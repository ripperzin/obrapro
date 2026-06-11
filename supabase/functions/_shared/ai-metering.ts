// Metering de IA por usuário/mês, compartilhado entre as edge functions de IA
// (ocr-receipt, ai-copilot). Identifica o usuário pelo JWT e chama a função SQL
// `check_and_increment_ai_usage` (service role) ANTES de gastar a IA.
//
// Filosofia: fail-OPEN em erro inesperado (env ausente, falha de rede, etc.) para
// nunca derrubar um uso legítimo por causa de um bug de medição; fail-CLOSED só
// quando a função SQL diz explicitamente que o limite foi atingido.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type MeterKind = "ocr" | "copilot";

export interface MeterResult {
    allowed: boolean;
    reason?: string;   // mensagem amigável quando bloqueado
    plan?: string;
}

export async function meterAI(req: Request, kind: MeterKind): Promise<MeterResult> {
    try {
        const url = Deno.env.get("SUPABASE_URL");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
        const authHeader = req.headers.get("Authorization") ?? "";

        if (!url || !serviceKey || !anonKey || !authHeader) {
            console.warn("[meterAI] env/header ausente; liberando (fail-open)");
            return { allowed: true };
        }

        // Identifica o usuário pelo JWT que o app enviou.
        const userClient = createClient(url, anonKey, {
            global: { headers: { Authorization: authHeader } },
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: { user } } = await userClient.auth.getUser();
        if (!user) {
            console.warn("[meterAI] usuário não identificado; fail-open");
            return { allowed: true };
        }

        // Decide e incrementa atomicamente via service role.
        const admin = createClient(url, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await admin.rpc("check_and_increment_ai_usage", {
            p_user: user.id,
            p_kind: kind,
        });

        if (error) {
            console.error("[meterAI] RPC falhou; fail-open:", error.message);
            return { allowed: true };
        }

        if (data?.allowed) return { allowed: true, plan: data?.plan };

        const plan = data?.plan ?? "free";
        const reason = plan === "free"
            ? "A IA do ObraPro está disponível nos planos Pro e Business. Faça upgrade para usar o copiloto e o leitor de recibos."
            : `Você atingiu o limite mensal de IA do seu plano (${data?.used}/${data?.limit}). Faça upgrade ou aguarde o próximo mês.`;
        return { allowed: false, reason, plan };
    } catch (e) {
        console.error("[meterAI] exceção; fail-open:", String(e));
        return { allowed: true };
    }
}
