-- v0.11 (CFDI en XML). Escrita a mano: no cambia el esquema de Prisma (las columnas ya existen y caben:
-- `kind` es VARCHAR(8)); solo se AMPLÍAN dos conjuntos cerrados. Es compatible hacia atrás: todo valor que ya existía
-- sigue siendo válido, así que ninguna fila actual puede violar las nuevas restricciones.

-- Los tipos de archivo: se suman `xml` (un CFDI) y `zip` (varios, como los baja el portal del SAT).
ALTER TABLE "uploads"
  DROP CONSTRAINT "uploads_kind_known",
  ADD CONSTRAINT "uploads_kind_known" CHECK ("kind" IN ('csv', 'xlsx', 'xml', 'zip'));

-- Los motivos de rechazo: se suma `not_cfdi` (un XML, o una entrada de un ZIP, que no es un comprobante CFDI 3.3 o 4.0).
-- Un XML con DOCTYPE o entidades (XXE) sale como `corrupt`: no hace falta un motivo propio.
ALTER TABLE "uploads"
  DROP CONSTRAINT "uploads_reject_reason_known",
  ADD CONSTRAINT "uploads_reject_reason_known" CHECK ("reject_reason" IS NULL OR "reject_reason" IN (
    'zip_bomb', 'too_many_entries', 'range_too_large', 'corrupt', 'empty', 'worker_timeout', 'not_cfdi'));
