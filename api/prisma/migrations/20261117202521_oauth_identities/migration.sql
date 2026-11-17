-- CreateTable
CREATE TABLE "oauth_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_identities_provider_subject_key" ON "oauth_identities"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_identities_user_id_provider_key" ON "oauth_identities"("user_id", "provider");

-- AddForeignKey
ALTER TABLE "oauth_identities" ADD CONSTRAINT "oauth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ════════════════════════════════════════════════════════════════════════════

-- Hoy solo Google. Agregar otro proveedor es una migración nueva a propósito: es una decisión de seguridad.
ALTER TABLE "oauth_identities"
  ADD CONSTRAINT "oauth_identities_provider_known" CHECK ("provider" IN ('google')),
  ADD CONSTRAINT "oauth_identities_subject_present" CHECK (length("subject") > 0),
  ADD CONSTRAINT "oauth_identities_email_lowercase" CHECK ("email" = lower("email"));
