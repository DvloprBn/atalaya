-- CreateTable
CREATE TABLE "security_events" (
    "id" UUID NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "user_id" UUID,
    "ip_hash" CHAR(64),
    "detail" VARCHAR(120),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "actor_id" UUID,
    "target_id" UUID,
    "detail" VARCHAR(120),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_events_created_at_idx" ON "security_events"("created_at");

-- CreateIndex
CREATE INDEX "security_events_type_created_at_idx" ON "security_events"("type", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ════════════════════════════════════════════════════════════════════════════

-- Los tipos son un conjunto cerrado: agregar uno es una migración nueva a propósito (así el panel,
-- el contrato y la base nunca discrepan sobre qué puede haber en la bitácora).
ALTER TABLE "security_events"
  ADD CONSTRAINT "security_events_type_known" CHECK ("type" IN (
    'login_failed', 'login_locked', 'two_factor_failed', 'refresh_reuse',
    'google_rejected', 'rate_limited', 'csp_violation')),
  ADD CONSTRAINT "security_events_ip_hash_hex" CHECK ("ip_hash" IS NULL OR "ip_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_action_known" CHECK ("action" IN (
    'user_created', 'role_changed', 'user_disabled', 'user_enabled',
    'two_factor_enabled', 'two_factor_disabled', 'recovery_codes_regenerated'));
