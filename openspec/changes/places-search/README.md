# places-search

Pesquisa empresarial funcional usando **Google Places Text Search (New)**, exclusivamente pelo backend (ADR-0002), com controle rigoroso de custos, endpoint interno autenticado e interface segura.

## Escopo (resumo)

- Backend: `PlacesProvider` + `GooglePlacesProvider` (fetch fixo, field mask mínima, timeout, sem redirects), `POST /places/search` (AuthGuard + Origin + CSRF), validação estrita, rate limit por usuário/global, orçamento diário/mensal fail-closed, dedup concorrente.
- Frontend: rota protegida `/search` com submissão explícita e estados loading/erro/vazio/resultados (funcional mesmo sem os campos Enterprise).
- **Sem paginação no MVP** (uma página **fixa de 10 resultados**; frontend não envia/escolhe `pageSize`; sem carregamento automático; alteração futura para até 20 exige nova revisão de custo/spec).
- Campos **Enterprise** (telefone/site/avaliação): configuráveis, **OFF por padrão** em dev/test/prod; produção exige confirmação explícita; field mask básica e Enterprise nunca misturadas; SKU documentado sem afirmar preço não verificado.
- Leads, listas, notas, status e exportação ficam em mudança posterior.

## Leia

- [`proposal.md`](proposal.md) — por que
- [`specs/places-search/spec.md`](specs/places-search/spec.md) — requisitos/cenários (SHALL/MUST)
- [`design.md`](design.md) — decisões, field mask/SKUs, custo, cache, ameaças, endpoint
- [`tasks.md`](tasks.md) — grupos de implementação (1–12)

## Documentação oficial consultada

Links e data de consulta (2026-08-17) registrados no `design.md` (Text Search (New), Policies/attributions, SKU details, security best practices, termos). Nenhum preço é afirmado sem fonte oficial + data.

## Non-goals

Persistência de leads · listas · notas/status · exportação · scraping/e-mail · enriquecimento · automação · múltiplos provedores · paginação no MVP · armazenamento proibido de dados Google.
