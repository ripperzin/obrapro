---
name: subir-app
description: Sobe o ambiente de desenvolvimento do ObraPro (Docker Desktop → Supabase local → Vite) e explica o acesso no PC e no celular. Use quando o usuário pedir para "rodar", "subir", "iniciar", "abrir" o app localmente, ou quando der "Failed to fetch"/"Load failed" ao entrar.
---

# Subir o ObraPro em desenvolvimento

App: Vite + React (frontend) com backend no **Supabase local** (Docker). O app de dev
aponta para o Supabase local via `.env.development.local` (`VITE_SUPABASE_URL=http://127.0.0.1:54321`).
A produção (Vercel + `plqafaprugrzhuhaggfs.supabase.co`) é intocada por este fluxo.

## ⚠️ Precedência de env — NÃO se confunda (erro já cometido)
Existem 2 arquivos e eles têm papéis diferentes. **No `npm run dev` (modo development) a precedência do Vite é `.env.development.local` > `.env.local`.**

| arquivo | aponta para | usado em |
|---|---|---|
| `.env.development.local` | **LOCAL** (`http://127.0.0.1:54321`) | `npm run dev` (é o que vale no dev) |
| `.env.local` | **PRODUÇÃO** (`plqafaprugrzhuhaggfs`) | `npm run build` (build de produção) |

- **Para saber para onde o DEV aponta, olhe `.env.development.local`, NÃO `.env.local`.** Ler só o `.env.local` leva à conclusão errada de que "o dev está em produção" — ele não está.
- **Nunca edite `.env.local` para mexer no dev** — você quebra o build de produção sem afetar o dev.
- O `supabaseClient.ts` reescreve `127.0.0.1`/`localhost` → host da página em runtime. Por isso o celular (via `192.168.x.x:3000`) alcança o backend local sozinho — **não** precisa trocar o IP em nenhum env.

## Sanidade de segurança ao iniciar (rápida)
Antes de mexer, confirme que o dev está isolado e produção intacta:
```bash
grep VITE_SUPABASE_URL .env.development.local   # deve ser 127.0.0.1:54321
# produção NÃO deve ter nenhuma migration nova (schema intocado):
curl -s -o /dev/null -w "investors em prod: %{http_code} (404=ok)\n" \
  "https://plqafaprugrzhuhaggfs.supabase.co/rest/v1/investors?select=id&limit=1" \
  -H "apikey: sb_publishable_IccJ9iOosNLJFQcXvWov-g_tpNoXzlt"
```
Migrations e edge functions novas moram **só no local**. Nunca rodar `supabase db push` / deploy de function sem o usuário pedir.

## Ordem de boot (importante: nessa sequência)

O app precisa de **3 camadas no ar**, nesta ordem:

1. **Docker Desktop** (o Supabase local roda em containers Docker)
2. **Supabase local** (`supabase start`)
3. **Vite** (`npm run dev`)

### 1. Docker Desktop
Verifique se o daemon responde:
```bash
docker info --format '{{.ServerVersion}}'
```
Se falhar (`dockerDesktopLinuxEngine ... não pode encontrar`), inicie o Docker Desktop e aguarde:
```bash
"/c/Program Files/Docker/Docker/Docker Desktop.exe" &
# aguardar o daemon (até ~2 min):
for i in $(seq 1 24); do docker info >/dev/null 2>&1 && { echo READY; break; }; sleep 5; done
```

### 2. Supabase local
```bash
npx supabase start
```
Confirme que auth e REST respondem (via container `supabase_db_obra_pro_0` / Kong em 54321):
```bash
curl -s -o /dev/null -w "auth %{http_code}\n" http://127.0.0.1:54321/auth/v1/health
```
Deve dar `200`. Serviços como `edge_runtime`/`vector` podem ficar fora — só afetam IA/edge functions, **não** o CRUD do app.

### 3. Vite (dev server)
```bash
npm run dev   # rodar em background; porta 3000, host:true (exposto na LAN)
```

## Acesso

- **PC:** http://localhost:3000
- **Celular** (mesmo Wi‑Fi): use o IP da LAN que o Vite imprime na linha `Network:` (ex.: `http://192.168.3.101:3000`).
  O `supabaseClient.ts` reescreve automaticamente `127.0.0.1` → host da página, então no celular o backend local é alcançado sozinho.

## Troubleshooting

- **"Failed to fetch" ao logar (no PC):** Supabase local não está no ar. Rode os passos 1–2. Causa comum: PC reiniciou e o Docker/Supabase não subiu junto.
- **"Load failed" no celular:** normalmente era o app tentando `127.0.0.1` (o próprio celular). Já resolvido pelo rewrite no `supabaseClient.ts`. Se persistir: (a) confirme mesmo Wi‑Fi; (b) Firewall do Windows pode bloquear a porta 3000 — aceite o prompt de rede privada; (c) confirme que o Kong está publicado em `0.0.0.0:54321` (`docker ps --filter name=supabase_kong --format '{{.Ports}}'`).
- **Página não carrega no PC:** confira o log do Vite (erro de compilação) e se a porta 3000 está livre.
- **Fotos/anexos não aparecem no LOCAL (app, timeline, PDF):** DOIS motivos distintos, não confunda:
  1. **RLS de Storage faltando no local.** Sintoma: `createSignedUrl` falha com *"Object not found"* para o usuário logado (mas service role funciona). Causa: a migration `20260610130000_storage_rls_hardening.sql` não foi aplicada no banco local (RLS ligada, 0 policies → nega tudo). Fix: aplicar essa migration no local (`psql ... < supabase/migrations/20260610130000_storage_rls_hardening.sql`).
  2. **Bytes das imagens não estão no Storage local.** Sintoma: assina OK, mas o GET do arquivo dá **HTTP 500** (mesmo com service role). Causa: a cópia inicial prod→local trouxe o **banco** (registros em `storage.objects`) mas **não os arquivos** binários. Consequência: **fotos não renderizam no local** — é esperado, NÃO é bug do código. O código de foto (PDF/portal) está correto e funciona onde os arquivos existem (produção). Para ver foto no local, precisaria sincronizar os arquivos do bucket prod→local (tarefa à parte).

## Migrations locais
As migrations ficam em `supabase/migrations/`. Para aplicar uma no banco local sem reset:
```bash
docker exec -i supabase_db_obra_pro_0 psql -U postgres -d postgres -c "<SQL>"
```
(Deploy em produção é outro fluxo — via Management API; ver a memória do projeto.)
