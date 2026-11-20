-- v1.0 · Demo de 24 h. Aditiva: una columna que admite null (las cuentas de antes quedan permanentes) y su índice,
-- que usa el barrido de cada 15 minutos y el conteo del tope global de cuentas de prueba.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "expires_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "users_expires_at_idx" ON "users"("expires_at");

-- SQL a mano: una cuenta vence DESPUÉS de nacer. Un reloj mal puesto o un error de código no puede crear una cuenta
-- que nazca ya vencida (el barrido la borraría al instante, con lo que alguien acabara de subir).
ALTER TABLE "users" ADD CONSTRAINT "users_expires_after_created" CHECK ("expires_at" IS NULL OR "expires_at" > "created_at");
