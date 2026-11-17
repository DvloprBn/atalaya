-- AlterEnum
ALTER TYPE "email_token_purpose" ADD VALUE 'invite';

-- ════════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- OJO: un valor nuevo de un enum NO se puede usar en la misma transacción que
-- lo agrega ("unsafe use of new value"). Por eso el CHECK de abajo no nombra
-- 'invite': describe "todo lo que no es registro", que cubre password_reset e invite.
-- ════════════════════════════════════════════════════════════════════════════

-- Registro: trae la contraseña y todavía no hay usuario.
-- Restablecer e invitación: apuntan a un usuario y no traen contraseña.
ALTER TABLE "email_tokens" DROP CONSTRAINT "email_tokens_purpose_fields";
ALTER TABLE "email_tokens"
  ADD CONSTRAINT "email_tokens_purpose_fields" CHECK (
    ("purpose" = 'register'  AND "password_hash" IS NOT NULL AND "user_id" IS NULL) OR
    ("purpose" <> 'register' AND "password_hash" IS NULL     AND "user_id" IS NOT NULL)
  );

-- Desactivar una cuenta revoca sus sesiones: al reactivarla, ninguna revive.
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_revoked_reason";
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_revoked_reason" CHECK (
    ("revoked_at" IS NULL AND "revoked_reason" IS NULL) OR
    ("revoked_at" IS NOT NULL AND "revoked_reason" IS NOT NULL
      AND "revoked_reason" IN ('logout', 'password_reset', 'reuse_detected', 'account_disabled'))
  );
