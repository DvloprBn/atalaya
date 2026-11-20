// S-10 · La recuperación asistida del 2FA en Chrome real. Las cuentas se preparan por API (rápido y estable); en el
// navegador se recorre lo que importa: la columna 2FA del panel, el formulario completo, y que ABRIR el enlace de
// cancelación no cancela (un filtro de correo lo abriría solo): hay que pulsar el botón.
// En desarrollo y CI la espera es de 30 s: esta prueba cancela antes de que venza.
import { type APIRequestContext, expect, request as playwrightRequest, test } from '@playwright/test';
import { mailLink, totp } from './helpers';

const BASE = process.env.ATALAYA_URL ?? 'http://localhost:3070';
const PASSWORD = 'violeta cobre nube 92 azul';
const headers = { Origin: BASE.replace('127.0.0.1', 'localhost') };

async function session(email: string, password = 'TestOnly123!'): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL: BASE, extraHTTPHeaders: headers });
  expect((await ctx.post('/api/auth/login', { data: { email, password } })).status()).toBe(200);
  return ctx;
}

/** Cuenta por invitación de `by`, con contraseña y 2FA activo. Devuelve sus códigos de recuperación. */
async function withTwoFactor(by: APIRequestContext, role: string) {
  const email = `ui-s10-${role}-${Date.now()}@example.com`;
  expect((await by.post('/api/admin/users', { data: { email, roleName: role } })).status()).toBe(201);
  const token = new URL(await mailLink(email, 'Te crearon una cuenta')).searchParams.get('token');
  const anon = await playwrightRequest.newContext({ baseURL: BASE, extraHTTPHeaders: headers });
  expect((await anon.post('/api/auth/accept-invite', { data: { token, password: PASSWORD } })).status()).toBe(200);
  const me = await session(email, PASSWORD);
  const { secret } = await (await me.post('/api/auth/2fa/setup', { data: { password: PASSWORD } })).json();
  const enabled = await me.post('/api/auth/2fa/enable', { data: { code: totp(secret) } });
  expect(enabled.status()).toBe(200);
  return { email, secret: secret as string, recovery: (await enabled.json()).recoveryCodes as string[], api: me };
}

test('el admin pide el restablecimiento con el formulario completo; abrir el enlace no cancela, el botón sí', async ({ page, context }) => {
  const admin = await withTwoFactor(await session('super@example.com'), 'admin');
  const target = await withTwoFactor(admin.api, 'staff');

  // El admin entra con su 2FA (un código de recuperación: no depende del reloj).
  await page.goto('/login');
  await page.getByLabel('Correo').fill(admin.email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByLabel('Código').fill(admin.recovery[0]);
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
  await page.goto('/admin');

  const row = () => page.getByRole('row').filter({ hasText: target.email });
  await expect(row().getByText('2FA activo')).toBeVisible();
  await row().getByRole('button', { name: 'Restablecer 2FA…' }).click();
  const form = page.getByRole('form', { name: `Restablecer el 2FA de ${target.email}` });
  // Un código malo: el servidor lo rechaza y el formulario lo dice (sin cerrarse).
  await form.getByLabel('Cómo verificaste su identidad').fill('Videollamada al número que ya teníamos registrado');
  await form.getByLabel('Tu contraseña').fill(PASSWORD);
  await form.getByLabel(/Tu código/).fill('000000');
  await form.getByRole('button', { name: 'Pedir el restablecimiento' }).click();
  await expect(form.getByRole('alert')).toHaveText('Contraseña o código incorrectos');
  await form.getByLabel(/Tu código/).fill(admin.recovery[1]);
  await form.getByRole('button', { name: 'Pedir el restablecimiento' }).click();
  await expect(row().getByText(/^se quita el /)).toBeVisible();

  // La persona abre el enlace de su correo en otra pestaña: ABRIRLO no cancela nada.
  const link = await mailLink(target.email, 'quitar la verificación');
  const victim = await context.newPage();
  await victim.goto(link);
  await expect(victim.getByRole('button', { name: 'No lo pedí: cancelar' })).toBeEnabled(); // ya leyó el token
  await expect(victim).toHaveURL(/\/cancelar-2fa$/); // y lo sacó de la barra de direcciones (no queda en el historial)
  await page.reload();
  await expect(row().getByText(/^se quita el /)).toBeVisible();

  // Pulsar el botón sí: el panel vuelve a «2FA activo».
  await victim.getByRole('button', { name: 'No lo pedí: cancelar' }).click();
  await expect(victim.getByRole('status')).toContainText('quedó cancelada');
  await page.reload();
  await expect(row().getByText('2FA activo')).toBeVisible();
});
