-- CreateTable
CREATE TABLE "analyses" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "upload_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'previewing',
    "fail_reason" VARCHAR(24),
    "preview" JSONB,
    "mapping" JSONB,
    "report" JSONB,
    "result_key" CHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analyses_result_key_key" ON "analyses"("result_key");

-- CreateIndex
CREATE INDEX "analyses_owner_id_created_at_idx" ON "analyses"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "analyses_upload_id_idx" ON "analyses"("upload_id");

-- CreateIndex
CREATE INDEX "analyses_status_created_at_idx" ON "analyses"("status", "created_at");

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ════════════════════════════════════════════════════════════════════════════

-- Conjuntos cerrados (como en las subidas): agregar un valor es una migración nueva a propósito.
ALTER TABLE "analyses"
  ADD CONSTRAINT "analyses_status_known" CHECK ("status" IN (
    'previewing', 'awaiting_mapping', 'queued', 'running', 'done', 'failed')),
  ADD CONSTRAINT "analyses_fail_reason_known" CHECK ("fail_reason" IS NULL OR "fail_reason" IN (
    'unreadable', 'no_header', 'too_few_columns', 'mapping_invalid', 'nothing_left', 'worker_timeout')),
  ADD CONSTRAINT "analyses_result_key_hex" CHECK ("result_key" ~ '^[0-9a-f]{32}$'),
  -- Hay motivo si y solo si falló (se comparan booleanos: no depende de que la columna pueda ser NULL).
  ADD CONSTRAINT "analyses_reason_iff_failed" CHECK (("status" = 'failed') = ("fail_reason" IS NOT NULL)),
  -- Hay informe si y solo si terminó bien.
  ADD CONSTRAINT "analyses_report_iff_done" CHECK (("status" = 'done') = ("report" IS NOT NULL)),
  -- Cada etapa exige lo que la anterior debió dejar: sin vista previa no se confirma nada, sin mapeo no se limpia.
  ADD CONSTRAINT "analyses_preview_before_mapping" CHECK (
    "status" NOT IN ('awaiting_mapping', 'queued', 'running', 'done') OR "preview" IS NOT NULL),
  ADD CONSTRAINT "analyses_mapping_before_cleaning" CHECK (
    "status" NOT IN ('queued', 'running', 'done') OR "mapping" IS NOT NULL),
  -- Los tres JSON son objetos (nunca un arreglo, un número o el literal null de JSON).
  ADD CONSTRAINT "analyses_json_objects" CHECK (
    ("preview" IS NULL OR jsonb_typeof("preview") = 'object')
    AND ("mapping" IS NULL OR jsonb_typeof("mapping") = 'object')
    AND ("report" IS NULL OR jsonb_typeof("report") = 'object'));

-- ── Permisos del worker (mismo criterio que en uploads_worker_role: por COLUMNA, lo justo) ──
-- Lee lo necesario para ubicar el trabajo y el mapeo; NO ve de quién es el análisis (owner_id).
GRANT SELECT ("id", "upload_id", "status", "mapping", "result_key") ON "analyses" TO atalaya_worker;
-- Escribe el resultado de su trabajo: estado, vista previa, informe y motivo del fallo. No toca el mapeo
-- (lo confirma la persona y lo valida la API), ni el dueño, ni el nombre de los resultados.
GRANT UPDATE ("status", "preview", "report", "fail_reason", "updated_at") ON "analyses" TO atalaya_worker;
