# ADR-0002 — Google Places exclusivamente pelo backend

- **Status:** Accepted
- **Data:** 2026-08-15

## Contexto

A aplicação busca empresas por segmento e localização usando a Google Places API. A chave da API é um segredo sensível; expô-la ao frontend permitiria abuso, custos indevidos e vazamento.

## Decisão

**Toda chamada à Google Places API ocorre no backend.** A chave existe somente no backend, carregada por variável de ambiente, e **nunca** é entregue ao frontend — nem em respostas da API, bundles, logs ou testes. A regra de negócio depende de uma **interface de busca de estabelecimentos** (abstração de provedor), e não diretamente do cliente HTTP do Google.

## Alternativas consideradas

- **Chamar o Google diretamente do frontend (Maps JavaScript / Places no navegador):** expõe a chave (ou exige chave restrita por origem), aumenta a superfície de ataque e dificulta métricas internas — rejeitado.
- **Proxy de busca no backend sem abstração:** acoplaria a aplicação ao provedor — rejeitado em favor da interface.

## Consequências positivas

- A chave nunca é exposta ao cliente.
- Métricas de consumo, deduplicação, tratamento de quotas e cache ficam centralizados no backend.
- Troca de provedor (ou mock em testes) sem alterar a regra de negócio.

## Consequências negativas / trade-offs

- Todo tráfego de busca passa pelo backend (latência e custo adicionais).
- O backend precisa tratar falhas, quotas e políticas do provedor.

## Impacto de segurança

- Mantém a chave fora do alcance do navegador e de logs.
- **Não confundir ocultação da chave com autorização de usuário:** a chave não autentica usuários; autorização continua sendo responsabilidade do backend.
- Respeitar as políticas de armazenamento e atribuição do provedor (ex.: atribuir os dados ao Google quando exigido).

## Critérios para reavaliar

- Se surgir um mecanismo oficial do provedor que permita acesso seguro e mensurável a partir do navegador sem expor segredos; se o custo/latência do proxy se tornar inviável; se outro provedor se tornar mais adequado (mantendo a abstração).
