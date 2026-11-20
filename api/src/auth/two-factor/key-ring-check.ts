// S-9 · Al arrancar, revisa que el llavero del 2FA abra lo que hay en la base, y si no, lo dice FUERTE en el log.
//
// Por qué existe: el ensayo de la rotación mostró que una API con la llave equivocada (una rotación a medias, una llave
// vieja retirada antes de tiempo, un .env de otra máquina) arranca SIN QUEJARSE, y luego cada persona con 2FA recibe un
// «código incorrecto» que nadie relaciona con la llave. Aquí se detecta en el primer minuto.
//
// No impide arrancar, a propósito: el resto del sitio (y quien no tiene 2FA, o entra con un código de recuperación) debe
// seguir funcionando. No escribe nada (es la revisión en seco del comando de rotación) y no imprime ids ni secretos.
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { rotateTotpKey } from './rotate-key.js';
import { SecretBox } from './secret-box.js';

@Injectable()
export class KeyRingCheck implements OnApplicationBootstrap {
  private readonly log = new Logger('2FA');

  constructor(
    private readonly prisma: PrismaService,
    private readonly box: SecretBox,
  ) {}

  onApplicationBootstrap(): void {
    // Sin await: con muchas cuentas la revisión tarda, y la API no tiene por qué esperarla para empezar a atender.
    void this.check();
  }

  async check(): Promise<void> {
    try {
      const r = await rotateTotpKey(this.prisma, this.box, { dryRun: true });
      if (r.failed.length > 0) {
        this.log.error(
          `${r.failed.length} de ${r.total} secretos del 2FA NO abren con ninguna llave del llavero: esas personas no pueden ` +
            'entrar con su app. Revisa TOTP_ENCRYPTION_KEY y TOTP_ENCRYPTION_KEYS_OLD (comando rotar-llave-totp --check).',
        );
      } else if (r.rotated > 0) {
        this.log.warn(`${r.rotated} de ${r.total} secretos del 2FA siguen con una llave anterior: termina la rotación (rotar-llave-totp).`);
      }
    } catch {
      this.log.error('No se pudo revisar el llavero del 2FA al arrancar (¿la base no responde?).');
    }
  }
}
