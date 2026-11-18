'use client';
import { useEffect, useState } from 'react';
import type { components } from '@/lib/api-schema';
import { api } from '@/lib/browser-api';
import { EVENT_LABELS, label } from '@/lib/security-view';
import { Pager } from './pager';

type EventPage = components['schemas']['SecurityEventPage'];

const when = (iso: string) => new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' });

/** La bitácora de seguridad, con filtro por tipo. Lo que se oculta de las cuentas lo decide la API, no esta tabla. */
export function EventsTable() {
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<EventPage | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true; // si el filtro cambia a media carga, la respuesta vieja no pisa a la nueva
    void (async () => {
      const q = new URLSearchParams({ page: String(page), ...(type ? { type } : {}) });
      const res = await api.get<EventPage>(`/api/admin/security/events?${q}`);
      if (!current) return;
      if (res.ok && res.data) (setData(res.data), setError(''));
      else setError(res.message ?? 'No se pudo leer la bitácora');
    })();
    return () => { current = false; };
  }, [type, page]);

  return (
    <section className="card stack" aria-labelledby="eventos">
      <h2 id="eventos">Bitácora de seguridad</h2>
      <label>
        Tipo{' '}
        <select value={type} onChange={(e) => (setType(e.target.value), setPage(1))}>
          <option value="">Todos</option>
          {Object.entries(EVENT_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Cuándo</th>
                  <th scope="col">Qué</th>
                  <th scope="col">Cuenta</th>
                  <th scope="col">Origen</th>
                  <th scope="col">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{when(e.createdAt)}</td>
                    <td>{label(EVENT_LABELS, e.type)}</td>
                    {/* null = sin cuenta, o una cuenta de tu nivel o superior: la API no la muestra. */}
                    <td className="mono">{e.user?.email ?? '—'}</td>
                    <td className="mono muted" title="Prefijo del hash de la IP: sirve para ver «mismo origen», no para saber quién">{e.source ?? '—'}</td>
                    <td className="mono muted">{e.detail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.items.length === 0 && <p className="muted">Sin eventos de este tipo.</p>}
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </section>
  );
}
