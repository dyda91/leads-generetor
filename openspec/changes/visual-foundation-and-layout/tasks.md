## 1. Scaffold React/Vite

Comandos: `pnpm --filter @leads/web lint` · `pnpm --filter @leads/web typecheck` · `pnpm --filter @leads/web build`

- [x] 1.1 Criar `apps/web` (Vite + React + TypeScript estrito) usando `@leads/typescript-config` (`tsconfig.web.json`) e `@leads/eslint-config` (config react), com scripts `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `format`, `format:check`
- [x] 1.2 Adicionar dependências mínimas fixadas (react, react-dom; dev: vite, @vitejs/plugin-react, @types/react, @types/react-dom, vitest, jsdom, @testing-library/react/dom/jest-dom, typescript), consultando as docs oficiais; sem Redux/Zustand
- [x] 1.3 Configurar entry point, HTML semântico (`lang="pt-BR"`, título, meta), Vite em loopback `127.0.0.1:5173` com `strictPort` e sem source maps no build, e `.env.example` com `VITE_API_BASE_URL` pública (sem segredo)

Nota: React Router, Tailwind CSS, shadcn/ui e Lucide ficam para o grupo que efetivamente os utiliza (design system e rotas), conforme decisão aprovada; a configuração dos tokens visuais foi movida para o grupo 2.

Critério de conclusão: `lint`/`typecheck`/`build`/`test` do web verdes; `check:workspaces` aceita `@leads/web`; nenhum segredo em variáveis `VITE_*`; Vite escuta somente em `127.0.0.1:5173`.

## 2. Design system e componentes-base

Comandos: `pnpm --filter @leads/web lint` · `pnpm --filter @leads/web typecheck` · `pnpm --filter @leads/web test`

- [ ] 2.1 Criar primitivas base (Button, Input, Label, Card, Skeleton, Form, Dialog/Drawer) a partir de shadcn/ui, customizadas com os tokens
- [ ] 2.2 Implementar estados de loading, erro e vazio reutilizáveis (skeleton sem layout shift, alertas com `aria-live`, retry controlado)
- [ ] 2.3 Garantir foco visível, contraste WCAG AA, tamanho de toque adequado e respeito à `prefers-reduced-motion`

Critério de conclusão: componentes com estados verificados por testes de render; foco visível e contraste AA; sem `dangerouslySetInnerHTML`/`eval`.

## 3. API client

Comandos: `pnpm --filter @leads/web test`

- [ ] 3.1 Criar cliente centralizado com `VITE_API_BASE_URL`, `credentials: include`, `Content-Type` controlado, timeout via `AbortController`
- [ ] 3.2 Enviar `X-CSRF-Token` SOMENTE em mutações protegidas (logout, change-password), nunca no login
- [ ] 3.3 Parsing defensivo e normalização de erros (sem mensagem bruta/stack; `requestId` exibido só em erro técnico controlado; 401/403/409/429/500 mapeados)
- [ ] 3.4 Sem auto-retry de login/logout/change-password e sem repetição silenciosa de mutações

Critério de conclusão: testes provam `credentials: include`, CSRF apenas em mutações, timeout, parsing defensivo e ausência de erro bruto; nenhum token em storage/log.

## 4. Estado de autenticação

Comandos: `pnpm --filter @leads/web test`

- [ ] 4.1 Criar store em memória (context + reducer) para `user` (mínimo), `csrfToken` e status; proibido `localStorage`/`sessionStorage`/`document.cookie`
- [ ] 4.2 Restauração da sessão via `GET /auth/me` com single-flight (uma chamada por instância) e loading estável; 401 → `/login`; 500 → erro recuperável sem deslogar, com retry
- [ ] 4.3 Tratar 409 de rotação concorrente com retry limitado (máx. 1) e sem loop; manter somente o token da resposta válida e descartar o anterior
- [ ] 4.4 Ciclo de vida do CSRF: setado por login e `/me`; usado em mutações; atualizado na troca de senha; limpo no logout/401

Critério de conclusão: testes de single-flight, retry ≤1, 409, sem persistência de token e sem `/me` desnecessário durante navegação.

## 5. Login

Comandos: `pnpm --filter @leads/web test`

- [ ] 5.1 Tela de login (marca, e-mail, senha, botão "entrar", loading, erro genérico, mostrar/ocultar senha opcional, autocomplete, acessibilidade); sem cadastro e sem "esqueci a senha"
- [ ] 5.2 Chamada `POST /auth/login` com `credentials: include`; usuário e CSRF ficam em memória; senha removida da memória após sucesso/falha
- [ ] 5.3 Tratamento 401 uniforme, 403 como origem/configuração, 429 como aguardar; sem revelar e-mail cadastrado
- [ ] 5.4 Redirecionar para destino interno validado (sem open redirect) e impedir submissões duplicadas

Critério de conclusão: testes de login válido/inválido, 401/403/429, sem open redirect, sem duplicação e sem persistência de senha/token.

## 6. Rotas protegidas

Comandos: `pnpm --filter @leads/web test`

- [ ] 6.1 Definir rotas `/login`, `/`, `/settings/security` e 404 do frontend com `ProtectedRoute` que aguarda a resolução da sessão
- [ ] 6.2 Sem sessão → `/login` com destino interno guardado; login com sessão válida → dashboard; destino externo rejeitado
- [ ] 6.3 401 em rota privada limpa estado e redireciona; 403 não é tratado como logout; 500 não apaga sessão sem confirmação

Critério de conclusão: testes de ProtectedRoute, redirecionamento, open redirect e tratamento 401/403/500.

## 7. Layout responsivo

Comandos: `pnpm --filter @leads/web test`

- [ ] 7.1 Layout desktop com sidebar centralizada (logo, Dashboard, itens futuros "em breve", Configurações, logout, identidade mínima do admin) e conteúdo centralizado com largura máxima
- [ ] 7.2 Layout mobile com header e drawer acessível (focus trap, Escape, scroll lock, navegação por teclado, foco retorna ao abrir/fechar)
- [ ] 7.3 Sem links funcionais para recursos inexistentes (itens futuros desabilitados/"em breve")

Critério de conclusão: testes de layout desktop/mobile, drawer/foco/Escape e ausência de links falsos.

## 8. Dashboard vazio

Comandos: `pnpm --filter @leads/web test`

- [ ] 8.1 Dashboard shell com saudação, status do sistema, "nenhuma pesquisa realizada", CTA futuro desabilitado e bloco "Próximos passos"
- [ ] 8.2 Estados vazios honestos (cards vazios, sem números inventados); health da API somente se útil, sem polling agressivo

Critério de conclusão: dashboard renderizado sem dados fictícios; estados de loading/erro/vazio cobertos por testes.

## 9. Segurança da conta

Comandos: `pnpm --filter @leads/web test`

- [ ] 9.1 Página/modal protegido de troca de senha (senha atual, nova senha, confirmação local, requisitos claros, CSRF em memória, sem normalização, sem armazenar/logar valores, sem submissão duplicada, inputs limpos)
- [ ] 9.2 Tratamento de erros da troca (senha atual incorreta → mensagem uniforme; 401 → redireciona; 403 → CSRF/origem); sucesso atualiza CSRF em memória
- [ ] 9.3 Logout com CSRF, sem auto-retry; sucesso limpa memória e redireciona; falha de rede oferece limpar estado local sem afirmar revogação do servidor; 401 limpa estado

Critério de conclusão: testes de troca de senha e logout (sucesso, falha de rede, 401), CSRF em memória e ausência de persistência.

## 10. Testes unitários e de integração

Comandos: `pnpm --filter @leads/web test`

- [ ] 10.1 Testes do API client (credentials include, CSRF só em mutações, timeout, parsing defensivo, 401/403/429/500)
- [ ] 10.2 Testes do estado de autenticação (sessão inicial, single-flight, 409 concorrente, retry limitado, nenhuma persistência de token)
- [ ] 10.3 Testes de login, ProtectedRoute, open redirect, layout desktop/mobile, menu e foco, 404, acessibilidade básica

Critério de conclusão: suíte web verde cobrindo os cenários da spec; nenhum cenário normativo sem teste correspondente.

## 11. E2E

Comandos: `docker compose -f infrastructure/docker-compose.dev.yml up -d postgres-test` · `pnpm --filter @leads/web build` · `pnpm --filter @leads/e2e test`

- [ ] 11.1 Seed seguro do administrador para E2E via helper (serviço de bootstrap em processo), nunca o CLI interativo; banco de teste isolado (5434); nunca tocar 5433
- [ ] 11.2 Fluxos E2E: login; reload preserva sessão (cookie); `/me` recupera CSRF; rota protegida; logout; troca de senha (senha anterior deixa de funcionar); sessão expirada
- [ ] 11.3 E2E sem token em `localStorage`/`sessionStorage` e sem segredos em screenshots/traces

Critério de conclusão: E2E verdes no `postgres-test` com a API rodando; nenhum segredo/token persistido ou capturado.

## 12. Documentação

Comandos: revisão manual de `README.md` e `docs/architecture/api.md`

- [ ] 12.1 Documentar a superfície web (rotas, autenticação por cookie, CSRF em memória, sessão única, troca de senha, logout) e os comandos de desenvolvimento/testes (API + web + E2E no banco de teste)
- [ ] 12.2 Documentar a direção visual (tokens) e a estratégia de autenticação/CSRF no frontend, sem afirmar controles futuros como ativos

Critério de conclusão: documentação consistente com spec/design e sem segredos.

## 13. Validação final

Comandos: `pnpm check` · `pnpm check:secrets` · `pnpm audit` · `pnpm exec openspec validate visual-foundation-and-layout`

- [ ] 13.1 Rodar gates completos (format, workspaces, segredos, lint, typecheck, test, build) sem erros
- [ ] 13.2 Revisão de segurança do frontend: sem tokens/segredos em storage/logs/URLs, sem open redirect, sem `dangerouslySetInnerHTML`/`eval`, sem segredos em `VITE_*`, CORS exato `http://127.0.0.1:5173`

Critério de conclusão: todos os comandos com exit 0; checklist de segurança revisado; nenhuma credencial real em código, testes, fixtures ou logs.
