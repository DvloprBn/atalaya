'use client';
import { useEffect, useState } from 'react';
import { api, type DemoInfo } from './browser-api';

/**
 * v1.0 · ¿Es esto la demo de 24 h? Lo pregunta a la API (GET /api/demo, pública) una vez por pantalla.
 * null mientras no responde: las pantallas no muestran ni piden nada de la demo hasta saberlo. Si la llamada falla,
 * la pantalla se comporta como fuera de la demo; no pasa nada malo, porque la casilla y los topes los exige la API.
 */
export function useDemo(): DemoInfo | null {
  const [info, setInfo] = useState<DemoInfo | null>(null);
  useEffect(() => {
    let current = true;
    api
      .get<DemoInfo>('/api/demo')
      .then((res) => current && res.ok && res.data && setInfo(res.data))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  return info;
}
