# ADR-0006 — Autenticação por sessão opaca única (rejeição de JWT)

- **Status:** Accepted
- **Data:** 2026-08-16

## Contexto

O sistema privado tem um único administrador no MVP e precisa de autenticação/autorização: hashing de senha, sessão, guard com role/status, CSRF e CORS com credenciais. É necessário decidir o mecanismo de sessão, a política de múltiplas sessões, o formato do cookie e os parâmetros de hashing.

## Decisões

### 1. Sessão opaca no servidor (rejeição de JWT)

O cliente guarda um token aleatório CSPRNG (`crypto.randomBytes(32)`) **somente** em cookie `HttpOnly`; o banco armazena apenas hashes com contexto distinto (`sess_v1:`/`csrf_v1:`). **JWT (access+refresh) foi avaliado e rejeitado:** a statelessness não é necessária aqui e JWT exige resolver revogação, rotação, armazenamento seguro (localStorage é proibido) e gerenciamento de chaves — tudo resolvido de forma simples pela sessão em banco. Não há endpoint de refresh.

### 2. Política de sessão única

Um login revoga atomicamente as sessões anteriores e cria uma nova (transação). Logout revoga a atual. Troca de senha revoga todas e, por decisão explícita, **mantém e rotaciona a sessão atual** (novo token de sessão + novo CSRF) para o administrador permanecer conectado. Multi-sessão está fora do escopo do MVP. A unicidade sob concorrência é imposta por um **índice único parcial** (`ON "Session"("userId") WHERE "revokedAt" IS NULL`), preservado em SQL na migration (o Prisma Schema não representa índices parciais), com retry limitado (máx. 1) e erro 409 controlado em último caso — nunca um erro Prisma.

### 3. Cookie por ambiente

Produção: nome `__Host-leads_session`, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, sem `Domain`. Desenvolvimento/teste: `leads_session`, `HttpOnly`, `SameSite=Strict`, `Path=/`, sem `Domain`, sem `Secure` (HTTP local em loopback). A configuração é rejeitada se tentasse emitir cookie não-`Secure` em produção; nunca emite os dois cookies; ignora cookie de outro ambiente. `SameSite=Strict` exige API e frontend no mesmo site (documentado); o **token CSRF é a defesa real** e `SameSite` não é apresentado como única defesa.

### 4. Parâmetros Argon2id

Hashing Argon2id com valores configuráveis e tetos conservadores: default OWASP baseline `m=19456 KiB, t=2, p=1` (máximos 262144, 5, 4). Política de senha por comprimento (mín. 12, máx. 128 chars, ≤512 UTF-8 bytes), sem regras arbitrárias de caracteres; rehash transparente no login quando os parâmetros armazenados diferem; senha nunca normalizada silenciosamente, nunca em logs ou respostas.

## Alternativas consideradas

- **JWT access+refresh:** rejeitado (item 1) — revogação/rotação/chaves sem benefício real para o MVP.
- **Multi-sessão:** rejeitado para o MVP — exigiria listagem, limites e UX de revogação.
- **Sessão com payload no cookie (signed cookie):** rejeitado — dados de sessão confidenciais ficam no cliente; preferido estado no servidor com hash no banco.
- **Outros algoritmos de hash (bcrypt/scrypt):** rejeitados em favor de Argon2id (vencedor PHC, parâmetros configuráveis, biblioteca com binários pré-compilados fixados).

## Consequências positivas

- Sessões revogáveis, expiráveis e com política de sessão única sem infraestrutura extra.
- Tokens com alta entropia permitem hash sem chave (SHA-256 com contexto) e comparação por índice único.
- Banco único é a fonte de verdade; outage em runtime degrada para `500` genérico com `health` up (fail-fast no boot).

## Consequências negativas / trade-offs

- Cada requisição autenticada consulta o banco (mitigado por índice único em `tokenHash` e única lookup).
- Sessão única significa que logar em outro lugar encerra a sessão anterior — decisão explícita para o MVP privado.
- Requer HTTPS em produção (cookies + SameSite); CORS com credenciais restrito a origens exatas.

## Impacto de segurança

- Tokens e hashes nunca em logs, JSON ou query; senha nunca em logs/respostas; erros controlados (401 uniforme no login, 403 CSRF/origem, 409 conflito) sem detalhes internos.

## Critérios para reavaliar

- Quando o número de sessões por usuário, SSO/OAuth/MFA ou revogação por sessão se tornar requisito; quando a operação exigir multi-instância com sessão em storage compartilhado.
