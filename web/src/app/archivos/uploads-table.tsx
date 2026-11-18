'use client';
import { api, type Upload } from '@/lib/browser-api';
import { formatSize, isPending, REJECT_LABELS, STATUS_LABELS, when } from '@/lib/upload-view';

/** Mis archivos. Todo lo que aquí aparece lo confirmó la API; borrar vuelve a leer la lista, no «adivina». */
export function UploadsTable({ items, onChanged }: { items: Upload[]; onChanged: () => void }) {
  async function remove(upload: Upload) {
    if (!window.confirm(`¿Borrar «${upload.displayName ?? 'este archivo'}»? No se puede deshacer.`)) return;
    await api.delete(`/api/uploads/${upload.id}`);
    onChanged();
  }

  if (items.length === 0) return <p className="muted">Todavía no has subido nada.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th scope="col">Archivo</th>
            <th scope="col">Tipo</th>
            <th scope="col">Tamaño</th>
            <th scope="col">Estado</th>
            <th scope="col">Subido</th>
            <th scope="col"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((u) => (
            <tr key={u.id}>
              <td style={{ overflowWrap: 'anywhere' }}>{u.displayName ?? <span className="muted">sin nombre</span>}</td>
              <td className="mono">{u.kind}</td>
              <td className="mono">{formatSize(u.sizeBytes)}</td>
              <td>
                {/* data-state pinta el punto del chip: turquesa = aceptado, ámbar = rechazado, sin punto = pendiente */}
                <span className="chip" data-state={u.status === 'accepted' ? 'ok' : u.status === 'rejected' ? 'down' : undefined}>
                  {STATUS_LABELS[u.status]}
                </span>
                {u.status === 'rejected' && (
                  <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                    {REJECT_LABELS[u.rejectReason ?? ''] ?? 'No pasó la revisión.'}
                  </p>
                )}
                {isPending(u) && <span className="sr-only"> (la lista se actualiza sola)</span>}
              </td>
              <td className="mono">{when(u.createdAt)}</td>
              <td>
                <button className="secondary" onClick={() => remove(u)} aria-label={`Borrar ${u.displayName ?? 'archivo'}`}>
                  Borrar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
