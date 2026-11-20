'use client';
import { type FormEvent, useRef, useState } from 'react';
import { api, type Upload } from '@/lib/browser-api';
import { ACCEPT, precheck } from '@/lib/upload-view';
import { useDemo } from '@/lib/use-demo';

/** Elegir un archivo y mandarlo. La API decide si lo acepta; aquí solo se muestra lo que responde. */
export function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const demo = useDemo();
  const [noRealData, setNoRealData] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setOk('');
    const file = input.current?.files?.[0];
    const problem = precheck(file);
    if (problem) return setError(problem);
    if (demo?.enabled && !noRealData) return setError('Marca la casilla: confirma que el archivo no contiene datos reales de personas.');
    setError('');
    setBusy(true);
    const form = new FormData();
    form.append('file', file!);
    // La casilla la exige la API (400 sin ella); aquí solo se manda lo que la persona marcó.
    if (demo?.enabled) form.append('noRealData', String(noRealData));
    const res = await api.upload<Upload>('/api/uploads', form);
    setBusy(false);
    if (!res.ok) return setError(res.message ?? 'No se pudo subir el archivo.');
    if (input.current) input.current.value = '';
    setNoRealData(false); // se confirma archivo por archivo, no una vez para siempre
    setOk('Archivo recibido. Se está revisando.');
    onUploaded();
  }

  return (
    <form className="card stack" onSubmit={submit} aria-labelledby="subir">
      <h2 id="subir">Subir un archivo</h2>
      <p className="muted">
        CSV (UTF-8), Excel .xlsx sin macros, un CFDI 3.3 o 4.0 en .xml, un .zip de CFDI (cada parte, un .xml) o un PDF con
        una tabla.
        Hasta 5 MB, 50 000 filas y 200 columnas; hasta 10 archivos por cuenta. Usa solo datos de prueba.
        {demo?.limits && ` En la demo: ${demo.limits.uploadsPerDay} subidas y ${demo.limits.analysesPerDay} análisis cada 24 horas.`}
      </p>
      <p className="muted">
        Los CFDI se leen como datos de ventas (un renglón por concepto). Atalaya <strong>no es una herramienta fiscal</strong>:
        no valida el sello ni el timbrado ante el SAT ni sirve para declarar.
      </p>
      <p className="muted">
        De un PDF se lee su tabla <strong>con líneas</strong> (y las páginas que la continúan), hasta 50 páginas. No se leen
        escaneos, PDF protegidos con contraseña ni PDF con JavaScript o archivos adjuntos.
      </p>
      <label>
        Archivo
        <input ref={input} type="file" name="file" accept={ACCEPT} required />
      </label>
      {demo?.enabled && (
        <label className="check">
          <input type="checkbox" name="noRealData" required checked={noRealData} onChange={(e) => setNoRealData(e.target.checked)} />
          Confirmo que no contiene datos reales de personas
        </label>
      )}
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
