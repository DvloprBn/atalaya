// La pantalla de archivos (v0.8) en Chrome real, contra el sistema vivo.
// Cuentas de la semilla: <rol>@example.com / TestOnly123!
import { type Dialog, expect, type Page, test } from '@playwright/test';

async function loginAs(page: Page, role: string) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(`${role}@example.com`);
  await page.getByLabel('Contraseña').fill('TestOnly123!');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
}

const upload = (page: Page, name: string, content: string) =>
  page.getByLabel('Archivo', { exact: true }).setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(content) });

/** Borra todo lo de la cuenta desde la propia pantalla (así también se prueba el botón). */
async function clean(page: Page) {
  // El «¿Borrar?» se acepta SOLO mientras se limpia: un manejador que se quedara puesto contestaría también a las pruebas.
  const accept = (d: Dialog) => void d.accept();
  page.on('dialog', accept);
  try {
    // Sin recargar si ya está aquí: cada carga pide /api/auth/me, que tiene tope por IP, y la tabla ya se mantiene al día sola.
    if (!page.url().endsWith('/archivos')) await page.goto('/archivos');
    await expect(page.getByRole('heading', { name: 'Mis archivos' })).toBeVisible();
    for (let guard = 0; guard < 12; guard++) {
      const buttons = page.getByRole('button', { name: /^Borrar/ });
      if ((await buttons.count()) === 0) return;
      await buttons.first().click();
      await page.waitForTimeout(300);
    }
  } finally {
    page.off('dialog', accept);
  }
}

// Las suites salen de una sola IP y el tope de inicios de sesión cuenta: UN login para toda la pantalla (sesión compartida).
test.describe.configure({ mode: 'serial' });

test.describe('Mis archivos', () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAs(page, 'usuario');
  });
  test.afterAll(async () => {
    await clean(page);
    await page.close();
  });
  test.beforeEach(async () => clean(page));

  test('subir un CSV bueno: pasa de «en cola»/«revisando» a «aceptado» sin recargar', async () => {
    await page.getByRole('link', { name: 'Mis archivos' }).click();
    await upload(page, 'ventas.csv', 'fecha,total\n2026-01-01,10\n2026-01-02,12\n');
    await page.getByRole('button', { name: 'Subir' }).click();
    await expect(page.getByRole('status').first()).toHaveText('Archivo recibido. Se está revisando.');
    const row = page.getByRole('row').filter({ hasText: 'ventas.csv' });
    await expect(row.getByText('aceptado')).toBeVisible({ timeout: 20_000 });
  });

  test('un archivo que el worker rechaza muestra el motivo en español', async () => {
    await upload(page, 'vacio.csv', 'fecha,total\n');
    await page.getByRole('button', { name: 'Subir' }).click();
    const row = page.getByRole('row').filter({ hasText: 'vacio.csv' });
    await expect(row.getByText('rechazado')).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText('No tiene datos');
  });

  test('la revisión de cortesía frena lo evidente; la API frena lo demás (firma falsa)', async () => {
    await upload(page, 'macros.xlsm', 'x');
    await page.getByRole('button', { name: 'Subir' }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText('Solo se admiten archivos .csv y .xlsx (sin macros).');
    // Pasa la cortesía (se llama .xlsx) pero NO es un libro: lo dice la API por la firma de bytes.
    await upload(page, 'falso.xlsx', 'fecha,total\n1,2\n');
    await page.getByRole('button', { name: 'Subir' }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText('El contenido no es un libro de Excel (.xlsx)');
    await expect(page.getByRole('row').filter({ hasText: 'falso.xlsx' })).toHaveCount(0);
  });

  test('borrar pide confirmación y la fila desaparece', async () => {
    await upload(page, 'borrar.csv', 'a,b\n1,2\n');
    await page.getByRole('button', { name: 'Subir' }).click();
    const row = page.getByRole('row').filter({ hasText: 'borrar.csv' });
    await expect(row).toBeVisible();
    page.once('dialog', (d) => void d.dismiss()); // cancelar: no se borra
    await row.getByRole('button', { name: /Borrar/ }).click();
    await expect(row).toBeVisible();
    page.once('dialog', (d) => void d.accept());
    await row.getByRole('button', { name: /Borrar/ }).click();
    await expect(row).toHaveCount(0);
  });

  test('a ancho de teléfono (390 px) la pantalla no se desborda', async () => {
    // La misma página y sesión, más angosta y recargada para que el diseño se calcule a ese ancho desde cero.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Mis archivos' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 1280, height: 720 });
  });
});

test('el admin ve solo metadatos de cuentas por debajo; un usuario no ve ni entra a esa pantalla', async ({ browser }) => {
  const page = await browser.newPage();
  await loginAs(page, 'usuario');
  await page.goto('/archivos');
  await upload(page, 'secreto-del-usuario.csv', 'a,b\n1,2\n');
  await page.getByRole('button', { name: 'Subir' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'secreto-del-usuario.csv' })).toBeVisible();

  await expect(page.getByRole('link', { name: 'Archivos de las cuentas' })).toHaveCount(0);
  await page.goto('/admin/archivos');
  await page.waitForURL('**/cuenta');

  const adminPage = await browser.newPage();
  await loginAs(adminPage, 'admin');
  await adminPage.getByRole('link', { name: 'Archivos de las cuentas' }).click();
  await expect(adminPage.getByRole('heading', { name: 'Archivos de las cuentas' })).toBeVisible();
  await expect(adminPage.getByRole('row').filter({ hasText: 'usuario@example.com' }).first()).toBeVisible();
  await expect(adminPage.getByText('secreto-del-usuario.csv')).toHaveCount(0); // el nombre no se le muestra al admin
  await adminPage.close();
  await clean(page);
  await page.close();
});
