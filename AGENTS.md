# AGENTS.md

Regras permanentes para agentes de código neste repositório.

## Processo

- Leia os artefatos OpenSpec (`openspec/`) antes de implementar qualquer mudança.
- Trabalhe somente na mudança e nas tasks autorizadas pelo usuário.
- Não marque uma task como concluída sem teste ou evidência concreta.
- Não execute `commit` nem `push` sem autorização explícita.
- Preserve alterações existentes; não sobrescreva trabalho alheio.

## Segurança

- Nunca leia, imprima, edite ou versione arquivos `.env` reais.
- Nunca inclua credenciais ou segredos em código, testes, fixtures, logs ou documentação.
- Não abra portas nem crie rotas sem necessidade documentada.

## Qualidade

- Não enfraqueça TypeScript, ESLint ou testes para obter sucesso artificial.
- Não use `any`, `@ts-ignore`, `eslint-disable` ou skip de testes sem justificativa explícita e documentada.
- Antes de concluir, execute os checks aplicáveis: lint, typecheck, testes, build e `openspec validate`.
- Consulte a documentação oficial antes de introduzir dependências ou configurações incertas.
