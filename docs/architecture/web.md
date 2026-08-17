# Frontend — Arquitetura, autenticação, layout e operação

> **Estado:** implementado (shell React autenticado). Pesquisa (Google Places), leads, listas, exportação e pipeline **não estão implementados** nesta fase — o dashboard é um estado vazio honesto.

## Visão geral

O frontend (`apps/web`) é um SPA React que consome a API NestJS autenticada (`/auth/login`, `/auth/me`, `/auth/logout`, `/auth/change-password`, `GET /health`). A autorização real permanece **no backend**; o frontend apenas consome o contrato, mantém a sessão e o CSRF **somente em memória** e renderiza rotas públicas/protegidas.

### Stack

- **React 19** + **TypeScript estrito** (configurações compartilhadas `@leads/typescript-config`, com `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **Vite 7** (loopback `127.0.0.1:5173`, `strictPort`, source maps desabilitados no build).
- **Tailwind CSS 4** (plugin oficial `@tailwindcss/vite`) + **design system próprio** com tokens semânticos em CSS custom properties (light theme; sem dark mode nesta fase).
- **React Router 7** — rotas declarativas; o router apenas observa o estado do `AuthProvider` (não duplica sessão/usuário).
- **Cliente HTTP próprio** (`fetch` tipado + validação Zod em runtime) — sem TanStack Query, Redux ou Zustand nesta fase (decisão: ADR-0007).
- **AuthProvider próprio** — contexto + reducer com estado discriminado e CSRF em `ref` (nunca exposto).
- Primitivas de UI customizadas (Button, Input, Label, Card, Skeleton) sobre `@radix-ui/react-label`, `@radix-ui/react-dialog`, `@radix-ui/react-slot` e ícones Lucide.

### Estrutura relevante

| Caminho                                         | Responsabilidade                                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.tsx`                                  | Bootstrap: cria o cliente de API (valida `VITE_API_BASE_URL`), monta `AuthProvider` + `BrowserRouter`; erro de configuração → tela controlada sem montar o app |
| `src/api/config.ts`                             | Validação de `VITE_API_BASE_URL` (http/https, origem apenas, sem credentials/query/fragment, HTTPS em produção)                                                |
| `src/api/client.ts`                             | Cliente `ApiClient` tipado (`credentials: include`, CSRF só em mutações, timeout `AbortController`, parsing defensivo)                                         |
| `src/api/endpoints.ts`                          | Constantes internas de endpoints; resolvidas apenas contra a origem validada                                                                                   |
| `src/api/errors.ts` / `schemas.ts` / `types.ts` | Envelope de erro tipado (`ApiError`) e contratos Zod                                                                                                           |
| `src/auth/AuthProvider.tsx`                     | Estado de autenticação em memória, single-flight, retry controlado de 409, CSRF em ref                                                                         |
| `src/routes/ProtectedRoute.tsx`                 | Guard de rota privada (restoring/recoverable/unauthenticated/autenticado)                                                                                      |
| `src/routes/LoginRoute.tsx`                     | Rota pública `/login` (aguarda resolução, redireciona autenticado)                                                                                             |
| `src/routes/destinations.ts`                    | Allowlist de destino pós-login (sem open redirect)                                                                                                             |
| `src/components/layout/AppShell.tsx`            | Shell autenticado: skip link, `<main>` único, sidebar desktop, header + drawer mobile                                                                          |
| `src/components/layout/mobile-nav.tsx`          | Drawer mobile acessível (Radix Dialog: focus trap, Escape, scroll lock)                                                                                        |
| `src/features/...`                              | Login, Dashboard (estado vazio) e Segurança (troca de senha)                                                                                                   |

## Configuração

- **`VITE_API_BASE_URL` é pública** (nunca segredo). É injetada pelo Vite durante `dev`/`build` via `import.meta.env` e **validada no bootstrap** do frontend (`src/api/config.ts`). Alterar o valor depois do build exige **reconstruir o bundle** (não é lida de outro lugar em runtime).
- Validação: http/https, **origem apenas** (sem usuário/senha, query, fragment ou path além de `/`), **HTTPS obrigatório em produção**; em falha, erro controlado sem ecoar o valor. `apps/web/.env.example` documenta `VITE_API_BASE_URL=http://127.0.0.1:3000` como valor público local.
- **Nenhuma variável `VITE_*` armazena segredo.** `GOOGLE_PLACES_API_KEY` existe somente no backend (ver ADR-0002); o frontend não a declara e nunca a recebe.
- A API **não carrega** `.env` automaticamente; recebe a configuração do ambiente do processo. Não documentamos/expomos valores reais de URLs com credenciais.

## Rotas

| Rota                 | Autenticação exigida | Página                                              | Comportamento sem sessão                                                                                     |
| -------------------- | -------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/login`             | Pública              | Tela de login (sem cadastro, sem "esqueci a senha") | Exibe o formulário; com sessão válida redireciona para o destino interno validado (ou `/`)                   |
| `/`                  | Protegida            | Dashboard (estado vazio honesto)                    | Aguarda a resolução da sessão; 401 → `/login` (destino interno preservado); 500 → erro recuperável com retry |
| `/settings/security` | Protegida            | Troca de senha                                      | Idem acima                                                                                                   |
| `*` (qualquer outra) | Pública              | Página 404 amigável                                 | Sem AppShell autenticado; não revela o pathname                                                              |

O `ProtectedRoute` **aguarda a resolução** da sessão (estado `restoring` → loading estável, sem flash de conteúdo protegido), redireciona anônimo para `/login` guardando apenas o pathname como destino (`location.state`), e nunca re-restaura/duplica a sessão. `403` **não** é tratado como logout; `500` não apaga a sessão sem confirmação do backend.

## Autenticação frontend

- **Sessão em cookie HttpOnly** — o JavaScript **nunca lê nem decodifica** o cookie; o navegador o envia automaticamente com `credentials: include`. O frontend não usa `document.cookie`, `localStorage` ou `sessionStorage` para sessão/token/CSRF/senha.
- **CSRF somente em memória** — recebido no corpo de `POST /auth/login` e `GET /auth/me`, mantido em um `ref` interno do `AuthProvider` e enviado no header `X-CSRF-Token` **apenas** nas mutações protegidas (logout, change-password). Nunca vai para URL, query, storage ou logs.
- **Restauração:** `GET /auth/me` com single-flight (uma chamada por instância), loading estável, 401 → limpa estado e `/login`, 500/rede → erro recuperável sem deslogar, 409 (rotação concorrente) → exatamente 1 retry controlado; apenas a resposta válida prevalece (operation id descarta resultados obsoletos).
- **Login:** `POST /auth/login` com `credentials: include`; sucesso mantém usuário+CSRF em memória e redireciona ao destino validado; 401 uniforme, 403 origem/configuração, 429 orienta aguardar; submissão duplicada bloqueada; senha limpa após o fluxo; a senha **nunca é normalizada** no envio (o backend aplica a política).
- **Troca de senha:** usa o CSRF interno; sucesso rotaciona a sessão e o CSRF (a sessão atual permanece válida); 401 limpa estado; 400/403/409/429/500 preservam o CSRF e o estado e reexpõem o erro controlado.
- **Logout:** usa o CSRF interno; sucesso limpa estado e redireciona `/login`; 401 limpa estado; falha de rede oferece limpar o estado local **sem afirmar** a revogação no servidor.
- **Regras de erro:** um `401` (backend confirmou a revogação) limpa a sessão; `403`/`409`/`429`/`500` **não são tratados automaticamente como logout** quando o backend não confirmou a revogação.

### Cookies

| Ambiente              | Nome                   | HttpOnly | SameSite | Secure                       | Path | Domain |
| --------------------- | ---------------------- | -------- | -------- | ---------------------------- | ---- | ------ |
| Desenvolvimento/teste | `leads_session`        | sim      | `Strict` | não (HTTP local em loopback) | `/`  | sem    |
| Produção              | `__Host-leads_session` | sim      | `Strict` | sim                          | `/`  | sem    |

Não documentamos valor, hash ou conteúdo do cookie.

### Fluxos (resumo)

1. **Restauração:** frontend → `GET /auth/me` → usuário + CSRF em memória.
2. **Login:** `POST /auth/login` → cookie `HttpOnly` + usuário + CSRF em memória.
3. **Troca de senha:** header `X-CSRF-Token` interno → sessão e CSRF rotacionados (sessão atual mantida).
4. **Logout:** header `X-CSRF-Token` interno → sessão revogada no backend → estado local limpo.

## Segurança do frontend (sem exageros)

- **O frontend não é uma fronteira de autorização.** Esconder menu/botão não substitui o guard do backend; a proteção efetiva está na API.
- O cookie `HttpOnly` não é lido por JavaScript; o CSRF fica **somente em memória**; `credentials: include` é usado em toda chamada.
- `CORS` restringe **navegadores**, mas não autentica clientes; o backend exige **`Origin` exata** nas mutações e o `SameSite=Strict` **não é a única** proteção CSRF (synchronizer token é a defesa real).
- **Sem JWT/Bearer**, sem `localStorage`/`sessionStorage` para tokens, sem token em URL/query/logs.
- Destino pós-login por **allowlist** (somente paths internos existentes; sem open redirect).
- Respostas da API **validadas em runtime** (Zod) e erros controlados (sem stack, sem corpo bruto do backend, sem `dangerouslySetInnerHTML`/`eval`).
- **Source maps desabilitados** no build; **sem assets/fontes externos** (pilha de fontes do sistema); a CSP restritiva do backend (`default-src 'none'; frame-ancestors 'none'; base-uri 'none'`) permanece ativa.
- Rate limiting e sessão única continuam no **backend**.

## Layout e acessibilidade

- **Sidebar desktop** (≥ 1024px): logo, navegação principal, logout; **conteúdo centralizado** com largura máxima (`--container-content: 1200px`), sem colar na borda da tela.
- **Drawer mobile** (< 1024px): header compacto com gatilho acessível; drawer à esquerda com focus trap, fechamento por **Escape**, scroll lock e foco retornando ao gatilho.
- **404 pública** sem AppShell; **skip link** para `#main-content`; landmarks (`<header>`, `<main>` único, `<aside>`, `<nav>`); `aria-current="page"` no item ativo.
- **Nenhum link para recurso ainda inexistente** (somente Dashboard e Segurança existem; pesquisa/leads/listas não aparecem como links).
- **Contraste WCAG AA** validado por cálculo em testes; **labels reais** (label↔input testado), foco visível (`:focus-visible`), roles `status`/`alert` com `aria-live`, **`prefers-reduced-motion`** respeitado, skeletons sem layout shift.
- **Validação manual de viewport/zoom:** pendente — as checagens de largura/rolagem horizontal são automatizadas, mas não há registro de uma auditoria manual de zoom/viewport nesta fase.

## Design tokens

Tokens semânticos em CSS custom properties (`src/styles/globals.css`) — fonte única de verdade consumida pelo Tailwind (`@theme inline`): cores de superfície/texto, primária/ações, bordas/input/foco, feedback (sucesso/aviso/erro), radius, sombras, tipografia (pilha do sistema, sem fontes remotas), transições, largura de conteúdo e largura da sidebar. Light theme; dark mode é decisão futura.

## Execução local

Três componentes, todos em loopback, sem senha real documentada (preencha localmente; nunca use credencial fixa):

1. **PostgreSQL de desenvolvimento** — `127.0.0.1:5433` (volume persistente; **nunca** usado como banco de testes). Via `infrastructure/docker-compose.dev.yml` (valores em `infrastructure/.env`, gitignored).
2. **API** — `127.0.0.1:3000`, CORS exato para `http://127.0.0.1:5173`, variáveis fornecidas pelo ambiente do processo (a API não carrega `.env`).
3. **Frontend** — `127.0.0.1:5173`; arquivo local `apps/web/.env` (gitignored) com `VITE_API_BASE_URL=http://127.0.0.1:3000` (valor público local).

```bash
# 1. Banco de desenvolvimento
cp infrastructure/.env.example infrastructure/.env   # edite com valores locais
docker compose -f infrastructure/docker-compose.dev.yml up -d postgres

# 2. API (ambiente do processo; CORS exato)
cd apps/api
export NODE_ENV=development
export PORT=3000
export CORS_ORIGINS=http://127.0.0.1:5173
export DATABASE_URL=postgresql://…@127.0.0.1:5433/leads_dev   # preencha localmente
pnpm dev

# 3. Frontend (loopback; VITE_API_BASE_URL pública local)
cd apps/web
printf 'VITE_API_BASE_URL=http://127.0.0.1:3000\n' > .env   # gitignored
pnpm dev
```

Nenhum comando imprime variáveis sensíveis; nenhum valor real de conexão com credenciais aparece na documentação.

## Testes

- **Unitários/integração (web, Vitest + Testing Library):** cliente de API (credentials, CSRF só em mutações, timeout/cancelamento, parsing defensivo, erros 400/401/403/409/429/500), estado de autenticação (single-flight, 409/retry ≤1, sem persistência), rotas/guard/open redirect, login, layout desktop/mobile/drawer, dashboard, troca de senha, logout, tokens/contraste WCAG AA e acessibilidade. **289 testes.**
- **API (Jest):** 366 testes; **E2E (Playwright):** 11 testes que cobrem os **42 cenários E2E originais** (matriz revisada: 10 testes públicos + 1 jornada serial com 11 `test.step`).
- **E2E:** API E2E em `127.0.0.1:3100`, frontend E2E em `127.0.0.1:5174`, CORS exato `http://127.0.0.1:5174`, Chromium, `workers: 1`, `retries: 0`, credenciais geradas com **CSPRNG** e mantidas **somente em memória**, **sem storageState**, trace/vídeo/screenshot desabilitados, artefatos de falha em diretório temporário privado **sanitizados/removidos** (redator + teardown), seed e cleanup protegidos pela guard.
- **Jornada serial deliberada:** sessão única (um login revoga o anterior), rotação de senha e logout destrutivo tornam o fluxo autenticado inevitavelmente stateful — por isso roda em um único teste com `test.step` em ordem de dependência.
- **Orçamento da suíte (abaixo de 10/min):** 5 chamadas `POST /auth/login` (2 válidas, 3 inválidas) + 1 troca de senha. Testes públicos (proteção, 404, erros de login) não consomem o orçamento.
- **Banco de testes:** `postgres-test` em `127.0.0.1:5434` (banco/usuário `leads_test`, tmpfs); migrations necessárias após recriação; `DATABASE_URL_TEST` nunca é compartilhada e o guard recusa 5433, host externo, usuário ou banco incorretos. **API integration tests e E2E usam o mesmo banco isolado**, por isso os workspaces são testados **sequencialmente** (`--workspace-concurrency=1`); **não paralelize** esses dois conjuntos sem bancos separados.

## Limitações e responsabilidades futuras

| Limitação                                                   | Mudança futura responsável            |
| ----------------------------------------------------------- | ------------------------------------- |
| Google Places não implementado (sem busca runtime)          | `places-search`                       |
| Leads não implementados                                     | mudanças de domínio (leads etc.)      |
| Dashboard sem dados reais (estado vazio honesto)            | mudanças de domínio                   |
| Sem recuperação de senha                                    | fora do escopo do MVP                 |
| Sem MFA                                                     | fora do escopo do MVP                 |
| Sem gerenciamento de dispositivos/sessões                   | fora do escopo do MVP                 |
| Sem deploy de produção                                      | `production-hardening-and-deployment` |
| Sem observabilidade completa (logs estruturados, auditoria) | `audit-and-observability`             |

Nenhum documento afirma que o sistema é invulnerável.
