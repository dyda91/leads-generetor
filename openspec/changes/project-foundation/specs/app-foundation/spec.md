## Purpose

Establishes the persistent behavioral contracts of the system foundation that every later change must respect: safe configuration handling, secret hygiene, the backend-only Google Places boundary, PostgreSQL exposure limits, a minimal public health check, and sanitized structured logs.

## ADDED Requirements

### Requirement: Validação fail-fast de configuração
A aplicação SHALL validar todas as variáveis de ambiente durante a inicialização e MUST encerrar o processo antes de aceitar tráfego quando a configuração for inválida ou insegura (por exemplo, um segredo obrigatório ausente em produção ou um valor inseguro).

#### Scenario: Configuração inválida bloqueia o boot
- **WHEN** o backend inicia com configuração inválida ou insegura
- **THEN** o processo é encerrado antes de aceitar tráfego
- **AND** nenhum detalhe interno de configuração é exposto na falha

#### Scenario: Configuração válida inicia o serviço
- **WHEN** o backend inicia com configuração válida
- **THEN** o processo sobe e passa a aceitar tráfego

### Requirement: Segredos nunca versionados
O repositório SHALL ignorar arquivos `.env` e suas variações (`**/.env`, `**/.env.*`) e MUST permitir explicitamente apenas os arquivos de exemplo (`!**/.env.example`). Os arquivos `.env.example` versionados SHALL conter somente nomes e exemplos não secretos.

#### Scenario: Arquivos .env locais permanecem fora do git
- **WHEN** existe um arquivo `.env` ou `.env.local` no repositório
- **THEN** o git não os rastreia

#### Scenario: .env.example é versionado e sem segredos reais
- **WHEN** o `.env.example` é revisado
- **THEN** ele não é ignorado pelo git
- **AND** contém apenas nomes e exemplos não secretos

### Requirement: Chave do Google Places somente no backend
O sistema SHALL manter a chave da Google Places API exclusivamente no backend, carregada do ambiente, e MUST nunca expô-la ao frontend — nem em respostas da API, bundles do frontend, logs ou testes. Todas as chamadas ao Google Places SHALL ser feitas apenas pelo backend.

#### Scenario: Respostas da API sem chave
- **WHEN** a API retorna dados de lugares ao frontend
- **THEN** a resposta não contém nenhum valor de chave da Google Places API

#### Scenario: Frontend não chama o Google diretamente
- **WHEN** o frontend precisa de dados de lugares
- **THEN** ele solicita os dados ao backend
- **AND** a requisição não exige nem contém a chave da Google Places API

### Requirement: PostgreSQL não exposto publicamente
O banco de dados SHALL ser acessível apenas localmente em desenvolvimento e MUST nunca ter porta publicamente publicada em produção. Em desenvolvimento, quando o acesso pelo host for necessário, a porta SHALL ser publicada somente em loopback.

#### Scenario: Desenvolvimento com acesso somente local
- **WHEN** o serviço de desenvolvimento do PostgreSQL é iniciado
- **THEN** a porta é publicada apenas em loopback
- **AND** nenhuma interface externa expõe o banco

#### Scenario: Produção sem porta publicada
- **WHEN** o PostgreSQL é executado em produção
- **THEN** nenhuma porta é publicada publicamente
- **AND** o banco permanece acessível apenas na rede interna

### Requirement: Health check público mínimo
O endpoint público de health SHALL retornar somente o mínimo necessário de status e MUST não revelar detalhes internos.

#### Scenario: Sondagem anônima de health
- **WHEN** um cliente não autenticado chama o endpoint público de health
- **THEN** a resposta contém apenas uma indicação mínima de status
- **AND** nenhum detalhe interno é incluído

### Requirement: Logs estruturados e sanitizados
O backend SHALL emitir logs estruturados que nunca contenham senhas, tokens, cookies, cabeçalhos de autorização, chaves ou dados pessoais desnecessários.

#### Scenario: Erros de autenticação não vazam credenciais
- **WHEN** um erro de autenticação é registrado
- **THEN** a entrada de log não contém senha, token ou valor de cabeçalho de autorização
