## 1. Scaffold da API

Comandos: `pnpm --filter @leads/api lint` · `pnpm --filter @leads/api typecheck` · `pnpm check:workspaces`

- [x] 1.1 Criar `apps/api` (package.json `@leads/api`, tsconfig estrito via `@leads/typescript-config/api`, `nest-cli.json`, `eslint.config.mjs` via `@leads/eslint-config/node`, `.env.example` atualizado)
- [x] 1.2 Declarar dependências e scripts reais `dev`, `build`, `lint`, `typecheck`, `test`
- [x] 1.3 Criar `main.ts` e módulo raiz com `enableShutdownHooks()` e desabilitação de `X-Powered-By`

Critério de conclusão: `lint`, `typecheck` e `check:workspaces` sem erros; app inicia com configuração válida.

## 2. Configuração fail-fast

Comandos: `pnpm --filter @leads/api test` (testes unitários de configuração) · `pnpm --filter @leads/api build`

- [x] 2.1 Schema de validação de ambiente com zod (obrigatórios; regras por NODE_ENV; produção rejeita CORS wildcard/debug)
- [x] 2.2 Integração do ConfigModule global com validação no boot; falha encerra o processo sem imprimir valores

Critério de conclusão: testes negativos comprovam bloqueio para variável ausente/inválida/insegura; falha não imprime o valor; config válida inicia.

## 3. Bootstrap HTTP seguro

Comandos: `pnpm --filter @leads/api test` · `pnpm --filter @leads/api lint`

- [ ] 3.1 Aplicar Helmet com política CSP restritiva para API sem HTML (no mínimo `default-src 'none'`, `frame-ancestors 'none'`, `base-uri 'none'`), validada contra a versão real do Helmet e sem desativação global; HSTS somente em produção; remover `X-Powered-By`
- [ ] 3.2 Configurar CORS com allowlist via `CORS_ORIGINS` comparando origem completa e normalizada; wildcard proibido em produção; `credentials` desabilitada; no-Origin documentado
- [ ] 3.3 Definir limites explícitos de corpo JSON e URL-encoded (padrão 100 KB; `BODY_LIMIT` com teto máximo no schema), sem parsers duplicados; limitar quantidade/tamanho de parâmetros quando aplicável; query parser com estratégia simples documentada (`query parser: 'simple'`)

Critério de conclusão: testes de headers (Helmet, CSP com presença/valores esperados, HSTS em produção/ausente em dev/test, ausência de X-Powered-By/versão) e de CORS (origem autorizada/não autorizada, origem completa normalizada, wildcard em produção, no-Origin documentado, credentials desabilitada) verdes; payload acima do limite (JSON e URL-encoded) rejeitado.

## 4. Validação e erros

Comandos: `pnpm --filter @leads/api test`

- [ ] 4.1 Configurar ValidationPipe global (`transform`, `whitelist`, `forbidNonWhitelisted`)
- [ ] 4.2 Criar filtro global de exceções com contrato consistente; `message` vindo de códigos/mensagens controladas (nunca `exception.message` de erros inesperados); `details` apenas com nomes de campos e tipos de violação (nunca valores); 413/429/404/validação no mesmo envelope quando tecnicamente possível; exceções pré-NestJS (parser de body) normalizadas; 404 sem estrutura interna; sem stack trace em produção
- [ ] 4.3 Implementar request ID (sempre gerado no backend com `crypto.randomUUID()`; ignorar `X-Request-Id` do cliente sem reutilizar/ecoar; header `X-Request-Id`; sem dados do usuário)

Critério de conclusão: testes negativos de validação (propriedades desconhecidas, tipos inválidos, limites) e de erros (contrato, 404, genérico controlado, envelope 413/429/404/validação, pré-NestJS, sem stack em produção, request ID) verdes; valores rejeitados ausentes de logs/respostas; entrada externa não controla o ID interno.

## 5. Rate limiting

Comandos: `pnpm --filter @leads/api test`

- [ ] 5.1 Configurar guard global `@nestjs/throttler`; excesso retorna 429; headers sem informações sensíveis
- [ ] 5.2 Manter `trust proxy` desabilitado; documentar que o limiter in-memory serve apenas para instância única; nenhuma heurística de `X-Forwarded-For`; configuração explícita para hospedagem atrás de proxy fica para `production-hardening-and-deployment`

Critério de conclusão: teste negativo de 429 verde; documentação da estratégia de IP real atrás de proxy e da limitação de instância única registrada.

## 6. Health check

Comandos: `pnpm --filter @leads/api test`

- [ ] 6.1 Criar `GET /health` público retornando somente status mínimo; método não permitido rejeitado

Critério de conclusão: testes confirmam acesso anônimo, resposta mínima sem internos e rejeição de método não permitido.

## 7. Testes negativos

Comandos: `pnpm --filter @leads/api test` · `pnpm --filter @leads/api test:cov`

- [ ] 7.1 Suite de testes negativos de segurança (configuração, validação, CORS, erros, rate limiting, headers, health)
- [ ] 7.2 Testes de integração da superfície pública (supertest) com cenários de sucesso e de rejeição

Critério de conclusão: todos os cenários da spec possuem teste correspondente e a suíte roda verde.

## 8. Documentação

Comandos: revisão manual de `docs/architecture` e `docs/security`

- [ ] 8.1 Documentar a superfície pública criada (health, contrato de erros, CORS, request ID sempre gerado no servidor, CSP restritiva, HSTS somente em produção) e os limites desta mudança

Critério de conclusão: documentação consistente com a spec e sem afirmar controles futuros como ativos.

## 9. Validação e revisão de segurança

Comandos: `pnpm check` · `pnpm check:secrets` · `pnpm audit` · `pnpm exec openspec validate security-foundation`

- [ ] 9.1 Rodar gates completos (lint, typecheck, test, build, format, segredos) sem erros
- [ ] 9.2 Revisão de segurança: headers comprovados, sem stack em produção, sem segredos versionados, portas/rotas documentadas

Critério de conclusão: todos os comandos com exit code 0 e checklist de segurança revisado.
