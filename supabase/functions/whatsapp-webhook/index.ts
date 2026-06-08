
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

const escapeXml = (unsafe: string) => {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
};

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
        const senderNumber = sender.replace('whatsapp:', '') // Remove prefixo

        console.log(`📩 Mensagem de ${senderNumber}: "${incomingMsg}" (Media: ${mediaUrl ? 'Sim' : 'Não'})`)

        // Se tiver áudio e nenhum texto, avisar (Stub para futuro Whisper)
        if (mediaUrl && mediaType?.toString().startsWith('audio/')) {
            return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>🎤 Recebi seu áudio! A funcionalidade de transcrever áudio (Whisper) será ativada na próxima etapa. Por favor, digite por enquanto.</Message>
</Response>`, { headers: { "Content-Type": "text/xml" } })
        }

        // 3. Autenticação (Buscar Usuário pelo Telefone)
        // Lógica para lidar com o 9º dígito (Brasil)
        // O Twilio pode mandar sem o 9 (+55 67 8204-2203), mas o usuário cadastrou com 9 (+55 67 98204-2203)
        let possibleNumbers = [senderNumber]

        // Se for Brasil (+55) e tiver 13 dígitos (+55 XX 9XXXX-XXXX), tenta também sem o 9
        if (senderNumber.startsWith('+55') && senderNumber.length === 14) {
            const withoutNine = senderNumber.substring(0, 5) + senderNumber.substring(6)
            possibleNumbers.push(withoutNine)
        }
        // Se tiver 13 dígitos (+55 XX XXXX-XXXX) tenta adicionar o 9 (menos comum o Twilio mandar, mas possível)
        if (senderNumber.startsWith('+55') && senderNumber.length === 13) {
            const withNine = senderNumber.substring(0, 5) + '9' + senderNumber.substring(5)
            possibleNumbers.push(withNine)
        }

        const { data: userProfile, error: profileError } = await supabase
            .from('profiles')
            .select('id, full_name, phone')
            .in('phone', possibleNumbers) // <--- Busca qualquer um dos formatos
            .maybeSingle() // Use maybeSingle para não estourar erro se achar 0 ou alertar se achar 2

        if (profileError || !userProfile) {
            console.log(`⛔ Acesso negado para ${senderNumber}. Tentativas: ${possibleNumbers.join(', ')}`)
            return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>🔒 Olá! Seu número (${senderNumber}) não foi encontrado.
Verifique se cadastrou corretamente (ex: ${senderNumber} ou ${possibleNumbers[1] || '...'}).</Message>
</Response>`, { headers: { "Content-Type": "text/xml" } })
        }

        console.log(`✅ Usuário autenticado: ${userProfile.full_name} (${userProfile.id})`)

        // 4. Buscar Projetos (Filtrados pelo Usuário)
        // Correção: Usando os nomes reais das tabelas (diary_entries, project_budgets)
        const { data: rawProjects, error } = await supabase
            .from('projects')
            .select('*, expenses(*), units(*), diary_entries(*), project_budgets(*), project_members!inner(*)')
            .eq('project_members.user_id', userProfile.id) // <--- Filtro de Segurança

        if (error || !rawProjects) {
            console.error("Supabase Error:", error)
            throw new Error(`Erro ao buscar projetos: ${error?.message || 'Unknown error'} ${error?.details || ''}`)
        }

        // Mapear para o formato esperado (Project user interface)
        const projects: Project[] = rawProjects.map((p: any) => ({
            ...p,
            diary: p.diary_entries || [],
            budget: p.project_budgets?.[0] || (p.project_budgets as any) || undefined // Tratar array ou objeto
        })) as unknown as Project[]

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
            model: "claude-haiku-4-5",
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
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>${escapeXml(finalMessage)}</Message>
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
