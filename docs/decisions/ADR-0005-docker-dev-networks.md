# ADR-0005 — Docker de desenvolvimento e redes

- **Status:** Accepted
- **Data:** 2026-08-15

## Contexto

Durante o desenvolvimento, as aplicações (web/api) serão executadas **no host**, e o PostgreSQL em container. O banco precisa ser acessível pelo host sem ser exposto além do loopback.

## Decisão

`infrastructure/docker-compose.dev.yml` executa o PostgreSQL com:

- Imagem oficial **fixada por digest imutável** (nunca `latest`).
- Bind **somente em loopback**: host `127.0.0.1:5433` → container `5432` (`127.0.0.1:5433:5432`).
- Rede dedicada (`bridge`) e volume nomeado para persistência.
- Healthcheck (`pg_isready`, sem expor senha) e `stop_grace_period`.
- Credenciais vindas de `infrastructure/.env` (gitignored) com sintaxe fail-fast; `.env.example` apenas com placeholders.
- O processo do PostgreSQL executa **sem root** (entrypoint oficial).

A porta externa `5433` foi escolhida para evitar conflito com outro serviço local de banco que usa a porta padrão 5432 nesta máquina. **Em produção o PostgreSQL não possui porta publicada.**

## Alternativas consideradas

- **Publicar em `0.0.0.0:5432:5432` (porta padrão):** exporia o banco além do host e conflitaria com o serviço local — rejeitado.
- **Containerizar web/api também:** melhora a paridade, mas degrada a DX de desenvolvimento — rejeitado nesta fase.
- **Porta dinâmica:** dificulta a configuração local determinística — rejeitado.

## Consequências positivas

- Banco acessível somente localmente; nenhuma exposição externa.
- Persistência estável (volume nomeado); estado saudável verificável.
- Configuração local reproduzível e documentada.

## Consequências negativas / trade-offs

- Porta de host não padrão (5433) exige documentação e configuração explícita na `DATABASE_URL` da API.
- Ferramentas que assumem 5432 precisam de ajuste local.

## Impacto de segurança

- O banco permanece fora de interfaces externas em desenvolvimento e sem porta publicada em produção.
- Credenciais nunca ficam no Compose nem no Git; apenas placeholders em `.env.example`.

## Critérios para reavaliar

- Quando o serviço local que ocupa a porta 5432 não existir mais nesta máquina (pode-se voltar à porta padrão, mantendo loopback-only); quando houver necessidade de CI/E2E usando o banco (definir acesso pela rede interna do Compose); quando a infraestrutura de produção for definida (`production-hardening-and-deployment`).
