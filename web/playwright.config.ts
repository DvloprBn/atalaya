import { defineConfig } from '@playwright/test';

// Pruebas en un navegador REAL contra el sistema vivo (Docker levantado).
// Usa el Chrome instalado en la máquina (channel: 'chrome'): no descarga navegadores.
export default defineConfig({
  testDir: 'test',
  timeout: 90_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.ATALAYA_URL ?? 'http://localhost:3070',
    channel: 'chrome',
    headless: true,
  },
});
