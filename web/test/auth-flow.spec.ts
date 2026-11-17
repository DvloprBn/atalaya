// El recorrido completo de una persona, en Chrome real, contra el sistema vivo:
// registrarse → abrir el correo → confirmar → entrar → (el acceso vence) → seguir dentro → salir.
//
//   docker compose up -d --build && npm run test:browser
import { expect, test } from '@playwright/test';
import { mailLink } from './helpers';

const email = `ui-${Date.now()}@example.com`;
const password = 'una frase larga para el navegador';

test('registro, confirmación, sesión con renovación automática y salida', async ({ page, context }) => {
  await page.goto('/registro');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel(/Contraseña/).fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();

  // El enlace del correo confirma la cuenta y el token desaparece de la barra de direcciones.
  await page.goto(await mailLink(email, 'Confirma tu correo'));
  await expect(page.getByRole('status')).toHaveText('Correo confirmado. Ya puedes iniciar sesión.');
  expect(page.url()).not.toContain('token=');

  await page.goto('/login');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Perfil' }).getByText(email)).toBeVisible();

  // Las cookies son las que prometimos: httpOnly, Secure y SameSite=Strict.
  const cookies = await context.cookies();
  for (const name of ['__Host-atalaya_access', '__Secure-atalaya_refresh']) {
    const cookie = cookies.find((c) => c.name === name);
    expect(cookie, name).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict' });
  }

  // Simula que pasaron 10 minutos: el acceso desaparece. La página debe renovarlo sola.
  await context.clearCookies({ name: '__Host-atalaya_access' });
  await page.reload();
  await expect(page.getByRole('region', { name: 'Perfil' }).getByText(email)).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.waitForURL('**/');
  await page.goto('/cuenta');
  await page.waitForURL('**/login'); // sin sesión, de vuelta al login
});
