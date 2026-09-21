# DataPlate

Sistema web para gestao de restaurantes, com cardapio digital, pedidos em tempo real, painel de cozinha, controle de mesas, cadastros e relatorios.

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

- CPF: `00000000000`
- Senha: `admin123`

## Estrutura

- `backend-python/`: API FastAPI
- `database/schema.sql`: schema inicial do PostgreSQL
- `frontend/`: telas web estaticas
- `dev-start-python.ps1`: inicializacao local com Docker

## Desenvolvimento

Veja [DEVELOPMENT.md](DEVELOPMENT.md) para detalhes de arquitetura, comandos, endpoints e convencoes.
