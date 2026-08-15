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

| Controle                                                                                                                    | Status                                       | Mudança prevista                                      |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| Segredos nunca versionados; `.env.example` com placeholders                                                                 | Implementado (parcial)                       | `project-foundation` (secretlint, pre-commit)         |
| PostgreSQL não exposto publicamente; loopback                                                                               | Implementado                                 | `project-foundation` (compose dev)                    |
| Google Places exclusivamente no backend                                                                                     | Obrigatório (contrato); integração planejada | `places-search`                                       |
| Validação fail-fast de configuração                                                                                         | Obrigatório (contrato); runtime planejado    | `security-foundation`                                 |
| Health check público mínimo                                                                                                 | Obrigatório (contrato)                       | `security-foundation`                                 |
| Logs estruturados e sanitizados                                                                                             | Obrigatório (contrato)                       | `audit-and-observability`                             |
| Autenticação e autorização (Argon2id, refresh rotativo, cookies, CSRF, bloqueio de brute force, revogação, anti-enumeração) | Planejado                                    | `authentication-and-authorization`                    |
| Rate limiting global e reforçado (login, pesquisa, exportação)                                                              | Planejado                                    | `security-foundation`                                 |
| Validação de entrada e rejeição de propriedades desconhecidas                                                               | Planejado                                    | `security-foundation`                                 |
| Erros centralizados sem detalhes internos                                                                                   | Planejado                                    | `security-foundation`                                 |
| Proteção contra IDOR (propriedade/permissão em todo recurso)                                                                | Planejado                                    | `lead-management`, `lead-lists-and-pipeline`          |
| Proteção contra XSS/CSP                                                                                                     | Planejado                                    | `visual-foundation-and-layout`, `security-foundation` |
| Proteção contra SSRF e chamadas externas seguras (timeout, redirecionamentos, validação de URL)                             | Planejado                                    | `places-search`                                       |
| SQL injection (consultas parametrizadas)                                                                                    | Planejado                                    | `security-foundation`/API                             |
| Abuso de API e paginação                                                                                                    | Planejado                                    | `security-foundation`                                 |
| Auditoria de ações sensíveis                                                                                                | Planejado                                    | `audit-and-observability`                             |
| Hardening de produção (containers não-root, imagens fixadas, .env validado)                                                 | Planejado                                    | `production-hardening-and-deployment`                 |

## Portas e serviços

- **Desenvolvimento:** PostgreSQL em container, publicado **somente em loopback** — host `127.0.0.1:5433` → container `5432`. Nenhuma outra porta é publicada.
- **Produção:** o PostgreSQL **não possui porta publicada**; a comunicação ocorre pela rede interna.

## Google Places

- A chave existe **somente no backend**, recebida por variável de ambiente.
- O frontend nunca recebe a chave; chamadas ao Google são feitas apenas pelo backend.
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
