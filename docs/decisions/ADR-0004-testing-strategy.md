# ADR-0004 — Estratégia de testes

- **Status:** Accepted
- **Data:** 2026-08-15

## Contexto

A base precisa de uma estratégia de testes clara e verificável, cobrindo desde unidades até o fluxo completo, incluindo testes negativos de segurança.

## Decisão

Adotar a **pirâmide de testes** com as seguintes ferramentas:

- **Vitest** — testes unitários e de componentes do frontend (`apps/web`).
- **Jest** — testes unitários e de integração do backend (`apps/api`).
- **Playwright** — testes end-to-end (`apps/e2e`, com configuração TypeScript base já criada).

Os testes unitários ficam junto aos módulos; os de integração exercitam a API (validação, autorização, rate limiting); os E2E cobrem fluxos completos do usuário. Testes negativos de segurança (autorização, autenticação, validação, rate limiting) são definidos por mudança.

## Alternativas consideradas

- **Uma única ferramenta para tudo:** reduz a adequação por camada (ex.: Jest para E2E é frágil) — rejeitado.
- **Foco apenas em E2E:** cobertura lenta e frágil sem apoio em camadas inferiores — rejeitado.

## Consequências positivas

- Cobertura em camadas com feedback rápido e direcionado.
- Testes negativos garantem comportamento seguro, não apenas funcional.

## Consequências negativas / trade-offs

- Múltiplas ferramentas e configurações (custo de manutenção).
- E2E exige navegadores e serviços disponíveis.

## Impacto de segurança

- Testes negativos (auth/validação/rate limiting) protegem contra regressões de segurança.
- E2E valida o comportamento real, incluindo restrições de rede e autorização.

## Notas

- Os navegadores do Playwright **ainda não estão instalados**; serão necessários quando houver testes E2E reais.
- CI será tratada em mudança futura (`production-hardening-and-deployment`).

## Critérios para reavaliar

- Se a pirâmide não se sustentar (ex.: muitos E2E frágeis); se houver necessidade de testes de contrato ou propriedade; se uma ferramenta unificada amadurecer.
