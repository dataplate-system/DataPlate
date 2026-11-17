# DataPlate - Contexto

Sistema de gestao para restaurantes com backend Python/FastAPI, frontend HTML/CSS/JS vanilla e PostgreSQL local via Docker.

## Arquitetura

```text
DataPlate/
|-- backend-python/
|   |-- app/
|   |   |-- routers/      # Rotas REST e WebSocket
|   |   |-- core/         # Configuracao
|   |   |-- db.py         # Sessao SQLAlchemy
|   |   |-- models.py     # Modelos SQLAlchemy
|   |   |-- schemas.py    # Schemas Pydantic
|   |   |-- security.py   # JWT e senha bcrypt
|   |   |-- bcg.py        # Regras da Matriz BCG
|   |   |-- estoque.py    # Baixa de insumos pela ficha tecnica
|   |   |-- limiter.py    # Limite de tentativas
|   |   `-- main.py       # App FastAPI
|   |-- tests/            # Testes de integracao (unittest)
|   |-- db/init/          # Inicializacao do Postgres local
|   |-- Dockerfile
|   `-- docker-compose.yml
|-- database/
|   `-- schema.sql        # Schema inicial do banco local
|-- frontend/
|   |-- pages/
|   |-- JavaScript/
|   |-- Css/
|   `-- images/
`-- dev-start-python.ps1  # Sobe API, Postgres e Adminer
```

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.12, FastAPI |
| Banco | PostgreSQL local em Docker |
| ORM | SQLAlchemy |
| Schemas | Pydantic |
| Auth | JWT + bcrypt |
| Frontend | HTML + CSS + JS vanilla |
| WebSocket | WebSocket nativo em `/ws` |
| Banco UI | Adminer |

## Ambiente Local

Subir tudo:

```powershell
.\dev-start-python.ps1
```

Se o build do backend falhar com `SSLEOFError` ao baixar pacotes do PyPI, escolha um indice acessivel pela rede do Docker e tente novamente. Por exemplo, este espelho foi validado:

```powershell
$env:PIP_INDEX_URL = "https://mirrors.ustc.edu.cn/pypi/simple"
.\dev-start-python.ps1
```

Para voltar ao indice oficial no terminal atual:

```powershell
Remove-Item Env:PIP_INDEX_URL
```

### E-mail de recuperação de senha

O envio de códigos exige SMTP configurado no `.env` da raiz. Para Gmail, use uma
senha de app (não a senha normal da conta):

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=seu-email@gmail.com
SMTP_PASSWORD=sua-senha-de-app
SMTP_FROM_EMAIL=seu-email@gmail.com
```

Depois de alterar o `.env`, recrie o container da API para aplicar as variáveis:

```powershell
docker compose -f backend-python\docker-compose.yml up -d --build api
```

Servicos:

```text
API: http://localhost:8081
Docs API: http://localhost:8081/docs
Adminer: http://localhost:8082
Frontend: http://localhost:5500/pages/adm-login.html
```

Banco local:

```text
host: localhost
porta: 5433
database: dataplate
usuario: postgres
senha: dataplate_local
```

No Adminer, use:

```text
Sistema: PostgreSQL
Servidor: db
Usuario: postgres
Senha: dataplate_local
Base de dados: dataplate
```

## Frontend Local

Os arquivos em `frontend/JavaScript` detectam ambiente local e chamam:

```text
http://localhost:8081/api
```

Para servir as telas:

```powershell
cd frontend
python -m http.server 5500
```

### QR Code em celular na rede local

Conecte o celular e o computador na mesma rede. Abra o painel no computador
por `http://<IP-DO-PC>:5500/pages/adm.html` (em vez de `localhost`) e gere o
QR Code da mesa. O QR aponta para o mesmo IP e o cardapio identifica a mesa
automaticamente pelo token. Use `ipconfig` para encontrar o IPv4 do computador.

O `dev-start-python.ps1` expoe o frontend na rede local; a API tambem aceita
origens privadas na porta 5500 somente no Docker local. Caso o Windows pergunte,
autorize o acesso nas portas 5500 e 8081 em redes privadas.

## Banco de Dados

O schema inicial fica em `database/schema.sql`.

Quando criar ou alterar tabelas, atualize esse arquivo. O Postgres local executa o schema apenas na primeira criacao do volume Docker.

Para bancos existentes, aplique manualmente a migracao correspondente em `database/migrations/` antes de usar as novas colunas. A migracao `002_mesa_qr_code_token.sql` adiciona o token exclusivo usado nos QR Codes das mesas.
Para habilitar o vínculo opcional entre pedidos e clientes, usuários e funcionários, e a associação entre fornecedores e insumos, aplique `003_relacionamentos_clientes_usuarios_fornecedores.sql` em bancos existentes.
A migracao `006_perfil_gerente.sql` (idempotente) cria o perfil `GERENTE`: promove o usuario de teste `00000000002` de `ADMIN` para `GERENTE`, adiciona o CHECK `chk_usuarios_role`, as colunas `id_usuario` e `motivo` em `pedido_status_historico` e o `token_acesso` (UUID unico) em `pedido`. Aplique em bancos existentes:

```powershell
Get-Content database\migrations\006_perfil_gerente.sql | docker compose -f backend-python\docker-compose.yml exec -T db psql -U postgres -d dataplate
```

Revise o `UPDATE` do CPF `00000000002` antes de rodar fora do ambiente de desenvolvimento. Ao iniciar, a API tambem cria as colunas que faltarem (sem o CHECK).

A migracao `011_fichas_tecnicas_demo.sql` (idempotente) cria fichas tecnicas para os produtos de demonstracao que nao tinham. A migracao `010_pagamento_e_estoque.sql` (idempotente) cria `pedido.pago_em`, `pedido.forma_pagamento` e a tabela `estoque_movimento`. Os pedidos antigos entregues, ou de balcao com pagamento marcado, ficam registrados como pagos. O Docker Compose ja a executa na inicializacao.

Para recriar o banco local do zero:

```powershell
docker compose -f backend-python\docker-compose.yml down -v
.\dev-start-python.ps1
```

## Padrao Para Novas Rotas

1. Criar ou atualizar modelo em `backend-python/app/models.py`.
2. Criar ou atualizar schema Pydantic em `backend-python/app/schemas.py`.
3. Criar router em `backend-python/app/routers/`.
4. Registrar router em `backend-python/app/main.py`.
5. Validar com:

```powershell
python -m compileall backend-python\app
docker compose -f backend-python\docker-compose.yml up -d --build
```

## Auth

- Login: `POST /api/auth/login`
- Registro: `POST /api/auth/register` (exige `ADMIN`)
- Refresh: `POST /api/auth/refresh`
- Reset de senha: `POST /api/auth/password-reset/request`, `POST /api/auth/password-reset/verify` e `POST /api/auth/reset-password`
- Header padrao: `Authorization: Bearer <token>`
- Roles: `ADMIN`, `GERENTE`, `FUNCIONARIO` (Atendente), `CAIXA`, `COZINHA`. Cliente nao tem conta.

O token identifica o usuario por `sub: "usuario:<id>"`; o CPF nao fica no JWT. Login: 5 falhas no mesmo CPF e origem, ou 30 na mesma origem, bloqueiam por 5 minutos (HTTP 429). Pedido de codigo de recuperacao: 3 por CPF e origem, ou 20 por origem, a cada 15 minutos. A resposta e igual para CPF cadastrado ou nao. Os contadores ficam em memoria e valem para um unico processo da API.

Com `APP_ENV` diferente de `local` (o padrao e `production`), a API nao sobe com o `JWT_SECRET` de desenvolvimento, com a senha padrao do administrador, com os acessos de teste ligados ou com `PASSWORD_RESET_DEBUG_CODE`. O Docker Compose e o `run-local.ps1` definem `APP_ENV=local`.

Para testar a recuperacao de senha sem SMTP, use `PASSWORD_RESET_DEBUG_CODE=true`: o codigo aparece na tela. Sem SMTP e sem essa opcao, o e-mail nao sai e o erro fica apenas no log da API.

O Docker local cria estes acessos de teste, todos com a mesma senha:

| Perfil | CPF | Senha local | Tela inicial |
|---|---|---|---|
| Administrador | `000.000.000-01` | `admin123` | `adm.html` |
| Gerente | `000.000.000-02` | `admin123` | `adm.html` |
| Atendente | `000.000.000-03` | `admin123` | `atendente.html` |
| Cozinha | `000.000.000-04` | `admin123` | `cozinha.html` |
| Caixa | `000.000.000-05` | `admin123` | `pdv.html` |

Esses CPFs sao ficticios, sem digitos verificadores validos; nao identificam pessoas.
O administrador padrao `000.000.000-01` e os usuarios existentes continuam disponiveis.
O seed so cria usuarios ausentes, sem substituir senhas ou perfis ja cadastrados. Excecao: com os acessos de teste habilitados, o `000.000.000-02` que ainda for `ADMIN` passa a `GERENTE`.
`DEFAULT_TEST_USERS_ENABLED=true` habilita os quatro acessos operacionais acima (configurado no Docker local); o administrador padrao e criado mesmo sem ele.
Fora do Docker local, esse seed de teste fica desligado por padrao.
`DEFAULT_ADMIN_ENABLED=false` desliga toda a criacao automatica de acessos.

### Controle de acesso

Regras completas em `docs/Requisitos/RegrasNegocioAcessos.md`.

| Perfil | Tela inicial | Telas permitidas |
|---|---|---|
| `ADMIN` | `adm.html` | `adm.html` (sistema: usuarios, restaurante, integracoes; dashboard, relatorios e funcionarios em leitura) |
| `GERENTE` | `adm.html` | `adm.html`, `pdv.html`, `atendente.html`, `cozinha.html` |
| `FUNCIONARIO` | `atendente.html` | `atendente.html` |
| `CAIXA` | `pdv.html` | `pdv.html` |
| `COZINHA` | `cozinha.html` | `cozinha.html` |

- Backend: rotas protegidas com `Depends(exigir_perfis(Role.X, ...))` (`app/security.py`). Sem token: 401; perfil fora: 403 "Acesso negado". O perfil e lido do banco a cada requisicao. Publicos: login/refresh/recuperacao de senha, cardapio (so itens ativos), `GET /api/mesas/por-token/{token}`, criacao de pedido pelo cliente, `GET /api/restaurante` (sem CNPJ), CEP e `/actuator/health`.
- `/api/usuarios`: `ADMIN` gerencia todos; `GERENTE` so `FUNCIONARIO`/`CAIXA`/`COZINHA` e nao exclui (usa `ativo`). Ninguem altera o proprio perfil/situacao; o ultimo `ADMIN` ou `GERENTE` ativo nao pode ser removido (409).
- Status de pedido: maquina de estados em `routers/pedidos.py` (`TRANSICOES_STATUS`). Cancelamento exige `motivo`; `ENTREGUE` (pago) exige `formaPagamento`.
- Mesas: cadastro via `PUT /api/mesas/{id}` (Gerente); status via `PATCH /api/mesas/{id}/status`; reserva via `PATCH /api/mesas/{id}/reserva`.
- Fluxo do cliente (`user.html`): a mesa vem so do QR Code (`?mesaToken=`). `POST /api/pedidos` envia `mesaToken` e devolve `tokenAcesso`; o acompanhamento usa `GET /api/pedidos/{id}?token=<tokenAcesso>`. Sem `mesaToken` valido, o pedido anonimo recebe 403.
- Abertura da mesa: o pedido anonimo so e aceito com a mesa em `ocupada`, status definido pela equipe ("Abrir mesa" no atendente) ou por um pedido lancado por ela; caso contrario, 409. Com a mesa fechada, o cardapio continua visivel e `user.html` mostra um aviso. Fechar a conta libera a mesa e volta a bloquear. O QR Code impresso e fixo: uma foto dele ainda funciona enquanto a mesa estiver aberta, por isso ha tambem o limite de 20 pedidos anonimos por mesa a cada 10 minutos (429).
- Frontend: a sessao guarda `backendRole`; cada tela confere o perfil ao carregar e redireciona para a tela inicial do perfil. Perfil desconhecido nao entra. Ocultar menus e so usabilidade: a autorizacao real e do backend.

## WebSocket

Endpoint (conexao sem credencial valida e fechada com codigo 1008):

```text
ws://localhost:8081/ws                                            # GERENTE, FUNCIONARIO, CAIXA, COZINHA: todos os eventos
ws://localhost:8081/ws?pedido=<id>&pedidoToken=<tokenAcesso>      # cliente: so eventos do proprio pedido
```

A equipe envia o token na primeira mensagem, em ate 5 segundos: `{ "type": "AUTH", "token": "<access JWT>" }`. O token nao vai na URL porque URLs ficam nos logs de acesso. A API responde `{ "type": "AUTENTICADO" }`.

`ADMIN` nao recebe eventos operacionais. Os eventos nao incluem `tokenAcesso`.

Eventos publicados:

```json
{ "type": "NOVO_PEDIDO", "pedido": {} }
{ "type": "PEDIDO_ATUALIZADO", "pedido": {} }
{ "type": "VENDA_CAIXA", "pedido": {} }
{ "type": "ESTOQUE_BAIXO", "insumos": [] }
```

`ESTOQUE_BAIXO` e enviado somente a equipe, quando um insumo atinge o estoque minimo.

## Relatorios e estoque

- `GET /api/relatorios/bcg`: Matriz BCG com dados internos, no lugar dos dados de mercado. Compara o periodo com o anterior de mesma duracao. Participacao alta: igual ou maior que a media por item ativo no faturamento; crescimento: faturar mais que no periodo anterior. Produto novo com vendas conta como crescimento. A tela mostra Em alta (Estrela), Garantido (Vaca Leiteira), Promissor (Interrogacao) e Em queda (Abacaxi).
- `GET /api/relatorios/vendas` e `/resumo`: `faturamento` (lancado) = `faturamentoRecebido` + `faturamentoEmAberto`; `valorCancelado` fica fora do total. Recebido e pedido com `pago_em` ou entregue.
- `GET /api/relatorios/cardapio`: sem ficha tecnica, `lucro` e `null`, pois o custo e desconhecido.
- Estoque (`app/estoque.py`): a baixa ocorre ao sair da fila (em preparo ou pronto) ou na venda de caixa entregue na hora. Editar um pedido ja baixado ajusta so a diferenca. Cancelar antes do preparo nao movimenta; depois do preparo a baixa e mantida, pois o insumo ja foi usado. O saldo pode ficar negativo, para nao travar a cozinha. Movimentacoes em `GET /api/insumos/movimentos`.

## O Que Nao Fazer

- Nao depender de Python instalado manualmente no PC de cada pessoa para rodar a aplicacao.
- Nao usar Fly.io ou Render no fluxo local.
- Nao editar dados diretamente sem refletir mudancas estruturais em `database/schema.sql`.


## Edicao operacional de pedidos

Atendente, Cozinha e Gerente podem usar `PUT /api/pedidos/{id}/itens` para pedidos
RECEBIDO, EM_PREPARO ou PRONTO. Enviar `itens`, `observacoes`, `motivo` e a
versao `atualizadoEm` retornada pela consulta. Edicao de PRONTO retorna ao
preparo; versao desatualizada retorna 409. O servidor recalcula o total e
publica PEDIDO_ATUALIZADO. A espera do atendente exclui pedidos SERVIDO.

A migracao `007_fotos_catalogo_demo.sql` corrige fotos dos produtos de teste;
o Docker Compose ja a executa na inicializacao. Fontes das fotografias:
`frontend/images/menu/FONTES.md`.

Teste visual e funcional das tres telas (servicos locais em execucao):

```powershell
node scripts/check-operacao.mjs
```

## Testes

Testes de integracao da API, com o Docker local em execucao. Cada teste desfaz o que gravou:

```powershell
npm test
```

O CI (`.github/workflows/ci.yml`) cria o banco do zero, roda esses testes e verifica a sintaxe do JavaScript em cada push na `main` e em cada pull request.

`scripts/check-melhorias.mjs` percorre o fluxo no navegador: QR Code bloqueado, abertura da mesa, WebSocket das quatro telas e baixa de estoque. Ele grava dados, entao exige uma API ligada a uma copia do banco. Rastreabilidade entre requisitos e testes: `docs/rastreabilidade.md`.

Analise e sugestoes priorizadas: `docs/analise-melhorias-operacao.md`.

## Operacao de pedidos - 09/11/2026

Atendente e Cozinha podem editar e cancelar em RECEBIDO, EM_PREPARO e PRONTO.
Edicao de PRONTO retorna a EM_PREPARO para conferencia. Cancelamento exige motivo.
A API valida a origem pelo perfil (Gerente pode informar a tela em que operou).
O historico existente guarda o setor como prefixo do motivo: `[Atendente]` ou
`[Cozinha]`. A resposta apresenta `motivoCancelamento` e `origemCancelamento`;
o gerente ve ambos na consulta de cancelamentos e nos detalhes do pedido.
Registros antigos sem setor continuam com origem nao registrada.

Normalizar nomes existentes no banco Docker local, sem criar pedidos:

```powershell
docker compose -f backend-python/docker-compose.yml exec -T api python -m app.local_demo_names
```

A carga `python -m app.local_test_data` tambem aplica os nomes naturais.
Validacao das telas (frontend em 5500, API em 8081):

```powershell
node scripts/check-pedidos-operacao.mjs
```

O teste verifica cinco logins reais e usa pedidos simulados no navegador.
Persistencia e permissoes sao verificadas em `test_operacao_pedidos.py`,
com transacoes desfeitas ao final.

A consulta paginada de pedidos aceita `status`, `data`, `mesa`, `cliente`,
`numero` (ID ou codigo) e `ordem` (`recentes`, `antigos`, `total_maior`,
`total_menor`). Filtros e ordenacao sao aplicados antes da paginacao na API.
`canceladoEm` vem do registro de cancelamento no historico, separado de `dataHora`.
O teste `node scripts/check-pedidos-filtros.mjs` verifica consultas reais sem
alterar pedidos e os controles de desktop/celular, salvando capturas no TEMP.

A ordenacao cronologica usa o horario de cancelamento nos CANCELADO e o de
entrega nos ENTREGUE; pedidos em andamento usam a criacao. A coluna mostra o
evento e tambem a data original do pedido. O filtro de data continua sendo pela
data de criacao, conforme o rotulo "Data do pedido".

Para atualizar somente motivos genericos e origens dos cenarios de demonstracao:
`docker compose -f backend-python/docker-compose.yml exec -T api python -m app.local_demo_cancellations`.
O comando e idempotente, limitado aos pedidos T26-/LOCAL-DEMO-, preserva horarios
e motivos manuais e recupera a origem dos registros manuais pelo usuario autor.

Para limpar e repovoar os dados operacionais do Docker local, use
`python -m app.local_test_data --reset` no container, com a API parada e um backup
previo. Restaurante e cardapio sao preservados; usuarios, clientes, fornecedores,
funcionarios, mesas, insumos, fichas, pedidos e historicos sao recriados.
A carga recria os cinco logins, nove pedidos ativos recentes, historico de trinta
dias e cenarios naturais de cancelamento. Tempos ativos ficam entre 5 e 19 minutos
no momento da carga e continuam aumentando conforme o tempo real passa.
