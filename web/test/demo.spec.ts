// v1.0 · La demo de 24 h en Chrome real. Solo con la demo encendida (docker-compose.demo.yml: la cuenta vive 90 s);
// fuera de ella se omite. Recorre lo que ve un visitante: el aviso al registrarse, el aviso FIJO con la fecha y la
// cuenta regresiva en las pantallas con sesión, la casilla obligatoria al subir y los datos de ejemplo para descargar.
import { expect, test } from '@playwright/test';
import { mailLink } from './helpers';

const BASE = process.env.ATALAYA_URL ?? 'http://localhost:3070';
const PASSWORD = 'una frase de prueba para la demo';

test.describe.configure({ mode: 'serial' });

test.describe('Demo de 24 h', () => {
  test.beforeAll(async () => {
    const demo = await (await fetch(`${BASE}/api/demo`)).json().catch(() => ({ enabled: false }));
    test.skip(!demo.enabled, 'Sin la demo encendida (DEMO_MODE) no hay nada que ver aquí.');
  });

  test('registro → aviso fijo con fecha y cuenta regresiva → casilla obligatoria → datos de ejemplo', async ({ page }) => {
    const email = `chrome-demo-${Date.now()}@example.com`;

    // 1. Antes de tener cuenta, el registro ya dice que la cuenta se borra y cuáles son los límites.
    await page.goto('/registro');
    await expect(page.getByTestId('demo-notice')).toContainText('se borra con todo lo que subas');
    await page.getByLabel('Correo').fill(email);
    await page.getByLabel(/^Contraseña/).fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();

    // La demo puede estar llena por otras corridas (3 cuentas, 90 s): se espera a que haya lugar al abrir el enlace.
    await page.goto(await mailLink(email, 'Confirma tu correo'));
    for (let i = 0; i < 30; i++) {
      if (await page.getByRole('link', { name: 'Iniciar sesión →' }).isVisible()) break;
      const retry = page.getByRole('button', { name: 'Reintentar con este enlace' });
      if (await retry.isVisible()) {
        await page.waitForTimeout(5_000);
        await retry.click();
      } else await page.waitForTimeout(500);
    }
    await page.getByRole('link', { name: 'Iniciar sesión →' }).click();
    await page.getByLabel('Correo').fill(email);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();

    // 2. El aviso fijo: fecha y hora del borrado, «usa solo datos de prueba» y cuánto falta.
    const banner = page.getByTestId('demo-banner');
    await expect(banner).toContainText('Esta cuenta y todo lo que subas se borran el');
    await expect(banner).toContainText('Usa solo datos de prueba');
    await expect(page.getByTestId('demo-countdown')).toHaveText(/^Quedan (\d+ min|menos de 1 min)$/);
    // Sigue arriba al desplazarse (fijo), y en todas las pantallas con sesión.
    await page.getByRole('link', { name: 'Mis archivos' }).click();
    await expect(banner).toBeVisible();
    await page.mouse.wheel(0, 2000);
    await expect(banner).toBeInViewport();

    // 3. La casilla es obligatoria: sin ella el navegador no deja enviar, y con ella el archivo entra.
    await page.getByLabel('Archivo', { exact: true }).setInputFiles({
      name: 'ventas.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('fecha,total\n2026-01-01,10\n2026-01-02,12\n'),
    });
    const box = page.getByLabel('Confirmo que no contiene datos reales de personas');
    await page.getByRole('button', { name: 'Subir' }).click();
    await expect(box).toHaveJSProperty('validity.valueMissing', true);
    await box.check();
    await page.getByRole('button', { name: 'Subir' }).click();
    await expect(page.getByRole('status').first()).toHaveText('Archivo recibido. Se está revisando.');
    await expect(box).not.toBeChecked(); // se confirma archivo por archivo

    // 4. Los datos de ejemplo se descargan del propio sitio.
    const link = page.getByRole('link', { name: 'cafe-ventas.csv' });
    const res = await page.request.get(String(await link.getAttribute('href')));
    expect(res.status()).toBe(200);
    // El CSV del café usa CRLF (como Excel): el encabezado se compara sin el fin de línea.
    expect((await res.text()).split(/\r?\n/)[0]).toBe('fecha,sucursal,producto,cantidad,importe');
  });
});
