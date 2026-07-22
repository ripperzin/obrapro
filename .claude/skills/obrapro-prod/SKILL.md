---
name: obrapro-prod
description: Fluxo de trabalho DIRETO em PRODUÇÃO do ObraPro (o padrão desde a reescrita de 16/07). Use quando precisar LER ou ESCREVER o banco de produção, SUBIR código (frontend na Vercel) ou DEPLOYAR uma edge function. NÃO é Docker/local — o local (subir-app) só serve pro npm run dev, que não usamos no dia a dia.
---

# ObraPro em PRODUÇÃO (Vercel + Supabase `plqafaprugrzhuhaggfs`)

Depois da reescrita subir (16/07), **todo o trabalho do dia a dia é direto em produção**.
Não há modo de teste separado — até a obra de teste **ZZ TESTE** vive em prod ao lado das reais.
O Docker/local (`npm run dev`) existe mas não é usado; ver a skill `subir-app` só se precisar dele.

## ⭐ Norte do produto (Victor pediu pra SEMPRE seguir)
**"Completo para quem quer, simples para quem precisa."** Toda decisão de produto passa por aqui:
o **coração** (caixa entrou/gastou/sobra · Gasto×Avanço · despesa + foto · avançar etapa + foto ·
link do sócio · unidades/custo-m²) fica visível por padrão; o **avançado** (orçamento por item ·
cronograma/Curva S/ritmo · físico×financeiro · barra de tempo) fica escondido/opcional/pago —
pra quem pede, nunca no caminho do básico, e escondido no celular. Ao propor feature, dizer onde
ela cai (coração × avançado × cortar) e não engordar o fluxo básico. **Ir ponto a ponto,
consultando o Victor antes de cada alteração.**

> ⚠️ Já me confundi 2× no começo de sessões: (a) achei que era local; (b) achei que
> precisava o Victor me passar um token. **Errado nas duas.** O token já está no Cofre do
> Windows e o fluxo é o de baixo.

## 1. Ler / escrever o BANCO de prod (Management API)

O token `sbp_` está no **Cofre de Credenciais do Windows** (alvo `Supabase CLI:supabase`, 44 chars).
Helper: `scratchpad/pg.ps1` — lê o token via `CredRead` (P/Invoke em C#) e expõe a função `Q`,
que faz `POST https://api.supabase.com/v1/projects/plqafaprugrzhuhaggfs/database/query`
(**aceita ESCRITA**, não só leitura).

```powershell
. .\scratchpad\pg.ps1              # carrega o helper (imprime "pg.ps1 pronto")
$r = Q "select count(*)::int as n from projects"   # Q retorna Object[] direto
$r | ConvertTo-Json -Compress      # -> [{"n":8}]
```

Se `scratchpad/pg.ps1` não existir (o scratchpad é por-sessão, some entre conversas),
recrie-o — o conteúdo canônico está no fim desta skill.

**Armadilhas (medidas, não teóricas):**
- O blob do Cofre é guardado como **bytes UTF-8**, não UTF-16 → ler com `Marshal.Copy` +
  `Encoding.UTF8.GetString`. (Ler como `PtrToStringUni`/`size/2` devolve 22 chars de CJK e a
  API responde `JWT could not be decoded`.)
- `Q` retorna o **array de linhas direto** (não `.result`).
- **Escrita PRESERVA acento; LEITURA via Invoke-RestMethod EMBARALHA acento** → para conferir
  dados, use contagens/números/ids, não compare texto com acento.
- `$pid` é **reservado** no PowerShell → use `$proj` para o project-ref.
- Multi-linha às vezes vem embrulhado `{value:[...],Count}` no `ConvertTo-Json` — desembrulhe.
- Funções `seed_*` / qualquer coisa com trava `can_access_project` exigem "fingir login":
  `select set_config('request.jwt.claims','{"sub":"<uid Victor>"}',true);` na MESMA query.
  UID do Victor = `77fbb12d-ad84-4488-b2b7-8db1d785cb7a`.

## 2. Subir CÓDIGO (frontend → Vercel)

`git push origin main` → a Vercel publica sozinha em ~1 min. **Nunca** pule os checks:

```bash
git log --oneline origin/main..main          # veja TUDO que vai subir (evita carona, ex. 14d849b)
npx tsc --noEmit 2>&1 | grep -viE '^landing/|^supabase/functions/'   # 0 erros (esses 2 dirs têm erros pré-existentes)
npm run build                                 # build de produção tem que passar
git add ... && git commit && git push origin main
```

- **Confira o deploy pelo CONTEÚDO, nunca pelo nome do arquivo:** o hash do bundle da Vercel
  nunca bate com o do build local (ela compila com as env vars dela). Pegue `index-*.js` do HTML
  → ache o chunk → procure o texto da mudança.
- **PWA no celular fica 1 abertura atrás** (`registerType:'autoUpdate'` baixa em 2º plano e só
  entra na abertura seguinte). Não é bug.

## 3. Deployar uma EDGE FUNCTION

```bash
npx supabase functions deploy investor-portal --project-ref plqafaprugrzhuhaggfs --no-verify-jwt
```
- Docker pode estar **desligado** — deploy de function não precisa dele; o token vem do Cofre.
- `--no-verify-jwt` é **obrigatório** no `investor-portal` (o portal do sócio é público).

## Segurança / bom senso
- Escrita em prod é real e imediata — não há undo. Antes de `UPDATE`/`DELETE` em massa, rode o
  `SELECT` equivalente e confira a contagem; envolva em transação quando fizer sentido.
- Nunca `DROP` de tabela/coluna do modelo velho (submacros) sem antes limpar os SELECTs vivos
  do app/edge (A3/A4/A5 na memória `revisao-2026-07-17-e-obra-teste`).
- Os 33 `.sql` soltos na raiz do repo são **minas** (reabrem RLS pública, revivem gatilhos) —
  nunca executar; ver a memória.

## Anexo — conteúdo canônico de `scratchpad/pg.ps1`
Recriar exatamente assim (a correção do blob UTF-8 é o que faz funcionar):

```powershell
$proj = 'plqafaprugrzhuhaggfs'
$sig = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class CredMan {
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool CredRead(string target, int type, int flags, out IntPtr credential);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr cred);
  [StructLayout(LayoutKind.Sequential)]
  struct CREDENTIAL {
    public int Flags; public int Type; public IntPtr TargetName; public IntPtr Comment;
    public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob;
    public int Persist; public int AttributeCount; public IntPtr Attributes;
    public IntPtr TargetAlias; public IntPtr UserName;
  }
  public static string Read(string target) {
    IntPtr p;
    if (!CredRead(target, 1, 0, out p)) return null;
    var c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
    byte[] buf = new byte[c.CredentialBlobSize];
    Marshal.Copy(c.CredentialBlob, buf, 0, c.CredentialBlobSize);
    CredFree(p);
    return Encoding.UTF8.GetString(buf).TrimEnd('\0');
  }
}
"@
if (-not ("CredMan" -as [type])) { Add-Type -TypeDefinition $sig -Language CSharp }
$script:SBP = [CredMan]::Read("Supabase CLI:supabase")
function Q { param([string]$sql)
  $uri = "https://api.supabase.com/v1/projects/$proj/database/query"
  $headers = @{ Authorization = "Bearer $($script:SBP)"; "Content-Type" = "application/json" }
  Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -Body (@{ query = $sql } | ConvertTo-Json -Compress)
}
```
