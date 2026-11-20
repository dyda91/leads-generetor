# Política e custo — Integração Google Places (Text Search New)

> **Consulta oficial:** 2026-08-17. Páginas oficiais consultadas (links diretos abaixo); salvo indicação, "última atualização" das páginas registrada como 2026-08-11 UTC.
>
> **Status desta documentação:** registra pesquisa oficial, políticas de custo/armazenamento/atribuição e contratos da integração. **Nenhum controle aqui descrito está implementado** — orçamento, rate limit da busca, endpoint e integração Google funcional são **planejados** na mudança `places-search`. A integração **não está habilitada** e nenhuma chamada real à Places API foi feita.

## 1. Fontes oficiais consultadas (consulta em 2026-08-17)

| Tópico                                                          | Fonte oficial (link direto)                                                             | Última atualização (UTC) |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------ |
| Text Search (New) — contrato, field mask, parâmetros, paginação | <https://developers.google.com/maps/documentation/places/web-service/text-search>       | não indicada na página   |
| Choose fields to return — regras de field mask                  | <https://developers.google.com/maps/documentation/places/web-service/choose-fields>     | 2026-08-11               |
| Place Data Fields (New) — lista completa de campos e SKUs       | <https://developers.google.com/maps/documentation/places/web-service/data-fields>       | 2026-08-11               |
| Policies and attributions for Places API                        | <https://developers.google.com/maps/documentation/places/web-service/policies>          | 2026-08-11               |
| Places API Usage and Billing — SKUs, quotas, limitações         | <https://developers.google.com/maps/documentation/places/web-service/usage-and-billing> | 2026-08-11               |
| SKU details (pricing/billing) — tabela de SKUs                  | <https://developers.google.com/maps/billing-and-pricing/sku-details>                    | —                        |
| Manage Google Maps Platform costs — quotas, alertas, orçamentos | <https://developers.google.com/maps/billing-and-pricing/manage-costs>                   | 2026-08-11               |
| Google Maps Platform security guidance (API keys)               | <https://developers.google.com/maps/api-security-best-practices>                        | não indicada na página   |
| Set up the Places API (New) — chave/habilitação                 | <https://developers.google.com/maps/documentation/places/web-service/get-api-key>       | 2026-08-11               |
| Place IDs — exceção de cache e gerenciamento                    | <https://developers.google.com/maps/documentation/places/web-service/place-id>          | 2026-08-11               |
| Google Maps Platform Terms of Service                           | <https://cloud.google.com/maps-platform/terms>                                          | —                        |
| Service Specific Terms (caching/restrições)                     | <https://cloud.google.com/maps-platform/terms/maps-service-terms>                       | —                        |
| Google Maps Platform EEA Terms of Service                       | <https://cloud.google.com/terms/maps-platform/eea>                                      | —                        |
| EEA Frequently Asked Questions                                  | <https://developers.google.com/maps/comms/eea/faq>                                      | —                        |

**Preços:** nenhum valor numérico é registrado como permanente aqui. Para cotações, consultar a página oficial de preços/SKUs ([SKU details](https://developers.google.com/maps/billing-and-pricing/sku-details), [pricing](https://developers.google.com/maps/billing-and-pricing/pricing) e [pricing — Índia](https://developers.google.com/maps/billing-and-pricing/pricing-india)) com a data da consulta — **preços mudam e variam por região/volume**.

## 2. Fatos confirmados vs. decisões internas vs. controles planejados

- **Fatos confirmados (fonte oficial):** contrato do Text Search (New); regras de field mask; campos e SKUs; limites de `pageSize`/paginação; política de cache (exceção do Place ID); requisitos de atribuição; boas práticas de proteção de chave; comportamento de quotas e alertas de orçamento; existência de termos regionais (EEA).
- **Decisões internas do projeto** (não impostas pela documentação): Places acessado **exclusivamente pelo backend**; field mask mínima fixa; `pageSize` fixado em 10; **sem paginação no MVP**; campos Enterprise **desabilitados por padrão** em todos os ambientes e **exigindo confirmação explícita em produção**; testes/CI **nunca** chamam o Google (provider fake); logs sanitizados.
- **Controles planejados (ainda não implementados):** orçamento diário/mensal **fail-closed**, rate limit por usuário/global da busca, deduplicação concorrente, endpoint interno `POST /places/search`, adaptador `GooglePlacesProvider`. **O sistema hoje não possui nenhum desses controles nem integração Google funcional.**

## 3. Endpoint e contrato do Text Search (New)

Confirmado na [documentação oficial](https://developers.google.com/maps/documentation/places/web-service/text-search) (consulta 2026-08-17):

- **Endpoint:** `POST https://places.googleapis.com/v1/places:searchText` (HTTP POST; parâmetros no corpo JSON e/ou headers).
- **Parâmetros obrigatórios:** `textQuery` e uma **response field mask** (`X-Goog-FieldMask` no header). **Não há lista padrão de campos**; omitir o field mask retorna erro.
- **Headers:** `X-Goog-Api-Key` (chave) e `Content-Type: application/json`.
- **Resposta:** objeto JSON com o array `places`, cada item um `Place` limitado ao field mask solicitado. A lista retornada **não é garantidamente consistente** entre requisições idênticas.
- **Parâmetros opcionais relevantes:** `languageCode` (default `en`; código inválido → `INVALID_ARGUMENT`), `regionCode` (código CLDR de 2 caracteres; sem default; pode influenciar biasing e formatação de endereço), `pageSize` (1–20), `pageToken`/`nextPageToken` (paginação), além de filtros de refinamento (ex.: `includedType`, `openNow`, `locationBias`/`locationRestriction`, `rankPreference`).
- **Limite superior:** Text Search (New) retorna **no máximo 60 resultados somando todas as páginas** (limite sujeito a mudança).
- **Biasing por IP:** omitindo `locationBias`/`locationRestriction`, a API usa IP biasing por padrão.

**Decisão do projeto:** o MVP envia apenas `textQuery` + field mask fixa + `languageCode=pt-BR` + `regionCode=BR` + `pageSize=10`. Nenhum outro parâmetro é repassado.

## 4. Field mask — regras atuais

Confirmado em [Choose fields to return](https://developers.google.com/maps/documentation/places/web-service/choose-fields) e [Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search):

- Field mask é **obrigatória e explícita** (via `X-Goog-FieldMask`); sem default.
- Formato: lista separada por vírgula de paths com ponto, começando no nível superior da resposta (`places.<campo>`); **sem espaços** em nenhum lugar da lista.
- **Wildcard (`*`):** permitido apenas em desenvolvimento; **a documentação desaconselha o wildcard em produção** (volume de dados, latência e custo).
- Billing é **por SKU**: o pedido é cobrado no **SKU mais alto** aplicável à requisição (se houver campos de Essentials e Pro, cobra-se o Pro; se houver um campo Enterprise, cobra-se o Enterprise).
- Campos solicitados mas ausentes por valor default no proto3 podem ser omitidos na resposta.

**Decisão do projeto:** field mask mínima e fixa, definida no backend; **wildcard proibido em produção**; frontend nunca escolhe campos.

## 5. Campos e SKUs — tabela campo → categoria/SKU → habilitação

Mapeamento confirmado na lista de campos por SKU da página oficial do [Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search) e em [Place Data Fields (New)](https://developers.google.com/maps/documentation/places/web-service/data-fields) (consulta 2026-08-17). Preços **não** são afirmados aqui; consultar [SKU details](https://developers.google.com/maps/billing-and-pricing/sku-details) na data da aprovação.

### Conjunto básico — sempre habilitado no MVP

| Campo (exato)             | SKU (docs 2026-08-17)              | Habilitação no projeto |
| ------------------------- | ---------------------------------- | ---------------------- |
| `places.id`               | Text Search **Essentials ID Only** | **ON** (padrão)        |
| `places.displayName`      | Text Search **Pro**                | **ON** (padrão)        |
| `places.formattedAddress` | Text Search **Pro**                | **ON** (padrão)        |
| `places.googleMapsUri`    | Text Search **Pro**                | **ON** (padrão)        |
| `places.location`         | Text Search **Pro**                | **ON** (padrão)        |
| `places.types`            | Text Search **Pro**                | **ON** (padrão)        |
| `places.businessStatus`   | Text Search **Pro**                | **ON** (padrão)        |

### Conjunto Enterprise — desabilitado por padrão (config-gated)

| Campo (exato)                | SKU (docs 2026-08-17)      | Habilitação no projeto                                                                         |
| ---------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| `places.nationalPhoneNumber` | Text Search **Enterprise** | **OFF** por padrão (dev/test/prod); só entra com `PLACES_ENABLE_CONTACT_FIELDS=true` explícito |
| `places.websiteUri`          | Text Search **Enterprise** | **OFF** por padrão; idem                                                                       |
| `places.rating`              | Text Search **Enterprise** | **OFF** por padrão; idem                                                                       |
| `places.userRatingCount`     | Text Search **Enterprise** | **OFF** por padrão; idem                                                                       |

**Impacto no SKU/faturamento (confirmado):** a cobrança considera o **SKU mais alto da requisição**. Incluir qualquer campo Enterprise eleva **toda a requisição** ao SKU Text Search Enterprise — por isso os campos Enterprise ficam **fora da field mask por padrão** e exigem decisão/confirmação de custo antes de qualquer habilitação. Os nomes exatos foram confirmados na documentação oficial (disponíveis no Text Search (New)).

**Decisão de custo (Enterprise):** **OFF por padrão em development, test e production**. Em produção, habilitação exige **confirmação explícita** (sem fallback silencioso) e **não se afirma que o recurso está habilitado até a aprovação do custo no Google Cloud**. A field mask básica e a Enterprise são **compostas em pontos separados** e nunca misturadas acidentalmente. A interface deve funcionar normalmente na ausência desses campos.

## 6. pageSize e paginação

Confirmado na [documentação oficial](https://developers.google.com/maps/documentation/places/web-service/text-search):

- `pageSize`: **1–20** resultados por página; `0`/omisso → **20 por padrão**; acima de 20 → retorna **no máximo 20**.
- Paginação: quando há mais resultados, a resposta inclui `nextPageToken`, que é passado em `pageToken` na próxima requisição. `nextPageToken` pertence ao SKU **Text Search Essentials ID Only**.
- Limite geral: **máx. 60 resultados somando todas as páginas** (sujeito a mudança).

**Decisão do projeto:** `pageSize` **fixo em 10 no backend**. O frontend **não envia nem escolhe** `pageSize`. **Sem paginação e sem carregamento automático no MVP** — nenhum resultado adicional é buscado automaticamente; `nextPageToken` não é solicitado nem exposto. Uma futura mudança para até 20 resultados exigirá **nova revisão de custo/spec**.

## 7. Política de armazenamento e cache

Confirmado em [Policies and attributions for Places API](https://developers.google.com/maps/documentation/places/web-service/policies) e [Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms):

- **Proibido** pré-buscar, cachear ou armazenar conteúdo da Places API além das exceções permitidas (conteúdo = nome, endereço, avaliação, etc.).
- **Exceção — Place ID:** o `place_id` é **isento das restrições de cache** e pode ser armazenado **indefinidamente**; o [guia de Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id#save-id) descreve como salvar/atualizar.
- Termos gerais podem permitir cache limitado em casos específicos; para este projeto a regra é: **na dúvida, não persistir**.

**Decisão do projeto:** nenhum conteúdo é persistido; apenas o Place ID pode ser armazenado conforme a exceção. Sem cache no navegador (`localStorage`/`sessionStorage`/IndexedDB) e resposta interna com `Cache-Control: no-store`.

## 8. Atribuição obrigatória do Google Maps

Confirmado em [Policies and attributions](https://developers.google.com/maps/documentation/places/web-service/policies):

- O aplicativo deve exibir **atribuição do Google Maps** ao apresentar conteúdo das APIs (novos implementos usam **"Google Maps"**; logo preferencialmente; texto "Google Maps" aceitável quando o espaço é limitado).
- Distinguir visualmente o conteúdo do Google Maps de outros conteúdos (borda, cor de fundo, sombra ou espaçamento).
- **Resultados de busca:** recomenda-se informar os fatores que influenciam a ordenação (relevância, distância, proeminência) e explicar que os dados não são verificados pelo sistema.
- **Reviews/fotos (aplicável aos campos Enterprise `rating`/`userRatingCount` e a um futuro `reviews`):** creditar o autor (avatar, nome, link de perfil); acesso direto ao conteúdo original no Google Maps via `googleMapsUri`; avisar como as reviews são ordenadas/filtradas; exibir data de visita para locais na França; avisar sobre traduções; avisar que reviews não são verificadas pelo Google. Não é escopo do MVP exibir reviews/fotos.

**Decisão do projeto:** a interface exibe a atribuição "Google Maps" e diferencia o conteúdo do Google de conteúdo próprio; os dados retornados **não são rotulados como verificados/curados** pelo sistema.

## 9. Proteção da chave (backend-only)

Confirmado em [Google Maps Platform security guidance](https://developers.google.com/maps/api-security-best-practices) e [Set up the Places API (New)](https://developers.google.com/maps/documentation/places/web-service/get-api-key):

- Chaves devem ser **restritas**: uma **application restriction** + uma ou mais **API restrictions**.
- **Application restriction para backend (web service):** restrição por **endereços IP/CIDR** (origem observada pelo Google). Restrições por site/referrer são para uso client-side.
- **API restriction:** limitar a chave às APIs/serviços necessários (no caso, **Places API**). **Nunca** restringir como chave de navegador para este fluxo.
- Boas práticas adicionais: **uma chave por aplicação**; excluir chaves não usadas; monitorar uso; rotação cuidadosa (verificar uso antes); separar uso client-side e server-side em projetos distintos; desabilitar serviços não usados.
- **Responsabilidade financeira:** "você é financeiramente responsável por cobranças causadas por abuso de chaves de API não restritas".

**Decisão do projeto:** `GOOGLE_PLACES_API_KEY` existe **somente no backend** (`apps/api`), enviada apenas no header `X-Goog-Api-Key`, **nunca** em `VITE_*`, bundle, respostas, logs ou testes. Restrições no Cloud Console: API restriction para **Places API** + application restriction **de servidor (IP)** + quotas/alertas. Rotação documentada (nova chave → variável → boot valida). Testes/CI usam **provider fake** e **nenhuma chave real**.

## 10. Quotas, alertas de orçamento e limites

Confirmado em [Usage and Billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing) e [Manage costs](https://developers.google.com/maps/billing-and-pricing/manage-costs):

- **Quota técnica:** para Places API (New), a taxa por minuto é **por método da API e por projeto** (cada método tem quota própria). Atingir a quota faz o serviço **parar de responder** a requisições. A página de Quotas reflete uso em tempo real para resiliência, mas **não é fonte de verdade de faturamento** (o billing pode ter até ~48 h de latência).
- **Quota alerts:** notificam quando o uso se aproxima de um limite configurado (e-mail, SMS, webhook, etc.).
- **Orçamentos (budgets) e budget alerts:** **não interrompem o gasto automaticamente** — "definir um orçamento não limita automaticamente o uso ou gasto do Google Cloud/Google Maps Platform; os e-mails de alerta podem levá-lo a agir para controlar custos, mas **não evitam automaticamente** o uso ou a cobrança quando o valor/limiar é atingido ou excedido".

**Distinção importante (decisão do projeto):**

- **Quota técnica** (Google): limita requisições/método/projeto e **para o serviço** quando atingida.
- **Orçamento/alerta** (Google): **apenas notifica**; não para gasto.
- **Fail-closed de orçamento** (nosso sistema, **planejado**): bloqueio interno diário/mensal configurável que recusa a busca quando o orçamento é atingido — **controle nosso, ainda não implementado**, e **não deve ser confundido** com quota ou alerta do Google.

## 11. Termos regionais e EEA

Confirmado em [Policies and attributions](https://developers.google.com/maps/documentation/places/web-service/policies) e avisos nas páginas oficiais:

- Desenvolvedores com **endereço de cobrança na EEA**: os **Google Maps Platform EEA Terms of Service** se aplicam a partir de **8 de julho de 2025**, e a funcionalidade pode variar por região. Fontes: [EEA ToS](https://cloud.google.com/terms/maps-platform/eea), [EEA Service Specific Terms](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms), [EEA FAQ](https://developers.google.com/maps/comms/eea/faq), [Road Safety Requirements](https://cloud.google.com/terms/maps-platform/eea-safety-requirements).
- Requisitos de aplicação (conteúdo de atribuição/reviews) podem ser **obrigatórios por lei** mesmo quando marcados como "recomendados".
- **Sem aconselhamento jurídico aqui:** dúvidas de conformidade devem ser encaminhadas a assessoria jurídica.

## 12. Privacidade e proibição de registrar dados sensíveis

Política interna do projeto (baseada nas políticas de uso da Places API e nas boas práticas de minimização):

- **Não registrar consultas ou respostas sensíveis desnecessariamente.** Logs estruturados com `requestId` e resultado controlado; a query completa só pode ser registrada quando não sensível, e preferencialmente apenas um **hash controlado**.
- **Nunca** registrar chave, `Authorization`, cookie, CSRF, corpo/headers upstream, IP/User-Agent.
- Não acessar sites retornados, não fazer scraping nem crawling; sem enriquecimento com dados pessoais.

## 13. Testes e CI — proibição de chamadas reais

Decisão do projeto (alinhada ao ADR-0004 e à política de custo):

- Testes e CI **nunca chamam a Google Places API real**; usam **provider fake/mocks** injetados.
- **Zero créditos consumidos** por desenvolvimento ou CI; nenhuma chave real, variável de ambiente secreta ou conta de faturamento em testes, fixtures ou documentação.

## 14. Resumo das decisões internas consolidadas

1. Google Places (Text Search New) acessado **exclusivamente pelo backend** (ADR-0002); chave apenas em `apps/api`.
2. Field mask **mínima e fixa** no backend; wildcard proibido em produção; frontend não escolhe campos.
3. Conjunto básico (Essentials ID Only + Pro) **sempre habilitado**.
4. Campos Enterprise (`nationalPhoneNumber`, `websiteUri`, `rating`, `userRatingCount`) **OFF por padrão** em dev/test/prod; produção exige confirmação explícita; field masks nunca misturadas; SKU documentado sem preço não verificado.
5. `pageSize` **fixo em 10**; frontend não envia/escolhe; **sem paginação e sem carregamento automático**; mudança futura para até 20 exige nova revisão de custo/spec.
6. **Sem cache de conteúdo**; Place ID isento (pode ser armazenado indefinidamente); sem cache no navegador.
7. Atribuição "Google Maps" e distinção de conteúdo na interface; dados não apresentados como verificados.
8. Chave restrita (API restriction + application restriction de servidor), rotação documentada, ausente de logs/respostas/frontend.
9. Quota técnica (Google) ≠ orçamento/alertas (Google, só notificam) ≠ **fail-closed interno planejado**.
10. Testes/CI com provider fake; zero chamadas reais e zero créditos.

## 15. Controles planejados (ainda não implementados)

A mudança `places-search` planeja, em grupos futuros: orçamento diário/mensal com **fail-closed**, rate limit por usuário e global da busca, deduplicação de requisições idênticas, endpoint interno `POST /places/search`, adaptador `GooglePlacesProvider` seguro e testes correspondentes. **Nada disso existe hoje no sistema.**
