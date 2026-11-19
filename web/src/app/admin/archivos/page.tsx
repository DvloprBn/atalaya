'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { type AdminUploadPage, api, type PublicUser } from '@/lib/browser-api';
import { formatSize, STATUS_LABELS, when } from '@/lib/upload-view';
import { Pager } from '../seguridad/pager';

const ADMIN_LEVEL = 3;

// Archivos de las cuentas de nivel menor al tuyo: SOLO metadatos. El admin administra cuentas, no lee datos
// (decisión de arranque): la API no tiene ruta para el contenido ni para el nombre original.
export default function AdminFilesPage() {
  const router = useRouter();
  const [me, setMe] = useState<PublicUser | null>(null);
  const [data, setData] = useState<AdminUploadPage | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    void api.get<PublicUser>('/api/auth/me').then((res) => {
      if (!res.ok || !res.data) return router.replace('/login');
      if (res.data.role.level < ADMIN_LEVEL) return router.replace('/cuenta');
      setMe(res.data);
    });
  }, [router]);

  useEffect(() => {
    if (!me) return;
    let current = true; // si cambias de página a media carga, la respuesta vieja no pisa a la nueva
    void api.get<AdminUploadPage>(`/api/admin/uploads?page=${page}`).then((res) => {
      if (current && res.ok && res.data) setData(res.data);
    });
    return () => { current = false; };
  }, [me, page]);

  if (!me) return <main className="mono muted" style={{ padding: 40 }}>Cargando…</main>;

  return (
    <AppShell user={me}>
      <h1>Archivos de las cuentas</h1>
      <section className="card stack" aria-labelledby="meta">
        <h2 id="meta">Metadatos</h2>
        <p className="muted">Solo dueño, tipo, tamaño, estado y fecha. El contenido y el nombre del archivo no se muestran.</p>
        {data && data.items.length === 0 && <p className="muted">No hay archivos de cuentas de nivel menor al tuyo.</p>}
        {data && data.items.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Cuenta</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Tamaño</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Subido</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id}>
                    <td className="mono" style={{ overflowWrap: 'anywhere' }}>{u.ownerEmail}</td>
                    <td className="mono">{u.kind}</td>
                    <td className="mono">{formatSize(u.sizeBytes)}</td>
                    <td><span className="chip" data-state={u.status === 'accepted' ? 'ok' : u.status === 'rejected' ? 'down' : undefined}>{STATUS_LABELS[u.status]}</span></td>
                    <td className="mono">{when(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.pageSize && <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </section>
    </AppShell>
  );
}
