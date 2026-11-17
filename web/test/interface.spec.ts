// Promesas de la interfaz «Observatorio» (v0.4), comprobadas en Chrome real.
import { expect, test } from '@playwright/test';

const PUBLIC_PAGES = ['/', '/login', '/registro', '/olvide'];

test('ninguna pantalla pide recursos a terceros (las fuentes las sirve el propio sitio)', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol !== 'data:' && url.origin !== origin) foreign.push(request.url());
  });
  for (const path of PUBLIC_PAGES) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  // Si aparece aquí fonts.googleapis.com (o cualquier otro), el visitante estaría
  // avisándole a un tercero que entró al sitio.
  expect(foreign).toEqual([]);
});

test('a ancho de teléfono (390 px) ninguna pantalla se desborda a los lados', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const path of PUBLIC_PAGES) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.close();
});

test('el radar gira, y se queda quieto si la persona pidió menos movimiento', async ({ browser }) => {
  const sweepAnimation = async (reducedMotion: 'reduce' | 'no-preference') => {
    const page = await browser.newPage({ reducedMotion, viewport: { width: 1280, height: 800 } });
    await page.goto('/login');
    const name = await page.locator('svg[role="img"] g').first().evaluate((g) => getComputedStyle(g).animationName);
    await page.close();
    return name;
  };
  expect(await sweepAnimation('no-preference')).not.toBe('none');
  expect(await sweepAnimation('reduce')).toBe('none');
});
