## 1. Prisma e persistência mínima

Comandos: `pnpm --filter @leads/api typecheck` · `pnpm --filter @leads/api build` · `pnpm --filter @leads/api test`

- [x] 1.1 Consultar docs oficiais e fixar versões exatas de `prisma`/`@prisma/client` (Node 24/PostgreSQL 17); configurar `PrismaModule` global e fechar o client no shutdown
- [x] 1.2 Definir schema em `apps/api/prisma/schema.prisma`: `User` (id cuid, email único, passwordHash, role, status, passwordChangedAt, createdAt, updatedAt) e `Session` (id cuid, userId, tokenHash único, csrfTokenHash único, expiresAt, lastUsedAt, revokedAt, createdAt); enums mínimos ADMIN e ACTIVE/INACTIVE
- [x] 1.3 Gerar migration versionada não destrutiva; aplicar em desenvolvimento; Prisma Studio não exposto; PostgreSQL permanece loopback
- [x] 1.4 Adicionar serviço `postgres-test` no Docker Compose (porta loopback exclusiva 127.0.0.1:5434, banco/usuário próprios, `tmpfs`); definir comandos de subir/aplicar migration/testar/limpar/derrubar somente o serviço de teste
- [x] 1.5 Guard de banco de teste: testes recusam rodar se `DATABASE_URL_TEST` não corresponder ao banco de teste esperado; nenhum comando usa `prisma migrate reset` contra o banco de desenvolvimento

Critério de conclusão: `typecheck`/`build` sem erros; migration aplicada; unicidade de e-mail/tokenHash/csrfTokenHash comprovada; comandos de teste documentados e funcionais; sem SQLite.

## 2. Configuração de autenticação

Comandos: `pnpm --filter @leads/api test` · `pnpm --filter @leads/api lint`

- [x] 2.1 Tornar `DATABASE_URL` obrigatória (ausente/inválida bloqueia boot sem imprimir o valor); decidir e registrar: boot exige banco acessível; indisponibilidade em runtime → auth retorna 500 genérico e health permanece up
- [x] 2.2 Adicionar variáveis tipadas (parâmetros Argon2id, expiração absoluta, inatividade, intervalo de `lastUsedAt`, rate limit de auth, política de cookie) com faixas seguras e produção estrita
- [x] 2.3 Rejeitar configuração de cookie não `Secure` em produção; nunca emitir os dois cookies simultaneamente; ignorar cookie de nome de outro ambiente
- [x] 2.4 Criar módulo de autenticação com DTOs estritos (login, change-password) usando decorators explícitos e rejeição de propriedades desconhecidas
- [x] 2.5 Definir constantes centralizadas de segurança (nomes de cookie por ambiente, headers, prefixos de hash) sem expor valores sensíveis

Critério de conclusão: env de auth validada no boot (valores inválidos/fora dos limites bloqueiam sem imprimir valores); DTOs rejeitam propriedades desconhecidas; política de cookie por ambiente testada.

## 3. Senhas e bootstrap admin

Comandos: `pnpm --filter @leads/api test` (unit de hashing/política) · execução manual segura

- [ ] 3.1 Implementar hashing Argon2id com parâmetros configuráveis (memória/tempo/paralelismo) e verificação com comparação segura
- [ ] 3.2 Implementar política de senha por comprimento (mínimo/máximo) com rejeição antes do hash; rehash transparente quando parâmetros mudam
- [ ] 3.3 Criar comando interativo `bootstrap-admin` exigindo TTY: leitura sem eco, confirmação, senha não aceita via argumento CLI nem variável de ambiente comum, falha segura em ambiente não interativo, Ctrl+C limpa buffers e fecha conexão
- [ ] 3.4 Bootstrap em transação com unicidade; falha (409) se admin já existir sem alterar dados; nunca imprime senha, hash ou e-mail; sem credencial padrão

Critério de conclusão: testes negativos (hash Argon2id, verificação, limites, rehash) verdes; bootstrap interativo recusa admin existente e não expõe credenciais; comando separado de troca/recuperação administrativa fica como opção futura não implementada.

## 4. Sessões opacas e política de sessão única

Comandos: `pnpm --filter @leads/api test`

- [ ] 4.1 Gerar token de sessão com `crypto.randomBytes(32)`; hash com prefixo/contexto distinto (`sess_v1:`); lookup por hash único; token nunca em texto
- [ ] 4.2 Gerar token CSRF com CSPRNG; hash com contexto distinto (`csrf_v1:`); comparação em tempo constante; nunca derivado do token de sessão
- [ ] 4.3 Implementar política de sessão única: login revoga atomicamente as sessões anteriores e cria nova (transação); logout revoga a atual; troca de senha revoga todas e decide explicitamente sobre a sessão atual
- [ ] 4.4 Implementar expiração absoluta (nunca prolongada) e por inatividade, verificadas a cada autenticação; atualizar `lastUsedAt` atomicamente somente após o intervalo controlado; sessão anterior a `passwordChangedAt` inválida; relógio injetável; datas UTC
- [ ] 4.5 Rotina não destrutiva de limpeza de sessões expiradas/revogadas
- [ ] 4.6 Criar índice único parcial na migration SQL (`CREATE UNIQUE INDEX ... ON "Session" ("userId") WHERE "revokedAt" IS NULL`); documentar que o Prisma Schema não representa índices parciais e preservar o SQL customizado na migration
- [ ] 4.7 Implementar fluxo transacional de sessão única sob concorrência: revogar todas as sessões não revogadas (incluindo expiradas ainda não revogadas) e criar a nova na mesma transação; tratar conflito de unicidade com retry limitado (máx. 1) ou erro genérico, nunca expondo erro Prisma/nome do índice

Critério de conclusão: testes de sessão (válida, ausente, malformada, hash não encontrado, expirada, revogada, inatividade, fixação, rotação, concorrência, fronteiras de expiração) verdes; token nunca em logs/JSON/query; escrita de `lastUsedAt` limitada pelo intervalo.

## 5. Login, logout e sessão atual

Comandos: `pnpm --filter @leads/api test`

- [ ] 5.1 Implementar `POST /auth/login` com DTO estrito, e-mail normalizado, resposta uniforme (inexistente/inativo/senha incorreta), cookie somente após autenticação completa e validação estrita de `Origin`/`Referer`
- [ ] 5.2 Login retorna o token CSRF no corpo; resposta sem `passwordHash` nem token de sessão; sessão única com revogação atômica das anteriores
- [ ] 5.3 Implementar `POST /auth/logout` revogando a sessão e limpando o cookie do ambiente atual; exige sessão + origem + CSRF
- [ ] 5.4 Implementar `GET /auth/me` retornando o usuário e o token CSRF (recuperação após reload) com `Cache-Control: no-store`
- [ ] 5.5 Aplicar rate limit mais rígido que o global em login/change-password (nome próprio) sem expor contagens internas

Critério de conclusão: testes de login válido/inválido, anti-enumeração, cookie só após sucesso, origem, rate limit 429, me/logout com e sem sessão, verdes; token CSRF no body do login/me; no-store presente.

## 6. Guard e autorização

Comandos: `pnpm --filter @leads/api test`

- [ ] 6.1 Implementar `AuthGuard` (cookie → hash → sessão válida → usuário ACTIVE) com `CurrentUser` tipado e deny by default
- [ ] 6.2 Proteger rotas privadas explicitamente; 401 sem sessão; 403 sem permissão; role ADMIN; ignorar role/userId do cliente
- [ ] 6.3 Registrar ownership no contexto para recursos futuros (fonte confiável = usuário autenticado)
- [ ] 6.4 Garantir que `GET /health` permaneça público e que rotas inexistentes sigam o contrato 404 existente

Critério de conclusão: testes de 401/403, usuário inativo, identidade não confiada ao cliente e health público verdes.

## 7. CSRF e CORS com credenciais

Comandos: `pnpm --filter @leads/api test` · `pnpm --filter @leads/api lint`

- [ ] 7.1 Implementar fluxo completo do synchronizer token CSRF: entrega no body de login/me, envio via `X-CSRF-Token` nas mutações, rotação no login/rotação/troca de senha
- [ ] 7.2 Tratar comportamentos de CSRF: ausente, inválido, de outra sessão, antigo após rotação, concorrência durante rotação, sessão expirada/revogada; token nunca em URL/query/logs/erros
- [ ] 7.3 Validar `Origin`/`Referer` no login (CSRF de login); logout e change-password exigem sessão + origem + CSRF
- [ ] 7.4 Revisar CORS: `credentials: true` e header `X-CSRF-Token` somente para origens exatas autorizadas; wildcard permanece proibido; sem-Origin documentado; cookie por ambiente (nunca os dois); não enfraquecer CSP/Helmet/rate limit
- [ ] 7.5 Respostas de login/me com `Cache-Control: no-store`; documentar que SameSite não é a única defesa e que produção exige HTTPS

Critério de conclusão: testes de CSRF (sem token → 403, com token → ok, outra sessão, antigo, concorrência) e de CORS credentials/X-CSRF-Token (origem exata autorizada; wildcard impossível) verdes.

## 8. Troca de senha e revogação

Comandos: `pnpm --filter @leads/api test`

- [ ] 8.1 Implementar `POST /auth/change-password` (sessão válida, senha atual correta, nova senha validada, CSRF, origem)
- [ ] 8.2 Atualizar `passwordChangedAt`; revogar todas as sessões; manter e rotacionar a sessão atual (novo token de sessão e novo CSRF) conforme decisão explícita; sessões anteriores à troca invalidadas
- [ ] 8.3 Rate limit específico; resposta genérica; sem senha em logs ou respostas

Critério de conclusão: testes de troca (correta, atual incorreta, nova inválida, todas revogadas, sessão anterior inválida, sessão atual rotacionada, CSRF/origem, resposta genérica) verdes.

## 9. Testes negativos e integração

Comandos: `pnpm --filter @leads/api test` · `pnpm --filter @leads/api test --coverage`

- [ ] 9.1 Suite de testes de segurança (bootstrap, política/hash, login/enumeração, cookies por ambiente, CSRF, sessão única, expiração, revogação, logout, guard, autorização, rate limit, CORS credentials, erros seguros)
- [ ] 9.2 Testes de integração da superfície de autenticação (supertest/HTTP real em porta efêmera) com sucesso e rejeição
- [ ] 9.3 Testes de indisponibilidade do banco (500 genérico, health up) e de concorrência (sessões paralelas, fronteiras exatas de expiração, rotação de CSRF)
- [ ] 9.4 Testes da garantia de sessão única sob concorrência: dois logins simultâneos, no máximo uma sessão não revogada, apenas um cookie final válido, conflito sem detalhes internos, troca de senha concorrente com outra requisição, sessão expirada revogada antes da criação
- [ ] 9.5 Garantir que nenhuma resposta expõe credenciais (senha, hash, token, cookie) e que `GET /health` continua público

Critério de conclusão: suíte verde no banco de teste isolado; cobertura reportada; nenhum cenário da spec sem teste correspondente.

## 10. Documentação

Comandos: revisão manual de `docs/architecture/api.md`, `docs/security/README.md` e `README.md`

- [ ] 10.1 Documentar superfície de autenticação (endpoints, cookies por ambiente, CSRF, CORS credentials, sessão única, bootstrap admin) e limites (sem cadastro público, sem OAuth/MFA, multi-sessão fora do escopo)
- [ ] 10.2 Atualizar `.env.example` (DATABASE_URL obrigatória, variáveis de auth) sem segredos; documentar pré-requisito e comandos do banco de teste
- [ ] 10.3 Registrar decisão de sessão opaca (e rejeição de JWT), política de sessão única, cookie por ambiente e parâmetros Argon2id

Critério de conclusão: documentação consistente com spec/design e sem afirmar controles futuros como ativos.

## 11. Validação e revisão de segurança

Comandos: `pnpm check` · `pnpm check:secrets` · `pnpm audit` · `pnpm exec openspec validate authentication-and-authorization`

- [ ] 11.1 Rodar gates completos (format, workspaces, segredos, lint, typecheck, test, build) sem erros
- [ ] 11.2 Revisão de segurança: sem hash/token/stack/erro Prisma em respostas, sem segredos versionados, rotas e portas documentadas, CORS credentials seguro, cookie por ambiente correto

Critério de conclusão: todos os comandos com exit 0; checklist de segurança revisado; nenhuma credencial real em código, testes, fixtures ou logs.
