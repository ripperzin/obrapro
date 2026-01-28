
// import { serve } from "https://deno.land/std@0.168.0/http/server.ts" (Deprecado em favor de Deno.serve)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Anthropic from "https://esm.sh/@anthropic-ai/sdk"
import {
    extractEntities,
    SYSTEM_PROMPT,
    Project,
    verificarAlertas,
    calcularCamposCanonicos,
    STAGE_NAMES
} from "./utils.ts"

console.log("🚀 WhatsApp Webhook Online")

Deno.serve(async (req) => {
    try {
        if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

        // 1. Configurar Clientes
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!

        const supabase = createClient(supabaseUrl, supabaseKey)
        const anthropic = new Anthropic({ apiKey: anthropicKey })

        // 2. Parse do Webhook
        const formData = await req.formData()
        const mediaUrl = formData.get('MediaUrl0') // URL do áudio/imagem se houver
        const mediaType = formData.get('MediaContentType0') // Tipo (audio/ogg, image/jpeg)

        let incomingMsg = formData.get('Body')?.toString() || ''
        const sender = formData.get('From')?.toString() || ''

        console.log(`📩 Mensagem de ${sender}: "${incomingMsg}" (Media: ${mediaUrl ? 'Sim' : 'Não'})`)

        // Se tiver áudio e nenhum texto, avisar (Stub para futuro Whisper)
        if (mediaUrl && mediaType?.toString().startsWith('audio/')) {
            return new Response(`
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>🎤 Recebi seu áudio! A funcionalidade de transcrever áudio (Whisper) será ativada na próxima etapa. Por favor, digite por enquanto.</Message>
</Response>`, { headers: { "Content-Type": "text/xml" } })
        }

        // 3. Buscar Dados do Banco
        // Buscamos projetos com TODAS as relações necessárias
        const { data: projects, error } = await supabase
            .from('projects')
            .select('*, expenses(*), units(*), diary(*), budget(*)')

        if (error || !projects) throw new Error("Erro ao buscar projetos")

        // 4. Inteligência (Extração + Contexto)
        const entities = extractEntities(incomingMsg, projects as unknown as Project[])

        // Preparar Contexto Simplificado para o Claude
        let context: any = { error: "Não entendi a qual obra você se refere." }

        if (entities.escopoConfirmado === 'MULTI_OBRA') {
            context = {
                tipo: 'MULTI_OBRA',
                resumo: projects.map((p: any) => ({
                    nome: p.name,
                    progresso: `${p.progress}%`,
                    alertas: verificarAlertas(p)
                }))
            }
        } else if (entities.obra) {
            const p = projects.find((x: any) => x.id === entities.obra!.id) as unknown as Project
            if (p) {
                const canonicos = calcularCamposCanonicos(p)
                context = {
                    tipo: 'OBRA_ESPECIFICA',
                    nome: p.name,
                    start: p.startDate,
                    etapa: STAGE_NAMES[p.progress],
                    progresso: p.progress,
                    financeiro: {
                        gasto: p.expenses.reduce((s, e) => s + e.value, 0),
                        orcamento: p.budget?.totalEstimated || 0
                    },
                    comercial: {
                        unidades: p.units.length,
                        vendidas: canonicos.unidadesVendidas,
                        roi: canonicos.roi
                    },
                    alertas: verificarAlertas(p)
                }
            }
        }

        // 5. Chamada para o Claude
        const prompt = `${SYSTEM_PROMPT}

CONTEXTO DOS DADOS:
${JSON.stringify(context, null, 2)}

MENSAGEM: "${incomingMsg}"
`
        const msg = await anthropic.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }]
        })

        const textResponse = msg.content[0].type === 'text' ? msg.content[0].text : "Erro na IA"

        // Tentar extrair JSON se o prompt mandar (o prompt atual manda texto, mas podemos ajustar)
        // Por segurança no WhatsApp, pegamos o texto puro ou parseamos se for JSON
        let finalMessage = textResponse
        try {
            const json = JSON.parse(textResponse)
            if (json.text) finalMessage = json.text
        } catch { }

        // 6. Resposta TwiML
        const twiml = `
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>${finalMessage}</Message>
</Response>`

        return new Response(twiml, {
            headers: { "Content-Type": "text/xml" },
            status: 200,
        })

    } catch (error) {
        console.error("Erro:", error)
        return new Response(`<Response><Message>Erro no sistema: ${error.message}</Message></Response>`, {
            headers: { "Content-Type": "text/xml" },
            status: 200, // Retornamos 200 pro Twilio não ficar tentando de novo
        })
    }
})
