# security-foundation Specification

## Purpose
Runtime security and operational controls of the minimal NestJS backend shell: fail-fast configuration, minimal public health check, secure HTTP bootstrap, strict input validation, safe centralized errors, rate limiting, request ID correlation, and orderly lifecycle.
## Requirements
### Requirement: Configuração fail-fast
O backend SHALL validar todas as variáveis de ambiente durante a inicialização e MUST encerrar o processo antes de aceitar tráfego quando uma variável obrigatória estiver ausente, inválida ou insegura. As mensagens de falha MUST NOT incluir os valores recebidos.

#### Scenario: Variável obrigatória ausente bloqueia a inicialização
- **WHEN** o backend inicia com uma variável obrigatória ausente
- **THEN** o processo é encerrado antes de aceitar tráfego

#### Scenario: Valor inválido bloqueia a inicialização
- **WHEN** uma variável de ambiente possui valor inválido
- **THEN** o processo é encerrado antes de aceitar tráfego

#### Scenario: Falha não imprime o valor recebido
- **WHEN** a inicialização falha por configuração
- **THEN** a mensagem de erro não contém o valor da variável

#### Scenario: Configuração válida permite inicialização
- **WHEN** todas as variáveis obrigatórias são válidas
- **THEN** o processo inicia e passa a aceitar tráfego

#### Scenario: Produção rejeita configurações inseguras
- **WHEN** o ambiente é produção e a configuração é insegura (por exemplo, CORS com wildcard ou debug habilitado)
- **THEN** o processo é encerrado antes de aceitar tráfego

### Requirement: Health check público mínimo
O endpoint público de health SHALL retornar somente o status mínimo e MUST NOT revelar detalhes internos.

#### Scenario: Acesso anônimo permitido
- **WHEN** um cliente não autenticado chama o health
- **THEN** recebe uma resposta de sucesso com status mínimo

#### Scenario: Resposta contém somente status mínimo
- **WHEN** o health é chamado
- **THEN** a resposta contém apenas uma indicação mínima de status

#### Scenario: Não revela detalhes internos
- **WHEN** o health é chamado
- **THEN** nenhum dado de banco, memória, hostname, versões, ambiente ou dependências é exposto

#### Scenario: Método não permitido é rejeitado
- **WHEN** um método HTTP não permitido é usado no health
- **THEN** a requisição é rejeitada

### Requirement: Validação de entrada
O backend SHALL validar e transformar toda entrada recebida e MUST rejeitar propriedades desconhecidas, tipos inválidos, parâmetros fora dos limites e payloads acima do limite definido. Os limites de corpo SHALL ser definidos explicitamente para JSON e URL-encoded, sem parsers duplicados, e o query parser SHALL usar uma estratégia simples e documentada.

#### Scenario: Propriedades desconhecidas são rejeitadas
- **WHEN** uma requisição contém propriedades não declaradas
- **THEN** a requisição é rejeitada com erro de validação

#### Scenario: Tipos inválidos são rejeitados
- **WHEN** um campo possui tipo inválido
- **THEN** a requisição é rejeitada com erro de validação

#### Scenario: Payload acima do limite é rejeitado
- **WHEN** o corpo HTTP (JSON ou URL-encoded) excede o limite definido explicitamente
- **THEN** a requisição é rejeitada

#### Scenario: Parâmetros possuem limites
- **WHEN** um parâmetro ou a quantidade de parâmetros excede o limite definido
- **THEN** a requisição é rejeitada

#### Scenario: Dados rejeitados não aparecem em logs ou respostas
- **WHEN** uma entrada é rejeitada
- **THEN** o valor rejeitado não aparece nos logs nem na resposta

### Requirement: CORS
O backend SHALL aplicar uma allowlist explícita de origens e MUST NOT usar wildcard em produção nem combinar wildcard com credentials. As origens SHALL ser comparadas por origem completa e normalizada. O CORS MUST NOT ser tratado como autenticação ou proteção de clientes fora do navegador, e `credentials` MUST NOT ser habilitada nesta mudança sem necessidade.

#### Scenario: Origem autorizada recebe headers apropriados
- **WHEN** uma origem autorizada faz uma requisição
- **THEN** a resposta inclui os headers CORS apropriados

#### Scenario: Origem não autorizada não recebe permissão
- **WHEN** uma origem não autorizada faz uma requisição
- **THEN** ela não recebe headers CORS de permissão

#### Scenario: Origem é comparada por origem completa e normalizada
- **WHEN** uma origem é avaliada contra a allowlist
- **THEN** a comparação usa a origem completa e normalizada, sem correspondência parcial

#### Scenario: Ausência de Origin tratada conscientemente
- **WHEN** uma requisição server-to-server sem header Origin é recebida
- **THEN** o comportamento é explícito e documentado, e o CORS não é tratado como autenticação nem como proteção de clientes fora do navegador

#### Scenario: Wildcard é proibido em produção
- **WHEN** o ambiente é produção e o CORS está configurado com wildcard
- **THEN** a inicialização é bloqueada

#### Scenario: Credentials não habilitada sem necessidade
- **WHEN** não há necessidade de cookies ou credenciais no navegador
- **THEN** `credentials` permanece desabilitada

### Requirement: Tratamento centralizado de erros
O backend SHALL tratar erros de forma centralizada com um contrato consistente e MUST NOT retornar stack trace ou detalhes internos em produção. A mensagem de erro MUST vir de códigos e mensagens controladas e MUST NOT ecoar `exception.message` de erros inesperados. O campo `details` MAY conter nomes de campos e tipos de violação, mas MUST NOT conter valores recebidos. Erros 413, 429, 404 e de validação SHALL seguir o mesmo envelope quando tecnicamente possível.

#### Scenario: 404 não revela estrutura interna
- **WHEN** um recurso não existe
- **THEN** a resposta não revela estrutura interna

#### Scenario: Erro de validação usa contrato consistente
- **WHEN** ocorre um erro de validação
- **THEN** a resposta segue o contrato único de erro e o campo `details` contém apenas nomes de campos e tipos de violação, nunca valores recebidos

#### Scenario: Erros 413, 429, 404 e de validação usam o mesmo envelope
- **WHEN** ocorre um erro 413, 429, 404 ou de validação
- **THEN** a resposta segue o mesmo envelope de erro quando tecnicamente possível

#### Scenario: Exceções pré-NestJS são normalizadas
- **WHEN** ocorre um erro antes de o NestJS assumir a requisição (por exemplo, parser de body rejeita o payload)
- **THEN** o erro é normalizado para o contrato padrão de erro

#### Scenario: Erro inesperado retorna mensagem genérica
- **WHEN** ocorre um erro inesperado
- **THEN** a resposta contém uma mensagem genérica proveniente de mensagens controladas e nunca o `exception.message` original

#### Scenario: Stack trace nunca é retornada em produção
- **WHEN** o ambiente é produção e ocorre um erro
- **THEN** a resposta não contém stack trace

#### Scenario: Request ID para correlação
- **WHEN** uma requisição gera um erro
- **THEN** a resposta inclui um request ID que permite correlação sem conter dados do usuário

### Requirement: Rate limiting
O backend SHALL aplicar rate limiting global e MUST retornar 429 em excesso sem revelar informações sensíveis. O limiter in-memory SHALL servir apenas para instância única, `trust proxy` SHALL permanecer desligado e nenhuma heurística de `X-Forwarded-For` SHALL ser implementada.

#### Scenario: Excesso retorna 429
- **WHEN** uma origem excede o limite de requisições
- **THEN** recebe a resposta 429

#### Scenario: Headers não revelam informações sensíveis
- **WHEN** uma resposta de rate limit é emitida
- **THEN** os headers não contêm informações sensíveis

#### Scenario: Proxy trust não é habilitado indiscriminadamente
- **WHEN** a aplicação não está atrás de um proxy conhecido
- **THEN** o trust proxy não é habilitado

#### Scenario: Estratégia para IP real atrás de proxy
- **WHEN** a aplicação é executada atrás de um proxy
- **THEN** a configuração de IP real é feita explicitamente para a hospedagem, sem heurísticas de `X-Forwarded-For`, e a estratégia multi-instância fica para `production-hardening-and-deployment`

### Requirement: Cabeçalhos de segurança
O backend SHALL emitir cabeçalhos HTTP seguros e MUST NOT expor tecnologia ou versão. O CSP SHALL ser configurado com política restritiva apropriada para uma API sem HTML e MUST NOT ser desabilitado de forma global. O HSTS SHALL ser emitido somente em produção.

#### Scenario: X-Powered-By ausente
- **WHEN** uma resposta é emitida
- **THEN** o header X-Powered-By está ausente

#### Scenario: Headers de segurança comprovados por teste
- **WHEN** o bootstrap seguro é aplicado
- **THEN** os headers de segurança são verificados por teste

#### Scenario: CSP restritiva para API sem HTML
- **WHEN** o backend não serve HTML
- **THEN** a política de Content Security Policy é restritiva e adequada para uma API sem HTML, considerando no mínimo `default-src 'none'`, `frame-ancestors 'none'` e `base-uri 'none'`, verificada quanto à compatibilidade real com o Helmet e comprovada por testes de presença e valores esperados

#### Scenario: Desativação de diretiva CSP exige justificativa
- **WHEN** uma diretiva de CSP precisa ser desabilitada
- **THEN** é exigida justificativa específica documentada e teste correspondente, e nunca uma desativação global da política

#### Scenario: HSTS emitido somente em produção
- **WHEN** o ambiente é produção
- **THEN** a resposta inclui o header de HSTS

#### Scenario: HSTS ausente em development e test
- **WHEN** o ambiente é development ou test
- **THEN** a resposta não inclui o header de HSTS

#### Scenario: Nenhum header expõe tecnologia ou versão
- **WHEN** uma resposta é emitida
- **THEN** nenhum header expõe tecnologia ou versão do servidor

### Requirement: Inicialização e encerramento ordenado
O backend SHALL inicializar com TypeScript estrito e MUST encerrar de forma ordenada ao receber sinal de término.

#### Scenario: Backend inicia com configuração válida
- **WHEN** a aplicação inicia com configuração válida
- **THEN** o servidor HTTP passa a aceitar conexões

#### Scenario: Encerramento ordenado em sinal de término
- **WHEN** a aplicação recebe SIGTERM ou SIGINT
- **THEN** o servidor e as conexões são encerrados de forma ordenada

### Requirement: Request ID seguro para correlação
O backend SHALL gerar um request ID por requisição usando `crypto.randomUUID()` no servidor para correlação e MUST NOT confiar, reutilizar ou ecoar um identificador controlado externamente como identificador interno. O request ID retornado MUST NOT conter dados do usuário.

#### Scenario: Request ID gerado pelo backend por requisição
- **WHEN** uma requisição chega
- **THEN** o backend gera um request ID com `crypto.randomUUID()` e o retorna no header `X-Request-Id` da resposta

#### Scenario: Entrada externa não controla o ID interno
- **WHEN** um cliente envia um header `X-Request-Id`
- **THEN** o backend ignora o valor externo, gera seu próprio request ID interno e nunca ecoa o valor fornecido pelo cliente

#### Scenario: Request ID não contém dados do usuário
- **WHEN** um request ID é exposto
- **THEN** ele não contém dados pessoais do usuário

