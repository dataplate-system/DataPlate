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
|   |   `-- main.py       # App FastAPI
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

## Banco de Dados

O schema inicial fica em `database/schema.sql`.

Quando criar ou alterar tabelas, atualize esse arquivo. O Postgres local executa o schema apenas na primeira criacao do volume Docker.

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
- Registro: `POST /api/auth/register`
- Refresh: `POST /api/auth/refresh`
- Reset de senha: `POST /api/auth/reset-password`
- Header padrao: `Authorization: Bearer <token>`
- Roles: `ADMIN`, `COZINHA`, `FUNCIONARIO`

## WebSocket

Endpoint:

```text
ws://localhost:8081/ws
```

Eventos publicados:

```json
{ "type": "NOVO_PEDIDO", "pedido": {} }
{ "type": "PEDIDO_ATUALIZADO", "pedido": {} }
{ "type": "VENDA_CAIXA", "pedido": {} }
```

## O Que Nao Fazer

- Nao depender de Python instalado manualmente no PC de cada pessoa para rodar a aplicacao.
- Nao usar Fly.io ou Render no fluxo local.
- Nao editar dados diretamente sem refletir mudancas estruturais em `database/schema.sql`.
