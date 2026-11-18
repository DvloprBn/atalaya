import type { Upload } from '../generated/prisma/client.js';

// Lo que sale por la API sigue el contrato (contracts/openapi.yaml). Nunca sale `sha256`, `storageKey`
// ni nada que revele dónde está el archivo.

export const toUpload = (u: Upload) => ({
  id: u.id,
  kind: u.kind,
  ...(u.displayName ? { displayName: u.displayName } : {}), // omitido si no hay, como dice el contrato
  sizeBytes: u.sizeBytes,
  status: u.status,
  rejectReason: u.rejectReason,
  createdAt: u.createdAt,
  checkedAt: u.checkedAt,
});

/** Lo que ve un admin: sin contenido ni nombre original (el admin administra cuentas, no lee datos). */
export const toAdminUpload = (u: Upload & { owner: { email: string } }) => ({
  id: u.id,
  ownerEmail: u.owner.email,
  kind: u.kind,
  sizeBytes: u.sizeBytes,
  status: u.status,
  createdAt: u.createdAt,
});
