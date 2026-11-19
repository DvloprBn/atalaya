// S-15: una falla de /api/auth/me que NO es un 401 (tope de peticiones, error del servidor, red caída) no debe sacar de la
// pantalla a quien tiene sesión válida. Solo un 401 de verdad manda a /login. Cuenta de la semilla: usuario@example.com.
import { expect, type Page, test } from '@playwright/test';

async function loginAs(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(`${role}@example.com`);
  await page.getByLabel('Contraseña').fill('TestOnly123!');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
}

// Un solo inicio de sesión para toda la pantalla: las suites salen de una IP y el tope de inicios cuenta.
test.describe.configure({ mode: 'serial' });

test.describe('Falla de /me que no es un 401 (S-15)', () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAs(page, 'usuario');
  });
  test.afterAll(async () => page.close());

  for (const failure of [{ name: '429 (tope de peticiones)', status: 429 }, { name: '503 (error del servidor)', status: 503 }, { name: 'red caída', status: 0 }]) {
    test(`${failure.name}: la persona se queda, ve el aviso y reintentando entra`, async () => {
      let broken = true;
      await page.route('**/api/auth/me', (route) => {
        if (!broken) return route.continue();
        return failure.status === 0 ? route.abort('failed') : route.fulfill({ status: failure.status, contentType: 'application/json', body: '{"message":"x"}' });
      });
      await page.goto('/resultado');
      await expect(page.getByText('Tu sesión no se cerró')).toBeVisible();
      await expect(page).toHaveURL(/\/resultado$/);
      broken = false;
      await page.getByRole('button', { name: 'Reintentar' }).click();
      await expect(page.getByRole('heading', { name: 'Resultado' })).toBeVisible();
      await page.unroute('**/api/auth/me');
    });
  }
});

test('un 401 de verdad (sin sesión) sí manda a /login', async ({ browser }) => {
  const context = await browser.newContext(); // sin cookies
  const anonymous = await context.newPage();
  await anonymous.goto('/archivos');
  await expect(anonymous).toHaveURL(/\/login/);
  await context.close();
});
