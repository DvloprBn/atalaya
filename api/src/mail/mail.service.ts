import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { loadEnv } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailContent, renderEmail } from './email-template.js';

const TICK_MS = 5_000;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 5;

interface ClaimedMail {
  id: string;
  toAddress: string;
  subject: string;
  text: string;
  html: string;
  attempts: number;
}

@Injectable()
export class MailService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(MailService.name);
  private readonly env = loadEnv();
  private readonly transport: Transporter = buildTransport(this.env.smtpUrl);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lo único que usan los demás módulos: deja el correo en la bandeja y regresa al instante.
   * Acepta una transacción: así un correo y el dato que lo origina se guardan juntos o ninguno.
   */
  async enqueue(to: string, content: EmailContent, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    const mail = renderEmail(content, this.env.appOrigin);
    await tx.mailOutbox.create({ data: { toAddress: to, ...mail } });
  }

  onModuleInit() {
    this.timer = setInterval(() => void this.dispatch(), TICK_MS);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** Envía lo pendiente. Público para que las pruebas puedan forzar una pasada. */
  async dispatch(): Promise<void> {
    if (this.running) return; // una pasada a la vez dentro de este proceso
    this.running = true;
    try {
      for (const mail of await this.claim()) await this.deliver(mail);
    } finally {
      this.running = false;
    }
  }

  // Reclama un lote en UNA sentencia. FOR UPDATE SKIP LOCKED: si algún día hay
  // varias instancias de la API, dos nunca toman el mismo correo. También
  // recupera los que quedaron "sending" porque el proceso murió a la mitad.
  private claim(): Promise<ClaimedMail[]> {
    return this.prisma.$queryRaw<ClaimedMail[]>`
      UPDATE mail_outbox SET status = 'sending', locked_at = now()
      WHERE id IN (
        SELECT id FROM mail_outbox
        WHERE (status = 'pending' AND next_attempt_at <= now())
           OR (status = 'sending' AND locked_at < now() - interval '5 minutes')
        ORDER BY created_at
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, to_address AS "toAddress", subject, text, html, attempts`;
  }

  private async deliver(mail: ClaimedMail): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.env.mailFrom,
        to: mail.toAddress,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      // Enviado: se borra el cuerpo para que los enlaces con token no queden guardados.
      await this.prisma.mailOutbox.update({
        where: { id: mail.id },
        data: { status: 'sent', sentAt: new Date(), text: '', html: '', lockedAt: null },
      });
    } catch (error) {
      const attempts = mail.attempts + 1;
      const code = (error as { code?: string }).code ?? 'UNKNOWN';
      // Solo el código: el mensaje de un error SMTP puede incluir la dirección o el servidor.
      this.log.warn(`correo ${mail.id} no enviado (${code}), intento ${attempts}`);
      await this.prisma.mailOutbox.update({
        where: { id: mail.id },
        data: {
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          attempts,
          lastError: code.slice(0, 64),
          lockedAt: null,
          // Espera creciente: 2, 4, 8, 16 minutos.
          nextAttemptAt: new Date(Date.now() + 2 ** attempts * 60_000),
        },
      });
    }
  }
}

/** smtp://host:puerto (sin cifrar, solo dentro de Docker) o smtps://usuario:clave@host:465 (TLS). */
function buildTransport(smtpUrl: string): Transporter {
  const url = new URL(smtpUrl);
  const secure = url.protocol === 'smtps:';
  return createTransport({
    host: url.hostname,
    port: Number(url.port || (secure ? 465 : 25)),
    secure,
    auth: url.username ? { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) } : undefined,
    // Toda llamada a un tercero lleva tiempo límite (lección 63, regla 6).
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
