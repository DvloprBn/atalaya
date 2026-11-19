import type { Analysis } from '../generated/prisma/client.js';

// Lo que sale por la API sigue el contrato. Nunca sale `ownerId` ni `resultKey` (dónde están los resultados en disco).
// `preview`, `mapping`, `report` e `insights` son JSON que escribió el worker (los dos primeros, con dato hostil ya recortado):
// aquí pasan tal cual y la pantalla los muestra siempre como TEXTO.
export const toAnalysis = (a: Analysis) => ({
  id: a.id,
  uploadId: a.uploadId,
  kind: a.kind,
  status: a.status,
  failReason: a.failReason,
  preview: a.preview ?? null,
  mapping: a.mapping ?? null,
  report: a.report ?? null,
  insights: a.insights ?? null, // lo escribe el worker, solo con el análisis terminado
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});
