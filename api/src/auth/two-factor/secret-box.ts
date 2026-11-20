import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

// Cifra el secreto TOTP antes de guardarlo. Quien robe un respaldo de la base NO obtiene
// los secretos: le falta la llave, que vive en el entorno (TOTP_ENCRYPTION_KEY), no en la base.
//
// AES-256-GCM: cifra Y firma. Si alguien cambia un solo byte del texto guardado, descifrar falla.
// AAD (datos asociados) = el id del usuario: un secreto copiado de una fila a otra no descifra,
// así que nadie puede "pasarle" a su cuenta el secreto de otra.
//
// S-9 · ROTACIÓN. Es un LLAVERO: una llave ACTUAL (cifra y descifra) y llaves ANTERIORES (solo descifran).
// Formatos guardados (todo en base64url):
//   v2.<kid>.<iv>.<etiqueta>.<texto cifrado>   ← el actual: <kid> dice con qué llave se cifró
//   v1.<iv>.<etiqueta>.<texto cifrado>         ← el de antes de v1.0 (sin kid): se prueba con cada llave
// El kid es un HMAC corto de la llave: identifica cuál es sin revelar nada de ella (no se puede invertir).

const KID_LABEL = 'atalaya/totp-key-id/v1';

/** El identificador público de una llave: 8 caracteres de un HMAC-SHA256 de la propia llave. */
export function keyId(key: Buffer): string {
  return createHmac('sha256', key).update(KID_LABEL).digest('base64url').slice(0, 8);
}

export class SecretBox {
  private readonly currentKid: string;
  /** kid → llave. La actual incluida. */
  private readonly ring = new Map<string, Buffer>();

  constructor(
    private readonly current: Buffer,
    previous: Buffer[] = [],
  ) {
    for (const key of [current, ...previous]) {
      if (key.length !== 32) throw new Error('La llave de cifrado debe ser de 32 bytes (64 hexadecimales)');
      const kid = keyId(key);
      // Dos veces la misma llave (o la actual repetida entre las viejas) es un error de configuración, no algo que ignorar.
      if (this.ring.has(kid)) throw new Error('Llave del 2FA repetida en el llavero: revisa TOTP_ENCRYPTION_KEYS_OLD');
      this.ring.set(kid, key);
    }
    this.currentKid = keyId(current);
  }

  /** El kid de la llave actual (para informes de la rotación; es público). */
  get kid(): string {
    return this.currentKid;
  }

  encrypt(plain: string, userId: string): string {
    const iv = randomBytes(12); // uno NUEVO por cifrado: reusarlo con la misma llave rompe GCM
    const cipher = createCipheriv('aes-256-gcm', this.current, iv);
    cipher.setAAD(Buffer.from(userId));
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v2', this.currentKid, ...[iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url'))].join('.');
  }

  decrypt(stored: string, userId: string): string {
    const parts = stored.split('.');
    if (parts[0] === 'v2' && parts.length === 5) {
      const key = this.ring.get(parts[1]);
      // Una llave que ya no está en el llavero: se retiró antes de re-cifrar esta fila (o la fila viene de otra instalación).
      if (!key) throw new Error('Secreto cifrado con una llave que no está en el llavero');
      return open(key, parts[2], parts[3], parts[4], userId);
    }
    if (parts[0] === 'v1' && parts.length === 4) {
      // Sin kid: se prueba la actual primero y luego las anteriores. Con una llave equivocada GCM FALLA (la etiqueta de
      // 128 bits no coincide; acertar por azar es 1 en 2^128), no devuelve basura: probar no da un resultado incorrecto.
      for (const key of this.ring.values()) {
        try {
          return open(key, parts[1], parts[2], parts[3], userId);
        } catch {
          /* la siguiente */
        }
      }
      throw new Error('Ninguna llave del llavero abre este secreto');
    }
    throw new Error('Secreto con formato desconocido');
  }

  /** ¿Esta fila está cifrada con otra cosa que no sea la llave actual en el formato actual? Entonces hay que re-cifrarla. */
  needsRotation(stored: string): boolean {
    return !stored.startsWith(`v2.${this.currentKid}.`);
  }
}

function open(key: Buffer, iv: string, tag: string, data: string, userId: string): string {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  // final() lanza si la etiqueta no coincide: llave distinta, texto alterado o usuario distinto.
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
