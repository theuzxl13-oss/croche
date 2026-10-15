# Fio & Ponto IA — receitas de crochê e amigurumi com IA

Plataforma web onde qualquer pessoa descreve uma peça de crochê e recebe:

- **imagem ilustrativa** gerada a partir do pedido (OpenAI `gpt-image-1`);
- **receita original e completa** em português (Claude, Anthropic), com materiais, quantidade de fio, agulha, abreviações, carreira por carreira, montagem, acabamento, nível e tempo estimado;
- **validação matemática** de todas as carreiras, com **correção automática** pela IA quando há erro;
- PDF A4 profissional, impressão, cópia, edição, biblioteca "Minhas Receitas", **modo acompanhamento** com progresso salvo e **assistente de crochê** em chat.

## Arquitetura

```
Navegador (React + Vite + Tailwind)
   │  login, CRUD de receitas, progresso, imagens  ──►  Supabase (Auth + Postgres com RLS + Storage)
   │  geração / chat (JWT do Supabase no header)
   ▼
Funções serverless /api (Node, Vercel)
   ├─ generate-recipe  → Gemini ou Claude (saída JSON estruturada) → validador → correções → salva no Postgres
   ├─ generate-image   → Gemini ou OpenAI → Supabase Storage (bucket privado) → URL assinada
   ├─ chat             → Gemini ou Claude em streaming, com a receita carregada do banco como contexto
   └─ health           → informa quais integrações estão configuradas
```

- **Chaves de API só no backend** (`/api`); o navegador usa apenas a chave anônima do Supabase.
- **Controle de acesso**: Row Level Security — cada usuário só lê/altera as próprias receitas e imagens.
- **Proteção contra abuso**: limite por usuário/hora/dia aplicado no Postgres (`consume_rate_limit`), válido entre todas as instâncias serverless; validação de entrada com Zod; corpo limitado a 256 KB.

### Pastas

```
api/                 Funções serverless (Vercel) — também servidas localmente pelo Vite
server/              Código só de backend: HTTP, Supabase admin, Claude, imagens, prompts, ciclo de correção
shared/              Código usado no navegador e no servidor
  recipeSchema.ts    Esquema único da receita (Zod) — também é o formato de saída exigido da IA
  crochet/parser.ts  Interpretador da notação brasileira (pb, aum, dim, (..) x N, AM...)
  crochet/validator.ts  Validação matemática da receita inteira
  format.ts          Texto simples, rótulos, passos do modo acompanhamento
src/                 Frontend React
  pages/             Início, Login, Receita, Editar, Acompanhar, Minhas Receitas, Assistente
  components/        Layout, painel de validação, receita, chat, progresso
  lib/               Supabase, chamadas à API, receitas (CRUD), PDF, arquivos
supabase/migrations/ Tabelas, RLS, função de limite de uso, bucket e políticas de Storage
tests/               Testes (Vitest)
```

## Como funciona a validação matemática

Cada carreira é escrita numa notação controlada (ex.: `(2 pb, 1 aum) x 6`, contagem `24`). O interpretador calcula, para cada carreira:

- **pontos usados** da carreira anterior (pb = 1, aum = 1, dim = 2, "pular N" = N, "N pb no mesmo ponto" = 1, anel mágico = 0…);
- **pontos gerados** (pb = 1, aum = 2, dim = 1, corr = 1…).

Regras verificadas: usados = total da carreira anterior; gerados = total informado; numeração contínua; repetições e blocos de carreiras (5ª a 8ª) conferidos um a um; início em correntinha (plana N-1, oval 2N-3, circular N); proibição de instruções vagas ("continue até…", "etc."). Trechos que não podem ser interpretados com segurança são marcados como **ambíguos**.

Quando há erro ou ambiguidade, o servidor envia à IA a lista exata dos problemas e pede a reescrita **somente das peças afetadas** (até `RECIPE_MAX_CORRECTIONS` rodadas). A receita recebe um dos status:

| Status | Significado |
|---|---|
| Matemática verificada | todas as carreiras conferidas, sem erros |
| Verificada com ressalvas | sem erros, mas há carreiras "especiais" (ex.: união de pernas) ou trechos para conferir à mão |
| Não validada — contém erros | erros persistiram; a receita é exibida com as carreiras problemáticas destacadas e **nunca** como validada |

Edições manuais são revalidadas ao vivo e ao salvar. A validação matemática **não substitui o teste físico** da peça — o site exibe esse aviso.

## Instalação local

Pré-requisitos: Node.js 20+, uma conta no [Supabase](https://supabase.com), uma chave da [Anthropic](https://console.anthropic.com) e uma da [OpenAI](https://platform.openai.com) (para imagens).

```bash
npm install
cp .env.example .env    # preencha as variáveis
npm run dev             # http://localhost:5173 (frontend + /api juntos)
```

### 1. Configurar o Supabase

1. Crie um projeto em supabase.com.
2. Em **SQL Editor**, cole e execute todo o arquivo `supabase/migrations/20261015000000_init.sql`
   (ou, com a CLI: `supabase link --project-ref SEU_REF` e `supabase db push`).
   Isso cria a tabela `recipes`, as políticas RLS, a tabela/função de limite de uso e o bucket privado `recipe-images`.
3. Em **Project Settings → API** copie:
   - `Project URL` → `VITE_SUPABASE_URL` e `SUPABASE_URL`
   - `anon public` → `VITE_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (**secreta**, só no servidor)
4. Em **Authentication → URL Configuration**, defina o *Site URL* (ex.: `http://localhost:5173` e, depois, o domínio da Vercel) e adicione os mesmos em *Redirect URLs*.
5. (Opcional) Em **Authentication → Providers → Email**, desative "Confirm email" para testes rápidos.

### 2. Chaves de IA

O provedor é escolhido no `.env` (`AI_PROVIDER` para texto e `IMAGE_PROVIDER` para imagens). Se ficarem vazios, o Gemini é usado quando existir `GEMINI_API_KEY`.

**Opção gratuita — Google Gemini (padrão)**
- Crie a chave em [aistudio.google.com](https://aistudio.google.com) → *Get API key* → `GEMINI_API_KEY`.
- A mesma chave serve para receitas, chat e imagens (`GEMINI_MODEL`, `GEMINI_IMAGE_MODEL`).
- O plano gratuito tem limites por minuto/dia; a geração de imagens pode exigir faturamento ativo.

**Opção paga — Claude + OpenAI**
- `AI_PROVIDER=anthropic` e `ANTHROPIC_API_KEY` — modelo padrão `claude-opus-5-5` (`ANTHROPIC_MODEL`), com *fallback* automático do servidor em caso de recusa.
- `IMAGE_PROVIDER=openai` e `OPENAI_API_KEY` — `gpt-image-1`.

Em qualquer provedor, a saída da IA é validada contra o esquema da receita e passa pelo mesmo verificador matemático com correção automática.

Verifique em `http://localhost:5173/api/health` quais integrações estão ativas.

## Deploy na Vercel

1. Envie o projeto para um repositório no GitHub.
2. Em vercel.com → **Add New Project** → importe o repositório (framework: Vite — já definido em `vercel.json`).
3. Em **Settings → Environment Variables**, cadastre todas as variáveis do `.env.example`.
4. Faça o deploy. As rotas `/api/*` viram funções serverless; o restante é servido como SPA.
5. Volte ao Supabase e adicione o domínio da Vercel em *Site URL* / *Redirect URLs*.

> A geração de uma receita completa pode levar de 1 a 4 minutos (inclui as rodadas de correção). O `vercel.json` define `maxDuration: 300` para `generate-recipe`, o que exige o **Fluid Compute** (padrão em projetos novos). Se o seu plano limitar a duração, reduza `ANTHROPIC_RECIPE_EFFORT` para `medium` ou `RECIPE_MAX_CORRECTIONS` para `1`.

## Testes

```bash
npm test          # interpretador, validador, formatação, ciclo de correção, HTTP e PDF
npm run typecheck
npm run build
```

## Custos e limites

Cada receita usa 1 chamada ao Claude (+ até 2 de correção) e cada imagem 1 chamada à OpenAI. Ajuste os limites por usuário com as variáveis `RATE_LIMIT_*`.

## Observações

- As receitas são geradas do zero; o sistema instrui a IA a não reproduzir receitas publicadas nem identidades visuais de editoras.
- A imagem é ilustrativa e não garante resultado idêntico à receita.
