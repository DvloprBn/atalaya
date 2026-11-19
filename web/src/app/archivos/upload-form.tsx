'use client';
import { type FormEvent, useRef, useState } from 'react';
import { api, type Upload } from '@/lib/browser-api';
import { ACCEPT, precheck } from '@/lib/upload-view';

/** Elegir un archivo y mandarlo. La API decide si lo acepta; aquí solo se muestra lo que responde. */
export function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setOk('');
    const file = input.current?.files?.[0];
    const problem = precheck(file);
    if (problem) return setError(problem);
    setError('');
    setBusy(true);
    const form = new FormData();
    form.append('file', file!);
    const res = await api.upload<Upload>('/api/uploads', form);
    setBusy(false);
    if (!res.ok) return setError(res.message ?? 'No se pudo subir el archivo.');
    if (input.current) input.current.value = '';
    setOk('Archivo recibido. Se está revisando.');
    onUploaded();
  }

  return (
    <form className="card stack" onSubmit={submit} aria-labelledby="subir">
      <h2 id="subir">Subir un archivo</h2>
      <p className="muted">
        CSV (UTF-8), Excel .xlsx sin macros, un CFDI 3.3 o 4.0 en .xml, o un .zip de CFDI (cada parte, un .xml).
        Hasta 5 MB, 50 000 filas y 200 columnas; hasta 10 archivos por cuenta. Usa solo datos de prueba.
      </p>
      <p className="muted">
        Los CFDI se leen como datos de ventas (un renglón por concepto). Atalaya <strong>no es una herramienta fiscal</strong>:
        no valida el sello ni el timbrado ante el SAT ni sirve para declarar.
      </p>
      <label>
        Archivo
        <input ref={input} type="file" name="file" accept={ACCEPT} required />
      </label>
      <div className="row">
        <button type="submit" disabled={busy}>
          {busy ? 'Subiendo…' : 'Subir'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {ok && <p role="status">{ok}</p>}
    </form>
  );
}
