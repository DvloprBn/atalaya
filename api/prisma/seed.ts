// Semilla de DESARROLLO: una cuenta de prueba por rol, para estudiar los permisos
// cambiando de cuenta. Correos @example.com (dominio reservado: nunca llega a nadie).
// Se puede correr las veces que sea: si la cuenta existe, solo se actualiza.
//
//   docker compose exec api npx prisma db seed
//
// La contraseña es pública A PROPÓSITO (repo de estudio). Por eso esta semilla
// se niega a correr en producción: el demo usa invitaciones, nunca estas cuentas.
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/auth/passwords.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

const TEST_PASSWORD = 'TestOnly123!';
const ROLES = ['usuario', 'staff', 'manager', 'admin', 'director', 'super'] as const;

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('La semilla de cuentas de prueba no corre en producción');
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const passwordHash = await hashPassword(TEST_PASSWORD);
    for (const name of ROLES) {
      const role = await prisma.role.findUniqueOrThrow({ where: { name } });
      const email = `${name}@example.com`;
      await prisma.user.upsert({
        where: { email },
        create: { email, passwordHash, emailVerifiedAt: new Date(), roleId: role.id },
        update: { passwordHash, roleId: role.id, disabledAt: null },
      });
      console.log(`  ${email.padEnd(24)} rol ${name} (nivel ${role.level})`);
    }
    console.log(`Contraseña de todas: ${TEST_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
