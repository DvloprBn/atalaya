-- CreateEnum
CREATE TYPE "email_token_purpose" AS ENUM ('register', 'password_reset');

-- CreateEnum
CREATE TYPE "mail_status" AS ENUM ('pending', 'sending', 'sent', 'failed');

-- CreateTable
CREATE TABLE "roles" (
    "id" INTEGER NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "level" INTEGER NOT NULL,
    "max_count" INTEGER,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT,
    "email_verified_at" TIMESTAMPTZ(3),
    "role_id" INTEGER NOT NULL,
    "disabled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" VARCHAR(32),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMPTZ(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_tokens" (
    "id" UUID NOT NULL,
    "purpose" "email_token_purpose" NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "user_id" UUID,
    "password_hash" TEXT,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_outbox" (
    "id" UUID NOT NULL,
    "to_address" VARCHAR(254) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "text" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "status" "mail_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "roles_level_key" ON "roles"("level");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_idx" ON "refresh_tokens"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_tokens_token_hash_key" ON "email_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_tokens_email_idx" ON "email_tokens"("email");

-- CreateIndex
CREATE INDEX "mail_outbox_status_next_attempt_at_idx" ON "mail_outbox"("status", "next_attempt_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
-- Escrito a mano: lo que el schema de Prisma no sabe expresar.
-- La base es la última línea de defensa: si el código fallara, estas reglas
-- siguen rechazando datos imposibles.
-- ════════════════════════════════════════════════════════════════════════════

-- Los 6 niveles de permiso. Filas FIJAS: viven aquí, no en una semilla, para
-- que toda base (local, CI, demo) tenga exactamente los mismos ids.
INSERT INTO "roles" ("id", "name", "level", "max_count") VALUES
  (1, 'usuario',  0, NULL),
  (2, 'staff',    1, NULL),
  (3, 'manager',  2, NULL),
  (4, 'admin',    3, NULL),
  (5, 'director', 4, 1),
  (6, 'super',    5, 1);

ALTER TABLE "roles"
  ADD CONSTRAINT "roles_level_range" CHECK ("level" BETWEEN 0 AND 5),
  ADD CONSTRAINT "roles_max_count_positive" CHECK ("max_count" IS NULL OR "max_count" > 0);

-- El correo siempre se guarda normalizado: así 'Ana@X.com' y 'ana@x.com' no son dos cuentas.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));

-- Una sesión revocada siempre dice por qué, y solo con un motivo conocido.
-- OJO (lección 13): `NULL IN (...)` da NULL y un CHECK que da NULL PASA.
-- Por eso el "IS NOT NULL" explícito: sin él, revocar sin motivo se colaba.
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_revoked_reason" CHECK (
    ("revoked_at" IS NULL AND "revoked_reason" IS NULL) OR
    ("revoked_at" IS NOT NULL AND "revoked_reason" IS NOT NULL
      AND "revoked_reason" IN ('logout', 'password_reset', 'reuse_detected'))
  );

-- Cada propósito lleva exactamente sus datos: el registro trae la contraseña
-- (todavía no hay usuario); el restablecimiento apunta a un usuario y no trae contraseña.
ALTER TABLE "email_tokens"
  ADD CONSTRAINT "email_tokens_email_lowercase" CHECK ("email" = lower("email")),
  ADD CONSTRAINT "email_tokens_purpose_fields" CHECK (
    ("purpose" = 'register'       AND "password_hash" IS NOT NULL AND "user_id" IS NULL) OR
    ("purpose" = 'password_reset' AND "password_hash" IS NULL     AND "user_id" IS NOT NULL)
  );

ALTER TABLE "mail_outbox"
  ADD CONSTRAINT "mail_outbox_attempts_range" CHECK ("attempts" BETWEEN 0 AND 10);
