## Purpose

Professional, responsive React application for the leads generator, integrated with the existing single-admin authentication (cookie session, in-memory CSRF, me/logout/change-password) — a secure visual foundation with login, session restoration, protected routing, dashboard shell and an accessible layout, without business features.

## ADDED Requirements

### Requirement: Aplicação e integração com a API
O frontend SHALL ser um aplicativo React profissional e responsivo que consome a API autenticada. O cliente de API SHALL usar uma URL base pública (`VITE_API_BASE_URL`), enviar cookies com `credentials: include`, controlar `Content-Type`, enviar o header `X-CSRF-Token` SOMENTE em mutações protegidas (nunca no login), usar timeout com `AbortController`, fazer parsing defensivo e tratar respostas inesperadas sem exibir erro bruto do backend. O frontend MUST NOT usar `localStorage`/`sessionStorage` para cookie, token de sessão, CSRF, senha ou dados sensíveis; MUST NOT usar `document.cookie` nem decodificar o cookie; MUST NOT incluir token em URL, query ou logs; e MUST NOT implementar handling de JWT ou refresh token.

#### Scenario: Credenciais são enviadas em toda chamada
- **WHEN** o frontend chama a API
- **THEN** as requisições incluem `credentials: include`

#### Scenario: CSRF é enviado somente em mutações protegidas
- **WHEN** o frontend executa uma mutação protegida por cookie (logout, change-password)
- **THEN** o header `X-CSRF-Token` é enviado
- **AND** o login não envia o header CSRF

#### Scenario: Nenhum token é persistido em storage
- **WHEN** o aplicativo carrega, autentica ou executa mutações
- **THEN** nenhum cookie, token de sessão, CSRF ou senha é gravado em `localStorage`, `sessionStorage` ou `document.cookie`

#### Scenario: Falhas de rede e de resposta são controladas
- **WHEN** uma chamada excede o timeout ou retorna uma resposta inesperada
- **THEN** o aplicativo apresenta um erro controlado e não exibe stack, mensagem bruta do backend nem detalhes internos

### Requirement: Restauração da sessão
Ao carregar, o frontend SHALL chamar `GET /auth/me` para restaurar a sessão, manter o usuário e o CSRF SOMENTE em memória e exibir um estado de loading estável. Uma sessão válida SHALL entrar na aplicação; um 401 SHALL redirecionar para `/login`; um 500 SHALL exibir erro recuperável SEM deslogar automaticamente, com retry controlado. O carregamento SHALL usar single-flight (sem chamadas duplicadas de inicialização), tratar o 409 de rotação concorrente com retry limitado (máx. 1) e evitar loop de requests, flash de conteúdo protegido e `/me` desnecessário durante navegação.

#### Scenario: Sessão válida entra na aplicação
- **WHEN** `GET /auth/me` retorna 200 com usuário e CSRF
- **THEN** o usuário e o CSRF ficam em memória e o aplicativo carrega a área protegida

#### Scenario: Sessão ausente redireciona para login
- **WHEN** `GET /auth/me` retorna 401
- **THEN** o aplicativo redireciona para `/login` e limpa o estado em memória

#### Scenario: Erro de servidor é recuperável sem deslogar
- **WHEN** `GET /auth/me` retorna 500
- **THEN** o aplicativo exibe um erro recuperável com opção de retry e NÃO desloga o usuário automaticamente

#### Scenario: Inicialização usa single-flight
- **WHEN** a aplicação inicia
- **THEN** apenas uma chamada de restauração de sessão é disparada por instância, mesmo com múltiplas requisições concorrentes de rotas

#### Scenario: 409 de rotação concorrente é tratado com retry limitado
- **WHEN** `GET /auth/me` retorna 409 por rotação concorrente
- **THEN** o frontend tenta uma vez mais, de forma controlada, sem retry infinito
- **AND** somente o token da resposta válida é mantido; o token anterior é descartado

### Requirement: Login
O frontend SHALL fornecer uma tela de login com marca/nome do sistema, e-mail, senha, botão "entrar", feedback de loading, erro genérico e acessibilidade. O login SHALL chamar `POST /auth/login` com `credentials: include` (Origin enviado naturalmente pelo navegador), manter usuário e CSRF SOMENTE em memória, impedir submissões duplicadas e redirecionar para o destino protegido pretendido (interno e validado, sem open redirect). A resposta SHALL ser uniforme (sem revelar se o e-mail está cadastrado); 401 mostra mensagem genérica, 403 mostra erro de origem/configuração sem detalhes internos, 429 orienta a aguardar. A senha SHALL ser removida da memória do formulário após sucesso ou falha. Não SHALL existir cadastro nem "esqueci a senha".

#### Scenario: Login válido entra e redireciona para o destino protegido
- **WHEN** credenciais válidas são enviadas com origem permitida
- **THEN** o usuário e o CSRF retornados ficam em memória e o usuário é redirecionado para o destino interno pretendido (ou `/`)

#### Scenario: Falha de login é uniforme e genérica
- **WHEN** o e-mail não existe, o usuário está inativo ou a senha está incorreta (401)
- **THEN** a tela exibe uma mensagem genérica idêntica, sem revelar qual condição ocorreu

#### Scenario: Erro de origem/configuração
- **WHEN** o login retorna 403
- **THEN** a tela exibe um erro de origem/configuração sem detalhes internos

#### Scenario: Rate limit
- **WHEN** o login retorna 429
- **THEN** a tela orienta o usuário a aguardar antes de tentar novamente

#### Scenario: Sem open redirect
- **WHEN** um destino pretendido é inválido ou externo
- **THEN** o redirecionamento após o login usa apenas destinos internos validados

#### Scenario: Sem submissões duplicadas
- **WHEN** o formulário de login está em submissão
- **THEN** o botão "entrar" fica desabilitado e não inicia uma nova submissão

#### Scenario: Sem cadastro e sem recuperação de senha
- **WHEN** a tela de login é exibida
- **THEN** não há ação de cadastro nem de "esqueci a senha"

### Requirement: Rotas e navegação
O frontend SHALL ter rotas públicas e protegidas: `/login` (pública), `/` (dashboard protegido), `/settings/security` (protegido) e um 404 do frontend. Uma rota protegida SHALL aguardar a resolução da sessão; sem autenticação SHALL redirecionar para `/login`; autenticado SHALL entrar no layout. O login visitado com sessão válida SHALL redirecionar para o dashboard. O destino interno pretendido SHALL ser guardado e validado; URLs externas SHALL ser rejeitadas. Um 401 durante rota privada SHALL limpar o estado e redirecionar para `/login`; 403 SHALL NOT ser tratado automaticamente como logout; 500 SHALL NOT apagar a sessão sem confirmação. A autorização real SHALL permanecer no backend (ocultar botão não é proteção).

#### Scenario: Rota protegida sem sessão redireciona para login
- **WHEN** uma rota protegida é acessada sem sessão válida
- **THEN** o usuário é redirecionado para `/login`

#### Scenario: Login visitado com sessão válida
- **WHEN** `/login` é acessado com sessão válida
- **THEN** o usuário é redirecionado para o dashboard

#### Scenario: Destino pretendido é preservado
- **WHEN** uma rota protegida é acessada sem sessão
- **THEN** o destino interno é guardado e usado após o login bem-sucedido

#### Scenario: 404 do frontend
- **WHEN** uma rota desconhecida é acessada
- **THEN** a aplicação exibe uma página 404 amigável

### Requirement: Layout responsivo
O frontend SHALL fornecer um layout desktop com menu lateral (logo, Dashboard, itens futuros claramente "em breve", Configurações, logout e identificação mínima do administrador) e um layout mobile com header e menu drawer acessível. O menu mobile SHALL ter foco controlado, fechamento por Escape, scroll lock e navegação por teclado. Não SHALL existir links funcionais para recursos inexistentes; itens futuros SHALL estar desabilitados ou marcados como "em breve". O conteúdo SHALL ser centralizado em telas widescreen, com largura máxima para evitar elementos excessivamente distantes, e uma área lateral futura pode ser preparada sem conteúdo fictício.

#### Scenario: Sidebar desktop
- **WHEN** a aplicação é exibida em desktop
- **THEN** o layout mostra a sidebar com navegação principal e o conteúdo ao lado

#### Scenario: Drawer mobile acessível
- **WHEN** a navegação é aberta em mobile
- **THEN** o drawer foca o conteúdo, fecha com Escape, trava o scroll e permite navegação por teclado

#### Scenario: Itens futuros não são links falsos
- **WHEN** itens futuros (ex.: pesquisa, leads, listas) são exibidos
- **THEN** eles estão desabilitados ou marcados como "em breve", sem navegação para recursos inexistentes

#### Scenario: Conteúdo centralizado em widescreen
- **WHEN** a aplicação é exibida em tela larga
- **THEN** o conteúdo principal é centralizado com largura máxima definida

### Requirement: Dashboard shell
O dashboard `/` SHALL exibir um shell visual realista sem dados falsos: saudação, status do sistema, indicação de que nenhuma pesquisa foi realizada, um CTA futuro desabilitado ou identificado como próxima etapa, cards vazios (sem números inventados) e um bloco "Próximos passos". O health da API SHALL ser usado somente se houver necessidade útil, sem polling agressivo.

#### Scenario: Dashboard sem dados inventados
- **WHEN** o dashboard é exibido
- **THEN** ele mostra estados vazios honestos, sem números, contadores ou dados fictícios

#### Scenario: Próximos passos e CTA futuro
- **WHEN** o dashboard é exibido
- **THEN** há um bloco "Próximos passos" e um CTA de pesquisa futuro desabilitado ou marcado como próxima etapa

### Requirement: Troca de senha
O frontend SHALL fornecer uma página/modal protegida de troca de senha com senha atual, nova senha e confirmação local, CSRF em memória, exibição clara dos requisitos e impedimento de submissões duplicadas. O frontend SHALL NOT armazenar senhas, normalizar a senha ou registrar valores. Ao sucesso, o estado de usuário/CSRF/cookie SHALL refletir a resposta; erros SHALL ser tratados de forma controlada (senha atual incorreta → mensagem uniforme; 401 → redireciona; 403 → tratado como CSRF/origem). Os inputs SHALL ser limpos após o fluxo.

#### Scenario: Troca bem-sucedida
- **WHEN** a senha atual está correta, a nova senha atende à política e a confirmação coincide
- **THEN** o CSRF em memória é atualizado com o da resposta e a sessão permanece válida

#### Scenario: Senha atual incorreta
- **WHEN** a senha atual está incorreta
- **THEN** a tela exibe uma mensagem genérica sem revelar detalhes

#### Scenario: Nova senha fora da política ou confirmação divergente
- **WHEN** a nova senha não atende aos requisitos ou a confirmação diverge
- **THEN** a submissão é bloqueada com validação local e nenhuma chamada é enviada

#### Scenario: Sem duplicação e inputs limpos
- **WHEN** a troca é submetida
- **THEN** submissões duplicadas são impedidas e os campos de senha são limpos após o fluxo

### Requirement: Logout
O frontend SHALL oferecer logout que exige CSRF em memória, não repete automaticamente, limpa o estado em memória ao sucesso e redireciona para `/login`. Se a resposta falhar por rede, o frontend SHALL tratar conscientemente (opção de limpar o estado local sem afirmar que a sessão do servidor foi revogada). Um 401 SHALL limpar o estado. O frontend SHALL NOT expor cookie ou token.

#### Scenario: Logout bem-sucedido
- **WHEN** o usuário confirma o logout com CSRF válido
- **THEN** o estado em memória é limpo e o usuário é redirecionado para `/login`

#### Scenario: Falha de rede no logout
- **WHEN** a chamada de logout falha por rede
- **THEN** o aplicativo oferece limpar o estado local sem afirmar que a sessão do servidor foi revogada

#### Scenario: 401 no logout
- **WHEN** o logout retorna 401
- **THEN** o estado em memória é limpo e o usuário é redirecionado para `/login`

### Requirement: Acessibilidade
A interface SHALL ser acessível: labels reais, `aria` apenas quando necessário, navegação por teclado, foco visível, foco movido após erro, mensagens com `aria-live`, contraste WCAG AA, tamanho de toque adequado, respeito à redução de movimento, skeletons sem layout shift, drawer/modal com focus trap, títulos de página e HTML semântico.

#### Scenario: Formulários e erros acessíveis
- **WHEN** um formulário exibe um erro
- **THEN** o erro é anunciado (ex.: `aria-live`) e o foco é movido para o campo/erro relevante

#### Scenario: Navegação por teclado e foco visível
- **WHEN** a interface é navegada por teclado
- **THEN** todos os controles são alcançáveis e o foco é visível

#### Scenario: Focus trap no drawer/modal
- **WHEN** o drawer mobile ou um modal está aberto
- **THEN** o foco fica contido, Escape fecha e o foco retorna ao elemento de origem ao fechar

#### Scenario: Redução de movimento e skeleton sem layout shift
- **WHEN** o usuário prefere reduzir movimento ou uma seção está carregando
- **THEN** as animações são reduzidas e o skeleton não causa layout shift

### Requirement: Segurança do frontend
O frontend SHALL NOT usar `dangerouslySetInnerHTML`, `eval` ou interpolação de HTML externo; SHALL NOT conter segredos em variáveis `VITE_*`; SHALL NOT armazenar tokens em storage; SHALL NOT logar respostas de autenticação; SHALL NOT exibir stacks; SHALL proteger contra open redirect; SHALL manter dependências mínimas e avaliar source maps públicos; SHALL ser compatível com a CSP de produção (tratada no deploy). O frontend SHALL NOT chamar Google Places diretamente.

#### Scenario: Sem tokens em storage ou logs
- **WHEN** a aplicação autentica ou executa mutações
- **THEN** nenhum token, senha ou CSRF é persistido em storage ou registrado em logs/console

#### Scenario: Sem segredos em variáveis públicas
- **WHEN** o frontend é configurado
- **THEN** nenhuma variável `VITE_*` contém segredo e `VITE_API_BASE_URL` não contém credenciais

#### Scenario: Sem injeção de HTML
- **WHEN** conteúdo dinâmico é renderizado
- **THEN** nenhum HTML externo é interpolado e nenhum `dangerouslySetInnerHTML` ou `eval` é usado

### Requirement: Estados de loading, erro e vazio
A interface SHALL fornecer estados explícitos de loading, erro e vazio em todas as telas relevantes (restauração de sessão, login, dashboard, troca de senha), sem flash de conteúdo protegido e sem exibir detalhes internos nos erros.

#### Scenario: Loading estável na restauração de sessão
- **WHEN** a sessão está sendo restaurada
- **THEN** um estado de loading estável é exibido e nenhum conteúdo protegido aparece antes da resolução

#### Scenario: Erro controlado em qualquer tela
- **WHEN** uma operação falha
- **THEN** a tela exibe um erro controlado e acionável (retry quando aplicável), sem detalhes internos
