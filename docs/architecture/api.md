# API — Superfície pública, controles e limites

> **Estado:** implementado (shell seguro + autenticação do administrador único + frontend React consumindo o contrato). Leads, Google Places (runtime), auditoria e deploy **não estão implementados** nesta fase.

## Superfície pública atual

Endpoints implementados: `GET /health` (liveness) e a superfície de autenticação (`/auth/*`). Rotas inexistentes retornam o contrato de erro 404.

| Método                | Caminho                 | Autenticação   | CSRF                            | Rate limit         | Resposta                                   | Finalidade             | Observações de segurança                                                                                                                                                                                                                   |
| --------------------- | ----------------------- | -------------- | ------------------------------- | ------------------ | ------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET                   | `/health`               | Nenhuma        | —                               | Global             | `200` `{"status":"ok"}`                    | Liveness mínimo        | Público, sem diagnóstico; `Cache-Control: no-store`; request ID no header                                                                                                                                                                  |
| POST                  | `/auth/login`           | Nenhuma        | `Origin` exata (login CSRF)     | Reforçado (10/min) | `200` `{ user, csrfToken }`                | Autenticar             | Cookie somente após sucesso; resposta uniforme para e-mail inexistente/inativo/senha incorreta (401); exatamente uma verificação Argon2 por tentativa (dummy para inexistente/inativo); `Cache-Control: no-store`; sem hash/token no corpo |
| POST                  | `/auth/logout`          | Cookie (guard) | `Origin` exata + `X-CSRF-Token` | Global             | `204`                                      | Encerrar sessão        | Revoga a sessão e limpa o cookie do ambiente; sem sessão → 401; `Origin`/CSRF inválidos → 403                                                                                                                                              |
| GET                   | `/auth/me`              | Cookie (guard) | —                               | Global             | `200` `{ user, csrfToken }`                | Sessão atual           | Rotaciona o token CSRF (compare-and-set); concorrência → exatamente uma 200 com token e uma 409 sem token; `Cache-Control: no-store`; 401 sem sessão válida                                                                                |
| POST                  | `/auth/change-password` | Cookie (guard) | `Origin` exata + `X-CSRF-Token` | Reforçado (10/min) | `200` `{ user, csrfToken }`                | Trocar senha           | Senha atual correta + nova senha na política; atualiza `passwordChangedAt`, revoga todas as sessões e mantém/rotaciona a atual; 400/401/403/409 conforme o caso                                                                            |
| OPTIONS               | `/auth/*`, `/health`    | Nenhuma        | —                               | —                  | `204` (preflight) quando origem autorizada | Preflight CORS         | Conforme allowlist exata; `Access-Control-Allow-Credentials: true` e header `X-CSRF-Token` somente para origens autorizadas                                                                                                                |
| POST/PUT/PATCH/DELETE | `/health`               | —              | —                               | —                  | `404` contrato de erro                     | Métodos não suportados | Rejeitados com 404 (não 405)                                                                                                                                                                                                               |
| Qualquer              | rota inexistente        | —              | —                               | —                  | `404` contrato de erro                     | —                      | `error: NOT_FOUND`                                                                                                                                                                                                                         |

Não existem endpoints de cadastro público, Google Places, leads, Swagger, métricas, `/info`, `/debug` ou readiness detalhada.

## Contrato de erros

Todas as respostas de erro seguem o envelope:

```json
{
  "requestId": "UUID gerado pelo servidor",
  "statusCode": 400,
  "error": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [{ "field": "campo", "type": "invalid_type" }]
}
```

- `details` é **opcional** (presente somente em erros de validação).
- Valores recebidos **nunca** são retornados; `details` contém apenas nome do campo e tipo controlado.
- Stack e `exception.message` **nunca** são retornadas.
- Um `X-Request-Id` enviado pelo cliente é **ignorado**; o header retornado é sempre gerado pelo backend (`crypto.randomUUID()`), idêntico ao `requestId` do envelope.
- `Content-Type: application/json` em todas as respostas de erro.

### Códigos implementados

| status | error                    | message (catálogo real)                             |
| ------ | ------------------------ | --------------------------------------------------- |
| 400    | `VALIDATION_ERROR`       | `Request validation failed`                         |
| 400    | `MALFORMED_JSON`         | `The request body is not valid JSON.`               |
| 400    | `BAD_REQUEST`            | `The request is invalid.`                           |
| 401    | `UNAUTHORIZED`           | `Authentication is required.`                       |
| 403    | `FORBIDDEN`              | `The request is not allowed.`                       |
| 404    | `NOT_FOUND`              | `The requested resource was not found.`             |
| 405    | `METHOD_NOT_ALLOWED`     | `The HTTP method is not allowed for this resource.` |
| 409    | `CONFLICT`               | `The request conflicts with the current state.`     |
| 413    | `PAYLOAD_TOO_LARGE`      | `The request payload is too large.`                 |
| 415    | `UNSUPPORTED_MEDIA_TYPE` | `The request uses an unsupported content encoding.` |
| 429    | `RATE_LIMIT_EXCEEDED`    | `Too many requests`                                 |
| 500    | `INTERNAL_SERVER_ERROR`  | `An unexpected error occurred.`                     |

Nenhuma resposta de autenticação retorna senha, hash, token de sessão, cookie ou indício da existência do usuário; o login usa uma resposta uniforme para e-mail inexistente, usuário inativo e senha incorreta (anti-enumeração). Indisponibilidade do banco em runtime retorna `500` genérico e `GET /health` permanece disponível.

## Variáveis de ambiente

A aplicação **não carrega** um arquivo `.env` automaticamente; os valores são fornecidos pelo ambiente do processo. Configuração inválida **impede o boot** (fail-fast) e as falhas **não exibem os valores recebidos**. `.env.example` é apenas template; arquivos `.env` reais não são versionados.

| Variável                    | Finalidade                                               | Formato / limites                                                          |
| --------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `NODE_ENV`                  | Ambiente de execução                                     | `development` \| `test` \| `production` (obrigatório)                      |
| `PORT`                      | Porta HTTP (bind em loopback)                            | inteiro 1–65535 (obrigatório; default no template 3000)                    |
| `CORS_ORIGINS`              | Origens permitidas para CORS (vírgula)                   | lista de origens completas http/https; sem wildcard; produção exige https  |
| `BODY_LIMIT_BYTES`          | Limite do corpo HTTP                                     | inteiro 1000–1.000.000; default 100.000                                    |
| `RATE_LIMIT_TTL_MS`         | Janela do rate limit                                     | inteiro 1000–3.600.000; default 60.000                                     |
| `RATE_LIMIT_MAX`            | Máximo de requisições por janela                         | inteiro 1–10.000 (produção até 1.000); default 100                         |
| `SESSION_ABSOLUTE_TTL_MS`   | Expiração absoluta da sessão                             | inteiro 3.600.000–2.592.000.000; default 604.800.000 (7 dias)              |
| `SESSION_IDLE_TTL_MS`       | Expiração por inatividade                                | inteiro 300.000–86.400.000; default 1.800.000 (30 min); < absoluta         |
| `SESSION_TOUCH_INTERVAL_MS` | Intervalo mínimo de `lastUsedAt`                         | inteiro 60.000–3.600.000; default 300.000 (5 min); < inatividade           |
| `ARGON2_MEMORY_COST`        | Memória Argon2id (KiB)                                   | inteiro 19.456–262.144; default 19.456                                     |
| `ARGON2_TIME_COST`          | Iterações Argon2id                                       | inteiro 2–5; default 2                                                     |
| `ARGON2_PARALLELISM`        | Paralelismo Argon2id                                     | inteiro 1–4; default 1                                                     |
| `ARGON2_HASH_LENGTH`        | Comprimento do hash Argon2id (bytes)                     | inteiro 16–64; default 32                                                  |
| `DATABASE_URL`              | Conexão PostgreSQL (obrigatória em todos os ambientes)   | URL `postgresql://`; ausente/inválida bloqueia o boot sem imprimir o valor |
| `DATABASE_URL_TEST`         | PostgreSQL isolado de testes (nunca usado pelo runtime)  | guard valida porta 5434, banco/usuário `leads_test`, host loopback         |
| `GOOGLE_PLACES_API_KEY`     | **Reservada** para `places-search`, exclusiva do backend | não requerida nesta fase; nunca no frontend                                |

## Controles HTTP ativos

- Bind atual em `127.0.0.1`.
- `X-Powered-By` removido.
- Helmet ativo; CSP restritiva: `default-src 'none'; frame-ancestors 'none'; base-uri 'none'`.
- HSTS somente em produção (`max-age=31536000; includeSubDomains`).
- CORS com comparação por origem completa e normalizada, `credentials: true` e headers `Content-Type`/`X-CSRF-Token` permitidos **somente** para origens exatas autorizadas; wildcard jamais combinado com credenciais; endpoints de leitura (`/health`, `/auth/me`) funcionam sem `Origin`, mas as mutações de autenticação **exigem** `Origin` exata (403 quando ausente). **CORS não é autenticação.**
- Body: JSON (`strict`, `inflate: false`) e URL-encoded (`extended: false`, `parameterLimit: 100`, `inflate: false`), ambos com limite explícito. Corpo comprimido não suportado. Multipart/upload **não existe**.
- Query parser `simple` (sem objetos aninhados).
- `trust proxy` desligado; `X-Forwarded-For` e `X-Real-IP` **não** são confiados.

## Rate limiting

- Armazenamento em memória (`@nestjs/throttler`), válido para **instância única**; **não coordenado entre réplicas**.
- Tracker baseado no IP observado pelo Express (`req.ip`); headers de proxy ignorados.
- Nenhum header interno de contagem é emitido.
- Excesso retorna `429` com o envelope seguro (`RATE_LIMIT_EXCEEDED`), sem IP, tracker, stack ou detalhes de implementação.
- Storage compartilhado (multi-instância) pertence a `production-hardening-and-deployment`.
- **Reforço de autenticação:** `POST /auth/login` e `POST /auth/change-password` usam um limite mais rígido que o global (10 requisições por janela de 60 s), independentemente do limite global.
- Rate limit **não** substitui autenticação.

## Autenticação (sessão opaca única)

- **Sessão opaca por cookie:** o cliente guarda um token aleatório CSPRNG (32 bytes, hex) somente no cookie `HttpOnly` `SameSite=Strict`; o banco armazena apenas hashes com contexto (`sess_v1:`/`csrf_v1:`). **JWT foi rejeitado** (ver ADR-0006).
- **Cookie por ambiente:** produção usa `__Host-leads_session` (`Secure`); desenvolvimento/teste usam `leads_session`. Apenas o cookie do ambiente atual é emitido; cookies de outro ambiente são ignorados.
- **Sessão única:** um login revoga atomicamente as sessões anteriores e cria uma nova (transação); logout revoga a atual; troca de senha revoga todas e mantém/rotaciona a atual. Um índice único parcial (`user_id` + `revokedAt IS NULL`) impõe a unicidade sob concorrência, com retry limitado (1) e erro 409 controlado.
- **Expiração:** absoluta (nunca prolongada) e por inatividade, verificadas a cada requisição; `lastUsedAt` atualizado somente após o intervalo configurado; sessão anterior a `passwordChangedAt` é inválida. Timestamps em UTC, relógio centralizado.
- **CSRF synchronizer token:** token entregue no corpo de `login`/`me`, enviado no header `X-CSRF-Token` nas mutações; rotacionado no login, na rotação de sessão e na troca de senha; ausente/inválido/de outra sessão/antigo → 403. `SameSite` não é a única defesa.
- **Origem obrigatória nas mutações:** `login`, `logout` e `change-password` exigem uma `Origin` exata autorizada (ausente, `null`, malformada, semelhante ou fora da allowlist → 403); um `Referer` presente deve concordar e nunca substitui uma `Origin` ausente. `GET /auth/me` e `GET /health` continuam funcionando sem `Origin`.
- **Rotação determinística do CSRF em `/me`:** como o banco guarda apenas o hash, `/me` rotaciona com compare-and-set sobre o hash observado na validação da sessão; sob chamadas concorrentes, exatamente uma retorna 200 com token e a perdedora retorna 409 (`CONFLICT`) sem token; o token antigo permanece inválido após a rotação.
- **Anti-enumeração temporal:** cada tentativa de login sintaticamente válida executa exatamente uma verificação Argon2id; e-mails inexistentes e usuários inativos verificam contra um hash dummy em memória (parâmetros atuais, entrada CSPRNG, por instância, nunca armazenado/logado), uniformizando a duração. Um hash armazenado malformado cai no fallback dummy e retorna o 401 uniforme sem expor a causa.
- **Bootstrap admin:** primeiro administrador criado via `pnpm --filter @leads/api bootstrap-admin` (interativo, TTY, sem credencial padrão); recusa segundo admin (409).
- **Limites:** sem cadastro público, sem e-mail/recuperação de senha, sem OAuth/MFA, sem multi-sessão, sem gerenciamento de usuários.

## Lifecycle

- No boot, a API valida a configuração e **conecta ao PostgreSQL** (`DATABASE_URL` obrigatória); banco inacessível impede o início.
- `SIGTERM` e `SIGINT` iniciam encerramento ordenado; sockets e timers são liberados; o cliente Prisma é desconectado.
- O NestJS pode **reemitir o sinal** após concluir o shutdown; por isso o término pode apresentar exit code nulo acompanhado do sinal — **isso não é uma falha**.
- Em runtime, uma indisponibilidade transitória do banco **não derruba o processo**: operações autenticadas retornam `500` genérico enquanto `GET /health` (que nunca consulta o banco) permanece responsivo.

## Health

- Liveness mínimo; body somente `{"status":"ok"}`.
- **Não verifica** PostgreSQL, Google Places ou quaisquer dependências; não é readiness.
- Sujeito ao rate limit global; público e sem diagnóstico; `Cache-Control: no-store`.

## Limitações atuais

| Limitação                                        | Mudança futura responsável            |
| ------------------------------------------------ | ------------------------------------- |
| Sem multi-sessão, OAuth, MFA ou cadastro público | decidido (fora do escopo do MVP)      |
| Sem gestão administrativa de usuários            | decidido (fora do escopo do MVP)      |
| Sem troca/recuperação administrativa de senha    | opção futura (não implementada)       |
| Sem persistência de negócio (leads)              | mudanças de domínio (leads etc.)      |
| Sem integração Google (runtime)                  | `places-search`                       |
| Sem logs estruturados completos                  | `audit-and-observability`             |
| Sem auditoria                                    | `audit-and-observability`             |
| Rate limiter sem storage compartilhado           | `production-hardening-and-deployment` |
| Sem configuração de proxy/TLS dentro do processo | `production-hardening-and-deployment` |
| Sem deploy/CI                                    | `production-hardening-and-deployment` |
| Sem readiness detalhada                          | futura, se necessária                 |

## Segurança e operação local

Requisitos: Node.js ≥ 22 e pnpm 11.x (Corepack); Docker para os PostgreSQL de desenvolvimento (`postgres` em `127.0.0.1:5433`) e de testes (`postgres-test` em `127.0.0.1:5434`). `DATABASE_URL` é obrigatória em todos os ambientes. Não crie `.env` real; exporte as variáveis no shell ou injete-as.

```bash
# Instalar
corepack enable
pnpm install

# Validar (gates)
pnpm check
pnpm check:secrets
pnpm exec openspec validate security-foundation authentication-and-authorization

# Subir o PostgreSQL de desenvolvimento (infrastructure/.env via infrastructure/.env.example)
docker compose -f infrastructure/docker-compose.dev.yml up -d postgres

# Aplicar migrations no banco de desenvolvimento
DATABASE_URL=postgresql://…@127.0.0.1:5433/leads_dev \
  pnpm --filter @leads/api exec prisma migrate deploy

# Criar o primeiro administrador (interativo, TTY; não aceita senha via argumento)
DATABASE_URL=postgresql://…@127.0.0.1:5433/leads_dev \
  pnpm --filter @leads/api bootstrap-admin

# Testes da API no banco de teste isolado (postgres-test, porta 5434)
docker compose -f infrastructure/docker-compose.dev.yml up -d postgres-test
DATABASE_URL_TEST=postgresql://…@127.0.0.1:5434/leads_test \
  pnpm --filter @leads/api exec prisma migrate deploy
DATABASE_URL_TEST=postgresql://…@127.0.0.1:5434/leads_test \
  pnpm --filter @leads/api test
DATABASE_URL_TEST=postgresql://…@127.0.0.1:5434/leads_test \
  pnpm --filter @leads/api test --coverage
# Parar somente o serviço de teste
docker compose -f infrastructure/docker-compose.dev.yml down postgres-test

# Executar a API localmente (valores de exemplo não sensíveis; sem chave Google)
cd apps/api
export NODE_ENV=development
export PORT=3000
export CORS_ORIGINS=http://localhost:5173
export DATABASE_URL=postgresql://…@127.0.0.1:5433/leads_dev
pnpm dev
```

A API escuta em `127.0.0.1` (nunca `0.0.0.0`); nenhum comando usa `sudo`, abre firewall ou desabilita controles para facilitar a execução; nenhum comando solicita `GOOGLE_PLACES_API_KEY` para iniciar. Os testes recusam rodar se `DATABASE_URL_TEST` não corresponder ao banco de teste esperado (porta 5434, `leads_test`); `prisma migrate reset` nunca é executado contra o banco de desenvolvimento.

## Consistência

- Porta da API conforme a implementação (default 3000, loopback).
- PostgreSQL de desenvolvimento permanece `127.0.0.1:5433` → container `5432`; PostgreSQL de testes `127.0.0.1:5434` → container `5432` (tmpfs).
- Nenhuma documentação afirma que o health consulta banco ou que CORS autentica.
- Nenhuma documentação afirma segurança absoluta.
- Nenhuma referência a máquinas locais, usuários ou outros projetos.
- Nenhum segredo ou chave real.
