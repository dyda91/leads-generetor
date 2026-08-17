## Purpose

Functional business search powered by Google Places Text Search (New), called exclusively by the backend with strict query validation, layered cost/abuse controls, a secure authenticated internal endpoint, an accessible single-page search UI, and safe data/caching/privacy handling — without persisting leads in this change.

## ADDED Requirements

### Requirement: Integração Google exclusivamente pelo backend
O sistema SHALL buscar lugares usando a Google Places API **somente pelo backend**. A chave `GOOGLE_PLACES_API_KEY` MUST exist apenas em `apps/api` e MUST NOT aparecer no frontend, em variáveis `VITE_*`, no bundle, em respostas, logs ou testes. O frontend SHALL chamar apenas a API interna. A URL upstream SHALL ser fixa e controlada pelo backend, e o backend MUST NOT aceitar URLs fornecidas pelo usuário, implementar proxy genérico ou expor endpoint capaz de chamar host arbitrário. Mesmo com upstream fixo, o backend SHALL planejar proteção SSRF: redirecionamentos upstream MUST NOT permitir troca de host.

#### Scenario: Chave ausente do frontend
- **WHEN** o frontend é construído e inspecionado
- **THEN** nenhum valor ou referência de `GOOGLE_PLACES_API_KEY` existe no bundle, em `VITE_*`, em storage ou em respostas da API interna

#### Scenario: Somente a API interna é chamada pelo frontend
- **WHEN** o usuário executa uma pesquisa no frontend
- **THEN** a única chamada de rede é para `POST /places/search` da própria API, e nenhuma chamada direta ao Google ocorre no navegador

#### Scenario: URL upstream fixa e sem proxy genérico
- **WHEN** o backend realiza uma pesquisa
- **THEN** ele conecta apenas ao endpoint fixo `https://places.googleapis.com/v1/places:searchText`, nunca a uma URL fornecida pelo cliente

#### Scenario: Redirects não trocam de host
- **WHEN** o upstream responde com um redirect
- **THEN** a requisição é rejeitada/abortada e nenhum outro host é contatado

#### Scenario: Proteção SSRF mesmo com upstream fixo
- **WHEN** a configuração ou o código é revisado
- **THEN** não existe caminho que permita ao cliente escolher host, porta, path ou protocolo do destino upstream

### Requirement: Endpoint interno de pesquisa
O backend SHALL expor `POST /places/search` para usuário autenticado e autorizado (ADMIN ACTIVE via guard existente). O endpoint MUST exigir cookie de sessão, `Origin` exata autorizada e token CSRF válido, e MUST usar o envelope de erro existente para 401, 403, 409, 429 e 500. A resposta SHALL ser um contrato próprio, sanitizado, com `requestId`, status/enum controlado e resultados limpos — MUST NOT repassar JSON bruto do Google, `pageToken`, `nextPageToken`, chave, quota ou detalhes upstream. A resposta SHALL usar `Cache-Control` apropriado (sem cache de conteúdo).

#### Scenario: Pesquisa autenticada retorna contrato próprio
- **WHEN** um usuário autenticado e autorizado envia `POST /places/search` com `Origin` e CSRF válidos
- **THEN** a resposta usa o contrato próprio (requestId, status controlado, resultados sanitizados) e não contém JSON bruto do Google, chave, token, página ou detalhes de quota

#### Scenario: Sem sessão
- **WHEN** `POST /places/search` é chamado sem sessão válida
- **THEN** a resposta é 401 no envelope existente, sem revelar a rota ou internos

#### Scenario: Sem permissão
- **WHEN** a sessão não pertence a um usuário ADMIN ACTIVE
- **THEN** a resposta é 403 no envelope existente

#### Scenario: Sem CSRF ou Origin inválida
- **WHEN** a mutação é enviada sem token CSRF válido ou com `Origin` ausente/não autorizada
- **THEN** a operação é rejeitada (403) e um `Referer` presente não substitui uma `Origin` ausente

#### Scenario: Sem detalhes upstream em erro
- **WHEN** o upstream falha e a API interna responde um erro
- **THEN** a resposta não contém mensagem, stack, corpo, headers ou código do Google, nem a chave

#### Scenario: Erros mapeados ao envelope
- **WHEN** ocorre 400 (validação), 403, 409, 429 (rate limit) ou 500
- **THEN** a resposta segue o envelope de erro existente, sem detalhes internos

### Requirement: Validação estrita da consulta
O backend SHALL validar `POST /places/search` com contrato estrito. O campo `textQuery` SHALL ser obrigatório, com limite mínimo e máximo de comprimento, e MUST NOT aceitar strings vazias, somente espaços, caracteres de controle ou payloads com propriedades desconhecidas. A normalização SHALL ser mínima e previsível (apenas trim de extremidades), e o sistema MUST NOT reescrever a intenção do usuário. `languageCode` SHALL ser fixo em `pt-BR` e `regionCode` SHALL ser fixo em `BR` (não fornecidos pelo usuário no MVP). O `pageSize` SHALL ser **fixado em 10 no backend**; o frontend MUST NOT enviar nem escolher `pageSize`, e MUST NOT haver paginação ou carregamento automático de resultados adicionais. O backend MUST NOT repassar parâmetros arbitrários ao Google; apenas os parâmetros mapeados e fixos SHALL ser enviados.

#### Scenario: Query obrigatória e com limites
- **WHEN** `textQuery` está ausente, vazia, só espaços, abaixo do mínimo ou acima do máximo
- **THEN** a requisição é rejeitada com 400 no envelope, sem ecoar o valor

#### Scenario: Controles e propriedades desconhecidas rejeitados
- **WHEN** a query contém caracteres de controle ou o payload contém propriedades não declaradas
- **THEN** a requisição é rejeitada com 400

#### Scenario: Normalização mínima preserva a intenção
- **WHEN** uma query válida é normalizada
- **THEN** apenas as extremidades são aparadas e a intenção do usuário não é reescrita

#### Scenario: Região e idioma fixos no backend
- **WHEN** a requisição é montada para o Google
- **THEN** `languageCode` é `pt-BR` e `regionCode` é `BR`, e valores enviados pelo cliente para esses campos são rejeitados

#### Scenario: Sem parâmetros arbitrários ao Google
- **WHEN** o backend chama o Google
- **THEN** envia apenas a query validada, o field mask fixo, região/idioma fixos e o valor fixo de `pageSize` (10), sem parâmetros escolhidos pelo cliente

### Requirement: Controle de custo e abuso
O backend SHALL aplicar defesa em camadas para custo e abuso: rate limit específico por usuário e limite global por instância, orçamento diário/mensal configurável, teto por pesquisa e por resultado. O sistema MUST NOT realizar busca automática ao digitar; a submissão SHALL ser explícita e o debounce MUST NOT ser considerado controle de custo. O backend MUST NOT executar retry automático que possa duplicar cobrança, e SHALL deduplicar requisições simultâneas idênticas (mesmo usuário/consulta). Quando o orçamento estiver esgotado, o sistema SHALL falhar de forma controlada (fail-closed) com resposta que não revela quota, chave ou conta do Google. Timeout curto e limites de tamanho de resposta SHALL ser aplicados. O sistema SHALL registrar métricas de consumo agregadas sem dados sensíveis.

#### Scenario: Rate limit por usuário e global
- **WHEN** um usuário ou a instância excede o limite configurado de pesquisas
- **THEN** a resposta é 429 no envelope, sem revelar tracker, IP ou detalhes internos

#### Scenario: Sem busca automática
- **WHEN** o usuário digita em uma caixa de pesquisa
- **THEN** nenhuma chamada é disparada até uma submissão explícita (botão/Enter)

#### Scenario: Sem retry que duplique cobrança
- **WHEN** uma chamada upstream falha
- **THEN** o backend não repete automaticamente a mutação que poderia gerar nova cobrança

#### Scenario: Sem resultados adicionais automáticos
- **WHEN** uma pesquisa retorna seus resultados
- **THEN** nenhum resultado adicional é buscado automaticamente (sem paginação e sem carregamento automático)

#### Scenario: Deduplicação de requisições idênticas concorrentes
- **WHEN** duas requisições idênticas do mesmo usuário chegam simultaneamente
- **THEN** apenas uma chamada upstream é feita e ambas recebem o mesmo resultado controlado

#### Scenario: Orçamento esgotado falha de forma fechada
- **WHEN** o orçamento diário/mensal é atingido
- **THEN** a pesquisa é recusada com erro controlado que não revela quota, chave ou conta Google

#### Scenario: Métricas sem dados sensíveis
- **WHEN** métricas de consumo são emitidas
- **THEN** contêm apenas agregados (contagens, latência, status) e nenhuma query, chave, cookie ou identificador de conta

### Requirement: Contrato de campos e cobrança
O field mask enviado ao Google SHALL ser mínimo, fixo e definido no backend; o frontend MUST NOT escolher campos. O backend MUST NOT usar wildcard (`*`) em produção. O sistema SHALL mapear cada campo exibido ao SKU atual da documentação oficial e MUST NOT solicitar campos que não serão exibidos. O conjunto básico (Essentials + Pro) e o conjunto de contato (Enterprise) SHALL ser separados, e a inclusão do conjunto Enterprise SHALL exigir decisão de custo documentada e aprovada. O sistema MUST NOT afirmar preços sem fonte oficial e data de consulta. O conjunto Enterprise (`nationalPhoneNumber`, `websiteUri`, `rating`, `userRatingCount`) SHALL ser configurável e **OFF por padrão em development, test e production**; seus campos SHALL ser incluídos no field mask somente quando configuração explícita estiver ativa. Em produção, a habilitação SHALL exigir **confirmação explícita — sem fallback silencioso**. A field mask básica e a Enterprise SHALL ser compostas em pontos separados e MUST NOT ser misturadas acidentalmente. O sistema MUST NOT afirmar que o recurso está habilitado até a **aprovação do custo no Google Cloud**, e SHALL documentar o impacto de SKU dos campos Enterprise **sem afirmar preço não verificado**.

#### Scenario: Field mask fixo e mínimo
- **WHEN** o backend chama o Google
- **THEN** envia exatamente o field mask fixo e mínimo configurado, sem wildcard e sem campos não exibidos

#### Scenario: Frontend não escolhe campos
- **WHEN** o frontend pesquisa
- **THEN** ele não envia nem recebe field mask; apenas recebe a resposta já sanitizada do backend

#### Scenario: Campos exibidos = campos solicitados
- **WHEN** um campo é exibido na interface
- **THEN** ele pertence ao field mask ativo, e campos não solicitados nunca aparecem na resposta

#### Scenario: Conjunto Enterprise exigido apenas com decisão aprovada
- **WHEN** o conjunto de contato (Enterprise: telefone, site, avaliação) não foi habilitado pela decisão de custo
- **THEN** o field mask não inclui esses campos e a resposta não os contém

#### Scenario: Enterprise off por padrão em todos os ambientes
- **WHEN** nenhuma configuração explícita de campos Enterprise está ativa
- **THEN** `nationalPhoneNumber`, `websiteUri`, `rating` e `userRatingCount` não entram no field mask e não aparecem na resposta, em development, test ou production

#### Scenario: Produção exige confirmação explícita
- **WHEN** em produção os campos Enterprise estão habilitados
- **THEN** houve confirmação explícita de custo; não há fallback silencioso que os ative

#### Scenario: Field mask básica e Enterprise não misturadas
- **WHEN** o field mask é composto
- **THEN** a máscara básica e a Enterprise são montadas em pontos separados e nunca misturadas acidentalmente

#### Scenario: Interface funcional sem campos Enterprise
- **WHEN** o conjunto Enterprise está desabilitado
- **THEN** a interface renderiza os resultados corretamente sem telefone, site, avaliação ou contagem

#### Scenario: Impacto de SKU documentado sem preço não verificado
- **WHEN** os campos Enterprise são documentados
- **THEN** o impacto de SKU é registrado sem afirmar preço sem fonte oficial e data de consulta

### Requirement: Cliente Google seguro
O adaptador Google SHALL usar `fetch` nativo do Node (ou dependência justificada e documentada), endpoint fixo, `X-Goog-Api-Key` somente no header, field mask fixa, `Content-Type: application/json`, `AbortController`, timeout curto configurável, validação de resposta em runtime e limite de tamanho da resposta. Redirects SHALL ser desabilitados ou rejeitados. O adaptador MUST NOT vazar `exception.message` upstream, corpo bruto do Google, headers ou a chave em erros ou logs, e MUST NOT executar retry automático no MVP. Testes MUST usar mocks e MUST NOT fazer chamadas reais ao Google (zero créditos).

#### Scenario: Requisição correta ao upstream
- **WHEN** o adaptador chama o Google
- **THEN** envia POST ao endpoint fixo com `X-Goog-Api-Key` no header, `X-Goog-FieldMask` fixa, `Content-Type: application/json`, corpo com apenas os parâmetros validados e timeout ativo

#### Scenario: Timeout e abort
- **WHEN** a requisição excede o timeout ou é abortada
- **THEN** o adaptador encerra com erro controlado e limpa o timer, distinguindo timeout de cancelamento

#### Scenario: Redirect rejeitado
- **WHEN** o upstream responde com redirect
- **THEN** o adaptador não segue e não contata outro host

#### Scenario: Resposta inválida ou acima do limite
- **WHEN** a resposta não é JSON válido, não valida em runtime ou excede o limite de tamanho
- **THEN** o adaptador responde erro controlado, sem corpo bruto em logs

#### Scenario: Sem corpo bruto e sem chave em erros
- **WHEN** o upstream retorna erro
- **THEN** o erro interno não contém mensagem/stack/headers do Google nem a chave, e nenhum log imprime esses valores

#### Scenario: Zero chamadas reais em testes
- **WHEN** a suíte de testes é executada
- **THEN** nenhuma chamada real ao Google é feita (mocks/provedor fake), e nenhum crédito é consumido

### Requirement: Privacidade e dados
O backend SHALL retornar somente os campos aprovados e MUST NOT misturar resultados do Google com leads persistentes nesta mudança. O sistema MUST NOT coletar e-mails por scraping, acessar sites retornados, seguir URLs de website nem fazer crawling. O backend MUST NOT armazenar IP ou User-Agent sem política, e SHOULD sanitizar logs para não registrar a query completa quando ela puder conter dados pessoais. O sistema MUST NOT apresentar dados como verificados pelo próprio sistema.

#### Scenario: Somente campos aprovados retornados
- **WHEN** uma pesquisa retorna resultados
- **THEN** apenas os campos do field mask ativo são retornados, e nenhum e-mail, website acessado ou dado extra é adicionado

#### Scenario: Sem mistura com leads
- **WHEN** os resultados são exibidos
- **THEN** nenhum dado é persistido nem misturado com leads existentes nesta mudança

#### Scenario: Sem scraping nem acesso automático a sites
- **WHEN** um resultado possui website
- **THEN** o backend não acessa o site, não faz crawling e não tenta obter e-mail

#### Scenario: Logs sanitizados
- **WHEN** logs de pesquisa são emitidos
- **THEN** não contêm a query completa se sensível (ou contêm apenas um hash controlado), nem IP/User-Agent, chave, cookie ou CSRF

#### Scenario: Dados não apresentados como verificados
- **WHEN** a interface exibe resultados do Google
- **THEN** nenhum dado é rotulado como verificado/curado pelo sistema

### Requirement: Política de armazenamento e cache
O sistema SHALL respeitar a política oficial de armazenamento da Places API: conteúdo (nome, endereço, avaliação etc.) MUST NOT ser pré-buscado, cacheado ou persistido além das exceções permitidas; o Place ID SHALL ser tratado como isento das restrições de cache e poderá ser armazenado indefinidamente. O sistema MUST NOT usar cache em navegador (`localStorage`/`sessionStorage`) para conteúdo do Places e SHOULD evitar cache de conteúdo. Se cache for introduzido, SHALL ser chaveado por consulta normalizada + field mask, com TTL e invalidação definidos, e MUST NOT armazenar chave ou headers. Na dúvida legal/política, o sistema SHALL preferir não persistir além do necessário.

#### Scenario: Nenhuma persistência de conteúdo além do permitido
- **WHEN** o sistema processa resultados
- **THEN** nenhum conteúdo do Places (exceto Place ID) é persistido sem política aprovada

#### Scenario: Place ID tratado como isento
- **WHEN** um Place ID é armazenado
- **THEN** ele é tratado conforme a exceção oficial de cache (persistência indefinida permitida) e associado à sua consulta de origem de forma controlada

#### Scenario: Sem cache no navegador
- **WHEN** o frontend exibe resultados
- **THEN** nenhum conteúdo do Places é gravado em `localStorage`/`sessionStorage`/IndexedDB

#### Scenario: Cache futuro com TTL e chave controlada
- **WHEN** cache é habilitado (decisão futura)
- **THEN** ele é chaveado por consulta normalizada + field mask, com TTL e invalidação definidos e sem chave/headers armazenados

### Requirement: Frontend de pesquisa
O frontend SHALL fornecer uma rota protegida de pesquisa com entrada explícita, botão de busca, e estados de loading, erro, vazio e resultados, com acessibilidade e responsividade. O sistema MUST NOT disparar busca automaticamente ao digitar, MUST impedir submissões duplicadas e MUST cancelar a requisição ao desmontar a tela. O frontend SHALL usar o cliente de API seguro (CSRF via AuthProvider, `credentials: include`), MUST NOT conter chave Google, MUST NOT usar armazenamento local para resultados, e SHALL abrir links do Google Maps em nova aba com `rel="noopener noreferrer"` e MUST NOT acessar automaticamente websites retornados. O frontend SHALL renderizar corretamente os resultados mesmo quando os campos Enterprise estiverem ausentes. O frontend MUST NOT criar leads nesta mudança.

#### Scenario: Rota protegida e entrada explícita
- **WHEN** um usuário autenticado acessa a página de pesquisa
- **THEN** vê um formulário com entrada de texto e botão "Pesquisar", e nenhuma chamada ocorre até a submissão

#### Scenario: Estados loading/erro/vazio/resultados
- **WHEN** uma busca é submetida
- **THEN** a interface mostra loading durante a chamada e, ao final, resultados ou erro/vazio controlado, sem flash indevido

#### Scenario: Sem duplicação e cancelamento
- **WHEN** uma busca está em andamento ou a tela desmonta
- **THEN** uma nova submissão é bloqueada e a requisição pendente é cancelada sem efeito colateral

#### Scenario: Sem chave, sem storage, links seguros
- **WHEN** o frontend exibe resultados
- **THEN** nenhuma chave Google existe no bundle/storage, nenhum conteúdo é persistido localmente, links do Google Maps abrem em nova aba com `rel="noopener noreferrer"` e websites não são acessados automaticamente

#### Scenario: Sem criação de leads
- **WHEN** a página de pesquisa é usada
- **THEN** nenhum lead é criado, persistido ou enviado

### Requirement: Configuração de integração
O backend SHALL exigir configuração explícita para habilitar a integração e validar no boot (fail-fast): `GOOGLE_PLACES_API_KEY` (ou habilitação explícita), timeout, limites por busca, limites de orçamento e parâmetros de rate limit. Em produção, o boot SHALL rejeitar placeholder ou valor inseguro, e a habilitação dos campos Enterprise SHALL exigir **confirmação explícita — sem fallback silencioso**. Os erros de configuração MUST NOT imprimir valores. `.env.example` SHALL conter apenas placeholder vazio. A rotação da chave SHALL ser documentada, e a restrição no Google Cloud SHALL prever API restriction para Places API e application restriction adequada ao backend (servidor), com quotas e alertas; a chave MUST NOT ser restringida como chave de navegador para este fluxo.

#### Scenario: Habilitação explícita e fail-fast
- **WHEN** a integração não está habilitada ou a configuração é inválida
- **THEN** o boot falha antes de aceitar tráfego, sem imprimir valores

#### Scenario: Produção rejeita placeholder
- **WHEN** em produção `GOOGLE_PLACES_API_KEY` é um placeholder ou valor inseguro
- **THEN** o boot é rejeitado

#### Scenario: Variável sensível ausente do frontend
- **WHEN** o frontend é configurado
- **THEN** nenhuma variável `VITE_*` carrega a chave ou qualquer segredo

#### Scenario: Rotação documentada
- **WHEN** a chave precisa ser rotacionada
- **THEN** o procedimento (nova chave, atualização da variável, validação no boot) está documentado e não exige deploy de código

### Requirement: Logs e observabilidade
O backend SHALL emitir logs estruturados com `requestId`, resultado controlado e métricas agregadas, e MUST NOT registrar chave, `Authorization`, cookie, CSRF, corpo upstream ou headers. Um hash controlado da consulta SHALL ser usado apenas se necessário. Auditoria detalhada SHALL pertencer a `audit-and-observability`, e o sistema MUST NOT criar dashboard de billing fictício.

#### Scenario: Logs sem dados sensíveis
- **WHEN** logs de pesquisa são emitidos
- **THEN** contêm requestId e resultado controlado, e nunca chave, cookie, CSRF, corpo/headers upstream ou a query completa não sanitizada

#### Scenario: Métricas agregadas
- **WHEN** métricas são emitidas
- **THEN** são agregadas (contagem, latência, status) sem query, chave ou dados pessoais

#### Scenario: Sem dashboard de billing fictício
- **WHEN** o sistema expõe consumo
- **THEN** não apresenta um painel de faturamento não real; detalhes de auditoria ficam para `audit-and-observability`
