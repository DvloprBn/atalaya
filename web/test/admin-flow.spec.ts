// El panel de administración en Chrome real, contra el sistema vivo.
// Usa las cuentas de la semilla: <rol>@example.com / TestOnly123!
import { expect, type Page, test } from '@playwright/test';

async function loginAs(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(`${role}@example.com`);
  await page.getByLabel('Contraseña').fill('TestOnly123!');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
}

test('un usuario sin nivel no ve el panel: lo manda a su cuenta', async ({ page }) => {
  await loginAs(page, 'usuario');
  await expect(page.getByRole('link', { name: 'Administración de cuentas' })).toHaveCount(0);
  await page.goto('/admin');
  await page.waitForURL('**/cuenta');
});

test('el admin invita a una persona y le cambia el rol; la tabla muestra lo que confirmó el servidor', async ({ page }) => {
  const email = `ui-admin-${Date.now()}@example.com`;
  await loginAs(page, 'admin');
  await page.getByRole('link', { name: 'Administración de cuentas' }).click();
  await expect(page.getByRole('heading', { name: 'Administración de cuentas' })).toBeVisible();

  // Solo los roles de nivel menor al del admin se ofrecen.
  const roleOptions = page.locator('form select[name="roleName"] option');
  await expect(roleOptions).toHaveText(['usuario', 'staff', 'manager']);

  await page.getByLabel('Correo', { exact: true }).fill(email);
  await page.locator('form select[name="roleName"]').selectOption('staff');
  await page.getByRole('button', { name: 'Mandar invitación' }).click();
  await expect(page.getByRole('status')).toHaveText('Invitación enviada.');

  const row = page.getByRole('row').filter({ hasText: email });
  await expect(row.getByRole('cell').nth(2)).toHaveText('invitada');

  await row.getByLabel(`Rol de ${email}`).selectOption('manager');
  await expect(page.getByRole('row').filter({ hasText: email }).getByLabel(`Rol de ${email}`)).toHaveValue('manager');

  await page.getByRole('row').filter({ hasText: email }).getByRole('button', { name: 'Desactivar' }).click();
  await expect(page.getByRole('row').filter({ hasText: email }).getByRole('cell').nth(2)).toHaveText('desactivada');
});
