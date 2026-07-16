-- Aportes de investidores (controle de caixa da obra) — versao SIMPLES.
-- Obra inteira, sem calculo de retorno, portal consolidado.
-- Segue as convencoes de public.expenses + RLS via public.can_access_project(project_id).
-- Aplicado primeiro no LOCAL (2026-07-08). Aplicar na producao quando aprovado.

-- 1) Investidores da obra
CREATE TABLE IF NOT EXISTS "public"."investors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "investors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "investors_project_id_fkey" FOREIGN KEY ("project_id")
        REFERENCES "public"."projects"("id") ON DELETE CASCADE
);

-- 2) Aportes (contribuicoes de capital) — vinculados a um investidor, na obra inteira
CREATE TABLE IF NOT EXISTS "public"."contributions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "investor_id" "uuid" NOT NULL,
    "value" numeric NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE,
    "description" "text",
    "user_id" "uuid",
    "user_name" "text",
    "attachments" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contributions_project_id_fkey" FOREIGN KEY ("project_id")
        REFERENCES "public"."projects"("id") ON DELETE CASCADE,
    CONSTRAINT "contributions_investor_id_fkey" FOREIGN KEY ("investor_id")
        REFERENCES "public"."investors"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "investors_project_id_idx" ON "public"."investors" ("project_id");
CREATE INDEX IF NOT EXISTS "contributions_project_id_idx" ON "public"."contributions" ("project_id");
CREATE INDEX IF NOT EXISTS "contributions_investor_id_idx" ON "public"."contributions" ("investor_id");

-- 3) RLS: mesmo padrao das outras tabelas (so membros do projeto)
ALTER TABLE "public"."investors" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "investors_all" ON "public"."investors";
CREATE POLICY "investors_all" ON "public"."investors" TO "authenticated"
    USING ("public"."can_access_project"("project_id"))
    WITH CHECK ("public"."can_access_project"("project_id"));

ALTER TABLE "public"."contributions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contributions_all" ON "public"."contributions";
CREATE POLICY "contributions_all" ON "public"."contributions" TO "authenticated"
    USING ("public"."can_access_project"("project_id"))
    WITH CHECK ("public"."can_access_project"("project_id"));

GRANT ALL ON TABLE "public"."investors" TO "authenticated", "service_role";
GRANT ALL ON TABLE "public"."contributions" TO "authenticated", "service_role";

-- 4) Caixa da obra (calculado ao vivo): aportado - gasto = saldo
--    security_invoker garante que a view respeita o RLS de quem consulta.
CREATE OR REPLACE VIEW "public"."project_cash_summary"
WITH ("security_invoker" = true) AS
SELECT
    p."id" AS "project_id",
    COALESCE((SELECT SUM(c."value") FROM "public"."contributions" c WHERE c."project_id" = p."id"), 0) AS "total_aportado",
    COALESCE((SELECT SUM(e."value") FROM "public"."expenses" e WHERE e."project_id" = p."id"), 0) AS "total_gasto",
      COALESCE((SELECT SUM(c."value") FROM "public"."contributions" c WHERE c."project_id" = p."id"), 0)
    - COALESCE((SELECT SUM(e."value") FROM "public"."expenses" e WHERE e."project_id" = p."id"), 0) AS "saldo"
FROM "public"."projects" p;

GRANT SELECT ON "public"."project_cash_summary" TO "authenticated", "service_role";
