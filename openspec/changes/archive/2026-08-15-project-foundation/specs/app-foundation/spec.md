## Purpose

Establishes the persistent behavioral contracts of the system foundation implemented and verifiable in this change: secret hygiene, repository-level Google Places key placement, PostgreSQL exposure limits, reproducible foundation gates, and shared strict TypeScript configurations.

## ADDED Requirements

### Requirement: Segredos nunca versionados
O repositório SHALL ignorar arquivos `.env` e suas variações (`**/.env`, `**/.env.*`) e MUST permitir explicitamente apenas os arquivos de exemplo (`!**/.env.example`). Os arquivos `.env.example` versionados SHALL conter somente nomes e exemplos não secretos.

#### Scenario: Arquivos .env locais permanecem fora do git
- **WHEN** existe um arquivo `.env` ou `.env.local` no repositório
- **THEN** o git não os rastreia

#### Scenario: .env.example é versionado e sem segredos reais
- **WHEN** o `.env.example` é revisado
- **THEN** ele não é ignorado pelo git
- **AND** contém apenas nomes e exemplos não secretos

#### Scenario: Detecção de segredos nos gates
- **WHEN** a detecção de segredos é executada (`check:secrets` ou pre-commit)
- **THEN** um possível segredo faz o comando encerrar com exit code diferente de zero
- **AND** a saída reporta arquivo, localização e regra, sem imprimir o valor

### Requirement: Chave do Google Places restrita ao backend (nível de repositório)
Os templates e configurações do repositório SHALL declarar `GOOGLE_PLACES_API_KEY` exclusivamente no backend e MUST NOT declarar ou incorporar essa variável no frontend.

#### Scenario: Exemplo do backend sem valor real
- **WHEN** o arquivo `apps/api/.env.example` é revisado
- **THEN** ele declara `GOOGLE_PLACES_API_KEY` sem valor real

#### Scenario: Exemplo do frontend sem a variável
- **WHEN** o arquivo `apps/web/.env.example` é revisado
- **THEN** ele não declara `GOOGLE_PLACES_API_KEY`
- **AND** nenhuma variável `VITE_*` representa a chave

#### Scenario: Scanner e gates sem chave versionada
- **WHEN** a detecção de segredos é executada nos arquivos versionados
- **THEN** nenhuma chave do Google Places é encontrada

#### Scenario: Ownership runtime documentado
- **WHEN** a documentação é revisada
- **THEN** registra que a implementação runtime (chamadas e respostas) pertencerá à mudança `places-search`

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

### Requirement: Gates reprodutíveis da fundação
O repositório SHALL prover um gate reprodutível (`pnpm check`) que executa formatação, contratos de workspaces, detecção de segredos, lint, typecheck, testes e build, e MUST falhar quando qualquer etapa falhar.

#### Scenario: Gate completo passa em base saudável
- **WHEN** `pnpm check` é executado em uma base saudável
- **THEN** todas as etapas são executadas
- **AND** o comando encerra com sucesso

#### Scenario: Gate falha em erro real
- **WHEN** alguma etapa falha (lint, typecheck, teste ou segredo)
- **THEN** o gate encerra com exit code diferente de zero

### Requirement: Configurações TypeScript estritas compartilhadas
O repositório SHALL prover configurações TypeScript compartilhadas que habilitam TypeScript estrito — `strict`, `noImplicitAny`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch` e `forceConsistentCasingInFileNames` — e MUST ser consumíveis pelos workspaces.

#### Scenario: Flags estritas ativas
- **WHEN** as configurações compartilhadas são validadas
- **THEN** as sete flags obrigatórias estão ativas na base
- **AND** os perfis web e api herdam da base

#### Scenario: Configuração consumível pelos workspaces
- **WHEN** um workspace estende as configurações compartilhadas
- **THEN** o compilador TypeScript executa sem erro de resolução de configuração
