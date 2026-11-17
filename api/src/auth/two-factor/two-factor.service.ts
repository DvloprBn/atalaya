import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../current-user.decorator.js';
import { verifyPassword } from '../passwords.js';
import { RateLimits } from '../rate-limits.js';
import { SessionsService } from '../sessions.service.js';
import { hashRecoveryCode, newRecoveryCodes, normalizeRecoveryCode } from './recovery-codes.js';
import { SecondFactorService } from './second-factor.service.js';
import { SecretBox } from './secret-box.js';
import { newSecret, otpauthUrl, verifyTotp } from './totp.js';

/** Un solo mensaje para contraseña mala, código malo o cuenta bloqueada: no se dice cuál. */
const denied = () => new ForbiddenException('Contraseña o código incorrectos');

/** Activar, confirmar, desactivar y regenerar códigos. Todo exige VOLVER a demostrar quién eres. */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly box: SecretBox,
    private readonly limits: RateLimits,
    private readonly second: SecondFactorService,
    private readonly sessions: SessionsService,
  ) {}

  async status(userId: string) {
    const [enabled, recoveryCodesLeft] = await Promise.all([
      this.second.isEnabled(userId),
      this.prisma.recoveryCode.count({ where: { userId, usedAt: null } }),
    ]);
    return { enabled, recoveryCodesLeft };
  }

  /**
   * Paso 1: contraseña → secreto nuevo, todavía PENDIENTE. La contraseña se pide otra vez
   * porque, si no, quien robe una sesión podría enlazar SU teléfono a tu cuenta y dejarte fuera.
   */
  async setup(user: AuthUser, password: string) {
    await this.reauth(user.id, password);
    const secret = newSecret();
    const secretEnc = this.box.encrypt(secret, user.id);

    // Atómico: si no existe, se crea; si existe PENDIENTE, se reemplaza; si ya está activo, 409.
    const created = await this.prisma.twoFactor.createMany({ data: { userId: user.id, secretEnc }, skipDuplicates: true });
    if (created.count === 0) {
      const replaced = await this.prisma.twoFactor.updateMany({
        where: { userId: user.id, confirmedAt: null },
        data: { secretEnc, lastUsedStep: null },
      });
      if (replaced.count === 0) throw new ConflictException('Ya tienes el 2FA activo');
    }
    const url = otpauthUrl(user.email, secret);
    const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 2, color: { dark: '#000000', light: '#ffffff' } });
    return { secret, otpauthUrl: url, qrSvg };
  }

  /** Paso 2: un código de la app demuestra que el teléfono quedó enlazado. Recién entonces el 2FA cuenta. */
  async enable(user: AuthUser, code: string) {
    if (await this.limits.isTwoFactorLocked(user.id)) throw denied();
    const pending = await this.prisma.twoFactor.findFirst({ where: { userId: user.id, confirmedAt: null } });
    if (!pending) throw new ConflictException('Primero empieza a activar el 2FA');

    const step = verifyTotp(this.box.decrypt(pending.secretEnc, user.id), code.trim());
    if (step === null) {
      await this.limits.recordTwoFactorFailure(user.id);
      throw denied();
    }
    const codes = newRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      const confirmed = await tx.twoFactor.updateMany({
        where: { userId: user.id, confirmedAt: null },
        data: { confirmedAt: new Date(), lastUsedStep: step }, // el código de recién ya no se puede repetir
      });
      if (confirmed.count !== 1) throw new ConflictException('El 2FA ya estaba activo');
      await this.replaceRecoveryCodes(tx, user.id, codes);
      // Cambió la seguridad de la cuenta: todas las DEMÁS sesiones se cierran (la tuya sigue).
      await this.sessions.revokeAllForUser(user.id, 'two_factor_changed', tx, user.sessionId);
    });
    await this.limits.clearTwoFactorFailures(user.id);
    return { recoveryCodes: codes };
  }

  /** Desactivar pide la contraseña Y un código: quien tiene solo la sesión no puede quitar la protección. */
  async disable(user: AuthUser, password: string, code: string): Promise<void> {
    await this.reauth(user.id, password, code);
    await this.prisma.$transaction(async (tx) => {
      await tx.recoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.twoFactor.deleteMany({ where: { userId: user.id } });
      await this.sessions.revokeAllForUser(user.id, 'two_factor_changed', tx, user.sessionId);
    });
  }

  /** 10 códigos nuevos; los anteriores (usados o no) dejan de servir. */
  async regenerate(user: AuthUser, password: string, code: string) {
    await this.reauth(user.id, password, code);
    const codes = newRecoveryCodes();
    await this.prisma.$transaction((tx) => this.replaceRecoveryCodes(tx, user.id, codes));
    return { recoveryCodes: codes };
  }

  /** Contraseña (y, si se pide, un código). Todo fallo cuenta en el tope POR CUENTA. */
  private async reauth(userId: string, password: string, code?: string): Promise<void> {
    if (await this.limits.isTwoFactorLocked(userId)) throw denied();
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    // Solo si la contraseña es buena se mira (y se gasta) el código: una contraseña mala no quema códigos.
    const ok = (await verifyPassword(user?.passwordHash, password)) && (code === undefined || (await this.second.checkCode(userId, code)));
    if (!ok) {
      await this.limits.recordTwoFactorFailure(userId);
      throw denied();
    }
    await this.limits.clearTwoFactorFailures(userId);
  }

  private async replaceRecoveryCodes(tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0], userId: string, codes: string[]) {
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.recoveryCode.createMany({
      data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(normalizeRecoveryCode(c) as string) })),
    });
  }
}
