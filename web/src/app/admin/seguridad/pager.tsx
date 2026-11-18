/** Anterior / Siguiente. La API manda total y tamaño de página: aquí solo se calcula si hay más. */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="row" style={{ alignItems: 'center' }}>
      <button className="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
      <span className="mono muted">Página {page} de {last} · {total} en total</span>
      <button className="secondary" disabled={page >= last} onClick={() => onPage(page + 1)}>Siguiente</button>
    </div>
  );
}
