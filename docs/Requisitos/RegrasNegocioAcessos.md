# Regras de Negócio de Acesso - DataPlate

Este documento define quem pode fazer o quê no DataPlate. Ele cria o perfil **Gerente** e separa a administração do **sistema** (Administrador) da gestão do **negócio** (Gerente). Os módulos e as operações seguem o que existe hoje no código. Itens marcados como *(funcionalidade futura)* ainda não estão implementados e entram como regra para orientar o desenvolvimento.

Os códigos seguem o padrão `RN-ACnn` (Regra de Negócio - Acesso). A dezena indica a seção (RN-AC0x = princípios, RN-AC1x = autenticação, RN-AC2x = usuários, RN-AC3x = operações, RN-AC4x = operações sensíveis, RN-AC5x = dados restritos, RN-AC6x = rastreabilidade). Os saltos na numeração são intencionais.

**Operação sensível**, sempre que citada neste documento, é qualquer operação marcada com **\*** na matriz, qualquer operação da seção 5 (gestão de usuários) e qualquer operação da seção 7.

# 1. Perfis de acesso

| Perfil | Código no sistema | Responsabilidade | Tela inicial | Telas permitidas |
|---|---|---|---|---|
| Administrador | `ADMIN` | Administrar o sistema: usuários e perfis, dados do restaurante, integrações, notificações, parâmetros técnicos e auditoria. Não executa operação diária e não toma decisões gerenciais. Lê dashboard, relatórios consolidados, histórico de vendas e a lista resumida de funcionários. | `adm.html` (área de sistema) | `adm.html` |
| Gerente | `GERENTE` *(novo)* | Gerir o negócio: cardápio, preços, categorias, estoque, ficha técnica, fornecedores, funcionários, clientes, mesas, reservas, QR Code, parâmetros do negócio e relatórios completos. Autoriza operações sensíveis. Gerencia usuários de perfis operacionais. Executa as operações operacionais da matriz, sujeito à RN-AC48. | `adm.html` (área de gestão) | `adm.html`, `pdv.html`, `atendente.html`, `cozinha.html` |
| Atendente | `FUNCIONARIO` | Atender o salão: consultar mesas e pedidos, lançar pedidos, servir pedidos prontos, alterar o status da mesa, registrar e cancelar reservas e solicitar o fechamento da conta. | `atendente.html` | `atendente.html` |
| Caixa (PDV) | `CAIXA` | Registrar vendas de balcão, lançar pedidos de mesa, receber pagamentos, fechar contas de mesa, aplicar desconto dentro do limite, cadastrar ou vincular cliente à venda e consultar reservas (sem dados pessoais). | `pdv.html` | `pdv.html` |
| Cozinha | `COZINHA` | Acompanhar a fila de produção e atualizar o status de preparo dos pedidos. | `cozinha.html` | `cozinha.html` |
| Cliente | sem conta (anônimo) | Consultar o cardápio, fazer pedido para a mesa identificada pelo QR Code e acompanhar o próprio pedido. | `user.html` | `user.html` |

# 2. Princípios gerais

## RN-AC01 - Menor privilégio
- **Descrição:** Cada perfil recebe apenas as permissões necessárias para sua função, conforme a matriz da seção 3.
- **Perfis:** Todos.
- **Condição/Exceção:** O Gerente reúne as permissões dos perfis operacionais para poder cobrir ausências e conferir operações.
- **Comportamento do sistema:** Toda permissão não listada na matriz é considerada inexistente.

## RN-AC02 - Negação por padrão
- **Descrição:** Todo endpoint da API exige autenticação e um perfil autorizado, salvo os endpoints públicos listados na RN-AC07.
- **Perfis:** Todos.
- **Condição/Exceção:** Endpoints públicos da RN-AC07.
- **Comportamento do sistema:** Requisição sem token ou com token inválido/expirado retorna HTTP 401. Usuário autenticado sem permissão retorna HTTP 403 com a mensagem "Acesso negado". Uma negação de operação sensível (definição na introdução) é registrada em log (RN-AC60).

## RN-AC03 - Validação no backend
- **Descrição:** A autorização é sempre validada no backend. Ocultar menus e botões no frontend serve apenas à usabilidade e não substitui essa validação.
- **Perfis:** Todos.
- **Condição/Exceção:** Nenhuma.
- **Comportamento do sistema:** O perfil é lido do banco de dados a cada requisição, e não do token nem do `sessionStorage`. Alterar a sessão no navegador não concede acesso.

## RN-AC04 - Um perfil por usuário
- **Descrição:** Cada usuário possui exatamente um perfil. O CPF é único na tabela `usuarios`.
- **Perfis:** Todos os perfis com conta.
- **Condição/Exceção:** Como o CPF é único, uma pessoa que exerça mais de uma função recebe o perfil que cobre todas elas. O Gerente, por exemplo, cobre Atendente, Caixa e Cozinha. Não se acumulam os perfis Administrador e Gerente no mesmo usuário. Quando o proprietário exerce os dois papéis, ele fica com o perfil Gerente, e a conta Administrador pertence a outra pessoa ou ao suporte técnico (exceção da RN-AC26).
- **Comportamento do sistema:** O campo `role` aceita somente `ADMIN`, `GERENTE`, `FUNCIONARIO`, `CAIXA` e `COZINHA`. Outro valor é rejeitado com HTTP 422 na API e pela restrição CHECK no banco.

## RN-AC05 - Usuário inativo não acessa
- **Descrição:** Um usuário com `ativo = false` não pode autenticar nem usar tokens emitidos antes da inativação.
- **Perfis:** Todos os perfis com conta.
- **Condição/Exceção:** Nenhuma.
- **Comportamento do sistema:** O login é recusado com a mensagem genérica de credenciais inválidas. As requisições com tokens existentes retornam HTTP 401 ("Usuário inativo"). O refresh e a recuperação de senha também são recusados.

## RN-AC06 - Perfil desconhecido não acessa
- **Descrição:** Um perfil não previsto nesta especificação não recebe acesso a nenhuma tela.
- **Perfis:** Todos.
- **Condição/Exceção:** Nenhuma.
- **Comportamento do sistema:** O frontend encerra a sessão e volta ao login. Não existe perfil "padrão" de fallback.

## RN-AC07 - Endpoints públicos
- **Descrição:** Somente estes recursos podem ser acessados sem autenticação:
  - login, refresh e recuperação de senha;
  - consulta do cardápio (`GET /api/produtos`, `GET /api/produtos/{id}`, `GET /api/categorias`), apenas para itens ativos;
  - resolução de mesa por token (`GET /api/mesas/por-token/{token}`);
  - criação de pedido pelo cliente, nas condições da RN-AC36;
  - acompanhamento do próprio pedido e canal de tempo real do cliente, autenticados pelo token do pedido (RN-AC37);
  - dados públicos do restaurante (nome, contato e endereço);
  - consulta de CEP;
  - health check (`/actuator/health`), sem detalhes internos.

  O `/actuator/health/db`, que consulta o banco, é restrito ao Administrador.
- **Perfis:** Cliente e visitantes.
- **Condição/Exceção:** Qualquer outro recurso exige autenticação.
- **Comportamento do sistema:** Os endpoints públicos não devolvem dados pessoais nem financeiros internos, como custo, CPF, salário ou faturamento.

# 3. Matriz de permissões

Legenda: **C** criar, **L** ler, **A** alterar, **E** excluir, **I** inativar, **X** cancelar, **—** sem acesso, **\*** somente com autorização do Gerente (RN-AC40). As notas numeradas ficam abaixo da tabela.

| Módulo / Operação | Administrador | Gerente | Atendente | Caixa | Cozinha | Cliente |
|---|---|---|---|---|---|---|
| **Sistema** | | | | | | |
| Usuários e perfis | C L A I E | C L A I (1) | — | — | — | — |
| Própria conta (senha, e-mail) *(funcionalidade futura)* | L A | L A | L A | L A | L A | — |
| Dados do restaurante | L A | L | — | — | — | L (2) |
| Integrações e notificações (14) | C L A E | L | — | — | — | — |
| Parâmetros técnicos *(funcionalidade futura)* | C L A E | — | — | — | — | — |
| Logs de auditoria *(funcionalidade futura)* | L | L (3) | — | — | — | — |
| **Cadastros do negócio** | | | | | | |
| Categorias | L | C L A I (15) | L | L | L | L |
| Produtos e preços | L | C L A I E | L | L | L (16) | L (4) |
| Ficha técnica (produto x insumo) | — | C L A E | — | — | L | — |
| Insumos e estoque | — | C L A E | — | — | L (5) | — |
| Fornecedores | — | C L A E | — | — | — | — |
| Funcionários | C L A (6) | C L A I (17) | — | — | — | — |
| Clientes | — | C L A E | — | C L A | — | — |
| Parâmetros do negócio (limite de desconto, prazo de estorno, tolerância de caixa) *(funcionalidade futura)* | L | C L A | — | — | — | — |
| **Salão** | | | | | | |
| Mesas: cadastro (número, capacidade, localização) | — | C L A E | L | L | — | — |
| Mesas: status (18) | — | L A | L A | L A | — | — |
| Reservas | — | C L A X | C L A X | L (19) | — | — |
| QR Code da mesa (gerar/regenerar) | — | C L | — | — | — | L (7) |
| **Pedidos** | | | | | | |
| Lançar pedido de mesa | — | C | C | C | — | C (8) |
| Consultar pedidos ativos e da mesa | — | L | L | L | L (9) | L (10) |
| Atualizar preparo (RECEBIDO, EM_PREPARO, PRONTO) (20) | — | A | — | A (11) | A | — |
| Servir pedido (PRONTO para SERVIDO) | — | A | A | — | — | — |
| Marcar pedido urgente (21) | — | A | A | — | L | — |
| Checklist operacional da cozinha (21) | — | L | — | — | C L A | — |
| Cancelar pedido/item antes do preparo | — | X | X | X | — | — |
| Cancelar pedido/item já em preparo, pronto ou servido | — | X | X\* | X\* | — | — |
| **Caixa e pagamentos** | | | | | | |
| Venda de balcão (PDV) | — | C | — | C | — | — |
| Desconto até o limite | — | C | — | C | — | — |
| Desconto acima do limite | — | C (22) | — | C\* | — | — |
| Receber pagamento / fechar conta | — | C | — | C | — | — |
| Solicitar fechamento de conta | — | A | A | — | — | — |
| Reabrir conta fechada *(funcionalidade futura)* | — | A (22) | — | A\* | — | — |
| Estorno de venda paga *(funcionalidade futura)* | — | C (22) | — | C\* | — | — |
| Abertura, fechamento, sangria e suprimento de caixa *(funcionalidade futura)* | — | C L | — | C L (12) | — | — |
| Histórico de vendas | L | L | — | L (12) | — | — |
| **Gestão** | | | | | | |
| Dashboard (KPIs, faturamento, ticket médio) | L | L | — | — | — | — |
| Relatórios (vendas, financeiro, cardápio, operacional) | L (13) | L | — | — | — | — |
| Cancelamentos e pagamentos (histórico e totais) | L | L | — | — | — | — |
| Exportação (Excel, PDF, CSV) | L (13) | L | — | — | — | — |
| Tempo real (WebSocket de pedidos) | — | L | L | L | L (9) | L (10) |

Notas:
1. O Gerente cria, lê, altera e inativa apenas usuários de perfis operacionais (`FUNCIONARIO`, `CAIXA`, `COZINHA`). Não exclui. Ver RN-AC22.
2. Somente nome, contato e endereço. O CNPJ e os parâmetros internos não são públicos.
3. Apenas eventos de operação do negócio (cancelamentos, descontos, estornos, preços e pagamentos). Os eventos de gestão de usuários e de configuração são exclusivos do Administrador.
4. Somente produtos ativos, sem custo nem ficha técnica.
5. Quantidade em estoque e estoque mínimo, sem custo unitário e sem fornecedor.
6. Leitura: somente nome, cargo e situação, para vincular funcionário a usuário, sem CPF, telefone ou salário. Criação e alteração: somente do registro de funcionário vinculado a um usuário `GERENTE` (RN-AC28, RN-AC29).
7. O cliente apenas resolve a mesa a partir do token lido no QR Code. Não pode obter o token de outra mesa.
8. Somente para a mesa do QR Code lido, sem desconto, sem venda de balcão e sem vínculo de cliente cadastrado (RN-AC36).
9. A cozinha recebe a fila com itens, quantidades, observações, mesa e status, sem valores e sem dados do cliente.
10. O cliente recebe apenas o próprio pedido (RN-AC37).
11. Somente para marcar como PRONTO um pedido que não contém itens de preparo (`tempo_preparo = 0`), como ocorre hoje no PDV.
12. O Caixa vê apenas as vendas e movimentações do próprio turno e caixa. Depende da RN-AC45 *(funcionalidade futura)* e do registro do operador no pedido; hoje o pedido não guarda operador e o PDV lista as vendas de todos.
13. Somente dados consolidados: custo e margem aparecem apenas como totais, sem acesso aos cadastros de insumos e ficha técnica. Não exporta listas com dados pessoais (clientes, funcionários).
14. Hoje o módulo existe apenas no frontend, gravado em `localStorage` (`adm.js:4723`), sem API. A autorização no backend e a auditoria exigem criar os endpoints antes *(funcionalidade futura)*.
15. A alteração de categoria é *(funcionalidade futura)*: `routers/categorias.py` não tem PUT. A exclusão atual (`DELETE`) inativa a categoria.
16. Somente nome, categoria, tempo de preparo e ficha técnica, sem preço.
17. O Gerente não altera o próprio registro de funcionário nem o de funcionários vinculados a usuários `ADMIN` ou `GERENTE` (RN-AC28).
18. Valores: `livre`, `reservada`, `ocupada`, `manutencao` e `aguardando_pagamento`. Hoje o backend aceita qualquer outro texto (`mesas.py` `_normalize_status`).
19. Somente mesa, data e horário, sem nome e telefone.
20. Inclui o KDS "Cozinha" dentro do `adm.html` (`adm.js:4226`), restrito ao Gerente.
21. Hoje gravado apenas em `localStorage` (`adm.js:2293`, `cozinha.js`), sem API. A versão no backend é *(funcionalidade futura)*.
22. Sujeito à segregação de funções (RN-AC48).

# 4. Autenticação e sessão

## RN-AC10 - Login
- **Descrição:** O login é feito com CPF e senha. Em caso de sucesso, o sistema emite um access token e um refresh token (JWT) e informa o perfil do usuário.
- **Perfis:** Todos os perfis com conta.
- **Condição/Exceção:** Usuário inativo (RN-AC05).
- **Comportamento do sistema:** Uma falha de login devolve sempre a mesma mensagem genérica, sem indicar se o CPF existe. A partir de 5 falhas consecutivas para o mesmo CPF ou IP, novas tentativas ficam bloqueadas por 15 minutos e o evento é registrado em log *(funcionalidade futura)*.

## RN-AC11 - Redirecionamento por perfil
- **Descrição:** Após o login, o usuário é enviado à tela inicial do seu perfil e só abre as telas permitidas, conforme a seção 1.
- **Perfis:** Todos os perfis com conta.
- **Condição/Exceção:** Perfil desconhecido (RN-AC06). O Gerente acessa, além de `adm.html`, as telas `pdv.html`, `atendente.html` e `cozinha.html`.
- **Comportamento do sistema:** Cada tela confere o perfil ao carregar. Se a tela não está entre as permitidas ao perfil, o usuário é redirecionado à própria tela inicial. O Caixa não acessa `adm.html`, e o botão "voltar" do PDV leva ao logout ou ao próprio PDV.

## RN-AC12 - Validade e renovação de tokens
- **Descrição:** O access token vale 24 horas e o refresh token vale 7 dias (`jwt_expiration_ms` e `jwt_refresh_expiration_ms` em `core/config.py`). A renovação é feita pelo endpoint de refresh.
- **Perfis:** Todos os perfis com conta.
- **Condição/Exceção:** O refresh é recusado para usuário inativo ou inexistente.
- **Comportamento do sistema:** Um token expirado retorna HTTP 401, e o frontend tenta o refresh uma única vez antes de encerrar a sessão *(funcionalidade futura)*.

## RN-AC13 - Logout
- **Descrição:** O logout encerra a sessão no dispositivo.
- **Perfis:** Todos os perfis com conta.
- **Condição/Exceção:** Nenhuma.
- **Comportamento do sistema:** O frontend descarta os tokens. O backend passa a recusar o refresh token usado no logout, por meio de uma lista de revogação *(funcionalidade futura)*.

## RN-AC14 - Alteração de perfil ou senha produz efeito imediato
- **Descrição:** Mudanças de perfil, inativação ou troca de senha valem já na requisição seguinte.
- **Perfis:** Todos os perfis com conta.
- **Condição/Exceção:** Nenhuma.
- **Comportamento do sistema:** O perfil é relido do banco a cada requisição. Uma troca de senha invalida os refresh tokens anteriores do usuário *(funcionalidade futura)*.

## RN-AC15 - Recuperação de senha
- **Descrição:** A senha é redefinida com um código de 6 dígitos enviado ao e-mail cadastrado. O código expira em 10 minutos, aceita no máximo 3 tentativas e só pode ser usado uma vez. A nova senha tem entre 8 e 72 caracteres.
- **Perfis:** Todos os perfis com conta.
- **Condição/Exceção:** Usuário inativo ou sem e-mail cadastrado não recupera a senha e deve procurar o Administrador ou o Gerente (RN-AC22).
- **Comportamento do sistema:** A etapa de identificação responde da mesma forma para CPF existente e inexistente, sem revelar se o CPF está cadastrado. O código de depuração (`debugCode`) fica desabilitado em produção. As solicitações são limitadas por CPF e por IP *(funcionalidade futura)*.

## RN-AC16 - Credenciais padrão
- **Descrição:** O usuário administrador criado automaticamente (seed) e os usuários de teste servem apenas para desenvolvimento.
- **Perfis:** Administrador.
- **Condição/Exceção:** Ambiente de desenvolvimento local.
- **Comportamento do sistema:** Em produção, `DEFAULT_ADMIN_ENABLED` e `DEFAULT_TEST_USERS_ENABLED` ficam desligados. Se o administrador padrão existir, a troca de senha é obrigatória no primeiro acesso *(funcionalidade futura)*.

## RN-AC17 - Modo demonstração
- **Descrição:** O modo demonstração (perfis fixos no frontend, sem backend) não concede acesso a dados reais.
- **Perfis:** Todos.
- **Condição/Exceção:** Apresentações.
- **Comportamento do sistema:** Uma sessão sem token não consegue chamar a API, que retorna HTTP 401 (RN-AC02). O modal "Trocar usuário" exige um novo login com senha.

# 5. Gestão de usuários

## RN-AC20 - Proibição de auto-cadastro com perfil
- **Descrição:** Ninguém cria a própria conta escolhendo o perfil. Os usuários são criados apenas pelo Administrador ou, para perfis operacionais, pelo Gerente.
- **Perfis:** Administrador, Gerente.
- **Condição/Exceção:** Nenhuma.
- **Comportamento do sistema:** O endpoint público de cadastro (`POST /api/auth/register`) é removido ou passa a exigir o perfil Administrador. Uma tentativa sem autorização retorna HTTP 401/403 e é registrada em log.

## RN-AC21 - Administrador gerencia todos os perfis
- **Descrição:** O Administrador cria, edita, altera o perfil, ativa/inativa e exclui usuários de qualquer perfil.
- **Perfis:** Administrador.
- **Condição/Exceção:** RN-AC23, RN-AC24, RN-AC25 e RN-AC27. Ativar/inativar é *(funcionalidade futura)*: hoje não há endpoint para isso.
- **Comportamento do sistema:** Toda alteração é registrada em log com os valores anteriores e os novos (RN-AC60).

## RN-AC22 - Gerente gerencia apenas perfis operacionais
- **Descrição:** O Gerente pode, para usuários dos perfis `FUNCIONARIO`, `CAIXA` e `COZINHA`:
  - listar;
  - criar;
  - editar dados cadastrais e o vínculo com funcionário;
  - trocar o perfil entre os perfis operacionais;
  - redefinir a senha (RN-AC27);
  - ativar e inativar *(funcionalidade futura)*.
- **Perfis:** Gerente.
- **Condição/Exceção:** O Gerente não cria, edita, inativa nem exclui usuários `ADMIN` ou `GERENTE`, não atribui esses perfis a ninguém e não exclui usuários (somente inativa).
- **Comportamento do sistema:** Uma tentativa fora dessas condições retorna HTTP 403 e é registrada em log. Na listagem do Gerente não aparecem usuários `ADMIN` nem `GERENTE`.

## RN-AC23 - Não alterar o próprio perfil nem a própria situação
- **Descrição:** Nenhum usuário altera o próprio perfil, inativa a si mesmo ou exclui a si mesmo.
- **Perfis:** Todos os perfis com conta.
- **Condição/Exceção:** Cada usuário pode alterar a própria senha e o próprio e-mail *(funcionalidade futura)*. A troca exige a senha atual, e o novo e-mail só passa a valer após confirmação enviada a ele.
- **Comportamento do sistema:** HTTP 400 com a mensagem "Você não pode alterar o próprio perfil ou situação".

## RN-AC24 - Sempre existe ao menos um Administrador e um Gerente ativos
- **Descrição:** O sistema não permite ficar sem Administrador ativo nem sem Gerente ativo.
- **Perfis:** Administrador.
- **Condição/Exceção:** Nenhuma.
- **Comportamento do sistema:** Alterar o perfil, inativar ou excluir o último `ADMIN` ativo retorna HTTP 409 com a mensagem "É necessário manter ao menos um Administrador ativo". O mesmo vale para o último `GERENTE` ativo ("É necessário manter ao menos um Gerente ativo").

## RN-AC25 - Inativação em vez de exclusão
- **Descrição:** Um usuário com registros vinculados (pedidos, histórico, logs) é inativado, e não excluído.
- **Perfis:** Administrador.
- **Condição/Exceção:** A exclusão física só é permitida para usuários sem nenhum registro vinculado.
- **Comportamento do sistema:** O sistema verifica os vínculos antes de excluir. Se existirem, retorna HTTP 409 e sugere a inativação.

## RN-AC26 - Dados obrigatórios do usuário
- **Descrição:** Todo usuário tem nome, CPF válido e único, e-mail (para recuperação de senha), perfil e senha de 8 a 72 caracteres. Usuários dos perfis Gerente e operacionais devem estar vinculados a um funcionário ativo.
- **Perfis:** Administrador, Gerente.
- **Condição/Exceção:** O usuário `ADMIN` pode não ter vínculo com funcionário (ex.: suporte técnico externo).
- **Comportamento do sistema:** Dados inválidos retornam HTTP 422. CPF duplicado retorna HTTP 409. Funcionário inexistente ou inativo retorna HTTP 400. Funcionário já vinculado a outro usuário retorna HTTP 409.

## RN-AC27 - Senha definida por terceiro
- **Descrição:** A senha definida pelo Administrador ou pelo Gerente para outro usuário é temporária.
- **Perfis:** Administrador, Gerente.
- **Condição/Exceção:** O Administrador não define a senha de um usuário `GERENTE`: para esse caso, apenas dispara o fluxo de recuperação (RN-AC15) para o e-mail do próprio Gerente. O Gerente define senha apenas de perfis operacionais (RN-AC22).
- **Comportamento do sistema:** O titular é obrigado a trocar a senha no primeiro acesso e é avisado por e-mail. A operação é registrada em log com o autor (RN-AC60) *(funcionalidade futura)*.

## RN-AC28 - Registro de funcionário ligado a usuário
- **Descrição:** O Gerente não altera o próprio registro de funcionário nem o de funcionários vinculados a usuários `ADMIN` ou `GERENTE`. Esses registros, incluindo o salário, são mantidos pelo Administrador (nota 6 da matriz) e cada alteração é registrada conforme a RN-AC60.
- **Perfis:** Gerente, Administrador.
- **Condição/Exceção:** Nenhuma.
- **Comportamento do sistema:** Tentativa do Gerente retorna HTTP 403. Inativar um funcionário com usuário ativo vinculado retorna HTTP 409 até que o usuário seja inativado.

## RN-AC29 - Implantação do primeiro Gerente
- **Descrição:** O Administrador cria o registro de funcionário do Gerente no mesmo ato em que cria o usuário `GERENTE`, o que permite cumprir a RN-AC26 na implantação.
- **Perfis:** Administrador.
- **Condição/Exceção:** O Administrador não cria funcionários de outros perfis.
- **Comportamento do sistema:** A criação de funcionário pelo Administrador sem um usuário `GERENTE` associado retorna HTTP 403.

# 6. Operações por perfil

## RN-AC30 - Administrador não executa operação diária
- **Descrição:** O Administrador não lança pedidos, não altera status, não registra vendas, não aplica descontos e não altera cadastros do negócio, como preços, estoque e mesas.
- **Perfis:** Administrador.
- **Condição/Exceção:** Leitura de dashboard, relatórios consolidados, histórico de vendas e lista resumida de funcionários; manutenção do funcionário vinculado a usuário `GERENTE` (RN-AC28, RN-AC29).
- **Comportamento do sistema:** HTTP 403. No `adm.html`, o Administrador vê somente os menus Configurações (usuários, restaurante, integrações, notificações), Auditoria *(funcionalidade futura)*, Dashboard, Relatórios, Histórico de vendas e Funcionários, os quatro últimos em leitura.

## RN-AC31 - Gerente gere o negócio
- **Descrição:** O Gerente mantém os seguintes cadastros e funções:
  - cardápio, categorias, preços e ficha técnica;
  - insumos e estoque, fornecedores, funcionários e clientes;
  - cadastro de mesas, reservas e QR Code;
  - consulta de todos os relatórios.
- **Perfis:** Gerente.
- **Condição/Exceção:** Não altera usuários `ADMIN`/`GERENTE`, dados do restaurante, integrações nem parâmetros técnicos. Restrições de funcionários na RN-AC28.
- **Comportamento do sistema:** As alterações de preço de produto e de custo de insumo são registradas conforme a RN-AC60.

## RN-AC32 - Fluxo de status do pedido
- **Descrição:** O status do pedido segue uma máquina de estados. Cada transição só pode ser feita pelos perfis indicados. `ENTREGUE` significa pedido pago e finalizado.

| De | Para | Perfis | Condição |
|---|---|---|---|
| RECEBIDO | EM_PREPARO | Cozinha, Gerente | — |
| EM_PREPARO | PRONTO | Cozinha, Gerente | — |
| RECEBIDO | PRONTO | Caixa, Gerente | Somente pedido sem itens de preparo |
| PRONTO | SERVIDO | Atendente, Gerente | — |
| PRONTO ou SERVIDO | ENTREGUE | Caixa, Gerente | Forma de pagamento obrigatória (RN-AC34) |
| RECEBIDO | CANCELADO | Atendente, Caixa, Gerente | Motivo obrigatório (RN-AC41) |
| EM_PREPARO, PRONTO ou SERVIDO | CANCELADO | Gerente; Atendente ou Caixa com autorização | Motivo obrigatório (RN-AC41) |
| ENTREGUE | SERVIDO (reabertura de conta de mesa) *(funcionalidade futura)* | Gerente; Caixa com autorização | RN-AC44 |

- **Perfis:** Atendente, Caixa, Cozinha, Gerente.
- **Condição/Exceção:** Venda de balcão sem itens de preparo pode ser criada diretamente como `ENTREGUE` pelo Caixa ou pelo Gerente. O estorno (RN-AC43) não altera o status: a venda permanece `ENTREGUE` e recebe um lançamento de estorno vinculado. `CANCELADO` é estado final.
- **Comportamento do sistema:** Uma transição não prevista retorna HTTP 409 ("Transição de status inválida"). Uma transição prevista feita por perfil não autorizado retorna HTTP 403. A Cozinha não marca `ENTREGUE`.

## RN-AC33 - Atendente
- **Descrição:** O Atendente consulta mesas e pedidos ativos, lança pedidos para mesas, serve pedidos prontos, registra, altera e cancela reservas, altera o status da mesa, marca pedido urgente e solicita o fechamento da conta (status "aguardando pagamento").
- **Perfis:** Atendente.
- **Condição/Exceção:** Não recebe pagamento, não aplica desconto, não vê relatórios e não altera o cadastro da mesa. A alteração de status não pode apagar a capacidade, a localização nem os dados de reserva.
- **Comportamento do sistema:** HTTP 403 fora dessas operações. A forma de pagamento preferida informada ao solicitar o fechamento é gravada no backend, e não apenas no navegador *(funcionalidade futura)*.

## RN-AC34 - Caixa
- **Descrição:** O Caixa registra vendas de balcão, lança pedidos em mesas, recebe pagamentos, fecha contas de mesa, aplica desconto até o limite (RN-AC42), cadastra ou vincula cliente à venda, consulta reservas sem dados pessoais (nota 19) e consulta o histórico do próprio turno (depende da RN-AC45).
- **Perfis:** Caixa.
- **Condição/Exceção:** O fechamento de conta exige forma de pagamento. Fechar a conta libera a mesa, e o fechamento de todos os pedidos da mesa ocorre em uma única transação. Havendo pedido da mesa em RECEBIDO ou EM_PREPARO, o fechamento retorna HTTP 409 com a lista dos pedidos pendentes; o operador aguarda ou os cancela (RN-AC41).
- **Comportamento do sistema:** HTTP 403 fora dessas operações. Cada pagamento registra o operador, a forma de pagamento, o valor e o desconto, em campos próprios e não em `observacoes` *(funcionalidade futura)*.

## RN-AC35 - Cozinha
- **Descrição:** A Cozinha consulta a fila de produção e avança o status de preparo (RECEBIDO para EM_PREPARO para PRONTO).
- **Perfis:** Cozinha.
- **Condição/Exceção:** Não cancela pedidos, não marca `SERVIDO` nem `ENTREGUE` e não vê valores nem dados de clientes. O aviso de que um pedido foi cancelado continua sendo exibido.
- **Comportamento do sistema:** HTTP 403 fora dessas operações. A API devolve à Cozinha uma versão do pedido sem valores e sem nome do cliente.

## RN-AC36 - Cliente: criação de pedido
- **Descrição:** O cliente anônimo cria pedido apenas para a mesa identificada por um token de QR Code válido.
- **Perfis:** Cliente.
- **Condição/Exceção:** Não envia `vendaCaixa`, desconto nem `clienteId`. Não escolhe a mesa por número ou parâmetro de URL.
- **Comportamento do sistema:** Pedido sem token de mesa válido ou com campos restritos retorna HTTP 403. O preço de cada item é sempre recalculado no backend.

## RN-AC37 - Cliente: acompanhamento do pedido
- **Descrição:** O cliente acompanha somente os pedidos que ele mesmo criou.
- **Perfis:** Cliente.
- **Condição/Exceção:** Nenhuma.
- **Comportamento do sistema:** A consulta exige um identificador não sequencial do pedido (token devolvido na criação). Uma consulta por ID sequencial ou de outro pedido retorna HTTP 404. O canal de tempo real do cliente recebe apenas eventos dos próprios pedidos *(funcionalidade futura)*.

# 7. Operações sensíveis

## RN-AC40 - Autorização do Gerente *(funcionalidade futura)*
- **Descrição:** Uma operação marcada com **\*** na matriz só é concluída com a autorização de um Gerente ativo.
- **Perfis:** Atendente, Caixa (solicitantes); Gerente (autorizador).
- **Condição/Exceção:** Se o próprio Gerente executa a operação, não é preciso autorização adicional, mas vale a RN-AC48. O autorizador deve ser diferente do solicitante e do beneficiário da operação.
- **Comportamento do sistema:**
  - Na tela do operador, o Gerente informa CPF e senha. O backend valida que o autorizador tem perfil `GERENTE` e está ativo.
  - A autorização vale para uma única operação, identificada pelo tipo, pelo pedido e pelo valor, e expira em 2 minutos. Não pode ser reutilizada. Executar com valor diferente do autorizado retorna HTTP 403.
  - Após 5 falhas consecutivas, o endpoint de autorização é bloqueado por 15 minutos, como no login (RN-AC10).
  - O sistema registra o solicitante, o autorizador e o resultado (RN-AC60). Uma autorização negada ou inválida retorna HTTP 403 e também é registrada.

## RN-AC41 - Cancelamento de pedido ou item
- **Descrição:** Todo cancelamento exige um motivo. O cancelamento de um item individual usa o campo `item_pedido.cancelado` e recalcula o total do pedido.
- **Perfis:** Atendente, Caixa, Gerente.
- **Condição/Exceção:** O cancelamento antes do preparo (RECEBIDO) dispensa autorização. Já com o pedido em EM_PREPARO, PRONTO ou SERVIDO, o cancelamento exige autorização do Gerente (RN-AC40).
- **Comportamento do sistema:** Sem motivo, retorna HTTP 422. O histórico de status registra o usuário, o motivo e o autorizador. A Cozinha é notificada em tempo real.

## RN-AC42 - Limite de desconto
- **Descrição:** O desconto é limitado a um percentual do subtotal da venda. O limite padrão é 10%, e o Gerente pode alterá-lo.
- **Perfis:** Caixa, Gerente.
- **Condição/Exceção:** Um desconto acima do limite exige autorização do Gerente (RN-AC40). Nenhum desconto pode ser maior que o subtotal. O Atendente e o Cliente não aplicam desconto.
- **Comportamento do sistema:** Acima do limite e sem autorização, retorna HTTP 403. O desconto é gravado em campo próprio, junto com o usuário que o aplicou e o autorizador, quando houver.

## RN-AC43 - Estorno *(funcionalidade futura)*
- **Descrição:** O estorno desfaz uma venda já paga (`ENTREGUE`), com motivo obrigatório, e preserva o registro original.
- **Perfis:** Gerente; Caixa com autorização.
- **Condição/Exceção:** O estorno é permitido quando a venda pertence a um caixa que ainda está aberto ou quando foi paga há no máximo N horas (parâmetro do negócio; padrão 24 horas). Fora disso, retorna HTTP 409.
- **Comportamento do sistema:** A venda permanece `ENTREGUE` e o sistema gera um lançamento de estorno vinculado a ela, sem apagar nem sobrescrever a venda. A operação é registrada conforme a RN-AC60.

## RN-AC44 - Reabertura de conta de mesa *(funcionalidade futura)*
- **Descrição:** A reabertura devolve uma conta de mesa `ENTREGUE` ao status `SERVIDO` para correção, com motivo obrigatório.
- **Perfis:** Gerente; Caixa com autorização.
- **Condição/Exceção:** Não se reabre venda de balcão, venda com estorno nem pedido `CANCELADO`. Não é permitida após o fechamento do caixa em que a venda foi registrada.
- **Comportamento do sistema:** Sem autorização, retorna HTTP 403. Venda de balcão, venda estornada, pedido cancelado ou caixa já fechado retornam HTTP 409. A operação é registrada conforme a RN-AC60, com o motivo e o autorizador.

## RN-AC45 - Controle de caixa *(funcionalidade futura)*
- **Descrição:** O Caixa abre o caixa com um valor inicial antes de registrar vendas e o fecha ao fim do turno informando os valores apurados. Sangrias e suprimentos são lançados com motivo.
- **Perfis:** Caixa, Gerente.
- **Condição/Exceção:** Se a diferença entre o valor apurado e o esperado passar da tolerância (parâmetro do negócio), o fechamento fica com status "pendente de conferência" até um Gerente confirmá-lo.
- **Comportamento do sistema:** Uma venda sem caixa aberto retorna HTTP 409. Cada venda fica vinculada ao operador e ao caixa ou turno.

## RN-AC46 - Alterações de preço e cardápio
- **Descrição:** Somente o Gerente cria, altera ou exclui produtos e categorias e define preços.
- **Perfis:** Gerente.
- **Condição/Exceção:** Um produto com vendas registradas é inativado, e não excluído. A alteração de categoria é *(funcionalidade futura)* (nota 15).
- **Comportamento do sistema:** HTTP 403 para os demais perfis. As alterações de preço são registradas conforme a RN-AC60.

## RN-AC47 - Ausência do Gerente
- **Descrição:** Quando nenhum Gerente está disponível, uma operação marcada com **\*** fica com status "aguardando autorização" até que um Gerente a aprove ou recuse.
- **Perfis:** Atendente, Caixa (solicitantes); Gerente (autorizador).
- **Condição/Exceção:** O Administrador não autoriza operações do negócio, nem na ausência do Gerente (RN-AC30). A existência de ao menos um Gerente ativo é garantida pela RN-AC24.
- **Comportamento do sistema:** A operação pendente não produz efeito (não cancela, não aplica desconto, não reabre) até a aprovação. A aprovação ou recusa é registrada conforme a RN-AC60 *(funcionalidade futura)*.

## RN-AC48 - Segregação de funções
- **Descrição:** As exceções feitas pelo próprio Gerente são revisadas por outra pessoa.
- **Perfis:** Gerente (executa); Administrador (revisa, somente leitura).
- **Condição/Exceção:** Desconto acima do limite, estorno, reabertura de conta e cancelamento após o preparo feitos pelo próprio Gerente exigem motivo. O autorizador nunca é o solicitante nem o beneficiário (RN-AC40).
- **Comportamento do sistema:** Essas operações entram no "relatório de exceções", que o Administrador consulta em leitura para revisão do proprietário. Esses registros não podem ser alterados (RN-AC62) *(funcionalidade futura)*.

# 8. Dados pessoais e informações restritas

## RN-AC50 - Dados pessoais (LGPD)
- **Descrição:** O CPF, o telefone, o e-mail e o endereço de clientes e funcionários, o salário e os dados de reserva só são exibidos aos perfis que precisam deles.
- **Perfis:** Gerente (todos os dados do negócio); Caixa (clientes, para vincular à venda); Atendente (nome e telefone da reserva).
- **Condição/Exceção:** O Administrador vê de funcionários apenas nome, cargo e situação (nota 6 da matriz).
- **Comportamento do sistema:** Endpoints públicos e respostas destinadas à Cozinha e ao Cliente omitem esses campos.

## RN-AC51 - Informações financeiras e de custo
- **Descrição:** O faturamento, o ticket médio, o custo de insumos, a margem e o histórico de vendas são informações gerenciais.
- **Perfis:** Gerente (completo); Administrador (somente leitura consolidada nos relatórios e no dashboard, sem acesso aos cadastros de insumos e ficha técnica; nota 13); Caixa (somente o histórico de vendas do próprio turno, quando existir a RN-AC45 *(funcionalidade futura)* e o registro do operador no pedido).
- **Condição/Exceção:** Nenhuma.
- **Comportamento do sistema:** HTTP 403 para os demais perfis.

## RN-AC52 - QR Code da mesa
- **Descrição:** O token do QR Code identifica a mesa e só pode ser obtido por quem gera o QR Code.
- **Perfis:** Gerente.
- **Condição/Exceção:** O Gerente pode regenerar o token, o que invalida o QR Code anterior.
- **Comportamento do sistema:** `GET /api/mesas/{id}/qrcode.svg` exige o perfil Gerente. Listagens de mesas não expõem o token.

## RN-AC53 - Canal de tempo real
- **Descrição:** A conexão WebSocket exige autenticação, e cada conexão recebe apenas os eventos permitidos ao seu perfil.
- **Perfis:** Gerente, Atendente, Caixa, Cozinha; Cliente (RN-AC37).
- **Condição/Exceção:** Nenhuma.
- **Comportamento do sistema:** Conexões de funcionários usam o access token (JWT); a conexão do Cliente usa o token do pedido (RN-AC37). Uma conexão sem token válido é recusada. A Cozinha recebe eventos sem valores. O Administrador não recebe eventos operacionais.

# 9. Rastreabilidade

## RN-AC60 - Registro de auditoria *(funcionalidade futura)*
- **Descrição:** As operações abaixo são registradas em log de auditoria. Hoje não existe tabela, API nem tela de auditoria.
  - login (sucesso e falha) e recuperação de senha;
  - gestão de usuários;
  - alteração de dados do restaurante e de integrações;
  - alteração de preço e de custo;
  - cancelamentos, descontos, estornos, reaberturas e pagamentos;
  - negações HTTP 403 em operações sensíveis (definição na introdução).
- **Perfis:** Todos (geram registros).
- **Condição/Exceção:** Nenhuma.
- **Comportamento do sistema:** Cada registro guarda:
  - data e hora;
  - usuário e perfil;
  - ação;
  - entidade e identificador;
  - valores anteriores e novos;
  - motivo;
  - autorizador, quando houver;
  - IP de origem.

  A senha, o hash da senha e os códigos de recuperação nunca são registrados.

## RN-AC61 - Histórico de status do pedido
- **Descrição:** Cada mudança de status do pedido registra o usuário responsável, o motivo (obrigatório em cancelamento, estorno e reabertura) e o autorizador, quando houver.
- **Perfis:** Atendente, Caixa, Cozinha, Gerente.
- **Condição/Exceção:** O pedido criado pelo Cliente anônimo registra "cliente (QR Code)" e a mesa como origem.
- **Comportamento do sistema:** A tabela `pedido_status_historico` ganha as colunas `id_usuario`, `motivo` e `id_autorizador`.

## RN-AC62 - Integridade dos registros *(funcionalidade futura para o log de auditoria)*
- **Descrição:** Os registros de auditoria e o histórico de status não podem ser alterados nem excluídos por nenhum perfil.
- **Perfis:** Todos.
- **Condição/Exceção:** Expurgo somente após o prazo de retenção (sugestão: 5 anos para registros financeiros), por rotina técnica.
- **Comportamento do sistema:** A API não oferece endpoints de alteração ou exclusão para esses registros. O Administrador consulta todos os registros, e o Gerente consulta os eventos do negócio (nota 3 da matriz).

# 10. Situação atual x proposta

| Situação atual no código | Referência | Regra que corrige | Status |
|---|---|---|---|
| Cadastro público aceita qualquer perfil, inclusive `ADMIN`: qualquer pessoa cria um administrador | `routers/auth.py:22`, `schemas.py:20-24`, `services.py:42-53` | RN-AC20 | Corrigido: `POST /api/auth/register` exige `ADMIN` (`exigir_admin`) |
| Apenas `/api/usuarios` verifica perfil (`exigir_admin`). Os demais routers aceitam requisições sem token, inclusive POST/PUT/DELETE | `security.py:122`, `routers/*.py` | RN-AC02, RN-AC03, matriz | Corrigido: todos os routers usam `exigir_perfis` conforme a matriz |
| Não existe perfil Gerente. O seed cria o usuário "Gerente" como `ADMIN`, e a tela de usuários mapeia "Gerente" para `ADMIN` | `models.py:20-24`, `seed.py:37-42`, `adm.js:4874-4880` | Seção 1, RN-AC04 | Corrigido: `Role.GERENTE`, seed e migração `006_perfil_gerente.sql`; a UI mapeia Gerente para `GERENTE` |
| Não é possível criar usuário `CAIXA` pela UI: o select de perfil só oferece Administrador, Operacional e Cozinha, e `USER_ROLE_LABEL`/`USER_ROLE_CLASS` não têm `CAIXA` | `adm.html:1904-1908`, `adm.js:4871-4872` | Seção 1, RN-AC04 | Corrigido: select com os 5 perfis (Gerente vê só os operacionais) |
| Não há como ativar/inativar usuário pela API ou UI. `UserResponse` não expõe `ativo`, e a tabela exibe "Ativo" fixo | `routers/usuarios.py`, `schemas.py:67`, `adm.js:4889` | RN-AC21, RN-AC22, RN-AC25 | Corrigido: `ativo` em `UserResponse`/`UserUpdateRequest`; botão Ativar/Inativar na tabela |
| Não existe troca da própria senha ou e-mail. O modal "Segurança" é apenas visual e não chama a API | `adm.js:2240-2252` | RN-AC23 | Pendente |
| O frontend não renova o token: um 401 encerra a sessão direto | `adm.js:121` | RN-AC12 | Pendente: um 401 leva ao login, sem tentativa de refresh |
| O frontend trata qualquer perfil desconhecido como "gerente" (administrador) | `adm-login.js:175-180` | RN-AC06 | Corrigido: perfil desconhecido não cria sessão ("Perfil sem acesso") |
| O controle de perfil é apenas visual: `data-role`, `sessionStorage` editável, atalhos e hash abrem seções restritas, "Trocar usuário" não exige senha | `adm.js:47-58`, `adm.js:293-307`, `adm.js:2256` | RN-AC03, RN-AC11, RN-AC17 | Corrigido: `backendRole` decide o perfil, `data-roles` e `SECTION_ROLES` filtram menu, atalhos, busca e `navigateTo`; "Trocar usuário" encerra a sessão |
| O Caixa entra em `adm.html` e vê todo o menu Operações (Pedidos, Cancelamentos, Pagamentos, Mesas, Cozinha), que não tem `data-role`; o "voltar" do PDV leva a `adm.html`. As telas operacionais não verificam o perfil | `adm.html:60-70`, `adm.js:54-55`, `pdv.js:47`, `atendente.js:31`, `pdv.js:1074`, `cozinha.js:145` | RN-AC11 | Corrigido: cada tela confere o perfil ao carregar; o "voltar" do PDV leva o Caixa ao logout e o Gerente ao `adm.html` |
| A mudança de status não tem máquina de estados nem perfil exigido. Um anônimo cancela, reabre ou marca como pago enviando qualquer status | `routers/pedidos.py:137` | RN-AC32, RN-AC35, RN-AC44 | Corrigido: `TRANSICOES_STATUS` em `routers/pedidos.py` (409 transição inválida, 403 perfil). Reabertura continua *(funcionalidade futura)* |
| `ENTREGUE` é usado com dois sentidos: pago e apenas entregue. A Cozinha e o KDS do painel avançam PRONTO para `ENTREGUE`, e "Confirmar Entrega" marca `ENTREGUE` sem forma de pagamento | `cozinha.js:50`, `adm.js:1922`, `adm.js:1972`, `adm.js:4033`, `adm.js:4226` | RN-AC32 | Corrigido: Cozinha e KDS param em PRONTO, "Confirmar entrega" marca SERVIDO, `ENTREGUE` só com forma de pagamento |
| O fechamento de conta são N requisições independentes (`Promise.all`); uma falha parcial deixa a mesa inconsistente | `pdv.js:202`, `pdv.js:885` | RN-AC34 | Parcial: pedidos em RECEBIDO/EM_PREPARO bloqueiam o fechamento no PDV e a falha parcial é exibida sem liberar a mesa, mas continuam N requisições sem transação única nem 409 no backend |
| Não existe log de auditoria (tabela, API ou tela) | `models.py` | RN-AC60, RN-AC62 | Pendente |
| Integrações e notificações existem só no frontend, em `localStorage`; tokens de iFood e PagSeguro e chave PIX ficam no navegador. Autorização no backend exige criar endpoints antes | `adm.js:4723-4767` | RN-AC02, RN-AC03, RN-AC60 | Pendente |
| Não existe fluxo de autorização do Gerente, reabertura, nem turno/caixa/operador: o pedido não guarda o usuário que o registrou | `models.py` (`Pedido`) | RN-AC40, RN-AC44, RN-AC45, RN-AC51 | Pendente: o histórico de status já grava o usuário que criou o pedido; autorização, reabertura e turno não existem |
| `/actuator/health/db` é público e acessa o banco | `main.py:86-89` | RN-AC07 | Corrigido: exige `ADMIN` |
| O cancelamento não guarda motivo nem autor (o motivo do Atendente não é enviado), e o histórico não tem usuário | `atendente.js:312`, `pedido_status_historico` | RN-AC41, RN-AC61 | Corrigido: motivo obrigatório (422) e histórico com `id_usuario` e `motivo`. `id_autorizador` depende da RN-AC40 |
| O desconto não tem limite, autor nem campo próprio. Qualquer anônimo envia `vendaCaixa=true` e, com isso, aplica desconto e cria a venda já como `ENTREGUE` | `routers/pedidos.py:35`, `pedidos.py:57`, `pedidos.py:234-237` | RN-AC36, RN-AC42 | Parcial: anônimo não envia `vendaCaixa`, desconto nem `clienteId` (403) e o Caixa tem limite de 10% (`LIMITE_DESCONTO_PERCENTUAL`); o desconto ainda não tem campo próprio nem autor |
| A forma de pagamento é gravada apenas como texto em `observacoes`. Não há estorno nem controle de caixa | `routers/pedidos.py`, `pdv.js:873` | RN-AC34, RN-AC43, RN-AC45 | Pendente |
| O cancelamento de item (`item_pedido.cancelado`) não é usado por nenhum endpoint | `models.py` | RN-AC41 | Pendente |
| Dados pessoais e financeiros ficam públicos (clientes, funcionários com salário, reservas, pedidos, relatórios, custos de insumos) | `routers/clientes.py`, `funcionarios.py`, `mesas.py`, `pedidos.py`, `relatorios.py`, `insumos.py` | RN-AC50, RN-AC51 | Parcial: os endpoints exigem perfil e o Administrador e o Caixa recebem campos pessoais como `null`; a Cozinha ainda recebe custo e fornecedores de insumos e valores dos pedidos (notas 5 e 9, RN-AC35) |
| O QR Code de qualquer mesa é público. Pedidos podem ser lidos por ID ou número de mesa sequencial. O cliente escolhe a mesa sem QR | `routers/mesas.py:45`, `pedidos.py:116,132`, `user.js:74,873` | RN-AC36, RN-AC37, RN-AC52 | Corrigido: QR Code exige `GERENTE`, pedido anônimo exige `mesaToken`, consulta anônima exige `?token=<tokenAcesso>` (senão 404), `user.js` só usa a mesa do QR Code |
| O WebSocket não tem autenticação e envia todos os pedidos a qualquer conexão | `main.py`, `realtime.py` | RN-AC53 | Corrigido: `/ws?token=` (equipe, `ADMIN` recusado) ou `/ws?pedido=&pedidoToken=` (cliente, só o próprio pedido); inválido fecha com 1008. A Cozinha ainda recebe valores |
| O Administrador pode rebaixar a si mesmo ou remover o último `ADMIN`. A exclusão é física e sem auditoria | `routers/usuarios.py:51,86` | RN-AC23, RN-AC24, RN-AC25 | Corrigido: 400 ao alterar o próprio perfil/situação, 409 para o último `ADMIN`/`GERENTE` ativo e para exclusão com histórico vinculado. Auditoria pendente (RN-AC60) |
| A recuperação de senha permite descobrir CPFs cadastrados: a identificação devolve o e-mail mascarado, e a solicitação devolve `resetToken` e `recoveryEmail` só para CPF ativo (ou HTTP 503 se não houver e-mail). Não há limite de tentativas no login | `routers/auth.py:32`, `services.py:60-81`, `services.py:84-86` | RN-AC10, RN-AC15 | Pendente |
| As credenciais padrão (`admin123`) são criadas por padrão | `seed.py`, `DEFAULT_ADMIN_ENABLED` | RN-AC16 | Pendente: `DEFAULT_ADMIN_ENABLED` continua `true` por padrão |
| `usuarios.role` não tem restrição CHECK | `database/schema.sql:127` | RN-AC04 | Corrigido: `chk_usuarios_role` em `schema.sql` e na migração 006 |
| O PUT de mesa usado para mudar o status sobrescreve a capacidade (fixada em 4 pelo PDV) e apaga a reserva | `pdv.js:208`, `atendente.js:534` | RN-AC33, RN-AC34 | Corrigido: `PATCH /api/mesas/{id}/status` e `PATCH /api/mesas/{id}/reserva`; `PUT` só no cadastro (Gerente) |

Pontos já atendidos:
- o perfil é relido do banco a cada requisição, e o usuário inativo é bloqueado em `get_usuario_atual`, no login, no refresh e na recuperação de senha (`services.py:24`, `36`, `63`, `105`), o que cumpre a RN-AC05;
- a autoexclusão é bloqueada;
- o código de recuperação expira em 10 minutos, aceita 3 tentativas, e `debugCode` vem desligado por padrão;
- o preço do item vem do banco (`pedidos.py` `_criar_item`);
- `clienteId` exige sessão de funcionário e retorna HTTP 401 sem ela (`pedidos.py:37-38`);
- a listagem de mesas não expõe `qr_code_token` (`MesaResponse`);
- `POST /api/usuarios` valida o CPF e a senha de 8 a 72 caracteres.

# Apêndice - Implementação

O recorte abaixo já está implementado. Os itens marcados como *(funcionalidade futura)* continuam pendentes (ver a coluna "Status" da seção 10).

1. **Enum de perfis** (`backend-python/app/models.py`):
   ```python
   class Role(StrEnum):
       ADMIN = "ADMIN"
       GERENTE = "GERENTE"
       COZINHA = "COZINHA"
       FUNCIONARIO = "FUNCIONARIO"
       CAIXA = "CAIXA"
   ```

2. **Dependência genérica** (`backend-python/app/security.py`):
   ```python
   def exigir_perfis(*perfis: Role):
       permitidos = {p.value for p in perfis}

       def _verificar(usuario_atual: User = Depends(get_usuario_atual)) -> User:
           if usuario_atual.role not in permitidos:
               raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")
           return usuario_atual

       return _verificar
   ```
   Uso por rota, conforme a matriz:
   ```python
   @router.put("/{produto_id}", dependencies=[Depends(exigir_perfis(Role.GERENTE))])
   ```
   `exigir_admin` foi mantida (equivale a `exigir_perfis(Role.ADMIN)`) e protege `POST /api/auth/register` e `/actuator/health/db`. Rotas públicas que mudam a resposta conforme o login (produtos, restaurante, pedido por ID, criação de pedido) usam `get_usuario_opcional`. Em `/api/usuarios`, o router aceita `ADMIN` e `GERENTE`, e as restrições da RN-AC22 a RN-AC25 são verificadas dentro de cada rota.

   Mesas: o cadastro usa `PUT /api/mesas/{id}` (Gerente). O status usa `PATCH /api/mesas/{id}/status` com `{ "status": "..." }` (Atendente, Caixa, Gerente; aceita `livre`, `reservada`, `ocupada`, `manutencao` e `aguardando_pagamento`, senão 422). A reserva usa `PATCH /api/mesas/{id}/reserva` (Atendente, Gerente): definir muda o status para `reservada`; enviar os campos nulos cancela e devolve `reservada` para `livre`.

3. **Migração** (`database/migrations/006_perfil_gerente.sql`, refletida em `database/schema.sql`, idempotente):
   ```sql
   UPDATE usuarios SET role = 'GERENTE' WHERE cpf = '00000000001' AND role = 'ADMIN';
   ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS chk_usuarios_role;
   ALTER TABLE usuarios ADD CONSTRAINT chk_usuarios_role
       CHECK (role IN ('ADMIN', 'GERENTE', 'FUNCIONARIO', 'CAIXA', 'COZINHA'));
   ALTER TABLE pedido_status_historico
       ADD COLUMN IF NOT EXISTS id_usuario BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS motivo VARCHAR(255);
   ALTER TABLE pedido ADD COLUMN IF NOT EXISTS token_acesso UUID;
   UPDATE pedido SET token_acesso = gen_random_uuid() WHERE token_acesso IS NULL;
   ALTER TABLE pedido
       ALTER COLUMN token_acesso SET DEFAULT gen_random_uuid(),
       ALTER COLUMN token_acesso SET NOT NULL;
   CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_token_acesso ON pedido (token_acesso);
   ```
   A primeira instrução promove o usuário de teste "Gerente" e deve ser revisada antes de rodar em produção. O seed (`seed.py`) cria o usuário "Gerente" com `Role.GERENTE`, aplica as colunas que faltarem (sem o CHECK) e, com `DEFAULT_TEST_USERS_ENABLED=true`, faz a mesma promoção do CPF `00000000001`. A coluna `id_autorizador` e a tabela `auditoria` ficam para a RN-AC40 e a RN-AC60 *(funcionalidade futura)*.

4. **Cadastro público**: `POST /api/auth/register` protegido com `exigir_admin`.

5. **Pedidos** (`routers/pedidos.py`):
   - `TRANSICOES_STATUS` mapeia (origem, destino) para os perfis da RN-AC32. A ordem de checagem em `PUT /api/pedidos/{id}/status` é 404 (pedido) → 409 (transição inválida) → 403 (perfil) → 422 (motivo de cancelamento ou forma de pagamento ausentes). O cancelamento após o preparo é exclusivo do Gerente (403 "Cancelamento apos o inicio do preparo exige o perfil Gerente"), já que a autorização da RN-AC40 ainda não existe. O histórico grava `id_usuario` e `motivo`.
   - `POST /api/pedidos`: o anônimo precisa de `mesaToken` válido e não pode enviar `vendaCaixa`, desconto nem `clienteId` (403). `vendaCaixa`, desconto e `clienteId` exigem `CAIXA` ou `GERENTE`; `ADMIN` e `COZINHA` recebem 403. O Caixa tem limite de 10% do subtotal (`LIMITE_DESCONTO_PERCENTUAL`), e o Gerente não tem limite. A resposta do POST inclui `tokenAcesso`, usado pelo cliente em `GET /api/pedidos/{id}?token=<tokenAcesso>` (sem token correto: 404).

6. **WebSocket** (`main.py`, `realtime.py`): `/ws?token=<access JWT>` para `GERENTE`, `FUNCIONARIO`, `CAIXA` e `COZINHA` (todos os eventos); `/ws?pedido=<id>&pedidoToken=<tokenAcesso>` para o cliente (só os eventos do próprio pedido). Sem parâmetros, token inválido ou `ADMIN`: fechamento com código 1008. Os eventos não incluem `tokenAcesso`.

7. **Frontend**:
   - `adm-login.js`/`adm-auth.js`: `ADMIN` → `admin`, `GERENTE` → `gerente`, `FUNCIONARIO` → `atendente`, `CAIXA` → `caixa`, `COZINHA` → `cozinha`. Outro perfil não cria sessão e exibe "Perfil sem acesso". A sessão guarda `backendRole`.
   - `adm.js`: o perfil vem de `session.backendRole` (no modo demonstração, do `userKey`). `SECTION_ROLES` e o atributo `data-roles` controlam menu, atalhos, busca de telas e `navigateTo`. Atendente, Caixa e Cozinha são redirecionados à própria tela inicial. Os perfis do select de usuários vêm de `USER_ACCESS_TYPE_TO_ROLE` (5 perfis; o Gerente vê só os operacionais), e a situação usa o `ativo` real.
   - `atendente.js`, `pdv.js` e `cozinha.js`: conferem o perfil ao carregar e abrem o WebSocket com `?token=`. `atendente.js` e `pdv.js` usam `PATCH` para status e reserva de mesa. A Cozinha para em PRONTO, o Atendente marca SERVIDO e o Caixa marca ENTREGUE com forma de pagamento.
   - `user.js`: a mesa vem só do `mesaToken` do QR Code; o pedido envia `mesaToken` e guarda o `tokenAcesso` para a consulta e o WebSocket.


## Complemento operacional — 03/11/2026: edição e despacho

Cozinha e Gerente podem alterar itens, quantidades e observações dos pedidos
RECEBIDO, EM_PREPARO e PRONTO por `PUT /api/pedidos/{id}/itens`. Esta regra
amplia as permissões da cozinha descritas acima. Os demais perfis não recebem
essa permissão. Pedido PRONTO alterado retorna a EM_PREPARO para conferência.

Motivo obrigatório e registro de usuário/data/resumo no histórico existente.
O total é recalculado no servidor; preços já contratados e desconto absoluto
existente são preservados. Novos produtos usam o preço atual do cadastro.
A versão atualizadoEm é obrigatória e a gravação utiliza trava de linha;
versão antiga ou pedido fora da fila da cozinha retorna HTTP 409.

Atendente e Gerente também podem confirmar retirada de balcão já pago por
`PUT /api/pedidos/{id}/despacho`. Exige pedido PRONTO sem mesa e pagamento
previamente registrado pelo caixa. A operação registra ENTREGUE no histórico,
sem alterar valor, forma de pagamento ou gerar outra cobrança. As permissões
do endpoint geral de status para cobrança permanecem com Caixa/Gerente.
