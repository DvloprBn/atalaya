-- AlterTable
ALTER TABLE "analyses" ADD COLUMN     "insights" JSONB,
ADD COLUMN     "kind" VARCHAR(8) NOT NULL DEFAULT 'sales';

-- ════════════════════════════════════════════════════════════════════════════
-- Escrito a mano.
-- ════════════════════════════════════════════════════════════════════════════

-- Conjunto cerrado (como en estados y motivos): agregar un tipo es una migración nueva a propósito.
ALTER TABLE "analyses"
  ADD CONSTRAINT "analyses_kind_known" CHECK ("kind" IN ('sales', 'expenses')),
  -- Los indicadores solo existen con el análisis terminado (en los de v0.9 siguen siendo NULL: no hay «recalcular»).
  ADD CONSTRAINT "analyses_insights_only_when_done" CHECK ("insights" IS NULL OR "status" = 'done'),
  -- Y es un objeto JSON (nunca un arreglo, un número ni el literal null de JSON).
  ADD CONSTRAINT "analyses_insights_object" CHECK ("insights" IS NULL OR jsonb_typeof("insights") = 'object');

-- El worker escribe los indicadores junto con el informe. Mismo criterio de siempre: por COLUMNA y lo justo.
-- NO recibe SELECT sobre `kind`: calcula lo mismo para ventas y para gastos; lo que cambia es el significado, y eso
-- lo muestra la pantalla.
GRANT UPDATE ("insights") ON "analyses" TO atalaya_worker;
