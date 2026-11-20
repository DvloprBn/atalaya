// S-9 · Comando de la rotación de la llave del 2FA. Se corre DENTRO del contenedor de la API:
//   desarrollo:  docker compose exec api npx tsx src/cli/rotar-llave-totp.ts [--check]
//   producción:  docker compose -f docker-compose.prod.yml run --rm api sh /arranque.sh node dist/cli/rotar-llave-totp.js [--check]
//
// --check  no escribe nada: cuenta cuántas filas faltan. Sale con 0 si ya no falta ninguna (se puede retirar la llave vieja),
//          con 3 si faltan y con 4 si alguna no abre con ninguna llave.
// sin él   re-cifra lo que falte y deja una entrada «totp_key_rotated» en la auditoría.
// Nunca imprime secretos ni llaves: solo conteos, el kid de la llave actual (público) y, si hay, los ids que no abren.
import { loadEnv } from '../config/env.js';
import { rotateTotpKey } from '../auth/two-factor/rotate-key.js';
import { SecretBox } from '../auth/two-factor/secret-box.js';
import { PrismaService } from '../prisma/prisma.service.js';

const dryRun = process.argv.includes('--check');
const env = loadEnv();
const box = new SecretBox(Buffer.from(env.totpEncryptionKey, 'hex'), env.totpEncryptionKeysOld.map((k) => Buffer.from(k, 'hex')));
const prisma = new PrismaService();

try {
  const r = await rotateTotpKey(prisma, box, { dryRun });
  console.log(`llave actual: kid=${box.kid} · llaves anteriores en el llavero: ${env.totpEncryptionKeysOld.length}`);
  console.log(`filas de 2FA: ${r.total} · ya con la llave actual: ${r.current}`);
  console.log(dryRun ? `faltan por re-cifrar: ${r.rotated}` : `re-cifradas ahora: ${r.rotated} · cambiaron mientras tanto (no hace falta): ${r.changedMeanwhile}`);
  if (r.failed.length > 0) {
    // Los primeros 20 ids bastan para empezar a revisar; con cientos, la lista entera tapa el resto del informe.
    const more = r.failed.length > 20 ? ` … y ${r.failed.length - 20} más` : '';
    console.log(`NO abren con ninguna llave (${r.failed.length}): ${r.failed.slice(0, 20).join(', ')}${more}`);
    console.log('No retires ninguna llave: falta la que cifró esas filas. Si se perdió, esas personas entran con un código de recuperación.');
    process.exitCode = 4;
  } else if (dryRun && r.rotated > 0) {
    process.exitCode = 3;
  } else if (env.totpEncryptionKeysOld.length > 0) {
    console.log('Listo: ninguna fila depende ya de las llaves anteriores. Quítalas de TOTP_ENCRYPTION_KEYS_OLD cuando ningún respaldo las necesite.');
  }
} finally {
  await prisma.$disconnect();
}
