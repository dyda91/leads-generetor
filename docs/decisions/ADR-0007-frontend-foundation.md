# ADR-0007 — Fundação do frontend (React/Vite, design system próprio, cliente HTTP e estado de autenticação em memória)

- **Status:** Accepted
- **Data:** 2026-08-16

## Contexto

O backend expõe autenticação segura do administrador único (sessão opaca por cookie, CSRF, `me`/logout/change-password). O produto precisa de um frontend profissional e responsivo que consuma esse contrato sem reimplementar segurança. É necessário decidir o framework, o sistema visual, a biblioteca de roteamento, a forma de chamar a API e o estado de autenticação no navegador.

## Decisões

### 1. React 19 + Vite 7 + TypeScript estrito

`apps/web` usa React 19 com TypeScript estrito compartilhado (`@leads/typescript-config` — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), compilado por Vite 7 em loopback (`127.0.0.1:5173`, `strictPort`) com **source maps desabilitados no build**.

### 2. Design system próprio sobre Tailwind CSS 4

Os tokens semânticos são CSS custom properties (fonte única de verdade) consumidos pelo Tailwind 4 (`@theme inline`) e pelas primitivas customizadas (Button, Input, Label, Card, Skeleton). Não há dependência runtime de shadcn/ui: as primitivas são nossas, sobre `@radix-ui/react-label`, `@radix-ui/react-dialog` e `@radix-ui/react-slot`, com ícones Lucide. **Light theme** nesta fase; sem fontes/assets externos (pilha de fontes do sistema). Dark mode e repositório de componentes são decisões futuras.

### 3. React Router 7

Rotas declarativas com guard. O router **apenas observa** o estado do `AuthProvider` (não duplica sessão/usuário). Destino pós-login por **allowlist** de paths internos (sem open redirect).

### 4. Cliente HTTP próprio (fetch tipado + Zod), sem TanStack Query/Redux/Zustand

Cliente centralizado com `credentials: include`, endpoints como constantes internas resolvidas apenas contra a origem validada (`VITE_API_BASE_URL`), `X-CSRF-Token` somente em mutações protegidas, timeout via `AbortController` (timer sempre limpo) e **validação defensiva em runtime com Zod**. **TanStack Query não foi adicionado** — o estado de servidor atual é mínimo (restauração única + mutações explícitas) e justifica apenas um cliente simples; será reconsiderado se surgir complexidade real de server-state.

### 5. Estado de autenticação em memória (Context + reducer)

`AuthProvider` mantém usuário + CSRF **somente em memória** (CSRF em `ref`, nunca exposto), estado discriminado (`restoring`/`authenticated`/`unauthenticated`/`recoverable-error`), restauração single-flight com retry controlado (máx. 1) em 409, e operation id que descarta resultados obsoletos. **Proibido** `localStorage`/`sessionStorage`/`document.cookie` para sessão/token/CSRF/senha. O cookie de sessão permanece `HttpOnly` e invisível ao JavaScript.

## Alternativas consideradas

- **TanStack Query / Redux / Zustand para estado:** rejeitados nesta fase — estado de servidor mínimo; o estado de autenticação é pequeno e local ao `AuthProvider`. Reavaliar se o dashboard ganhar data fetching real.
- **Next.js:** rejeitado — alvo é SPA separada; roteamento pequeno coberto por React Router (design.md).
- **shadcn/ui como dependência runtime:** rejeitado — copy-in de primitivas sobre Radix mantém o design system nosso e composável com os tokens.
- **JWT/Bearer no frontend:** rejeitado (ADR-0006) — sessão opaca por cookie com CSRF em memória.

## Consequências positivas

- Dependências mínimas e fixadas; superfície de segurança pequena (sem tokens no storage).
- Design tokens centralizados e testáveis (contraste AA por cálculo).
- Cliente com parsing defensivo evita exibir erro bruto do backend.
- Estado de autenticação em memória não persiste segredos no navegador.

## Consequências negativas / trade-offs

- Sem server-state library: mais código próprio quando o dashboard ganhar dados reais (reavaliar TanStack Query).
- Light theme apenas nesta fase.
- Sem fonte tipográfica customizada (pilha do sistema) por decisão de superfície/segurança.

## Impacto de segurança

- CSRF e sessão nunca em storage/URL/logs; cookie `HttpOnly` intocado por JS.
- Nenhuma variável `VITE_*` contém segredo; `GOOGLE_PLACES_API_KEY` permanece exclusiva do backend (ADR-0002).
- O frontend **não é fronteira de autorização**: ocultar navegação não substitui o guard do backend; CORS limita navegadores, não autentica clientes.

## Critérios para reavaliar

- Quando o dashboard exigir data fetching/server-state real (TanStack Query); quando houver requisito de dark mode ou de fontes personalizadas; quando o número de telas justificar um design system em pacote separado.
