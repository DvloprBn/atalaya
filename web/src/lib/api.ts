// Cliente mínimo de la API para el servidor de Next.
// Los tipos NO se escriben a mano: salen del contrato (contracts/openapi.yaml)
// con `npm run contract:types`. Si la API cambia sin cambiar el contrato, el CI lo detecta.
import 'server-only';
import type { components } from './api-schema';

export type HealthReport = components['schemas']['HealthReport'];

// Dentro de Docker, Next habla con la API por la red interna (http://api:3000),
// sin pasar por Caddy. El navegador, en cambio, siempre usa /api del mismo dominio.
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://api:3000';

export async function getHealth(): Promise<HealthReport | null> {
  try {
    const res = await fetch(`${API_INTERNAL_URL}/api/health`, {
      cache: 'no-store',
      // Toda llamada de red lleva tiempo límite: si la API se cuelga, la página no.
      signal: AbortSignal.timeout(3000),
    });
    // 503 también trae un informe válido (dice qué pieza está caída).
    if (res.status !== 200 && res.status !== 503) return null;
    return (await res.json()) as HealthReport;
  } catch {
    return null;
  }
}
