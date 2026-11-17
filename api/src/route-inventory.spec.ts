// INVENTARIO DE RUTAS contra el contrato (método de la Biblioteca: «verificar el
// control de acceso contra la aplicación, no con una lista a mano»).
//
// Lee las rutas que Nest REALMENTE registra (desde los decoradores de cada
// controlador del AppModule) y las compara con contracts/openapi.yaml:
//   1. toda ruta del código está en el contrato, y al revés;
//   2. las rutas públicas (@Public) son EXACTAMENTE las que el contrato marca con `security: []`.
// Si alguien agrega una ruta sin contrato, o abre una sin declararla, esta prueba falla.
import { readFileSync } from 'node:fs';
import { RequestMethod } from '@nestjs/common';
import { parse } from 'yaml';
import { IS_PUBLIC } from './common/auth/public.decorator.js';

type Route = { key: string; isPublic: boolean };
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

async function routesFromCode(): Promise<Route[]> {
  // El módulo de acceso lee la configuración al importarse: valores de prueba.
  vi.stubEnv('DATABASE_URL', 'postgresql://x');
  vi.stubEnv('REDIS_URL', 'redis://x');
  vi.stubEnv('JWT_SECRET', 'x'.repeat(32));
  vi.stubEnv('APP_ORIGIN', 'http://localhost:3070');
  vi.stubEnv('SMTP_URL', 'smtp://x:1025');
  vi.stubEnv('MAIL_FROM', 'x@example.com');
  const { AppModule } = await import('./app.module.js');

  const controllers = new Set<object>();
  const visit = (mod: unknown) => {
    if (typeof mod !== 'function') return; // módulos dinámicos (forRoot) no traen controladores propios
    for (const c of Reflect.getMetadata('controllers', mod) ?? []) controllers.add(c);
    for (const child of Reflect.getMetadata('imports', mod) ?? []) visit(child);
  };
  visit(AppModule);

  const routes: Route[] = [];
  for (const controller of controllers) {
    const base: string = Reflect.getMetadata('path', controller);
    const proto = (controller as { prototype: Record<string, unknown> }).prototype;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const handler = proto[name];
      if (typeof handler !== 'function' || Reflect.getMetadata('method', handler) === undefined) continue;
      const method = RequestMethod[Reflect.getMetadata('method', handler) as number];
      const path = ['/api', base, Reflect.getMetadata('path', handler)]
        .filter((p) => p && p !== '/')
        .join('/')
        .replace(/\/+/g, '/')
        .replace(/:(\w+)/g, '{$1}');
      const isPublic = Boolean(Reflect.getMetadata(IS_PUBLIC, handler) ?? Reflect.getMetadata(IS_PUBLIC, controller));
      routes.push({ key: `${method} ${path}`, isPublic });
    }
  }
  return routes;
}

function routesFromContract(): Route[] {
  const doc = parse(readFileSync(new URL('../../contracts/openapi.yaml', import.meta.url), 'utf8'));
  return Object.entries(doc.paths as Record<string, Record<string, { security?: unknown[] }>>).flatMap(
    ([path, ops]) =>
      Object.entries(ops)
        // Una ruta de OpenAPI también puede traer `parameters` comunes: no es un método.
        .filter(([method]) => HTTP_METHODS.has(method))
        .map(([method, op]) => ({
        key: `${method.toUpperCase()} /api${path}`,
        isPublic: Array.isArray(op.security) && op.security.length === 0,
      })),
  );
}

const keys = (routes: Route[]) => routes.map((r) => r.key).sort();

describe('inventario de rutas vs. contrato', () => {
  it('el código y el contrato tienen exactamente las mismas rutas', async () => {
    expect(keys(await routesFromCode())).toEqual(keys(routesFromContract()));
  });

  it('las rutas públicas son exactamente las declaradas públicas en el contrato', async () => {
    const code = keys((await routesFromCode()).filter((r) => r.isPublic));
    expect(code).toEqual(keys(routesFromContract().filter((r) => r.isPublic)));
  });
});
