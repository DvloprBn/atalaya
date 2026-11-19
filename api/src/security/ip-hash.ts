import { createHmac } from 'node:crypto';

/**
 * La IP de un evento NO se guarda en claro. Un hash simple no basta: hay solo ~4 mil millones de
 * IPv4 y se prueban todas en minutos. Un HMAC con llave del servidor sí: sin la llave, el hash
 * no se invierte ni se compara con una lista de IP conocidas. Sirve para lo que se necesita
 * (¿estos dos eventos vienen del mismo lugar?) y no para identificar a nadie.
 *
 * La etiqueta separa dominios: la misma llave firma los JWT, y un HMAC de otra cosa nunca
 * debe poder pasar por un hash de IP (ni al revés).
 */
export function hashIp(ip: string | undefined, key: string): string | null {
  if (!ip) return null;
  return createHmac('sha256', key).update(`atalaya:ip-hash:v1:${ip}`).digest('hex');
}

/** Recorta a `max` caracteres y quita lo que no es imprimible: lo que viene de fuera nunca entra tal cual. */
export function clip(value: string | undefined | null, max: number): string | null {
  if (!value) return null;
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) || null;
}
