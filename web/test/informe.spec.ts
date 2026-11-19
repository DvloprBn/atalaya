// v0.10 en Chrome real, con el worker real: indicadores con gráficas (y su tabla equivalente), tooltip, un ataque XSS por el
// nombre de un producto y de una sucursal, y la pantalla de resultado (ventas menos gastos). Cuenta de la semilla:
// usuario@example.com / TestOnly123!
import { expect, type Page, test } from '@playwright/test';

async function loginAs(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(`${role}@example.com`);
  await page.getByLabel('Contraseña').fill('TestOnly123!');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
}

async function wipe(page: Page) {
  await page.evaluate(async () => {
    const list = await (await fetch('/api/uploads')).json();
    for (const u of list.items) await fetch(`/api/uploads/${u.id}`, { method: 'DELETE' });
  });
}

// Un negocio de 11 semanas (lunes 2026-01-05 → sábado 2026-03-21, cerrado los domingos) con un pico el miércoles 2026-02-11.
// Las cifras esperadas se calculan AQUÍ con enteros de centavos; nada sale del worker.
const XSS = '<img src=x onerror="window.__xss=1">';
const PATTERN: Record<number, number> = { 1: 100, 2: 110, 3: 120, 4: 130, 5: 200, 6: 300 };
const days: { date: string; cents: number }[] = [];
const lines = ['fecha,total,producto,sucursal'];
for (let n = 0; n < 77; n++) {
  const d = new Date(Date.UTC(2026, 0, 5 + n));
  const iso = d.toISOString().slice(0, 10);
  const base = PATTERN[d.getUTCDay() === 0 ? 7 : d.getUTCDay()];
  if (!base) continue;
  const amount = iso === '2026-02-11' ? 900 : base;
  const product = n % 3 === 0 ? 'pan' : n % 3 === 1 ? 'leche' : XSS; // un producto hostil
  days.push({ date: iso, cents: amount * 100 });
  lines.push(`${iso},${amount}.00,"${product.replace(/"/g, '""')}",${n % 2 ? `"${XSS.replace(/"/g, '""')}"` : 'norte'}`);
}
const SALES = lines.join('\n') + '\n';
const EXPENSES = ['fecha,total,categoria', '2026-01-10,1000.10,renta', '2026-01-20,250.20,luz', '2026-03-05,300.30,sueldos', '2026-04-01,80.00,luz'].join('\n') + '\n';

const commas = (cents: number) => `$${String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+$)/g, ',')}.${String(cents % 100).padStart(2, '0')}`;
const salesCents = days.reduce((a, d) => a + d.cents, 0);

test.describe.configure({ mode: 'serial' });

test.describe('Informe de ventas y gastos', () => {
  let page: Page;

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

  /** La sección que un título nombra (el `id` está en el <h2>; la sección lo referencia con aria-labelledby). */
  const section = (id: string) => page.locator(`section[aria-labelledby="${id}"]`);

  async function uploadAndAnalyze(name: string, content: string, button: RegExp) {
    await page.goto('/archivos');
    await page.getByLabel('Archivo', { exact: true }).setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(content) });
    await page.getByRole('button', { name: 'Subir' }).click();
    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row.getByText('aceptado')).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: button }).click();
    await page.waitForURL(/\/analisis\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: '¿Qué columna es cada dato?' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Limpiar y analizar' }).click();
  }

  test('ventas: indicadores exactos, gráficas con su tabla, anomalía, pronóstico con su error medido', async () => {
    await uploadAndAnalyze('ventas.csv', SALES, /^Analizar ventas/);
    await expect(page.getByRole('heading', { name: 'Análisis de ventas' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cómo van tus ventas' })).toBeVisible({ timeout: 40_000 });

    // Indicadores: el neto sale del texto exacto, con miles y centavos, sin pasar por números de punto flotante.
    const tile = (label: string) => page.locator('dl > div').filter({ has: page.getByText(label, { exact: true }) });
    await expect(tile('Ventas netas')).toContainText(commas(salesCents));
    await expect(tile('Días con datos')).toContainText('66');
    await expect(tile('Mejor día')).toContainText('$900.00');
    await expect(tile('Mejor día')).toContainText('11 feb 2026');

    // Gráficas: tienen nombre accesible y SIEMPRE su tabla equivalente.
    const monthly = page.getByRole('img', { name: /^Importe neto por mes/ });
    await expect(monthly).toBeVisible();
    await expect(monthly.locator('path')).toHaveCount(3); // una barra por mes (sin cuadrícula: son <line>)
    await section('mensual').getByText('Ver los datos de la gráfica').click();
    await expect(section('mensual').getByRole('row')).toHaveCount(4); // encabezado + 3 meses
    await expect(section('mensual').getByRole('row').nth(1)).toContainText('ene');
    // Tooltip al pasar el cursor por una banda.
    await monthly.locator('rect').nth(1).hover();
    await expect(section('mensual').locator('div').filter({ hasText: /^feb[^:]*: \$/ })).toBeVisible(); // el tooltip: «feb 2026: $…»

    // Anomalía plantada: el pico del miércoles 11 de feb, y lo normal para un miércoles ($120.00).
    const anomalies = section('anomalias');
    await expect(anomalies.getByRole('row').filter({ hasText: '11 feb 2026' })).toContainText('más alto');
    await expect(anomalies.getByRole('row').filter({ hasText: '11 feb 2026' })).toContainText('$120.00');

    // Pronóstico: arranca el domingo siguiente al último dato, y dice cuánto se habría equivocado.
    const forecast = section('pronostico');
    await expect(forecast.getByRole('img', { name: /^Importe esperado por día/ })).toBeVisible();
    await expect(forecast.getByText(/se habría equivocado en promedio \d+\.\d %/)).toBeVisible();
    await forecast.getByText('Ver los datos de la gráfica').click();
    await expect(forecast.getByRole('row').nth(1)).toContainText('22 mar 2026');
    await expect(forecast.getByRole('row').nth(1)).toContainText('$0.00'); // el domingo cerrado
  });

  test('XSS: un producto y una sucursal con HTML se ven como TEXTO, en la tabla de Pareto y en la de sucursales', async () => {
    await expect(section('pareto').getByRole('cell', { name: XSS })).toBeVisible();
    await expect(section('sucursales').getByRole('cell', { name: XSS })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await expect(page.locator('section[aria-labelledby="pareto"] img, section[aria-labelledby="sucursales"] img')).toHaveCount(0);
    // Pareto: el último acumulado cierra en 100.0 % y hay un elemento de clase A.
    await expect(section('pareto').getByRole('row').last()).toContainText('100.0 %');
    await expect(section('pareto').getByText(/^A · /).first()).toBeVisible();
  });

  test('gastos: la columna «categoría» es el elemento, y lo que no se puede analizar lo dice en vez de inventar', async () => {
    await uploadAndAnalyze('gastos.csv', EXPENSES, /^Analizar gastos/);
    await expect(page.getByRole('heading', { name: 'Análisis de gastos' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cómo van tus gastos' })).toBeVisible({ timeout: 40_000 });
    await expect(page.locator('dl > div').filter({ has: page.getByText('Gasto neto', { exact: true }) })).toContainText('$1,630.60');
    await expect(section('pareto').getByRole('cell', { name: 'renta' })).toBeVisible(); // «categoria» llegó como el elemento
    await expect(section('anomalias')).toContainText('No hay suficientes días con datos');
    await expect(section('pronostico')).toContainText('No hay historia suficiente para pronosticar');
  });

  test('resultado: ventas menos gastos, con centavos exactos, y un mes de pérdida dicho con texto', async () => {
    await page.goto('/resultado');
    await page.getByRole('combobox', { name: /^Ventas/ }).selectOption({ label: 'ventas.csv' });
    await page.getByRole('combobox', { name: /^Gastos/ }).selectOption({ label: 'gastos.csv' });
    await page.getByRole('button', { name: 'Ver resultado' }).click();
    await expect(page.getByRole('heading', { name: 'Totales' })).toBeVisible();

    const tile = (label: string) => page.locator('dl > div').filter({ has: page.getByText(label, { exact: true }) });
    await expect(tile('Ventas')).toContainText(commas(salesCents));
    await expect(tile('Gastos')).toContainText('$1,630.60');
    await expect(tile('Ganancia')).toContainText(commas(salesCents - 163060));

    const rows = section('meses').getByRole('row');
    await expect(rows).toHaveCount(5); // encabezado + ene, feb, mar, abr
    const april = rows.filter({ hasText: 'abr' });
    await expect(april).toContainText('-$80.00');
    await expect(april).toContainText('pérdida'); // dicho con texto, no solo con el color ámbar
    await expect(page.getByRole('img', { name: /^Resultado por mes/ })).toBeVisible();
  });

  test('a ancho de teléfono (390 px) el informe y el resultado no se desbordan', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/resultado', '/analisis']) {
      await page.goto(path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), path).toBeLessThanOrEqual(0);
    }
    await page.goto('/analisis');
    await page.getByRole('link', { name: 'Abrir' }).first().click();
    await expect(page.getByRole('heading', { name: /Cómo van tus/ })).toBeVisible({ timeout: 20_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 1280, height: 720 });
  });
});
