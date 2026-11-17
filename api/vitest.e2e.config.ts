import { defineConfig } from 'vitest/config';

// Pruebas contra el sistema VIVO (Docker levantado). Van en orden y sin paralelo:
// cada una construye sobre la cuenta que creó la anterior.
export default defineConfig({
  test: {
    globals: true,
    include: ['test/e2e/**/*.e2e-spec.ts'],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 60_000,
  },
});
