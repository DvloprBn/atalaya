// El panel de seguridad (v0.7) en Chrome real, contra el sistema vivo. Lo más importante: un
// reporte CSP REAL del navegador llega al recolector y aparece en el panel (el navegador manda
// el reporte con sus propias reglas, que un `fetch` de prueba no reproduce).
import { expect, type Page, test } from '@playwright/test';

async function loginAs(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(`${role}@example.com`);
  await page.getByLabel('Contraseña').fill('TestOnly123!');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
}

test('quien no es admin no ve el enlace y la pantalla lo manda a su cuenta', async ({ page }) => {
  await loginAs(page, 'manager');
  await expect(page.getByRole('link', { name: 'Seguridad del sistema' })).toHaveCount(0);
  await page.goto('/admin/seguridad');
  await page.waitForURL('**/cuenta');
});

test('el admin ve el radar con sus 14 días, la bitácora filtrable y la auditoría', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.getByRole('link', { name: 'Seguridad del sistema' }).click();
  await expect(page.getByRole('heading', { name: 'Seguridad del sistema' })).toBeVisible();

  await expect(page.getByRole('img', { name: /Radar de seguridad/ })).toBeVisible();
  await expect(page.locator('[aria-labelledby="dias"]').getByRole('row')).toHaveCount(15); // encabezado + 14 días
  await expect(page.getByRole('heading', { name: 'Auditoría' })).toBeVisible();

  await page.getByLabel('Tipo').selectOption('login_failed');
  const rows = page.locator('[aria-labelledby="eventos"] tbody tr');
  await expect(rows.first()).toBeVisible();
  for (const text of await rows.locator('td:nth-child(2)').allTextContents()) expect(text).toBe('Login fallido');
});

test('un reporte CSP real del navegador llega al recolector y se ve en el panel (solo host, sin ruta)', async ({ page }) => {
  const host = `probe-${Date.now()}.example`;
  await loginAs(page, 'admin');
  // Una imagen de otro origen viola img-src 'self' data:. La política va en «solo reporte»: no la bloquea, la reporta.
  await page.evaluate((h) => {
    const img = new Image();
    img.src = `https://${h}/ruta/secreta.png?token=NO_DEBE_VERSE`;
    document.body.append(img);
  }, host);

  await expect(async () => {
    await page.goto('/admin/seguridad');
    await page.getByLabel('Tipo').selectOption('csp_violation');
    await expect(page.locator('[aria-labelledby="eventos"] tbody')).toContainText(`img-src ${host}`, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.locator('[aria-labelledby="eventos"]')).not.toContainText('NO_DEBE_VERSE');
  await expect(page.locator('[aria-labelledby="eventos"]')).not.toContainText('secreta.png');
});
