-- v1.0 · S-10 (recuperación asistida del 2FA). La tabla la generó Prisma (migrate diff); al final, SQL a mano para lo
-- que el esquema no expresa. Aditiva: una tabla nueva y un conjunto cerrado que se AMPLÍA.

-- CreateTable
CREATE TABLE "two_factor_resets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "requested_by_id" UUID,
    "reason" VARCHAR(200) NOT NULL,
    "cancel_token_hash" CHAR(64) NOT NULL,
    "effective_at" TIMESTAMPTZ(3) NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "applied_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_resets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_resets_cancel_token_hash_key" ON "two_factor_resets"("cancel_token_hash");

-- CreateIndex
CREATE INDEX "two_factor_resets_effective_at_idx" ON "two_factor_resets"("effective_at");

-- AddForeignKey
ALTER TABLE "two_factor_resets" ADD CONSTRAINT "two_factor_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor_resets" ADD CONSTRAINT "two_factor_resets_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A lo más UNA solicitud PENDIENTE por cuenta: dos admins a la vez (o el mismo dos veces) no pueden apilar dos
-- relojes distintos. Las canceladas y aplicadas quedan como historia y no cuentan.
CREATE UNIQUE INDEX "two_factor_resets_one_pending" ON "two_factor_resets" ("user_id")
  WHERE "cancelled_at" IS NULL AND "applied_at" IS NULL;

-- Una solicitud termina de UNA forma: cancelada o aplicada, nunca las dos.
ALTER TABLE "two_factor_resets"
  ADD CONSTRAINT "two_factor_resets_one_outcome" CHECK ("cancelled_at" IS NULL OR "applied_at" IS NULL),
  -- El motivo es la constancia de cómo se verificó la identidad: no puede ir vacío (la API exige 10 caracteres).
  ADD CONSTRAINT "two_factor_resets_reason_present" CHECK (length(btrim("reason")) >= 10),
  ADD CONSTRAINT "two_factor_resets_effective_after_created" CHECK ("effective_at" > "created_at");

-- Sin permisos para el rol del worker (atalaya_worker): esta tabla no es asunto suyo, y no hay permisos por defecto.

-- Tres acciones nuevas de auditoría.
ALTER TABLE "audit_logs"
  DROP CONSTRAINT "audit_logs_action_known",
  ADD CONSTRAINT "audit_logs_action_known" CHECK ("action" IN (
    'user_created', 'role_changed', 'user_disabled', 'user_enabled',
    'two_factor_enabled', 'two_factor_disabled', 'recovery_codes_regenerated',
    'totp_key_rotated',
    'two_factor_reset_requested', 'two_factor_reset_cancelled', 'two_factor_reset_applied'));
