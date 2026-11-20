// S-2 · la CSP en un navegador real. Sirve contra desarrollo (la política solo REPORTA) y contra producción (BLOQUEA):
// lo que se comprueba es la política y el nonce, que son iguales en los dos. Además, en producción, que bloquee de verdad.
import { expect, test } from '@playwright/test';

const header = (res: { headers(): Record<string, string> }) =>
  res.headers()['content-security-policy'] ?? res.headers()['content-security-policy-report-only'] ?? '';
const enforcing = (res: { headers(): Record<string, string> }) => 'content-security-policy' in res.headers();

test('la política no permite scripts en línea y lleva un nonce distinto en cada petición', async ({ request }) => {
  const a = await request.get('/login');
  const b = await request.get('/login');
  const [pa, pb] = [header(a), header(b)];
  const script = /script-src ([^;]+)/.exec(pa)?.[1] ?? '';

  expect(script).toMatch(/'nonce-[A-Za-z0-9+/=]{22,}'/);
  expect(script).not.toContain("'unsafe-inline'"); // con él, la CSP no frenaría ningún XSS
  expect(pa).toContain("object-src 'none'");
  expect(pa).toContain("frame-ancestors 'none'");
  expect(pa).toContain('report-uri /api/csp-report');
  expect(/'nonce-([^']+)'/.exec(pa)?.[1]).not.toBe(/'nonce-([^']+)'/.exec(pb)?.[1]);
});

test('los scripts de la página llevan el MISMO nonce que la cabecera', async ({ request }) => {
  const res = await request.get('/login');
  const nonce = /'nonce-([^']+)'/.exec(header(res))?.[1];
  const tags = (await res.text()).match(/<script\b[^>]*>/g) ?? [];
  expect(tags.length).toBeGreaterThan(0);
  for (const tag of tags) expect(tag, tag).toContain(`nonce="${nonce}"`);
});

test('la interfaz sigue funcionando con la política puesta (sin violaciones y con JavaScript)', async ({ page }) => {
  await page.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (e) => {
      // Solo en desarrollo: la capa de depuración de Next (next-devtools) inyecta estilos en línea. No existe en producción.
      if (e.sourceFile.includes('next-devtools')) return;
      ((window as { __v?: string[] }).__v ??= []).push(`${e.effectiveDirective} ${e.blockedURI}`);
    }));
  for (const ruta of ['/', '/login', '/registro', '/olvide']) {
    await page.goto(ruta, { waitUntil: 'networkidle' });
    expect(await page.evaluate(() => (window as { __v?: string[] }).__v ?? []), ruta).toEqual([]);
  }
  // Si el JavaScript no corriera (nonce mal puesto), el formulario no reaccionaría.
  await page.goto('/olvide', { waitUntil: 'networkidle' });
  await page.getByLabel(/correo/i).fill('csp@example.com');
  const sent = page.waitForResponse((r) => r.url().includes('/api/auth/'));
  await page.getByRole('button').first().click();
  expect((await sent).status()).toBeLessThan(500);
});

test('un XSS reflejado (HTML hostil en la respuesta) no se ejecuta cuando la política bloquea', async ({ page, request }) => {
  const enforce = enforcing(await request.get('/login'));
  test.skip(!enforce, 'En desarrollo la política solo reporta: aquí no se bloquea nada, y es lo esperado.');
  await page.addInitScript(() => ((window as { __pwned?: string[] }).__pwned = []));
  await page.route('**/login', async (route) => {
    const res = await route.fetch();
    const hostile = '<script>window.__pwned.push("script")</script><img src="x:x" onerror="window.__pwned.push(\'onerror\')">';
    await route.fulfill({ response: res, body: (await res.text()).replace('<body', `${hostile}<body`) });
  });
  await page.goto('/login', { waitUntil: 'load' });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as { __pwned?: string[] }).__pwned)).toEqual([]);
});
