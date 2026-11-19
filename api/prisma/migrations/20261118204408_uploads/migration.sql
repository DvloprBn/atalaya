-- CreateTable
CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "display_name" VARCHAR(100),
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storage_key" CHAR(32) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'queued',
    "reject_reason" VARCHAR(24),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_at" TIMESTAMPTZ(3),
    "delete_requested_at" TIMESTAMPTZ(3),

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uploads_storage_key_key" ON "uploads"("storage_key");

-- CreateIndex
CREATE INDEX "uploads_owner_id_created_at_idx" ON "uploads"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "uploads_status_created_at_idx" ON "uploads"("status", "created_at");

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ════════════════════════════════════════════════════════════════════════════

-- Conjuntos cerrados (misma idea que la bitácora): agregar un valor es una migración nueva a propósito,
-- así el contrato, el worker y la base nunca discrepan. 5242880 = 5 MB, el tope del contrato.
ALTER TABLE "uploads"
  ADD CONSTRAINT "uploads_kind_known" CHECK ("kind" IN ('csv', 'xlsx')),
  ADD CONSTRAINT "uploads_status_known" CHECK ("status" IN ('queued', 'checking', 'accepted', 'rejected')),
  ADD CONSTRAINT "uploads_reject_reason_known" CHECK ("reject_reason" IS NULL OR "reject_reason" IN (
    'zip_bomb', 'too_many_entries', 'range_too_large', 'corrupt', 'empty', 'worker_timeout')),
  ADD CONSTRAINT "uploads_size_range" CHECK ("size_bytes" BETWEEN 1 AND 5242880),
  ADD CONSTRAINT "uploads_sha256_hex" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "uploads_storage_key_hex" CHECK ("storage_key" ~ '^[0-9a-f]{32}$'),
  -- Hay motivo si y solo si fue rechazado. Ambos lados son NOT NULL-seguros: se comparan booleanos, no valores.
  ADD CONSTRAINT "uploads_reason_iff_rejected" CHECK (("status" = 'rejected') = ("reject_reason" IS NOT NULL)),
  -- Hay fecha de revisión si y solo si la revisión terminó.
  ADD CONSTRAINT "uploads_checked_iff_done" CHECK (("status" IN ('accepted', 'rejected')) = ("checked_at" IS NOT NULL));
