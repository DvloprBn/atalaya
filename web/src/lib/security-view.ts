import type { components } from './api-schema';
import type { RadarPoint } from '@/components/radar';

type Day = components['schemas']['SecuritySummary']['days'][number];

/** Los nombres que ve el admin. Un tipo nuevo en el contrato sin nombre aquí se muestra tal cual (nunca se rompe la pantalla). */
export const EVENT_LABELS: Record<string, string> = {
  login_failed: 'Login fallido',
  login_locked: 'Cuenta bloqueada por intentos',
  two_factor_failed: 'Código 2FA incorrecto',
  refresh_reuse: 'Sesión robada (refresh reusado)',
  google_rejected: 'Login con Google rechazado',
  rate_limited: 'Tope de peticiones superado',
  csp_violation: 'Violación de CSP',
};

export const AUDIT_LABELS: Record<string, string> = {
  user_created: 'Cuenta creada',
  role_changed: 'Rol cambiado',
  user_disabled: 'Cuenta desactivada',
  user_enabled: 'Cuenta reactivada',
  two_factor_enabled: '2FA activado',
  two_factor_disabled: '2FA desactivado',
  recovery_codes_regenerated: 'Códigos de recuperación regenerados',
  totp_key_rotated: 'Llave del 2FA rotada (sistema)',
  two_factor_reset_requested: 'Restablecimiento de 2FA pedido (48 h)',
  two_factor_reset_cancelled: 'Restablecimiento de 2FA cancelado',
  two_factor_reset_applied: '2FA quitado por restablecimiento (sistema)',
};

export const label = (map: Record<string, string>, key: string) => map[key] ?? key;

/** UN solo criterio de «día de ataque»: mucho ruido, o cualquier sesión robada (eso nunca es ruido). */
export const ATTACK_DAY_EVENTS = 10;
export const isAttackDay = (d: Day) => d.total >= ATTACK_DAY_EVENTS || (d.byType.refresh_reuse ?? 0) > 0;

/**
 * Los 14 días en círculo (el más viejo arriba, el de hoy justo antes de cerrar la vuelta). Más eventos =
 * más lejos del centro; un día sin eventos queda en el aro interior, así sigue visible. Los días de ataque
 * van en ámbar. Es la MISMA información que la tabla de al lado: el radar es para verlo de un vistazo.
 */
export function radarPoints(days: Day[]): RadarPoint[] {
  const max = Math.max(1, ...days.map((d) => d.total));
  return days.map((d, i) => {
    const angle = (i / days.length) * 2 * Math.PI - Math.PI / 2;
    const radius = 0.3 + 0.6 * (d.total / max);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, anomaly: isAttackDay(d) };
  });
}
