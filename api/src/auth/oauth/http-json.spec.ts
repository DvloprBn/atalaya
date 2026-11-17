import { readdirSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { getJson, postForm } from './http-json.js';

let server: Server;
let base: string;
let lastRequest: { method?: string; type?: string; body: string } = { body: '' };

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      lastRequest = { method: req.method, type: req.headers['content-type'], body };
      const json = { 'content-type': 'application/json' };
      if (req.url === '/ok') return res.writeHead(200, json).end('{"hola":"mundo"}');
      if (req.url === '/html') return res.writeHead(200, { 'content-type': 'text/html' }).end('<p>hola</p>');
      if (req.url === '/error') return res.writeHead(500, json).end('{}');
      if (req.url === '/redirect') return res.writeHead(302, { location: '/ok' }).end();
      if (req.url === '/roto') return res.writeHead(200, json).end('{no es json');
      if (req.url === '/enorme') return res.writeHead(200, json).end(`{"x":"${'a'.repeat(70 * 1024)}"}`);
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code);

describe('cliente HTTP del proveedor (todo lo que llega es NO confiable)', () => {
  it('lee un JSON normal', async () => {
    expect(await getJson(`${base}/ok`)).toEqual({ hola: 'mundo' });
  });

  it('rechaza lo que no es JSON, un error del servidor y un JSON roto', async () => {
    for (const path of ['/html', '/error', '/roto', '/no-existe']) expect(await code(getJson(`${base}${path}`)), path).toBe('upstream');
  });

  it('NO sigue redirecciones (un servidor no puede mandarnos a una dirección interna)', async () => {
    expect(await code(getJson(`${base}/redirect`))).toBe('upstream');
  });

  it('corta una respuesta de más de 64 KB', async () => {
    expect(await code(getJson(`${base}/enorme`))).toBe('upstream');
  });

  it('postForm manda los campos como formulario', async () => {
    await postForm(`${base}/ok`, { grant_type: 'authorization_code', code: 'abc' });
    expect(lastRequest.method).toBe('POST');
    expect(lastRequest.type).toBe('application/x-www-form-urlencoded');
    expect(lastRequest.body).toBe('grant_type=authorization_code&code=abc');
  });

  it('un servidor que no existe da upstream, no revienta', async () => {
    expect(await code(getJson('http://127.0.0.1:1/'))).toBe('upstream');
  });
});

describe('prueba guardián: toda llamada a un tercero lleva tiempo límite (lección 63)', () => {
  it('cada fetch( de esta carpeta convive con AbortSignal.timeout', () => {
    const dir = new URL('.', import.meta.url);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))) {
      const source = readFileSync(new URL(file, dir), 'utf8');
      if (/\bfetch\(/.test(source)) expect(source, file).toContain('AbortSignal.timeout');
    }
  });
});
