# Design — places-search

## Context

The backend already provides single-admin auth (opaque cookie session, CSRF, exact Origin on mutations), a secure error envelope, strict config validation, and the visual foundation is archived. This change adds the first business capability: **text search of companies/places via Google Places Text Search (New), exclusively backend-side**, with cost control, a secure internal API and an accessible single-page UI. Lead persistence, lists, notes/status and export are explicitly out of scope (later changes).

## Research (official Google docs, consulted 2026-08-17)

- **Text Search (New)** — https://developers.google.com/maps/documentation/places/web-service/text-search
  Endpoint `POST https://places.googleapis.com/v1/places:searchText`; requires `textQuery` + a response field mask (`X-Goog-FieldMask`, comma-separated, no spaces; no default → error if omitted; wildcard `*` discouraged in production). Headers: `X-Goog-Api-Key`, `Content-Type: application/json`. Optional: `languageCode` (default `en`), `regionCode` (2-char CLDR), `pageSize` (1–20, default 20), `pageToken`/`nextPageToken`. **Max 60 results across all pages.** Field→SKU groups: Essentials ID Only, Pro, Enterprise, Enterprise + Atmosphere. `nextPageToken` belongs to Essentials ID Only.
- **Policies and attributions for Places API** — https://developers.google.com/maps/documentation/places/web-service/policies (last updated 2026-08-11 UTC)
  **Caching/storage:** MUST NOT pre-fetch, cache or store Places content beyond allowed exceptions; **Place ID is exempt** from caching restrictions and may be stored indefinitely. Attribution: Google Maps logo/text + distinguishing UI; author attribution for reviews/photos; ranking notice recommended.
- **Choose fields to return** — https://developers.google.com/maps/documentation/places/web-service/choose-fields
- **Usage and billing / SKU details** — https://developers.google.com/maps/billing-and-pricing/sku-details (no prices asserted here; consult linked table before approval)
- **API Security Best Practices / Set up the API key** — https://developers.google.com/maps/api-security-best-practices · https://developers.google.com/maps/documentation/places/web-service/get-api-key
- **Terms** — https://cloud.google.com/maps-platform/terms · https://cloud.google.com/maps-platform/terms/maps-service-terms
- **Place IDs** — https://developers.google.com/maps/documentation/places/web-service/place-id

## Decisions

### 1. Limite da mudança
`places-search` entrega: adaptador Google (`PlacesProvider`), endpoint interno `POST /places/search`, controle de orçamento/abuso, validação estrita, página de pesquisa no frontend (formulário + lista de resultados), testes (unit/integration/E2E com provider fake) e documentação. **Sem paginação no MVP** (uma página **fixa de 10 resultados**; frontend não envia nem escolhe `pageSize`). Gestão persistente de leads, listas, notas, status e exportação ficam em mudança posterior.

### 2. Fronteira backend-only
- `GOOGLE_PLACES_API_KEY` **somente em `apps/api`**; nunca em `VITE_*`, bundle, respostas, logs ou testes (gates de busca e Secretlint permanecem).
- Frontend chama apenas `POST /places/search`.
- URL upstream é **constante do backend**; nenhuma URL fornecida pelo usuário; sem proxy genérico; sem endpoint para host arbitrário.
- **SSRF mesmo com upstream fixo:** `redirect: 'manual'` no fetch e rejeição de status 3xx (impossibilita troca de host); host/porta/path fixos em constante; validação da resposta limita tamanho e shape.

### 3. Autenticação e autorização
- Pesquisa somente para usuário autenticado e **ADMIN ACTIVE** (AuthGuard existente — deny by default).
- `POST` exige **cookie HttpOnly + `Origin` exata autorizada + token CSRF válido** (reuso do fluxo existente; `Referer` não substitui `Origin`).
- Backend não confia em role/userId/headers enviados pelo frontend.
- Erros 400/401/403/409/429/500 no **envelope existente**.

### 4. Validação da consulta
Contrato estrito em `POST /places/search`:
- `textQuery`: obrigatória, 3–200 caracteres após trim, sem caracteres de controle, sem strings só de espaços.
- Propriedades desconhecidas do payload → 400 (rejeição `forbidUnknownValues`/zod `strip`+`strict`).
- `languageCode` e `regionCode` **fixos no backend** (`pt-BR` / `BR`); valores do cliente rejeitados.
- `pageSize` **fixo em 10 no backend**; o frontend não envia nem escolhe `pageSize`; sem paginação e sem carregamento automático de resultados adicionais. Sem parâmetros arbitrários repassados ao Google — apenas os mapeados.

### 5. Custos e abuso (defesa em camadas)
- Rate limit **por usuário** (default 10/min, configurável) + **global por instância** (default 60/min).
- **Orçamento diário/mensal** configurável (`PLACES_DAILY_BUDGET`, `PLACES_MONTHLY_BUDGET`); esgotado → **fail-closed** com erro controlado (não revela quota/chave/conta).
- Teto por pesquisa (1 página) e limite de tamanho de resposta.
- **Submissão explícita** (botão/Enter); **debounce não é controle de custo**; **sem retry automático** que duplique cobrança.
- **Deduplicação** de requisições idênticas simultâneas do mesmo usuário (promise compartilhada + key = usuário + hash normalizado da query).
- Timeout curto (default 5 s) e métricas agregadas (contagens/latência/status), sem dados sensíveis.
- Limites/alertas também documentados para configuração no **Google Cloud Console**.

### 6. Paginação
**Não haverá paginação no MVP.** O resultado por pesquisa é **fixo em 10**; o backend define o valor e o frontend não envia nem escolhe `pageSize`. **Nenhum resultado adicional é buscado automaticamente** (sem paginação e sem carregamento automático). `pageToken`/`nextPageToken` do Google não são expostos nem aceitos; o campo `nextPageToken` não é solicitado no field mask; **non-goal explícito** (evita cursor, custo e complexidade). Alteração futura para **até 20** resultados exige **nova revisão de custo/spec**. Decisão revisável em mudança futura (cursor opaco interno, vinculado a usuário/consulta, com integridade/expiração).

### 7. Field mask e cobrança
Field mask **fixo e mínimo no backend**; frontend não escolhe campos; sem wildcard; sem campos não exibidos.

| Campo (Place) | Finalidade | SKU (docs 2026-08-17) | Decisão |
| --- | --- | --- | --- |
| `places.id` | Place ID (link/ref) | Text Search **Essentials ID Only** | MVP on |
| `places.displayName` | Nome exibido | Text Search **Pro** | MVP on |
| `places.formattedAddress` | Endereço | Text Search **Pro** | MVP on |
| `places.googleMapsUri` | Link "Ver no Google Maps" | Text Search **Pro** | MVP on |
| `places.location` | Latitude/longitude | Text Search **Pro** | MVP on (exibido como auxiliar) |
| `places.types` | Tipos (ex.: `car_repair`) | Text Search **Pro** | MVP on |
| `places.businessStatus` | Status (ex.: `OPERATIONAL`) | Text Search **Pro** | MVP on |
| `places.nationalPhoneNumber` | Telefone | Text Search **Enterprise** | **config-gated, default OFF** |
| `places.websiteUri` | Site | Text Search **Enterprise** | **config-gated, default OFF** |
| `places.rating` | Avaliação | Text Search **Enterprise** | **config-gated, default OFF** |
| `places.userRatingCount` | Nº avaliações | Text Search **Enterprise** | **config-gated, default OFF** |
| `places.reviews`, `editorialSummary`, `photos`, `priceLevel`, etc. | Não necessários ao MVP | Enterprise / Enterprise+ / Pro | **off** |

- **Conjunto básico** (Essentials ID Only + Pro) habilitado por padrão. **Conjunto de contato** (Enterprise: `nationalPhoneNumber`, `websiteUri`, `rating`, `userRatingCount`) configurável e **OFF por padrão em development, test e production**; os campos só entram na field mask quando `PLACES_ENABLE_CONTACT_FIELDS=true` explícito. **Produção exige confirmação explícita de custo — sem fallback silencioso.** A field mask básica e a Enterprise são **montadas em pontos separados e nunca misturadas acidentalmente**. **Não afirmar que o recurso está habilitado até a aprovação do custo no Google Cloud.**
- A interface MUST funcionar corretamente com os campos Enterprise ausentes (estado default).
- Testes/CI **nunca** chamam o Google — provider fake, zero créditos.
- Preços **não são afirmados aqui**; o impacto de SKU dos campos Enterprise é documentado **sem afirmar preço não verificado**, aprovado com base em [`sku-details`](https://developers.google.com/maps/billing-and-pricing/sku-details) (consulta 2026-08-17) e registrado no relatório da mudança.

### 8. Cache e políticas Google
- **Sem cache de conteúdo** (nome, endereço, avaliação etc.) — proibido pela política de cache (única exceção: **Place ID**). Nenhuma persistência no MVP além de nada.
- **Sem cache no navegador** (`localStorage`/`sessionStorage`/IndexedDB); resposta interna usa `Cache-Control: no-store` (conteúdo dinâmico e mutável).
- Cache futuro (se aprovado legalmente) seria chaveado por consulta normalizada + field mask, com TTL e invalidação, sem chave/headers armazenados. **Dúvida política → não persistir.**

### 9. Dados e privacidade
- Retorna somente campos aprovados; não mistura com leads; sem e-mail por scraping; **não acessa websites retornados**; sem crawling; não armazena IP/User-Agent; logs sanitizados (nunca query completa quando sensível; hash controlado apenas se necessário); dados do Google **não apresentados como verificados** pelo sistema; atribuição "Google Maps" e distinção de conteúdo conforme política.

### 10. Cliente Google
- `PlacesProvider` (interface) + `GooglePlacesProvider` (implementação).
- Node `fetch` nativo (sem dependência nova); endpoint fixo; `X-Goog-Api-Key` só no header; `X-Goog-FieldMask` fixa; `Content-Type: application/json`; `AbortController` com timeout (default 5 s, timer sempre limpo); `redirect: 'manual'` + rejeição de 3xx; validação runtime (zod) e limite de tamanho da resposta (default 256 KB); sem `exception.message`/corpo bruto do Google em erros/logs; **sem retry automático no MVP**; mocks em testes; **zero chamadas reais em testes/CI**.

### 11. Configuração (fail-fast)
| Variável | Finalidade | Default |
| --- | --- | --- |
| `GOOGLE_PLACES_API_KEY` | Chave (só backend) | vazio (placeholder em `.env.example`) |
| `PLACES_ENABLED` | Habilitação explícita da integração | `false` |
| `PLACES_TIMEOUT_MS` | Timeout do upstream | `5000` |
| `PLACES_PAGE_SIZE` | Resultados por pesquisa (**fixo no MVP**) | `10` (alteração para até 20 exige nova revisão de custo/spec) |
| `PLACES_MAX_RESPONSE_BYTES` | Limite de resposta | `262144` |
| `PLACES_USER_RATE_LIMIT_MAX` / `_TTL_MS` | Rate limit por usuário | `10` / `60000` |
| `PLACES_GLOBAL_RATE_LIMIT_MAX` / `_TTL_MS` | Rate limit por instância | `60` / `60000` |
| `PLACES_DAILY_BUDGET` / `PLACES_MONTHLY_BUDGET` | Orçamento | configurável; `0` = desabilitado até valor explícito |
| `PLACES_ENABLE_CONTACT_FIELDS` | Conjunto Enterprise (telefone/site/avaliação) | `false` (OFF em dev/test/prod; produção exige confirmação explícita) |

- Produção rejeita placeholder/valor inseguro e exige `PLACES_ENABLED=true` + chave real; a habilitação dos campos Enterprise em produção exige **confirmação explícita — sem fallback silencioso**; erros não imprimem valores; nenhuma variável sensível no frontend.
- **Google Cloud Console:** API restriction para **Places API**; application restriction **servidor** (IP da origem da chamada); quotas e alertas; **nunca** restringir como chave de navegador para este fluxo. Rotação documentada (nova chave → variável → boot valida).

### 12. API interna
`POST /places/search` — request `{ "textQuery": "…" }`; response própria:
```json
{ "requestId": "uuid", "status": "ok", "results": [ { "placeId": "…", "name": "…", "address": "…", "mapsUri": "…", "location": {"lat":..,"lng":..}, "types": ["…"], "businessStatus": "…", "phone": "…", "website": "…", "rating": 4.5, "ratingCount": 123 } ] }
```
- `requestId` = mesmo do envelope; `status`/enum controlado; sem `pageToken`/chave/quota/detalhes upstream; `Cache-Control: no-store`; sem enumeração de infraestrutura (erros uniformes).
- Campos de contato ausentes quando o conjunto Enterprise estiver desabilitado; a interface MUST renderizar corretamente sem eles.

### 13. Frontend
- Rota protegida `/search` (dentro do `ProtectedRoute`/`AppShell`), link na navegação.
- Entrada explícita + botão "Pesquisar"; estados loading/erro/vazio/resultados; acessibilidade (labels, roles status/alert, foco); responsivo.
- Sem busca automática; submissão duplicada bloqueada; cancelamento ao desmontar (AbortController do cliente).
- Resultados renderizam corretamente mesmo quando os campos Enterprise estão ausentes (estado default).
- CSRF via AuthProvider/cliente seguro; sem chave Google; sem armazenamento local; links Google Maps com `rel="noopener noreferrer"` em nova aba; websites não acessados; sem criação de leads.

### 14. Testes
- Backend: schema de validação; adaptador mockado (field mask exata; chave ausente dos outputs; timeout/abort/redirect/JSON inválido/resposta acima do limite; 400/401/403/409/429/500); rate limit por usuário e global; orçamento esgotado; dedup concorrente; query maliciosa/propriedades extras; logs sanitizados; **zero chamadas externas**.
- Frontend: sem chave/storage; estados; cancelamento; a11y.
- E2E: **provedor fake injetado** (nunca Google real); custo não consome API.

### 15. Logs e observabilidade
- Logs estruturados com `requestId`, resultado controlado e métricas agregadas; nunca chave, Authorization, cookie, CSRF, corpo/headers upstream; hash controlado da query somente se necessário; auditoria detalhada → `audit-and-observability`; sem dashboard de billing fictício.

### 16. Non-goals (explícitos)
Persistência de leads; listas; notas/status; exportação; scraping de sites; obtenção de e-mails; enriquecimento externo; disparo de mensagens; automação de prospecção; múltiplos provedores reais; pagamentos; deploy; armazenamento proibido de dados Google; **paginação no MVP**.

## Threat model

| Ameaça | Mitigação |
| --- | --- |
| Exfiltração da chave | backend-only, header-only, nunca em logs/respostas/bundle; secretlint/`check:secrets`; build sem `VITE_*` de chave |
| Dreno de créditos/abuso | auth obrigatória, rate limit por usuário + global, orçamentos, submissão explícita, dedup, fail-closed, sem auto-retry |
| SSRF (redirects/URL arbitrária) | host fixo em constante, `redirect: 'manual'` + rejeição 3xx, sem URL do cliente, sem proxy genérico |
| Vazamento de dados pessoais (query) | logs sanitizados, sem persistência de conteúdo, apenas campos aprovados |
| CSRF | cookie + token CSRF + `Origin` exata nas mutações |
| Autorização/IDOR | AuthGuard ADMIN, identidade do contexto, nenhum id do cliente |
| Enumeração de infraestrutura | erros uniformes, sem detalhes/headers upstream |
| Resposta malformada/envenenada | validação runtime (zod), limite de tamanho, erro genérico |

## Architecture sketch

```
Frontend (rota /search) --POST /places/search--> AuthGuard(ADMIN) + Origin/CSRF
        │                                           │
        │                                    PlacesSearchController/Service
        │                                           │ schema estrito
        │                                    BudgetGuard (diário/mensal) + RateLimit (user+global)
        │                                           │ dedup concorrente
        │                                    PlacesProvider (interface)
        │                                           │ GooglePlacesProvider
        │                                           │   fetch fixo + X-Goog-Api-Key header + FieldMask fixa
        │                                           ▼
        │                                    places.googleapis.com/v1/places:searchText
        ▼
  Resultado sanitizado (contrato próprio, requestId, sem quota/token)
```

## Migration / rollout

Sem migrations. Rollback = desabilitar `PLACES_ENABLED` (endpoint falha fechado). CI/desenvolvimento nunca chamam o Google (provider fake). Ativação real depende de: chave restrita no Cloud Console + orçamento/limites configurados + aprovação de custo dos campos Enterprise (se habilitados).
