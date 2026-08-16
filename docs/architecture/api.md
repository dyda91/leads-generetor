# API — Superfície pública, controles e limites

> **Estado:** implementado (shell seguro de runtime). Recursos de negócio — autenticação, leads, Google Places, banco, frontend, auditoria e deploy — **não estão implementados** nesta fase.

## Superfície pública atual

Endpoint único implementado: `GET /health` (liveness mínimo). Rotas inexistentes retornam o contrato de erro 404.

| Método                | Caminho          | Autenticação atual | Rate limit | Resposta                                   | Finalidade                | Observações de segurança                                                  |
| --------------------- | ---------------- | ------------------ | ---------- | ------------------------------------------ | ------------------------- | ------------------------------------------------------------------------- |
| GET                   | `/health`        | Nenhuma            | Sim        | `200` `{"status":"ok"}`                    | Liveness mínimo           | Público, sem diagnóstico; `Cache-Control: no-store`; request ID no header |
| HEAD                  | `/health`        | Nenhuma            | Sim        | `200` sem corpo                            | Verificação de existência | Tratado automaticamente pelo Express para a rota GET                      |
| OPTIONS               | `/health`        | Nenhuma            | Sim        | `204` (preflight) quando origem autorizada | Preflight CORS            | Conforme allowlist; sem detalhes internos                                 |
| POST/PUT/PATCH/DELETE | `/health`        | —                  | —          | `404` contrato de erro                     | Métodos não suportados    | Rejeitados com 404 (não 405)                                              |
| Qualquer              | rota inexistente | —                  | —          | `404` contrato de erro                     | —                         | `error: NOT_FOUND`                                                        |

Não existem endpoints de autenticação, Google Places, leads, Swagger, métricas, `/info`, `/debug` ou readiness detalhada.

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
| 404    | `NOT_FOUND`              | `The requested resource was not found.`             |
| 405    | `METHOD_NOT_ALLOWED`     | `The HTTP method is not allowed for this resource.` |
| 413    | `PAYLOAD_TOO_LARGE`      | `The request payload is too large.`                 |
| 415    | `UNSUPPORTED_MEDIA_TYPE` | `The request uses an unsupported content encoding.` |
| 429    | `RATE_LIMIT_EXCEEDED`    | `Too many requests`                                 |
| 500    | `INTERNAL_SERVER_ERROR`  | `An unexpected error occurred.`                     |

## Variáveis de ambiente

A aplicação **não carrega** um arquivo `.env` automaticamente; os valores são fornecidos pelo ambiente do processo. Configuração inválida **impede o boot** (fail-fast) e as falhas **não exibem os valores recebidos**. `.env.example` é apenas template; arquivos `.env` reais não são versionados.

| Variável                | Finalidade                                               | Formato / limites                                                         |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `NODE_ENV`              | Ambiente de execução                                     | `development` \| `test` \| `production` (obrigatório)                     |
| `PORT`                  | Porta HTTP (bind em loopback)                            | inteiro 1–65535 (obrigatório; default no template 3000)                   |
| `CORS_ORIGINS`          | Origens permitidas para CORS (vírgula)                   | lista de origens completas http/https; sem wildcard; produção exige https |
| `BODY_LIMIT_BYTES`      | Limite do corpo HTTP                                     | inteiro 1000–1.000.000; default 100.000                                   |
| `RATE_LIMIT_TTL_MS`     | Janela do rate limit                                     | inteiro 1000–3.600.000; default 60.000                                    |
| `RATE_LIMIT_MAX`        | Máximo de requisições por janela                         | inteiro 1–10.000 (produção até 1.000); default 100                        |
| `DATABASE_URL`          | **Reservada** para a mudança futura de banco             | não requerida nesta fase                                                  |
| `GOOGLE_PLACES_API_KEY` | **Reservada** para `places-search`, exclusiva do backend | não requerida nesta fase; nunca no frontend                               |

## Controles HTTP ativos

- Bind atual em `127.0.0.1`.
- `X-Powered-By` removido.
- Helmet ativo; CSP restritiva: `default-src 'none'; frame-ancestors 'none'; base-uri 'none'`.
- HSTS somente em produção (`max-age=31536000; includeSubDomains`).
- CORS com comparação por origem completa e normalizada; `credentials` desabilitado; requisição sem `Origin` é permitida para clientes não navegador. **CORS não é autenticação.**
- Body: JSON (`strict`, `inflate: false`) e URL-encoded (`extended: false`, `parameterLimit: 100`, `inflate: false`), ambos com limite explícito. Corpo comprimido não suportado. Multipart/upload **não existe**.
- Query parser `simple` (sem objetos aninhados).
- `trust proxy` desligado; `X-Forwarded-For` e `X-Real-IP` **não** são confiados.

## Rate limiting

- Armazenamento em memória (`@nestjs/throttler`), válido para **instância única**; **não coordenado entre réplicas**.
- Tracker baseado no IP observado pelo Express (`req.ip`); headers de proxy ignorados.
- Nenhum header interno de contagem é emitido.
- Excesso retorna `429` com o envelope seguro (`RATE_LIMIT_EXCEEDED`), sem IP, tracker, stack ou detalhes de implementação.
- Storage compartilhado (multi-instância) pertence a `production-hardening-and-deployment`.
- Rate limit **não** substitui autenticação.

## Lifecycle

- `SIGTERM` e `SIGINT` iniciam encerramento ordenado; sockets e timers são liberados.
- O NestJS pode **reemitir o sinal** após concluir o shutdown; por isso o término pode apresentar exit code nulo acompanhado do sinal — **isso não é uma falha**.
- Nenhum comportamento específico de orquestrador é prometido nesta fase.

## Health

- Liveness mínimo; body somente `{"status":"ok"}`.
- **Não verifica** PostgreSQL, Google Places ou quaisquer dependências; não é readiness.
- Sujeito ao rate limit global; público e sem diagnóstico; `Cache-Control: no-store`.

## Limitações atuais

| Limitação                                        | Mudança futura responsável            |
| ------------------------------------------------ | ------------------------------------- |
| Sem autenticação e autorização                   | `authentication-and-authorization`    |
| Sem persistência de negócio (Prisma/PostgreSQL)  | mudanças de domínio (leads etc.)      |
| Sem integração Google (runtime)                  | `places-search`                       |
| Sem logs estruturados completos                  | `audit-and-observability`             |
| Sem auditoria                                    | `audit-and-observability`             |
| Rate limiter sem storage compartilhado           | `production-hardening-and-deployment` |
| Sem configuração de proxy/TLS dentro do processo | `production-hardening-and-deployment` |
| Sem deploy/CI                                    | `production-hardening-and-deployment` |
| Sem readiness detalhada                          | futura, se necessária                 |
| Sem frontend                                     | `visual-foundation-and-layout`        |

## Segurança e operação local

Requisitos: Node.js ≥ 22 e pnpm 11.x (Corepack). **Não** são necessários Docker/PostgreSQL para executar a API nesta fase (a API não consulta banco). Não crie `.env` real; exporte as variáveis no shell.

```bash
# Instalar
corepack enable
pnpm install

# Validar (gates)
pnpm check
pnpm check:secrets
pnpm exec openspec validate security-foundation

# Testes da API
pnpm --filter @leads/api test
pnpm --filter @leads/api test --coverage

# Executar a API localmente (valores de exemplo não sensíveis; sem chave Google)
cd apps/api
export NODE_ENV=development
export PORT=3000
export CORS_ORIGINS=http://localhost:5173
pnpm dev

# Consultar o health (outro terminal)
curl -i http://127.0.0.1:3000/health

# Encerrar com sinal (SIGTERM; Ctrl+C envia SIGINT)
kill -TERM <pid>
```

A API escuta em `127.0.0.1` (nunca `0.0.0.0`); nenhum comando usa `sudo`, abre firewall ou desabilita controles para facilitar a execução; nenhum comando solicita `GOOGLE_PLACES_API_KEY` para iniciar.

## Consistência

- Porta da API conforme a implementação (default 3000, loopback).
- PostgreSQL de desenvolvimento permanece `127.0.0.1:5433` → container `5432`.
- Nenhuma documentação afirma que o health consulta banco ou que CORS autentica.
- Nenhuma documentação afirma segurança absoluta.
- Nenhuma referência a máquinas locais, usuários ou outros projetos.
- Nenhum segredo ou chave real.
