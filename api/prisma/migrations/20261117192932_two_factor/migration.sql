-- CreateTable
CREATE TABLE "two_factors" (
    "user_id" UUID NOT NULL,
    "secret_enc" TEXT NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "last_used_step" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factors_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recovery_codes_code_hash_key" ON "recovery_codes"("code_hash");

-- CreateIndex
CREATE INDEX "recovery_codes_user_id_idx" ON "recovery_codes"("user_id");

-- AddForeignKey
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ════════════════════════════════════════════════════════════════════════════

-- Activar o desactivar el 2FA cierra las demás sesiones de la cuenta: motivo nuevo.
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_revoked_reason";
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_revoked_reason" CHECK (
    ("revoked_at" IS NULL AND "revoked_reason" IS NULL) OR
    ("revoked_at" IS NOT NULL AND "revoked_reason" IS NOT NULL
      AND "revoked_reason" IN ('logout', 'password_reset', 'reuse_detected', 'account_disabled', 'two_factor_changed'))
  );

-- Un paso de tiempo de 30 s nunca es negativo; y una cuenta confirmada siempre
-- tiene un secreto (no puede haber un "2FA activo" vacío).
ALTER TABLE "two_factors"
  ADD CONSTRAINT "two_factors_step_positive" CHECK ("last_used_step" IS NULL OR "last_used_step" >= 0),
  ADD CONSTRAINT "two_factors_secret_present" CHECK (length("secret_enc") > 0);

-- El hash de un código de recuperación es siempre un SHA-256 en hexadecimal.
ALTER TABLE "recovery_codes"
  ADD CONSTRAINT "recovery_codes_hash_hex" CHECK ("code_hash" ~ '^[0-9a-f]{64}$');
