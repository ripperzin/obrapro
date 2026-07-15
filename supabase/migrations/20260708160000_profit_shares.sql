-- Participação nos lucros (sócios) — lista SEPARADA dos aportes.
-- Um sócio pode ter % sem ter aportado (ex: administrador da obra) e vice-versa.
-- investor_id é um vínculo OPCIONAL a um investidor (quando o sócio também aportou).

CREATE TABLE IF NOT EXISTS "public"."profit_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "investor_id" "uuid",
    "name" "text" NOT NULL,
    "percentage" numeric NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "profit_shares_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "profit_shares_project_id_fkey" FOREIGN KEY ("project_id")
        REFERENCES "public"."projects"("id") ON DELETE CASCADE,
    CONSTRAINT "profit_shares_investor_id_fkey" FOREIGN KEY ("investor_id")
        REFERENCES "public"."investors"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "profit_shares_project_id_idx" ON "public"."profit_shares" ("project_id");

ALTER TABLE "public"."profit_shares" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profit_shares_all" ON "public"."profit_shares";
CREATE POLICY "profit_shares_all" ON "public"."profit_shares" TO "authenticated"
    USING ("public"."can_access_project"("project_id"))
    WITH CHECK ("public"."can_access_project"("project_id"));

GRANT ALL ON TABLE "public"."profit_shares" TO "authenticated", "service_role";
