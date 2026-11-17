import { Injectable } from '@nestjs/common';
import { loadEnv } from '../../config/env.js';
import { Prisma } from '../../generated/prisma/client.js';
import { MailService } from '../../mail/mail.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DEFAULT_ROLE_ID } from '../constants.js';
import { googleLinked } from '../emails.js';
import type { IdTokenClaims } from './id-token.js';
import { OAuthError } from './oauth-error.js';

const PROVIDER = 'google';
export type Outcome = 'login' | 'linked' | 'created';

/**
 * A QUÉ cuenta de Atalaya corresponde una cuenta de Google. Es la parte donde más se juega la
 * seguridad, y la política cabe en tres reglas:
 *
 *  1. Una identidad (el `sub` de Google) ya enlazada entra a SU cuenta, aunque el correo haya cambiado.
 *  2. Un correo que ya tiene cuenta se vincula SOLO si esa cuenta ya probó su correo (aquí todas lo
 *     hacen: no existen cuentas sin verificar) y se le AVISA por correo al dueño. Nunca se pisa un
 *     enlace existente ni se vincula una cuenta desactivada.
 *  3. Un correo sin cuenta crea una cuenta nueva de rol `usuario`, sin contraseña.
 *
 * Todo supone un `email_verified: true` ya comprobado en el id_token (id-token.ts).
 */
@Injectable()
export class OAuthAccounts {
  private readonly origin = loadEnv().appOrigin;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async resolve(claims: IdTokenClaims): Promise<{ userId: string; outcome: Outcome }> {
    try {
      return await this.resolveOnce(claims);
    } catch (error) {
      // Dos intentos simultáneos con la misma cuenta nueva: uno crea y el otro choca con la
      // restricción única. El segundo vuelve a mirar y encuentra lo que acaba de crear el primero.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return this.resolveOnce(claims);
      throw error;
    }
  }

  private async resolveOnce({ sub, email }: IdTokenClaims): Promise<{ userId: string; outcome: Outcome }> {
    const identity = await this.prisma.oAuthIdentity.findUnique({
      where: { provider_subject: { provider: PROVIDER, subject: sub } },
      select: { user: { select: { id: true, disabledAt: true } } },
    });
    if (identity) {
      if (identity.user.disabledAt) throw new OAuthError('account_denied');
      return { userId: identity.user.id, outcome: 'login' };
    }

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, disabledAt: true, emailVerifiedAt: true, oauthIdentities: { where: { provider: PROVIDER }, select: { id: true } } },
    });
    if (existing) {
      if (existing.disabledAt || !existing.emailVerifiedAt || existing.oauthIdentities.length > 0) {
        throw new OAuthError('account_denied');
      }
      // La identidad y el aviso al dueño se guardan juntos o ninguno.
      await this.prisma.$transaction(async (tx) => {
        await tx.oAuthIdentity.create({ data: { userId: existing.id, provider: PROVIDER, subject: sub, email } });
        await this.mail.enqueue(email, googleLinked(`${this.origin}/olvide`), tx);
      });
      return { userId: existing.id, outcome: 'linked' };
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, emailVerifiedAt: new Date(), roleId: DEFAULT_ROLE_ID }, select: { id: true } });
      await tx.oAuthIdentity.create({ data: { userId: user.id, provider: PROVIDER, subject: sub, email } });
      return user;
    });
    return { userId: created.id, outcome: 'created' };
  }
}
