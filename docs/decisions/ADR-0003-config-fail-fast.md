# ADR-0003 — Validação fail-fast da configuração

- **Status:** Accepted
- **Data:** 2026-08-15

## Contexto

Erros de configuração (segredo ausente, valor inseguro, ambiente mal definido) são causas comuns de incidentes. Iniciar a aplicação com configuração inválida pode expor dados ou degradar a segurança silenciosamente.

## Decisão

A configuração (variáveis de ambiente) é **validada durante a inicialização, antes de aceitar tráfego**. Configuração ausente ou insegura **bloqueia a inicialização** (processo encerrado). As mensagens de erro **não revelam os valores** das variáveis.

## Alternativas consideradas

- **Validar de forma ad hoc em cada uso:** permite inconsistências e boot com config errada — rejeitado.
- **Só alertar em logs:** pode passar despercebido em produção — rejeitado.

## Consequências positivas

- Falha rápida e explícita; nenhum tráfego é servido com configuração insegura.
- Contrato verificável e testável.

## Consequências negativas / trade-offs

- A inicialização exige que todas as variáveis obrigatórias estejam definidas no ambiente.
- Pequena duplicação entre os esquemas de validação do ambiente e das entradas de API.

## Impacto de segurança

- Impede boot com segredo ausente ou valor inseguro em produção.
- Evita vazamento de valores via mensagens de erro.

## Critérios para reavaliar

- Se houver necessidade de recarregar configuração em runtime; se o número de variáveis crescer a ponto de exigir uma ferramenta de gerenciamento de segredos externa; se surgirem perfis de ambiente muito distintos.

> **Nota de implementação:** esta decisão é uma obrigação de runtime da mudança futura `security-foundation`, que criará sua própria spec normativa. Não foi implementada em `project-foundation`.
