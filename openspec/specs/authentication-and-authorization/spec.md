# authentication-and-authorization Specification

## Purpose
Private authentication and authorization for the single administrator of the leads generator: secure first-admin bootstrap, Argon2id password hashing, a single opaque server-side session per user, login/logout/me/change-password, an AuthGuard with role/status checks, a complete CSRF synchronizer-token flow, credentialed CORS for exact origins, and safe authentication errors.
## Requirements
### Requirement: Bootstrap do administrador inicial
O backend SHALL prover um comando seguro e interativo para criar o primeiro administrador. O comando MUST exigir um terminal (TTY), ler a senha sem eco, exigir confirmação, validar a política de senha e executar em uma transação com unicidade. A senha MUST NOT ser aceita por argumento de linha de comando nem por variável de ambiente comum; em ambiente não interativo, o comando SHALL falhar de forma segura. Uma interrupção (Ctrl+C) SHALL limpar buffers e encerrar a conexão corretamente. Se um administrador já existir, o comando SHALL falhar sem alterar dados, e nenhum usuário ou senha padrão SHALL existir nem ser embutido em migrations ou seed. O comando MUST NOT imprimir a senha, o hash ou o e-mail.

#### Scenario: Primeiro administrador criado com sucesso
- **WHEN** o comando é executado em um banco sem administrador e com e-mail/senha válidos
- **THEN** um usuário com role ADMIN e status ACTIVE é criado
- **AND** a saída não contém a senha, o hash nem o e-mail

#### Scenario: Recusa quando já existe administrador
- **WHEN** o comando é executado e já existe um administrador
- **THEN** o comando falha e não cria nem altera usuários

#### Scenario: Senha fora da política é rejeitada
- **WHEN** a senha informada não atende à política de comprimento
- **THEN** o comando falha e nenhum usuário é criado

#### Scenario: Sem usuário ou senha padrão
- **WHEN** o banco é inicializado com as migrations
- **THEN** nenhum usuário com credencial padrão ou conhecida é criado automaticamente

#### Scenario: Senha não aceita via argumento CLI ou variável de ambiente
- **WHEN** a senha é fornecida por argumento de linha de comando ou variável de ambiente comum
- **THEN** o comando a ignora ou falha, e não a usa para criar o usuário

#### Scenario: Falha segura em ambiente não interativo
- **WHEN** o comando é executado sem TTY
- **THEN** ele falha de forma segura e não cria usuário

#### Scenario: Interrupção limpa buffers e fecha conexão
- **WHEN** o comando é interrompido com Ctrl+C durante a entrada
- **THEN** os buffers de senha são limpos e a conexão é encerrada sem persistir dados

### Requirement: Política de senhas e hashing com Argon2id
O backend SHALL armazenar e verificar senhas exclusivamente com Argon2id, com parâmetros de memória, tempo e paralelismo definidos e configuráveis. A política de senha SHALL ser baseada em comprimento (mínimo e máximo), e MUST NOT usar SHA ou MD5 puros, bcrypt sem justificativa, criptografia reversível ou perguntas de segurança. A senha MUST NOT ser normalizada silenciosamente nem registrada em logs. Quando os parâmetros do Argon2id mudarem, o hash SHALL ser recalculado na próxima autenticação bem-sucedida. O hash MUST NOT ser retornado pela API.

#### Scenario: Hash gerado em formato Argon2id
- **WHEN** uma senha é armazenada
- **THEN** o valor persistido é um hash Argon2id
- **AND** a senha em texto claro não é armazenada

#### Scenario: Verificação correta e incorreta
- **WHEN** uma senha é verificada
- **THEN** a senha correta é aceita e a incorreta é rejeitada sem expor qual parte falhou

#### Scenario: Limites de comprimento
- **WHEN** uma senha é fornecida
- **THEN** senhas abaixo do mínimo ou acima do máximo são rejeitadas antes do hash

#### Scenario: Rehash quando os parâmetros mudam
- **WHEN** a autenticação é bem-sucedida e os parâmetros atuais diferem dos usados no hash armazenado
- **THEN** o hash é recalculado com os parâmetros atuais e persistido

#### Scenario: Hash nunca é retornado pela API
- **WHEN** qualquer resposta de autenticação ou de usuário é emitida
- **THEN** o `passwordHash` não aparece em nenhuma resposta

### Requirement: Login autenticado
O backend SHALL aceitar credenciais válidas em `POST /auth/login`, autenticar completamente o usuário antes de emitir qualquer cookie e retornar uma resposta uniforme para usuário inexistente, usuário inativo ou senha incorreta, impedindo enumeração por resposta. O login SHALL aplicar rate limit mais rígido que o global e exigir uma `Origin` exata autorizada (`Origin` ausente, `null`, malformada, semelhante/maliciosa ou não autorizada SHALL ser rejeitada com 403); um `Referer`, quando presente, SHALL concordar com a `Origin` e MUST NOT substituí-la quando a `Origin` estiver ausente. Para toda tentativa de credencial sintaticamente válida, o backend SHALL executar exatamente uma verificação Argon2id, verificando usuários inexistentes e inativos contra um hash dummy em memória gerado com os parâmetros atuais (mesma duração, sem revelar a existência do usuário); um hash armazenado malformado SHALL ser tratado como credencial inválida sem expor a causa. O backend SHALL adotar política de sessão única: o login bem-sucedido MUST revogar atomicamente as sessões anteriores do usuário e criar um novo token de sessão e um novo token CSRF, impedindo session fixation. A resposta de login bem-sucedida SHALL incluir o token CSRF no corpo e MUST NOT conter `passwordHash` ou o token de sessão.

#### Scenario: Login válido cria sessão única e emite cookie
- **WHEN** credenciais válidas de um usuário ACTIVE são enviadas com origem permitida
- **THEN** as sessões anteriores são revogadas, uma nova sessão é criada, um cookie é emitido e a resposta contém o token CSRF e os dados do usuário, sem hash ou token de sessão

#### Scenario: Resposta uniforme para falhas de autenticação
- **WHEN** o e-mail não existe, o usuário está inativo ou a senha está incorreta
- **THEN** a resposta é idêntica e genérica, sem indicar qual condição ocorreu

#### Scenario: Cookie não emitido em falha
- **WHEN** a autenticação falha
- **THEN** nenhum cookie de sessão é emitido

#### Scenario: Rate limit mais rígido que o global
- **WHEN** o endpoint de login excede o limite de autenticação
- **THEN** a resposta é 429 e não expõe detalhes internos

#### Scenario: Rotação previne session fixation
- **WHEN** um usuário faz login enquanto possui sessões ativas
- **THEN** as sessões anteriores são revogadas atomicamente e nenhuma sessão pré-existente é reaproveitada

#### Scenario: Validação de origem no login
- **WHEN** uma requisição de login vem de uma origem ou referer não esperado
- **THEN** o login é rejeitado

#### Scenario: Login exige Origin exata
- **WHEN** uma requisição de login não envia `Origin`, ou envia `null`, uma `Origin` malformada, semelhante/maliciosa ou fora da allowlist
- **THEN** o login é rejeitado com 403 e nenhum cookie é emitido
- **AND** um `Referer` presente não substitui uma `Origin` ausente

#### Scenario: Tentativa de login executa exatamente uma verificação Argon2
- **WHEN** uma tentativa de login sintaticamente válida é feita para e-mail inexistente, usuário inativo, senha incorreta ou senha correta
- **THEN** exatamente uma verificação Argon2id é executada por tentativa
- **AND** e-mails inexistentes e usuários inativos verificam contra um hash dummy em memória (mesma duração), sem revelar a existência do usuário

#### Scenario: Resposta sem hash nem token de sessão
- **WHEN** o login é bem-sucedido
- **THEN** a resposta não contém o `passwordHash` nem o token de sessão

### Requirement: Sessão opaca server-side
A sessão SHALL ser um token de sessão aleatório gerado com CSPRNG, enviado somente em cookie, com atributos definidos por ambiente. O banco SHALL armazenar apenas o hash do token de sessão e o hash do token CSRF, cada um com índice único. O token de sessão e o token CSRF SHALL usar domínios distintos e funções de hash com contexto separado, e MUST NOT ser derivados um do outro. A sessão SHALL ter expiração absoluta e expiração por inatividade, ser revogável imediatamente no logout e após troca de senha, e o token MUST NOT aparecer em URL, query, logs ou respostas JSON.

#### Scenario: Token somente em cookie; banco guarda apenas hashes
- **WHEN** uma sessão é criada
- **THEN** o token de sessão completo é entregue apenas no cookie
- **AND** o banco armazena apenas os hashes do token de sessão e do token CSRF

#### Scenario: Domínios distintos entre token de sessão e CSRF
- **WHEN** os hashes são calculados
- **THEN** o token de sessão e o token CSRF usam contextos/prefixos distintos e não são derivados um do outro

#### Scenario: Cookie com atributos por ambiente
- **WHEN** um cookie de sessão é emitido
- **THEN** ele é `HttpOnly`, com `Path=/` e `SameSite` justificado, e em produção é `Secure` com prefixo `__Host-`, sem `Domain`

#### Scenario: Expiração absoluta
- **WHEN** o tempo de vida absoluto da sessão é excedido
- **THEN** a sessão é tratada como inválida

#### Scenario: Expiração por inatividade
- **WHEN** a sessão fica sem uso por mais que o limite de inatividade
- **THEN** a sessão é tratada como inválida

#### Scenario: Revogação imediata
- **WHEN** o usuário faz logout ou altera a senha
- **THEN** as sessões afetadas são revogadas imediatamente

#### Scenario: Token nunca exposto
- **WHEN** uma sessão é usada ou uma resposta é emitida
- **THEN** o token completo não aparece em logs, respostas JSON, query ou URLs

### Requirement: Sessão atual e logout
O backend SHALL expor `GET /auth/me` retornando o usuário da sessão atual e renovando ou retornando o token CSRF, e `POST /auth/logout` revogando a sessão atual e limpando o cookie do ambiente atual. Ambas as respostas autenticadas SHALL usar `Cache-Control: no-store`. Logout MUST exigir sessão válida, uma `Origin` exata autorizada (um `Referer` presente SHALL concordar e MUST NOT substituir uma `Origin` ausente) e token CSRF válido. A rotação do token CSRF em `/auth/me` SHALL ser determinística sob concorrência, usando compare-and-set no hash atual: exatamente uma requisição concorrente persiste o novo hash e retorna 200 com token; a perdedora SHALL retornar 409 controlado sem token. Sem sessão válida, ambos SHALL retornar 401.

#### Scenario: me retorna o usuário e o token CSRF
- **WHEN** uma sessão válida de um usuário ACTIVE é apresentada
- **THEN** a resposta contém os dados do usuário e o token CSRF, com `Cache-Control: no-store`

#### Scenario: me sem sessão válida
- **WHEN** nenhum cookie de sessão válido é apresentado
- **THEN** a resposta é 401

#### Scenario: logout revoga e limpa o cookie do ambiente
- **WHEN** um usuário autenticado chama logout com CSRF e origem válidos
- **THEN** a sessão é revogada, o cookie do ambiente atual é limpo e a sessão deixa de ser aceita

#### Scenario: logout sem sessão
- **WHEN** logout é chamado sem sessão válida
- **THEN** a resposta é 401

#### Scenario: logout exige CSRF e origem
- **WHEN** logout é chamado sem token CSRF válido ou sem uma `Origin` exata autorizada
- **THEN** a operação é rejeitada (403)
- **AND** um `Referer` presente não substitui uma `Origin` ausente

#### Scenario: me com rotação determinística sob concorrência
- **WHEN** duas requisições `GET /auth/me` concorrentes usam a mesma sessão
- **THEN** exatamente uma retorna 200 com um token CSRF que funciona
- **AND** a perdedora retorna 409 controlado, sem token, e o banco guarda apenas o hash vencedor
- **AND** nenhum retry é feito que invalide o token já entregue pela vencedora

### Requirement: Autorização por guard
O backend SHALL proteger rotas privadas com um guard que exige sessão válida (deny by default) e que o usuário tenha role ADMIN e status ACTIVE. Sem sessão válida, a resposta SHALL ser 401; com sessão válida mas sem permissão, SHALL ser 403. O backend MUST NOT confiar em role, `userId` ou `ownerId` enviados pelo cliente. `GET /health` SHALL permanecer público.

#### Scenario: Rota privada sem sessão
- **WHEN** uma rota privada é chamada sem sessão válida
- **THEN** a resposta é 401 e não revela a rota ou internos

#### Scenario: Rota privada com sessão sem permissão
- **WHEN** uma sessão válida não possui a permissão necessária
- **THEN** a resposta é 403

#### Scenario: Usuário inativo não acessa rotas privadas
- **WHEN** a sessão pertence a um usuário com status inativo
- **THEN** o acesso é negado

#### Scenario: Identidade não é confiada ao cliente
- **WHEN** uma requisição tenta informar role, userId ou ownerId
- **THEN** o backend ignora e usa apenas o usuário autenticado do contexto

#### Scenario: health permanece público
- **WHEN** `GET /health` é chamado sem sessão
- **THEN** a resposta é 200

### Requirement: CORS com credenciais e cookies
O backend SHALL habilitar `credentials: true` no CORS somente para origens exatas autorizadas, MUST NOT combinar credenciais com wildcard e SHALL permitir o header `X-CSRF-Token` somente para origens autorizadas. O cookie de sessão SHALL ser destinado apenas à API. O backend SHALL emitir somente o cookie do ambiente atual, MUST NOT emitir os dois cookies simultaneamente e MUST NOT aceitar um cookie com nome de outro ambiente. Requisições sem header `Origin` SHALL ter comportamento explícito e documentado, e em produção o uso de cookies SHALL exigir HTTPS.

#### Scenario: Origem autorizada recebe credenciais
- **WHEN** uma origem exata autorizada faz uma requisição autenticada
- **THEN** a resposta inclui `Access-Control-Allow-Credentials: true` e o cookie é processado

#### Scenario: Wildcard nunca combinado com credenciais
- **WHEN** o CORS é configurado
- **THEN** a allowlist nunca usa wildcard em conjunto com `credentials: true`

#### Scenario: Header X-CSRF-Token permitido somente para origens autorizadas
- **WHEN** uma origem autorizada envia o header `X-CSRF-Token`
- **THEN** o header é aceito pelo CORS
- **AND** uma origem não autorizada não recebe permissão de leitura via CORS

#### Scenario: Sem Origin, comportamento explícito
- **WHEN** uma requisição sem header `Origin` é recebida em um endpoint de leitura (`GET /health`, `GET /auth/me`)
- **THEN** o comportamento é explícito e documentado, o CORS não é tratado como autenticação
- **AND** as mutações de autenticação (`login`, `logout`, `change-password`) SHALL exigir uma `Origin` exata autorizada, com 403 quando ausente

#### Scenario: Nunca emite os dois cookies simultaneamente
- **WHEN** uma resposta é emitida
- **THEN** somente o cookie do ambiente atual é definido, nunca os dois

#### Scenario: Não aceita cookie de outro ambiente
- **WHEN** um cookie com o nome de outro ambiente é apresentado
- **THEN** ele é ignorado e não autentica

### Requirement: Proteção CSRF
Operações mutáveis autenticadas por cookie SHALL ser protegidas contra CSRF com um synchronizer token vinculado à sessão, e o `SameSite` não SHALL ser apresentado como única defesa. O token CSRF SHALL ser gerado com CSPRNG, armazenado apenas como hash (com contexto distinto do token de sessão), comparado de forma segura, entregue ao frontend somente no corpo de `POST /auth/login` e `GET /auth/me`, mantido apenas em memória no frontend e enviado no header `X-CSRF-Token` nas mutações protegidas. O token SHALL ser rotacionado no login, na rotação da sessão e na troca de senha. Respostas de login e `me` SHALL usar `Cache-Control: no-store`. O token MUST NOT aparecer em URL, query, logs ou mensagens de erro, e uma origem maliciosa MUST NOT ler o token via CORS.

#### Scenario: Operação mutável sem token CSRF válido
- **WHEN** uma operação mutável autenticada por cookie é enviada sem token CSRF válido
- **THEN** a resposta é 403

#### Scenario: Operação mutável com token CSRF válido
- **WHEN** uma operação mutável é enviada com token CSRF válido vinculado à sessão
- **THEN** a operação é processada

#### Scenario: Token de outra sessão rejeitado
- **WHEN** o token CSRF apresentado pertence a outra sessão
- **THEN** a operação é rejeitada

#### Scenario: Token antigo após rotação rejeitado
- **WHEN** o token CSRF usado foi emitido para uma sessão já rotacionada
- **THEN** a operação é rejeitada

#### Scenario: Token rotacionado no login e na troca de senha
- **WHEN** um login ou uma troca de senha cria um novo token de sessão
- **THEN** um novo token CSRF é gerado e o anterior deixa de ser aceito

#### Scenario: Concorrência durante rotação
- **WHEN** requisições concorrentes usam o token CSRF antigo durante uma rotação
- **THEN** o token antigo não é aceito e as requisições são rejeitadas ou re-autenticadas de forma segura
- **AND** a rotação de `/auth/me` usa compare-and-set: sob concorrência, exatamente uma requisição persiste o novo hash e retorna 200, e a perdedora retorna 409 sem token

#### Scenario: Token não exposto em URL, query, logs ou erros
- **WHEN** uma operação CSRF falha
- **THEN** o token não aparece em URLs, query, logs ou mensagens de erro

#### Scenario: Login e me retornam token CSRF com no-store
- **WHEN** `POST /auth/login` ou `GET /auth/me` respondem com sucesso
- **THEN** o token CSRF está no corpo e a resposta usa `Cache-Control: no-store`

### Requirement: Troca de senha
O backend SHALL aceitar `POST /auth/change-password` somente com sessão válida, senha atual correta, token CSRF válido e `Origin`/`Referer` permitida, validar a nova senha, atualizar `passwordChangedAt` e revogar todas as sessões do usuário. O backend SHALL decidir explicitamente sobre a sessão atual: mantê-la e rotacioná-la (criando novo token de sessão e novo token CSRF) ou encerrá-la. Sessões criadas antes da troca SHALL ser invalidadas. A resposta SHALL ser genérica, sem conter senha, e a operação SHALL estar sujeita a rate limit e CSRF.

#### Scenario: Troca com senha atual correta
- **WHEN** a senha atual está correta, a nova senha atende à política e o CSRF/origem são válidos
- **THEN** a senha é alterada, `passwordChangedAt` é atualizado e a resposta é genérica

#### Scenario: Senha atual incorreta
- **WHEN** a senha atual está incorreta
- **THEN** a troca é rejeitada com resposta genérica

#### Scenario: Nova senha fora da política
- **WHEN** a nova senha não atende à política
- **THEN** a troca é rejeitada com erro de validação

#### Scenario: Todas as sessões revogadas e decisão sobre a sessão atual
- **WHEN** a senha é alterada
- **THEN** todas as demais sessões são revogadas
- **AND** a sessão atual é mantida e rotacionada ou encerrada conforme a decisão explícita

#### Scenario: Sessão anterior à troca invalidada
- **WHEN** uma sessão criada antes da troca é usada depois dela
- **THEN** a sessão é rejeitada

#### Scenario: Troca exige CSRF e origem
- **WHEN** a troca é chamada sem token CSRF válido ou com origem não permitida
- **THEN** a operação é rejeitada

#### Scenario: Resposta genérica sem senha
- **WHEN** a troca é bem-sucedida ou falha
- **THEN** a resposta não contém a senha, o hash nem detalhes internos

### Requirement: Expiração e atividade da sessão
O backend SHALL aplicar expiração absoluta (nunca prolongada) e expiração por inatividade, verificadas a cada autenticação, com valores configuráveis e limites seguros. O campo `lastUsedAt` SHALL ser atualizado de forma atômica somente quando ultrapassar um intervalo controlado, evitando escrita no banco a cada requisição. Uma sessão revogada ou expirada SHALL nunca ser reativada, e uma sessão cujo `createdAt` seja anterior ao `passwordChangedAt` do usuário SHALL ser inválida. As datas SHALL ser em UTC, com relógio centralizado e injetável para testes.

#### Scenario: Expiração absoluta no limite exato
- **WHEN** o tempo de vida absoluto é atingido
- **THEN** a sessão é invalidada e a expiração nunca é prolongada

#### Scenario: Expiração por inatividade
- **WHEN** o tempo sem uso excede o limite de inatividade
- **THEN** a sessão é invalidada

#### Scenario: lastUsedAt atualizado somente após o intervalo
- **WHEN** uma sessão ativa é usada antes de decorrido o intervalo
- **THEN** `lastUsedAt` não é atualizado; após o intervalo, é atualizado atomicamente

#### Scenario: Sessão revogada ou expirada não é reativada
- **WHEN** uma sessão revogada ou expirada é apresentada novamente
- **THEN** ela permanece inválida e não é reativada

#### Scenario: Sessão anterior à troca de senha é inválida
- **WHEN** `createdAt` da sessão é anterior ao `passwordChangedAt` do usuário
- **THEN** a sessão é inválida

#### Scenario: Concorrência não prolonga nem reativa indevidamente
- **WHEN** requisições concorrentes usam a mesma sessão
- **THEN** a expiração e a revogação são avaliadas de forma consistente, sem reativação ou extensão incorreta

### Requirement: Erros seguros de autenticação
Os erros de autenticação SHALL usar o envelope de erro existente com status 400, 401, 403, 409, 429 ou 500 conforme apropriado. As respostas MUST NOT conter stack, erro do Prisma, nome de tabela, SQL, hash, token, cookie ou indicação da existência do usuário. Quando o banco de dados estiver indisponível em runtime, a resposta SHALL ser 500 genérico.

#### Scenario: 401 sem sessão
- **WHEN** uma rota protegida é chamada sem sessão
- **THEN** a resposta é 401 no envelope existente

#### Scenario: 403 sem permissão
- **WHEN** a sessão não possui a permissão necessária
- **THEN** a resposta é 403 no envelope existente

#### Scenario: 409 quando apropriado
- **WHEN** uma ação exige um estado não satisfeito (por exemplo, bootstrap já realizado)
- **THEN** a resposta é 409 no envelope existente

#### Scenario: 429 por rate limit de autenticação
- **WHEN** um endpoint de autenticação excede o limite
- **THEN** a resposta é 429 no envelope existente

#### Scenario: Banco indisponível em runtime retorna 500 genérico
- **WHEN** o banco está indisponível durante uma operação de autenticação após o boot
- **THEN** a resposta é 500 genérico, sem detalhes internos

### Requirement: Persistência e modelo de dados
O backend SHALL persistir `User` e `Session` com IDs não sequenciais, enums mínimos (`ADMIN`; `ACTIVE`/`INACTIVE`), e-mail com índice único, `tokenHash` e `csrfTokenHash` com índices únicos e timestamps. A mudança MUST NOT excluir fisicamente usuários. A relação usuário–sessões SHALL suportar revogação segura, e a criação de uma nova sessão após revogar as anteriores SHALL ocorrer em transação. Os hashes de token de sessão e de CSRF SHALL usar prefixos/contextos distintos, e tokens nunca SHALL ser armazenados em texto claro. As migrations SHALL ser versionadas e não destrutivas, o Prisma Studio SHALL permanecer não exposto e o PostgreSQL SHALL continuar sem exposição pública.

#### Scenario: E-mail com índice único
- **WHEN** dois usuários são criados com o mesmo e-mail
- **THEN** o segundo é rejeitado por violação de unicidade

#### Scenario: tokenHash com índice único
- **WHEN** duas sessões são criadas com o mesmo `tokenHash`
- **THEN** a segunda é rejeitada por violação de unicidade

#### Scenario: csrfTokenHash com índice único
- **WHEN** duas sessões são criadas com o mesmo `csrfTokenHash`
- **THEN** a segunda é rejeitada por violação de unicidade

#### Scenario: Migrações não destrutivas
- **WHEN** novas migrations são aplicadas
- **THEN** nenhuma migration destrói dados existentes

#### Scenario: Relação usuário–sessões segura sem exclusão física
- **WHEN** um usuário é desativado ou removido logicamente
- **THEN** as sessões associadas são revogadas ou impedidas de autenticar, e nenhum usuário é excluído fisicamente

#### Scenario: Transação revoga anterior e cria nova
- **WHEN** um login cria uma nova sessão com política de sessão única
- **THEN** a revogação das sessões anteriores e a criação da nova ocorrem na mesma transação

### Requirement: Concorrência e garantia de sessão única
O backend SHALL garantir que, mesmo sob logins concorrentes, exista no máximo uma sessão não revogada por usuário. A revogação das sessões anteriores do usuário (incluindo sessões expiradas ainda não revogadas) e a criação da nova sessão SHALL ocorrer na mesma transação. Um conflito de unicidade decorrente da concorrência SHALL ser tratado de forma controlada — retry limitado e seguro ou erro genérico — e MUST NOT revelar detalhes internos do banco, como o nome do índice ou erro do Prisma. A troca de senha SHALL aplicar a mesma garantia ao revogar as demais sessões e rotacionar a sessão atual.

#### Scenario: Dois logins válidos simultâneos
- **WHEN** dois logins válidos do mesmo usuário ocorrem ao mesmo tempo
- **THEN** ambos são processados de forma segura e o resultado final mantém a garantia de sessão única

#### Scenario: No máximo uma sessão não revogada após a concorrência
- **WHEN** a concorrência de logins termina
- **THEN** existe no máximo uma sessão não revogada para o usuário

#### Scenario: Apenas um cookie final permanece válido
- **WHEN** dois logins concorrentes são concluídos
- **THEN** apenas o cookie da sessão sobrevivente permanece válido, e o cookie da sessão revogada deixa de autenticar

#### Scenario: Conflito do banco não revela detalhes internos
- **WHEN** uma transação perde a corrida de unicidade
- **THEN** a resposta é genérica (erro controlado) e não contém erro do Prisma, nome de índice, tabela ou SQL

#### Scenario: Troca de senha concorrente com outra requisição
- **WHEN** uma troca de senha ocorre em paralelo com outra requisição autenticada
- **THEN** após a troca, todas as sessões anteriores são invalidadas e a garantia de sessão única é mantida para a sessão atual rotacionada

#### Scenario: Sessão expirada não impede nova sessão após revogação transacional
- **WHEN** um usuário possui uma sessão expirada ainda não revogada e faz login
- **THEN** a sessão expirada é revogada na mesma transação e a nova sessão é criada com sucesso

### Requirement: Configuração de autenticação
O backend SHALL tratar `DATABASE_URL` como obrigatória quando o módulo de persistência for integrado; a ausência ou um valor inválido SHALL bloquear o boot sem imprimir o valor. Uma configuração de cookie não `Secure` em produção SHALL ser rejeitada no boot. Os valores de expiração absoluta, inatividade e intervalo de `lastUsedAt` SHALL ter limites seguros e serem validados no boot.

#### Scenario: DATABASE_URL ausente bloqueia o boot
- **WHEN** `DATABASE_URL` está ausente ou inválida e o módulo de persistência está integrado
- **THEN** o boot falha antes de aceitar tráfego, sem imprimir o valor

#### Scenario: Cookie não Secure em produção é rejeitado
- **WHEN** a configuração tenta emitir cookie sem `Secure` em produção
- **THEN** o boot é rejeitado

#### Scenario: Valores de expiração fora dos limites são rejeitados
- **WHEN** expiração absoluta, inatividade ou intervalo de `lastUsedAt` estão fora dos limites seguros
- **THEN** o boot é rejeitado sem imprimir os valores

