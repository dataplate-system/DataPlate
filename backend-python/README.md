# DataPlate Python Backend

Backend Python paralelo para a migracao gradual do DataPlate.

## Stack

- FastAPI
- SQLAlchemy
- PostgreSQL
- JWT
- Docker

## Rodar localmente com Docker

Este modo evita depender do Python instalado no PC e nao usa Fly.io.

```powershell
cd backend-python
docker compose up --build
```

O backend sobe em:

```text
http://localhost:8081
```

Health check:

```text
http://localhost:8081/actuator/health
```

Banco local:

```text
localhost:5433
database: dataplate
user: postgres
password: dataplate_local
```

Gerenciador web do banco:

```text
http://localhost:8082
```

Login no Adminer:

```text
Sistema: PostgreSQL
Servidor: db
Usuario: postgres
Senha: dataplate_local
Base de dados: dataplate
```

O schema inicial vem de `database/schema.sql`.

## Rodar sem Docker

Use apenas para desenvolvimento.

```powershell
cd backend-python
.\run-local.ps1
```

## Endpoints migrados

- `GET /actuator/health`
- `GET /actuator/health/db`
- `GET /api/cep/{cep}`
- `GET /api/cep/buscar/{cep}`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/register`
- `POST /api/auth/reset-password`
- `GET /api/categorias`
- `POST /api/categorias`
- `DELETE /api/categorias/{id}`
- `GET /api/produtos`
- `GET /api/produtos/{id}`
- `POST /api/produtos`
- `PUT /api/produtos/{id}`
- `DELETE /api/produtos/{id}`
- `GET /api/mesas`
- `POST /api/mesas`
- `PUT /api/mesas/{id}`
- `DELETE /api/mesas/{id}`
- `GET /api/clientes`
- `POST /api/clientes`
- `PUT /api/clientes/{id}`
- `DELETE /api/clientes/{id}`
- `GET /api/fornecedores`
- `POST /api/fornecedores`
- `PUT /api/fornecedores/{id}`
- `DELETE /api/fornecedores/{id}`
- `GET /api/funcionarios`
- `POST /api/funcionarios`
- `PUT /api/funcionarios/{id}`
- `DELETE /api/funcionarios/{id}`
- `GET /api/insumos`
- `POST /api/insumos`
- `PUT /api/insumos/{id}`
- `DELETE /api/insumos/{id}`
- `GET /api/restaurante`
- `PUT /api/restaurante`
- `POST /api/pedidos`
- `GET /api/pedidos`
- `GET /api/pedidos/ativos`
- `GET /api/pedidos/{id}`
- `GET /api/pedidos/mesa/{numeroMesa}`
- `PUT /api/pedidos/{id}/status`
- `GET /api/produtos/{produtoId}/insumos`
- `POST /api/produtos/{produtoId}/insumos`
- `DELETE /api/produtos/{produtoId}/insumos/{insumoId}`
- `GET /api/relatorios/resumo`
- `GET /api/relatorios/vendas`
- `GET /api/relatorios/cardapio`
- `GET /api/relatorios/operacional`
- `GET /api/usuarios`
- `PUT /api/usuarios/{id}`
- `DELETE /api/usuarios/{id}`
- `WS /ws`
