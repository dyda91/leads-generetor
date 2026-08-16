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

| Controle                                                                                                                    | Status       | Mudança prevista                              |
| --------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------- |
| Segredos nunca versionados; `.env.example` com placeholders                                                                 | Implementado | `project-foundation` (secretlint, pre-commit) |
| PostgreSQL não exposto publicamente; loopback                                                                               | Implementado | `project-foundation` (compose dev)            |
| Google Places — chave ausente do frontend (nível de repositório)                                                            | Implementado | `project-foundation`                          |
| Google Places — chamadas/respostas runtime backend-only                                                                     | Planejado    | `places-search`                               |
| Validação fail-fast de configuração (runtime)                                                                               | Implementado | `security-foundation`                         |
| Health check público mínimo (runtime)                                                                                       | Implementado | `security-foundation`                         |
| Logs estruturados e sanitizados (runtime)                                                                                   | Planejado    | `audit-and-observability`                     |
| Autenticação e autorização (Argon2id, refresh rotativo, cookies, CSRF, bloqueio de brute force, revogação, anti-enumeração) | Planejado    | `authentication-and-authorization`            |
| Rate limiting global (runtime)                                                                                              | Implementado | `security-foundation`                         |
| Rate limiting reforçado (login, pesquisa, exportação)                                                                       | Planejado    | `authentication-and-authorization` e domínio  |
| Validação de entrada e rejeição de propriedades desconhecidas                                                               | Implementado | `security-foundation`                         |
| Erros centralizados sem detalhes internos                                                                                   | Implementado | `security-foundation`                         |
| Proteção contra IDOR (propriedade/permissão em todo recurso)                                                                | Planejado    | `lead-management`, `lead-lists-and-pipeline`  |
| CSP restritiva da API (API sem HTML)                                                                                        | Implementado | `security-foundation`                         |
| Proteção contra XSS (frontend)                                                                                              | Planejado    | `visual-foundation-and-layout`                |
| Proteção contra SSRF e chamadas externas seguras (timeout, redirecionamentos, validação de URL)                             | Planejado    | `places-search`                               |
| SQL injection (consultas parametrizadas)                                                                                    | Planejado    | API/domínio (quando o banco existir)          |
| Abuso de API — paginação e limites por recurso                                                                              | Planejado    | API/domínio                                   |
| Auditoria de ações sensíveis                                                                                                | Planejado    | `audit-and-observability`                     |
| Hardening de produção (containers não-root, imagens fixadas, .env validado)                                                 | Planejado    | `production-hardening-and-deployment`         |

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
- **Limites:** configuração tipada (`RATE_LIMIT_TTL_MS`, `RATE_LIMIT_MAX`) validada no boot; produção rejeita limites que tornem a proteção ineficaz.
- **Relação com outros controles:** CORS **não** substitui rate limit; rate limit **não** substitui autenticação/autorização.
- Headers de rate limit (`Retry-After`, `X-RateLimit-*`) não são emitidos nesta mudança; o 429 segue o contrato de erro padrão (`RATE_LIMIT_EXCEEDED`).

## Contrato de erros

Todas as respostas de erro seguem um envelope único: `{ requestId, statusCode, error, message, details? }`. Valores recebidos, stack e `exception.message` nunca são retornados; `details` (opcional, somente em validação) contém apenas nome do campo e tipo controlado. O `X-Request-Id` retornado é sempre gerado pelo backend. Códigos implementados: `VALIDATION_ERROR`, `MALFORMED_JSON`, `BAD_REQUEST`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `RATE_LIMIT_EXCEEDED`, `INTERNAL_SERVER_ERROR` (400/404/405/413/415/429/500). Detalhes em [`docs/architecture/api.md`](../architecture/api.md).

## Lifecycle

- `SIGTERM` e `SIGINT` iniciam encerramento ordenado; sockets e timers são liberados.
- O NestJS pode reemitir o sinal após concluir o shutdown, resultando em exit code nulo acompanhado do sinal — **isso não é uma falha**.
- Nenhum comportamento específico de orquestrador é prometido nesta fase.

## Portas e serviços

- **Desenvolvimento:** PostgreSQL em container, publicado **somente em loopback** — host `127.0.0.1:5433` → container `5432`. Nenhuma outra porta é publicada.
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
