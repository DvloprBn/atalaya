// El login con Google en Chrome real, contra el servidor OAuth FALSO (mock-idp, puerto 3072).
// Va por `localhost` (la baseURL): el regreso de Google es a localhost y la cookie que ata el
// intento al navegador es de ese host.
import { expect, test } from '@playwright/test';

test('«Continuar con Google»: elegir cuenta en el servidor de prueba y quedar dentro', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Continuar con Google' }).click();

  // Pantalla del servidor OAuth de prueba (hace de Google).
  await expect(page.getByRole('heading', { name: 'Servidor OAuth de prueba' })).toBeVisible();
  await page.getByRole('link', { name: 'beto.google@example.com' }).click();

  await page.waitForURL('**/cuenta');
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Perfil' }).getByText('beto.google@example.com')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Perfil' }).getByText('usuario')).toBeVisible();

  // La cookie del intento no se queda: se gastó al volver.
  const names = (await page.context().cookies()).map((c) => c.name);
  expect(names).not.toContain('__Host-atalaya_oauth');
  expect(names).toContain('__Host-atalaya_access');
});

test('con un correo sin verificar en Google, vuelve al login con un aviso genérico y sin sesión', async ({ page }) => {
  await page.goto('/registro');
  await page.getByRole('link', { name: 'Continuar con Google' }).click();
  await page.getByRole('link', { name: /sinverificar\.google@example\.com/ }).click();

  await page.waitForURL('**/login');
  await expect(page.getByRole('alert').filter({ hasText: 'No pudimos iniciar sesión con Google' })).toBeVisible();
  expect(page.url()).not.toContain('error='); // el parámetro se borró de la barra
  expect((await page.context().cookies()).map((c) => c.name)).not.toContain('__Host-atalaya_access');
});

test('el reto de 2FA que trae el regreso en el fragmento abre el segundo paso y se borra de la URL', async ({ page }) => {
  await page.goto(`/login#challenge=${'A'.repeat(43)}`);
  await expect(page.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeVisible();
  expect(page.url()).not.toContain('challenge');
  await expect(page.getByLabel('Código')).toHaveValue('');
});

test('un fragmento con forma rara se ignora: queda el login normal', async ({ page }) => {
  await page.goto('/login#challenge=corto');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
});
