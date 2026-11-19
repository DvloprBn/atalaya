// Las pantallas de análisis (v0.9) en Chrome real, con el worker real. Cuentas de la semilla: <rol>@example.com / TestOnly123!
import { expect, type Page, test } from '@playwright/test';

async function loginAs(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(`${role}@example.com`);
  await page.getByLabel('Contraseña').fill('TestOnly123!');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
}

/** Borra todo lo de la cuenta desde el propio navegador (misma sesión y origen que la pantalla). */
async function wipe(page: Page) {
  await page.evaluate(async () => {
    const list = await (await fetch('/api/uploads')).json();
    for (const u of list.items) await fetch(`/api/uploads/${u.id}`, { method: 'DELETE' });
  });
}

// El ataque del encabezado: si la pantalla pintara el nombre de la columna como HTML, esto ejecutaría código.
const XSS = '<img src=x onerror="window.__xss=1">';
const CSV = [
  `Fecha,Total,"${XSS.replace(/"/g, '""')}",Producto`,
  '2026-01-05,100.50,a,pan',
  '2026-01-05,100.50,a,pan',
  '2026-01-06,-20.00,b,"=HYPERLINK(""http://evil.example"")"',
  'ayer,50.00,c,leche',
  '2026-01-08,30.25,d,  café   molido ',
].join('\n');

test.describe.configure({ mode: 'serial' });

test.describe('Análisis', () => {
  let page: Page;
  let analysisUrl = '';

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAs(page, 'usuario');
    await page.goto('/archivos');
    await wipe(page);
  });
  test.afterAll(async () => {
    await page.goto('/archivos');
    await wipe(page);
    await page.close();
  });

  test('desde «Mis archivos»: Analizar → vista previa con la sugerencia ya elegida; el nombre de columna hostil se ve como TEXTO', async () => {
    await page.goto('/archivos');
    await page.getByLabel('Archivo', { exact: true }).setInputFiles({ name: 'ventas.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
    await page.getByRole('button', { name: 'Subir' }).click();
    const row = page.getByRole('row').filter({ hasText: 'ventas.csv' });
    await expect(row.getByText('aceptado')).toBeVisible({ timeout: 20_000 });

    await row.getByRole('button', { name: /^Analizar ventas/ }).click();
    await page.waitForURL(/\/analisis\/[0-9a-f-]{36}$/);
    analysisUrl = page.url();
    await expect(page.getByRole('heading', { name: '¿Qué columna es cada dato?' })).toBeVisible({ timeout: 20_000 });

    // La sugerencia del worker llega elegida: fecha = 1.ª columna, importe = 2.ª, producto = 4.ª.
    await expect(page.getByLabel('Fecha de la venta (obligatorio)')).toHaveValue('0');
    await expect(page.getByLabel('Importe (obligatorio)')).toHaveValue('1');
    await expect(page.getByLabel(/^Producto/)).toHaveValue('3');
    await expect(page.getByLabel(/^Sucursal/)).toHaveValue(''); // opcional sin sugerencia: «no usar»

    // XSS: el encabezado malicioso aparece LITERAL, no se ejecutó, y no hay ningún <img> dentro de la tabla.
    await expect(page.getByRole('columnheader', { name: /<img src=x/ })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await expect(page.locator('table img, option img, h2 img')).toHaveCount(0);
  });

  test('el formulario frena lo evidente (la API valida el resto) y el mapeo manda', async () => {
    await page.getByLabel('Importe (obligatorio)').selectOption('0'); // misma columna que la fecha
    await page.getByRole('button', { name: 'Limpiar y analizar' }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText('«Fecha de la venta» y «Importe» no pueden ser la misma columna.');
    await page.getByLabel('Importe (obligatorio)').selectOption('1');
    await page.getByLabel('Fecha de la venta (obligatorio)').selectOption(''); // sin fecha
    await page.getByRole('button', { name: 'Limpiar y analizar' }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText('Elige la columna de la fecha y la del importe.');
    await page.getByLabel('Fecha de la venta (obligatorio)').selectOption('0');
  });

  test('confirmar → limpia → informe de calidad con los números y los problemas', async () => {
    await page.getByRole('button', { name: 'Limpiar y analizar' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible({ timeout: 30_000 });
    const tile = (label: string) => page.locator('dl > div').filter({ has: page.getByText(label, { exact: true }) });
    await expect(tile('Filas leídas')).toContainText('5');
    await expect(tile('Filas que se quedaron')).toContainText('3');
    await expect(tile('Filas descartadas')).toContainText('2');
    await expect(tile('Suma de importes')).toContainText('110.75');

    const issues = page.getByRole('region', { name: 'Qué se encontró' });
    await expect(issues.getByRole('row').filter({ hasText: 'Filas repetidas' })).toContainText('se descartaron');
    await expect(issues.getByRole('row').filter({ hasText: 'Fecha que no se pudo leer' })).toContainText('ayer'); // el ejemplo
    await expect(issues.getByRole('row').filter({ hasText: 'Importes negativos' })).toContainText('se conservaron');
    await expect(page.getByRole('region', { name: 'Columnas usadas' }).getByRole('row').filter({ hasText: 'Importe' })).toBeVisible();
  });

  test('descarga real: el CSV limpio llega como adjunto y la fórmula del archivo sale neutralizada', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Descargar datos limpios (CSV)' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^atalaya-[0-9a-f]{8}-clean\.csv$/);
    const chunks: Buffer[] = [];
    for await (const chunk of (await download.createReadStream())!) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8').replace(/^﻿/, '');
    expect(text.split(/\r?\n/)[0]).toBe('fecha,importe,producto'); // solo las columnas elegidas
    expect(text).toContain("'=HYPERLINK("); // la fórmula quedó como texto
    expect(text).toContain('2026-01-06,-20.00,'); // el importe negativo legítimo, intacto
    expect(text).not.toMatch(/(^|,)=HYPERLINK/m); // y ninguna celda empieza como fórmula
    expect(text).toContain('café molido'); // espacios de más limpiados
  });

  test('a ancho de teléfono (390 px) el informe no se desborda', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('«Mis análisis» lista el análisis y borrar pide confirmación', async () => {
    await page.goto('/analisis');
    const row = page.getByRole('row').filter({ hasText: 'ventas.csv' });
    await expect(row.getByText('terminado')).toBeVisible();
    await row.getByRole('link', { name: 'Abrir' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();
    page.once('dialog', (d) => void d.dismiss());
    await page.getByRole('button', { name: 'Borrar análisis' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible(); // cancelar: sigue ahí
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Borrar análisis' }).click();
    await page.waitForURL('**/analisis');
    await expect(page.getByText('Todavía no has hecho ninguno.')).toBeVisible();
  });

  test('el análisis de otra cuenta no existe para nadie más (ni para un admin)', async ({ browser }) => {
    const admin = await browser.newPage();
    await loginAs(admin, 'admin');
    await admin.goto(analysisUrl);
    await expect(admin.getByText('Este análisis no existe.')).toBeVisible(); // ya borrado: 404 como cualquier otro
    await admin.close();
  });
});
