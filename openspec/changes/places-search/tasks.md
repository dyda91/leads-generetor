# Tasks — places-search

## 1. Pesquisa oficial e contratos de política/custo

Comandos: revisão manual da documentação oficial (links registrados no `design.md`, consulta 2026-08-17)

- [ ] 1.1 Registrar em `docs/` os links oficiais e a data de consulta (Text Search (New), policies/attributions, SKU details, security best practices, termos)
- [ ] 1.2 Documentar a tabela campo → SKU → decisão e a política de cache (conteúdo não persistido; **Place ID isento**)
- [ ] 1.3 Registrar a decisão de custo dos campos **Enterprise** (telefone/site/avaliação): **OFF por padrão em dev/test/prod**; produção exige confirmação explícita (sem fallback silencioso); documentar o impacto de SKU **sem afirmar preço não verificado**; não afirmar que o recurso está habilitado antes da aprovação de custo no Google Cloud
- [ ] 1.4 Documentar os requisitos de atribuição ("Google Maps", distinção de conteúdo, ranking notice) aplicados à interface

Critério de conclusão: documentação de custo/política consistente com a fonte oficial, sem afirmar preços sem fonte/data; nenhum crédito consumido.

## 2. Configuração

Comandos: `pnpm --filter @leads/api lint` · `pnpm --filter @leads/api typecheck` · `pnpm --filter @leads/api test`

- [ ] 2.1 Adicionar ao environment schema (fail-fast) as variáveis `PLACES_*`: `GOOGLE_PLACES_API_KEY`, `PLACES_ENABLED`, timeout, `PLACES_PAGE_SIZE` (fixo 10 no MVP), `PLACES_MAX_RESPONSE_BYTES`, rate limits por usuário e global, orçamento diário/mensal, `PLACES_ENABLE_CONTACT_FIELDS` (default `false`)
- [ ] 2.2 Produção rejeita placeholder/valor inseguro (fail-fast) e erros de configuração não imprimem valores
- [ ] 2.3 `apps/api/.env.example` com placeholders vazios; nenhuma variável sensível no frontend (`apps/web/.env.example` sem `VITE_*` de chave)
- [ ] 2.4 Documentar rotação da chave e restrições no Google Cloud Console (API restriction para Places API; application restriction de servidor; quotas/alertas; nunca chave de navegador)

Critério de conclusão: boot recusa integração não habilitada/configuração inválida; testes do schema de ambiente verdes; nada sensível versionado.

## 3. Provider Google

Comandos: `pnpm --filter @leads/api lint` · `pnpm --filter @leads/api typecheck` · `pnpm --filter @leads/api test`

- [ ] 3.1 Interface `PlacesProvider` com contrato tipado (sem dependência do Google no domínio)
- [ ] 3.2 `GooglePlacesProvider` com `fetch` nativo do Node, endpoint fixo, `X-Goog-Api-Key` somente no header, `X-Goog-FieldMask` fixa, `Content-Type: application/json`, timeout via `AbortController` (timer sempre limpo)
- [ ] 3.3 `redirect: 'manual'` + rejeição de 3xx (sem troca de host); limite de tamanho da resposta; validação runtime (zod); sem `exception.message`/corpo bruto do Google em erros/logs; sem retry automático
- [ ] 3.4 Testes do adaptador com mock: field mask exata, chave ausente dos outputs, timeout, abort, redirect, JSON inválido, resposta acima do limite, erro upstream sanitizado — **zero chamadas reais**

Critério de conclusão: adaptador seguro e testado; nenhuma chamada real ao Google em testes/CI; nenhum valor sensível em outputs/logs.

## 4. Controle de custo e concorrência

Comandos: `pnpm --filter @leads/api lint` · `pnpm --filter @leads/api typecheck` · `pnpm --filter @leads/api test`

- [ ] 4.1 Rate limit específico por usuário e limite global por instância (configuráveis; 429 no envelope, sem revelar tracker/IP)
- [ ] 4.2 Orçamento diário/mensal configurável com **fail-closed** quando esgotado; resposta não revela quota/chave/conta
- [ ] 4.3 Deduplicação de requisições idênticas simultâneas do mesmo usuário (promise compartilhada; key = usuário + hash normalizado da query)
- [ ] 4.4 Métricas de consumo agregadas (contagens/latência/status), sem dados sensíveis; sem dashboard de billing fictício

Critério de conclusão: testes de rate limit por usuário/global, orçamento esgotado, dedup concorrente e métricas verdes.

## 5. Endpoint interno

Comandos: `pnpm --filter @leads/api lint` · `pnpm --filter @leads/api typecheck` · `pnpm --filter @leads/api test`

- [ ] 5.1 `POST /places/search` protegido por `AuthGuard` (ADMIN ACTIVE), com `Origin` exata + token CSRF (mutações)
- [ ] 5.2 Schema estrito: `textQuery` obrigatória (limites, sem controles/só espaços), propriedades desconhecidas rejeitadas, `languageCode=pt-BR`/`regionCode=BR` fixos, `pageSize` fixo em 10 (frontend não envia; sem paginação/carregamento automático); sem parâmetros arbitrários ao Google
- [ ] 5.3 Contrato de resposta próprio: `requestId`, `status`/enum controlado, resultados sanitizados, sem `pageToken`/`nextPageToken`/chave/quota/detalhes upstream; `Cache-Control: no-store`
- [ ] 5.4 Mapeamento de erros 400/401/403/409/429/500 no envelope existente, sem revelar rota/internos

Critério de conclusão: endpoint autenticado com validação estrita e contrato próprio; testes de controller verdes.

## 6. Testes negativos do backend

Comandos: `pnpm --filter @leads/api test` · `pnpm --filter @leads/api lint` · `pnpm --filter @leads/api typecheck`

- [ ] 6.1 Testes do schema: query maliciosa, caracteres de controle, strings vazias/só espaços, limites, propriedades extras
- [ ] 6.2 Testes do adaptador mockado: field mask exata, chave ausente, timeout, abort, redirect, JSON inválido, resposta acima do limite, upstream 400/401/403/409/429/500
- [ ] 6.3 Testes de rate limit por usuário/global, orçamento esgotado, dedup e concorrência idêntica
- [ ] 6.4 Testes de logs sanitizados (sem query completa/chave/cookie/CSRF/headers upstream) e prova de zero chamadas externas

Critério de conclusão: suíte de segurança/custo verde; nenhum cenário sensível sem teste.

## 7. Cliente frontend

Comandos: `pnpm --filter @leads/web lint` · `pnpm --filter @leads/web typecheck` · `pnpm --filter @leads/web test`

- [ ] 7.1 Método tipado no `ApiClient` para `POST /places/search` (CSRF via AuthProvider, `credentials: include`, timeout/cancelamento pelo cliente, parsing defensivo zod)
- [ ] 7.2 Sem chave Google e sem armazenamento local de resultados; contrato tipado dos resultados (campos condicionais do conjunto Enterprise, com interface funcional na ausência deles)

Critério de conclusão: cliente seguro e tipado; testes sem storage e sem chave.

## 8. Página de pesquisa

Comandos: `pnpm --filter @leads/web lint` · `pnpm --filter @leads/web typecheck` · `pnpm --filter @leads/web test`

- [ ] 8.1 Rota protegida `/search` dentro do `ProtectedRoute`/`AppShell` e link na navegação (sidebar/drawer)
- [ ] 8.2 Formulário com submissão explícita (sem busca ao digitar), estados loading/erro/vazio/resultados
- [ ] 8.3 Acessibilidade e responsividade; links do Google Maps em nova aba com `rel="noopener noreferrer"`; websites retornados nunca acessados automaticamente; atribuição/aviso "Google Maps"
- [ ] 8.4 Submissão duplicada bloqueada, cancelamento ao desmontar, sem criação de leads

Critério de conclusão: página funcional e acessível; testes de estados e interação verdes.

## 9. Testes frontend

Comandos: `pnpm --filter @leads/web test` · `pnpm --filter @leads/web lint` · `pnpm --filter @leads/web typecheck`

- [ ] 9.1 Testes da página: submissão explícita, loading/erro/vazio/resultados, cancelamento, acessibilidade (labels/roles/foco)
- [ ] 9.2 Testes do cliente: contrato, erros controlados, ausência de chave/storage
- [ ] 9.3 Testes de rota protegida/navegação e de ausência de criação de leads

Critério de conclusão: suíte web verde cobrindo os cenários da página e do cliente.

## 10. E2E com provider fake

Comandos: `docker compose -f infrastructure/docker-compose.dev.yml up -d postgres-test` · `pnpm --filter @leads/web build` · `pnpm --filter @leads/e2e test`

- [ ] 10.1 Provider fake injetável no E2E (substitui o `GooglePlacesProvider`; **nunca** o Google real; zero créditos)
- [ ] 10.2 Fluxo E2E: rota protegida, busca explícita, resultados, erro/vazio, ausência de chamada externa ao Google
- [ ] 10.3 Manter o orçamento de login da suíte (5 logins: 2 válidas, 3 inválidas + 1 troca) sem regressão da jornada serial

Critério de conclusão: E2E verde com provider fake; nenhuma chamada externa; orçamento de login preservado.

## 11. Documentação

Comandos: revisão manual de `README.md`, `docs/architecture/**`, `docs/security/**`

- [ ] 11.1 Documentar a integração (endpoint, field mask/SKUs, custos, impacto de SKU dos campos Enterprise sem afirmar preço não verificado, page size fixo 10, política de cache, ameaças, execução local) em `docs/architecture/places.md`
- [ ] 11.2 Atualizar `docs/security/README.md`: mapa de controles (SSRF, custo/abuso, privacidade/cache do Places)
- [ ] 11.3 Atualizar `README.md`: como habilitar, restrições no Cloud Console, rotação da chave, non-goals

Critério de conclusão: documentação consistente com spec/design e sem segredos; nada afirma preços sem fonte/data.

## 12. Validação e revisão de segurança

Comandos: `pnpm check` · `pnpm check:secrets` · `pnpm audit` · `npx openspec validate places-search` · `npx openspec validate --all`

- [ ] 12.1 Rodar gates completos (format, workspaces, segredos, lint, typecheck, test, build, audit) sem erros
- [ ] 12.2 Revisão de segurança: sem chave em bundle/logs/respostas/storage; SSRF coberto (redirect/host fixo); erros controlados; sem retry duplicador de cobrança; zero chamadas reais em testes; logs sanitizados

Critério de conclusão: todos os comandos exit 0; checklist de segurança revisado; nenhuma credencial real em código, testes, fixtures ou logs.
