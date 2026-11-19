-- v0.12 (PDF). Escrita a mano, igual que la de v0.11: no cambia el esquema de Prisma (`kind` es VARCHAR(8) y
-- `reject_reason` VARCHAR(24); el motivo más largo, `active_content`, tiene 14). Solo se AMPLÍAN dos conjuntos
-- cerrados, así que es compatible hacia atrás: ninguna fila actual puede violar las nuevas restricciones.

-- Los tipos de archivo: se suma `pdf` (un PDF con capa de texto que trae una tabla de ventas o gastos).
ALTER TABLE "uploads"
  DROP CONSTRAINT "uploads_kind_known",
  ADD CONSTRAINT "uploads_kind_known" CHECK ("kind" IN ('csv', 'xlsx', 'xml', 'zip', 'pdf'));

-- Los motivos de rechazo, solo de PDF: `encrypted` (protegido o cifrado), `active_content` (JavaScript, acciones,
-- archivos incrustados, XFA), `no_text_layer` (un escaneo: no se hace OCR) y `no_table` (texto sin ninguna tabla).
-- Demasiadas páginas o la memoria agotada salen como `range_too_large`; el tiempo agotado, como `worker_timeout`.
ALTER TABLE "uploads"
  DROP CONSTRAINT "uploads_reject_reason_known",
  ADD CONSTRAINT "uploads_reject_reason_known" CHECK ("reject_reason" IS NULL OR "reject_reason" IN (
    'zip_bomb', 'too_many_entries', 'range_too_large', 'corrupt', 'empty', 'worker_timeout', 'not_cfdi',
    'encrypted', 'active_content', 'no_text_layer', 'no_table'));
