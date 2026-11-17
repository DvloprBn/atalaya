'use client';
import { type FormEvent, useState } from 'react';
import type { ApiResult } from './browser-api';

/**
 * Lo que comparten todos los formularios de acceso: leer los campos, evitar
 * el doble envío y mostrar el mensaje de la API. Cada pantalla solo dice QUÉ
 * hacer con los datos.
 */
export function useForm<T>(submit: (fields: Record<string, string>) => Promise<ApiResult<T>>) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResult<T> | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const fields = Object.fromEntries(
      [...new FormData(event.currentTarget)].map(([k, v]) => [k, typeof v === 'string' ? v : '']),
    );
    setResult(await submit(fields));
    setBusy(false);
  }

  return { busy, result, onSubmit };
}
