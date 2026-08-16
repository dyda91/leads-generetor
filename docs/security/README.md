# Segurança — Leads Generator

> **Aviso:** esta documentação descreve intenções e controles, não garante ausência de vulnerabilidades. Controles marcados como "planejado" **ainda não estão ativos** — não devem ser tratados como implementados.

## Modelo de ameaças inicial

Ameaças consideradas nesta fase:

- Enumeração de contas e brute force de login.
- Roubo de sessão e token (access/refresh).
- Acesso não autorizado a recursos de terceiros (IDOR) em leads e listas.
- Exfiltração da chave do Google Places.
- Injeção SQL; XSS no frontend; CSRF (uso de cookies); SSRF (URLs externas).
- Abuso de API (paginação, rate limiting) e mass assignment.
- Vazamento de segredos via repositório, logs ou respostas.
- Comprometimento de dependências (supply chain).

## Ativos protegidos

- Credenciais e sessões de usuários; tokens de autenticação.
- Chave da Google Places (somente backend).
- Dados de leads e listas de prospecção (dados pessoais).
- Configuração e dados persistidos no PostgreSQL.
- Segredos de configuração (variáveis de ambiente).

## Atores e superfícies de ataque

- **Usuário anônimo:** endpoints públicos (health) e, futuramente, registro/login.
- **Usuário autenticado:** endpoints privados sobre seus próprios recursos.
- **Atacante externo (internet):** API pública e aplicação web.
- **Ferramentas e CI:** acesso a repositório e segredos.

## Fronteiras de confiança

- Navegador → API: não confiar em `role`, `userId`, `ownerId` ou permissões enviados pelo frontend.
- API → Google Places: chamadas controladas (timeout, seleção de campos, tratamento de quotas).
- API → PostgreSQL: consultas parametrizadas; rede interna.

## Princípios

- **Menor privilégio:** cada processo/usuário tem apenas o acesso necessário.
- **Defesa em profundidade:** múltiplas camadas independentes.
- **Segurança não depende de ocultação:** rotas, bundle e chamadas públicas são inspecionáveis; a proteção fica no backend e na infraestrutura.
- **Validação de entrada:** todo input é validado e transformado no backend; propriedades não reconhecidas são rejeitadas; limites para strings, arrays, paginação, corpo HTTP e arquivos.

## Controles por ameaça e mapa de mudanças

| Controle                                                                                                                      | Status       | Mudança prevista                              |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------- |
| Segredos nunca versionados; `.env.example` com placeholders                                                                   | Implementado | `project-foundation` (secretlint, pre-commit) |
| PostgreSQL não exposto publicamente; loopback                                                                                 | Implementado | `project-foundation` (compose dev)            |
| Google Places — chave ausente do frontend (nível de repositório)                                                              | Implementado | `project-foundation`                          |
| Google Places — chamadas/respostas runtime backend-only                                                                       | Planejado    | `places-search`                               |
| Validação fail-fast de configuração (runtime)                                                                                 | Implementado | `security-foundation`                         |
| Health check público mínimo (runtime)                                                                                         | Implementado | `security-foundation`                         |
| Logs estruturados e sanitizados (runtime)                                                                                     | Planejado    | `audit-and-observability`                     |
| Autenticação e autorização (Argon2id, sessão opaca única, cookies, CSRF, bloqueio de brute force, revogação, anti-enumeração) | Implementado | `authentication-and-authorization`            |
| Rate limiting global (runtime)                                                                                                | Implementado | `security-foundation`                         |
| Rate limiting reforçado (login, troca de senha)                                                                               | Implementado | `authentication-and-authorization`            |
| Validação de entrada e rejeição de propriedades desconhecidas                                                                 | Implementado | `security-foundation`                         |
| Erros centralizados sem detalhes internos                                                                                     | Implementado | `security-foundation`                         |
| Proteção contra IDOR (propriedade/permissão em todo recurso)                                                                  | Planejado    | `lead-management`, `lead-lists-and-pipeline`  |
| CSP restritiva da API (API sem HTML)                                                                                          | Implementado | `security-foundation`                         |
| Proteção contra XSS (frontend)                                                                                                | Planejado    | `visual-foundation-and-layout`                |
| Proteção contra SSRF e chamadas externas seguras (timeout, redirecionamentos, validação de URL)                               | Planejado    | `places-search`                               |
| SQL injection (consultas parametrizadas)                                                                                      | Planejado    | API/domínio (quando o banco existir)          |
| Abuso de API — paginação e limites por recurso                                                                                | Planejado    | API/domínio                                   |
| Auditoria de ações sensíveis                                                                                                  | Planejado    | `audit-and-observability`                     |
| Hardening de produção (containers não-root, imagens fixadas, .env validado)                                                   | Planejado    | `production-hardening-and-deployment`         |

A superfície pública da API, o contrato de erros e os controles ativos estão detalhados em [`docs/architecture/api.md`](../architecture/api.md).

## Health check

- **Finalidade:** liveness exclusiva — o endpoint `GET /health` responde apenas `{"status":"ok"}` (HTTP 200, `Content-Type: application/json`, `Cache-Control: no-store`).
- **Não mede** banco, dependências, memória, hostname, versões ou qualquer dependência externa. Não afirma que PostgreSQL ou Google Places estão saudáveis.
- **Público não é diagnóstico:** não expõe readiness detalhado, métricas, `/info`, `/debug` ou aliases. Readiness detalhada, se necessária, pertence a uma mudança futura.
- **Controles globais:** o health está sujeito ao rate limit global (429 usa o envelope seguro), CORS, Helmet/CSP/HSTS e request ID (somente no header `X-Request-Id`).
- **Métodos efetivamente suportados:** `GET` (200), `HEAD` (200 sem corpo, tratado automaticamente pelo Express), `OPTIONS` (respondido como preflight pelo CORS); `POST`/`PUT`/`PATCH`/`DELETE` são rejeitados (404 pelo contrato de erro).

## Rate limiting

- **Instância única:** a proteção atual usa um armazenamento **in-memory local** (`@nestjs/throttler`), válido apenas para uma única instância do processo. Múltiplas instâncias exigirão um armazenamento coordenado (ex.: Redis) — decisão de `production-hardening-and-deployment`.
- **Proxy:** `trust proxy` permanece desligado e nenhuma heurística de `X-Forwarded-For`/`X-Real-IP` é implementada. O tracker usa somente o endereço observado pelo Express (`req.ip`); a configuração correta de proxy pertence a `production-hardening-and-deployment`.
- **Limites:** configuração tipada (`RATE_LIMIT_TTL_MS`, `RATE_LIMIT_MAX`) validada no boot; produção rejeita limites que tornem a proteção ineficaz. `POST /auth/login` e `POST /auth/change-password` usam um limite mais rígido que o global (10 requisições por janela de 60 s).
- **Relação com outros controles:** CORS **não** substitui rate limit; rate limit **não** substitui autenticação/autorização.
- Headers de rate limit (`Retry-After`, `X-RateLimit-*`) não são emitidos nesta mudança; o 429 segue o contrato de erro padrão (`RATE_LIMIT_EXCEEDED`).

## Contrato de erros

Todas as respostas de erro seguem um envelope único: `{ requestId, statusCode, error, message, details? }`. Valores recebidos, stack e `exception.message` nunca são retornados; `details` (opcional, somente em validação) contém apenas nome do campo e tipo controlado. O `X-Request-Id` retornado é sempre gerado pelo backend. Códigos implementados: `VALIDATION_ERROR`, `MALFORMED_JSON`, `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `RATE_LIMIT_EXCEEDED`, `INTERNAL_SERVER_ERROR` (400/401/403/404/405/409/413/415/429/500). Detalhes em [`docs/architecture/api.md`](../architecture/api.md).

## Autenticação e sessão

- **Sessão opaca única:** o token de sessão (CSPRNG 32 bytes) fica somente no cookie `HttpOnly` `SameSite=Strict`; o banco guarda apenas hashes com contexto distinto (`sess_v1:`/`csrf_v1:`). Login revoga atomicamente as sessões anteriores (transação); logout revoga a atual; troca de senha revoga todas e mantém/rotaciona a atual. **JWT foi rejeitado** (ADR-0006).
- **Cookie por ambiente:** produção `__Host-leads_session` (`Secure`); dev/teste `leads_session`. Nunca emite os dois; cookies de outro ambiente são ignorados. Em produção o uso de cookies exige HTTPS.
- **Expiração:** absoluta (nunca prolongada) e por inatividade; `lastUsedAt` é atualizado somente após o intervalo controlado; sessão anterior a `passwordChangedAt` é inválida; timestamps em UTC.
- **Senha:** Argon2id com parâmetros configuráveis (default OWASP baseline: m=19456, t=2, p=1); política por comprimento (12–128 chars, ≤512 UTF-8 bytes); rehash transparente no login quando os parâmetros mudam; senha nunca em logs/respostas.
- **Anti-enumeração temporal:** cada tentativa de login sintaticamente válida executa **exatamente uma** verificação Argon2id; e-mails inexistentes e usuários inativos verificam contra um hash dummy em memória (parâmetros atuais, entrada CSPRNG, por instância, nunca armazenado/logado), uniformizando a duração. Hash malformado → fallback dummy + 401 uniforme sem expor a causa.
- **Bootstrap admin:** interativo (TTY), sem eco, confirmação, senha não aceita via argumento/env; recusa segundo admin (409); nunca imprime senha/hash/e-mail.
- **Banco em runtime:** indisponibilidade transitória → operações autenticadas retornam `500` genérico e `GET /health` permanece up (o health nunca consulta banco).

## CSRF e CORS com credenciais

- **Synchronizer token:** CSRF (CSPRNG 32 bytes, hash com contexto `csrf_v1:`, comparação em tempo constante) entregue no corpo de `login`/`me` e enviado no header `X-CSRF-Token` nas mutações; rotacionado no login, na rotação de sessão e na troca de senha. Ausente/inválido/de outra sessão/antigo → 403. `SameSite` **não é a única defesa**.
- **Rotação determinística em `/me`:** como o banco guarda apenas o hash, `/me` rotaciona com compare-and-set sobre o hash observado na validação; sob chamadas concorrentes, exatamente uma retorna 200 com token e a perdedora retorna 409 (`CONFLICT`) sem token; o token antigo permanece inválido.
- **Origem obrigatória nas mutações:** `login`, `logout` e `change-password` exigem uma `Origin` exata autorizada (ausente, `null`, malformada, semelhante ou fora da allowlist → 403); um `Referer` presente deve concordar e **nunca substitui** uma `Origin` ausente; `Host` não é confiado. `GET /auth/me` e `GET /health` (leitura) continuam sem `Origin`.
- **CORS:** `credentials: true` e headers `Content-Type`/`X-CSRF-Token` somente para origens exatas autorizadas; wildcard jamais combinado com credenciais; uma origem maliciosa não lê o token via CORS.

## Lifecycle

- No boot, a API valida a configuração e **conecta ao PostgreSQL** (`DATABASE_URL` obrigatória); banco inacessível impede o início.
- `SIGTERM` e `SIGINT` iniciam encerramento ordenado; sockets e timers são liberados; o cliente Prisma é desconectado.
- O NestJS pode reemitir o sinal após concluir o shutdown, resultando em exit code nulo acompanhado do sinal — **isso não é uma falha**.
- Em runtime, uma indisponibilidade transitória do banco **não derruba o processo**: operações autenticadas retornam `500` genérico enquanto `GET /health` permanece responsivo.

## Portas e serviços

- **Desenvolvimento:** PostgreSQL em container, publicado **somente em loopback** — host `127.0.0.1:5433` → container `5432`.
- **Testes:** PostgreSQL isolado em `tmpfs`, publicado **somente em loopback** — host `127.0.0.1:5434` → container `5432` (banco/usuário `leads_test`). Os testes recusam rodar se `DATABASE_URL_TEST` não corresponder a esse banco; `prisma migrate reset` nunca é executado contra o banco de desenvolvimento.
- **Produção:** o PostgreSQL **não possui porta publicada**; a comunicação ocorre pela rede interna.

## Google Places

- A chave existe **somente no backend**, recebida por variável de ambiente. A nível de repositório, a variável é declarada apenas no template do backend e ausente do frontend (implementado).
- O frontend nunca recebe a chave; chamadas ao Google serão feitas apenas pelo backend (runtime planejado em `places-search`).
- Devem ser respeitadas as políticas de armazenamento e atribuição do provedor.
- A regra de negócio depende de uma interface de busca de estabelecimentos (abstração de provedor), não do cliente HTTP do Google.

## Reporte de vulnerabilidades

Canais públicos oficiais de reporte ainda não foram estabelecidos. Até lá, vulnerabilidades devem ser reportadas diretamente ao responsável pelo repositório. Este documento não inventa endereços de e-mail ou contatos.

## Checklist de revisão por mudança

- [ ] Ler os artefatos OpenSpec da mudança (proposal/spec/design/tasks).
- [ ] Toda operação privada possui autorização no backend (nunca confiar no frontend).
- [ ] Entradas validadas e transformadas; propriedades desconhecidas rejeitadas; limites definidos.
- [ ] Nenhum segredo versionado; `.env.example` sem valores reais.
- [ ] Logs sem senhas, tokens, cookies, chaves ou dados pessoais desnecessários.
- [ ] Portas e rotas criadas apenas com necessidade documentada.
- [ ] Rodar os gates: `pnpm check`, `pnpm check:secrets`, `openspec validate`.
