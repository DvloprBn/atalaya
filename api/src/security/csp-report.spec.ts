import { summarizeCspReport } from './csp-report.js';

describe('summarizeCspReport', () => {
  it('formato viejo (report-uri): directiva y HOST, nunca la ruta ni los parámetros', () => {
    const body = { 'csp-report': { 'effective-directive': 'script-src-elem', 'blocked-uri': 'https://evil.example/x.js?token=SECRETO', 'document-uri': 'http://localhost/login#challenge=ABC' } };
    const out = summarizeCspReport(body);
    expect(out).toBe('script-src-elem evil.example');
    expect(out).not.toMatch(/SECRETO|challenge|x\.js/);
  });
  it('formato nuevo (Reporting API, arreglo)', () => {
    expect(summarizeCspReport([{ type: 'csp-violation', body: { effectiveDirective: 'img-src', blockedURL: 'https://cdn.example/a.png' } }])).toBe('img-src cdn.example');
  });
  it('inline y eval se conservan como palabra', () => {
    expect(summarizeCspReport({ 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'inline' } })).toBe('script-src inline');
  });
  it('basura → null (el recolector igual responde 204)', () => {
    for (const junk of [null, 'x', 42, [], {}, { 'csp-report': 'x' }, { 'csp-report': {} }, [[]]]) expect(summarizeCspReport(junk)).toBeNull();
  });
  it('lo larguísimo o con control se recorta', () => {
    const out = summarizeCspReport({ 'csp-report': { 'effective-directive': 'a'.repeat(500), 'blocked-uri': 'inline' } });
    expect(out?.length).toBeLessThanOrEqual(120);
  });
});
