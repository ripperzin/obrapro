-- Aquisição do empreendimento (terreno + custos iniciais) — bloco SEPARADO do orçamento de obra.
-- Regra: NÃO entra no orçamento de construção nem no % de progresso.
-- Entra no Caixa (como saída) SE paid_from_project=true; e sempre no custo total / rentabilidade.
-- Segue convenções de public.expenses + RLS via can_access_project.

CREATE TABLE IF NOT EXISTS "public"."acquisition_costs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "category" "text" NOT NULL DEFAULT 'terreno',   -- terreno|escritura|registro|imposto|comissao|outros
    "description" "text",
    "value" numeric NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE,
    "paid_from_project" boolean NOT NULL DEFAULT true,
    "attachments" "text"[] DEFAULT '{}'::"text"[],
    "user_id" "uuid",
    "user_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "acquisition_costs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "acquisition_costs_project_id_fkey" FOREIGN KEY ("project_id")
        REFERENCES "public"."projects"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "acquisition_costs_project_id_idx" ON "public"."acquisition_costs" ("project_id");

ALTER TABLE "public"."acquisition_costs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acquisition_costs_all" ON "public"."acquisition_costs";
CREATE POLICY "acquisition_costs_all" ON "public"."acquisition_costs" TO "authenticated"
    USING ("public"."can_access_project"("project_id"))
    WITH CHECK ("public"."can_access_project"("project_id"));

GRANT ALL ON TABLE "public"."acquisition_costs" TO "authenticated", "service_role";
