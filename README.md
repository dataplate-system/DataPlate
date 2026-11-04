# DataPlate

[![CI](https://github.com/dataplate-system/DataPlate/actions/workflows/ci.yml/badge.svg)](https://github.com/dataplate-system/DataPlate/actions/workflows/ci.yml)

Sistema web para gestao de restaurantes, com cardapio digital, pedidos em tempo real, painel de cozinha, controle de mesas, baixa de estoque pela ficha tecnica, relatorios e Matriz BCG do cardapio.

## Stack Atual

- Frontend: HTML, CSS e JavaScript
- Backend: Python com FastAPI
- Banco de dados: PostgreSQL
- Tempo real: WebSocket
- Ambiente local: Docker Compose
- Gerenciador do banco: Adminer

## Rodar Localmente

Com o Docker Desktop aberto, execute na raiz do projeto:

```powershell
.\dev-start-python.ps1
```

Servicos:

- Frontend: `http://localhost:5500/pages/adm-login.html`
- API Python: `http://localhost:8081`
- Health check: `http://localhost:8081/actuator/health/db`
- Adminer: `http://localhost:8082`

Login do banco no Adminer:

- Sistema: `PostgreSQL`
- Servidor: `db`
- Usuario: `postgres`
- Senha: `dataplate_local`
- Base de dados: `dataplate`

## Telas Para Teste

- Login administrativo: `http://localhost:5500/pages/adm-login.html`
- Administracao: `http://localhost:5500/pages/adm.html`
- Cozinha: `http://localhost:5500/pages/cozinha.html`
- Atendimento: `http://localhost:5500/pages/atendente.html`
- PDV: `http://localhost:5500/pages/pdv.html`
- Cardapio do cliente: `http://localhost:5500/pages/user.html`

Usuario de teste ja criado no banco local:

- Gerente: CPF `00000000002`, senha `admin123`.
- Demais perfis e roteiro: [Teste local](docs/teste-local.md).

## Testes

Com o Docker local em execucao:

```powershell
npm test
```

Requisitos ligados a telas e testes: [Rastreabilidade](docs/rastreabilidade.md).

## Estrutura

- `backend-python/`: API FastAPI
- `database/schema.sql`: schema inicial do PostgreSQL
- `frontend/`: telas web estaticas
- `dev-start-python.ps1`: inicializacao local com Docker

## Desenvolvimento

Veja [DEVELOPMENT.md](DEVELOPMENT.md) para detalhes de arquitetura, comandos, endpoints e convencoes.
