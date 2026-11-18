'use client';
import { useEffect, useState } from 'react';
import type { components } from '@/lib/api-schema';
import { api } from '@/lib/browser-api';
import { AUDIT_LABELS, label } from '@/lib/security-view';
import { Pager } from './pager';

type AuditPage = components['schemas']['AuditPage'];

const when = (iso: string) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' });

/** Quién hizo qué sobre qué cuenta. «—» = la API no muestra esa cuenta (está a tu nivel o por encima). */
export function AuditTable() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditPage | null>(null);

  useEffect(() => {
    let current = true;
    void (async () => {
      const res = await api.get<AuditPage>(`/api/admin/audit?page=${page}`);
      if (current && res.ok && res.data) setData(res.data);
    })();
    return () => { current = false; };
  }, [page]);

  return (
    <section className="card stack" aria-labelledby="auditoria">
      <h2 id="auditoria">Auditoría</h2>
      {data && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Cuándo</th>
                  <th scope="col">Acción</th>
                  <th scope="col">Quién</th>
                  <th scope="col">Sobre</th>
                  <th scope="col">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{when(e.createdAt)}</td>
                    <td>{label(AUDIT_LABELS, e.action)}</td>
                    <td className="mono">{e.actor?.email ?? '—'}</td>
                    <td className="mono">{e.target?.email ?? '—'}</td>
                    <td className="mono muted">{e.detail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.items.length === 0 && <p className="muted">Todavía no hay acciones registradas.</p>}
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </section>
  );
}
