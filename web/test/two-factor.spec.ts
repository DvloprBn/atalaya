// El segundo factor en Chrome real: activar con QR, guardar códigos, entrar en dos pasos con el
// código de la app, y entrar con un código de recuperación.
import { expect, type Page, test } from '@playwright/test';
import { mailLink, totp } from './helpers';

const email = `ui-2fa-${Date.now()}@example.com`;
const password = 'una frase larga para el 2fa en chrome';

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.waitForURL('**/');
}

async function passwordStep(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeVisible();
  // El campo del código nace VACÍO: no debe arrastrar lo escrito en el paso anterior (el correo).
  await expect(page.getByLabel('Código')).toHaveValue('');
}

test('activar el 2FA, entrar con el código de la app y con uno de recuperación', async ({ page }) => {
  // Cuenta nueva y confirmada.
  await page.goto('/registro');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel(/Contraseña/).fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
  await page.goto(await mailLink(email, 'Confirma tu correo'));
  await expect(page.getByRole('status')).toHaveText('Correo confirmado. Ya puedes iniciar sesión.');

  await page.goto('/login');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();

  // Activar: contraseña → QR → código → códigos de recuperación.
  await page.getByRole('link', { name: 'Seguridad' }).click();
  await page.getByLabel('Confirma tu contraseña').fill(password);
  await page.getByRole('button', { name: 'Empezar' }).click();

  const qr = page.getByRole('img', { name: /Código QR/ });
  await expect(qr).toBeVisible();
  expect(await qr.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const secret = (await page.getByLabel('Clave para escribir a mano').textContent())!.trim();
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);

  await page.getByLabel('Código de 6 dígitos').fill(totp(secret));
  await page.getByRole('button', { name: 'Activar' }).click();
  await expect(page.getByRole('heading', { name: 'Guarda tus códigos de recuperación' })).toBeVisible();
  const items = page.getByRole('list', { name: 'Códigos de recuperación' }).getByRole('listitem');
  await expect(items).toHaveCount(10);
  const recoveryCode = (await items.first().textContent())!.trim();
  await page.getByRole('button', { name: 'Ya los guardé' }).click();
  await expect(page.getByText('Te quedan 10 de 10 códigos de recuperación.')).toBeVisible();

  // Entrar de nuevo: la contraseña sola ya no basta.
  await logout(page);
  await passwordStep(page);
  await page.getByLabel('Código').fill('zzzzzz');
  await page.getByRole('button', { name: 'Verificar' }).click();
  // (Next trae su propio anunciador de rutas con role="alert": se filtra por el texto.)
  await expect(page.getByRole('alert').filter({ hasText: 'Código incorrecto' })).toBeVisible();
  // El código del instante de la activación ya se gastó: se usa el del paso siguiente.
  await page.getByLabel('Código').fill(totp(secret, 1));
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();

  // Y con un código de recuperación (que se gasta).
  await logout(page);
  await passwordStep(page);
  await page.getByLabel('Código').fill(recoveryCode);
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
  await page.getByRole('link', { name: 'Seguridad' }).click();
  await expect(page.getByText('Te quedan 9 de 10 códigos de recuperación.')).toBeVisible();
});
