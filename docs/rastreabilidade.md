# Rastreabilidade: requisito, tela, API e teste

Liga cada requisito de [Funcionais.md](Requisitos/Funcionais.md) ao que o implementa e ao que o verifica.

Os testes `test_*.py` ficam em `backend-python/tests/` e rodam com `npm test`, também no CI. Os scripts `check-*` ficam em `scripts/`, usam o navegador e rodam no ambiente local.

| Requisito | Tela | API | Verificação |
|---|---|---|---|
| RF01 Cardápio digital | `user.html` | `GET /api/produtos`, `GET /api/mesas/por-token/{token}` | `test_mesa_qr.py`, `check-melhorias.mjs` |
| RF02 Carrinho e pedido | `user.html` | `POST /api/pedidos` | `test_mesa_qr.py`, `check-melhorias.mjs` |
| RF03 Status do pedido | `user.html`, `cozinha.html`, `adm.html` | `/ws`, `GET /api/pedidos/{id}` | `test_seguranca.py`, `check-melhorias.mjs` |
| RF04 Painel da cozinha | `cozinha.html` | `PUT /api/pedidos/{id}/status`, `PUT /api/pedidos/{id}/itens` | `test_edicao_pedido.py`, `check-operacao.mjs` |
| RF05 Controle de mesas | `adm.html`, `atendente.html` | `/api/mesas` | `test_mesa_qr.py`, `check-atendimento-real.mjs` |
| RF06 Gestão de reservas | `adm.html`, `atendente.html` | `PATCH /api/mesas/{id}/reserva` | Sem teste automatizado; roteiro em [teste-local.md](teste-local.md) |
| RF07 Relatórios administrativos | `adm.html` | `/api/relatorios/*` | `test_relatorios.py` |
| RF08 Usuários e permissões | `adm.html`, `adm-login.html` | `/api/auth/*`, `/api/usuarios` | `test_seguranca.py`, `check-auth-local.mjs` |
| RF09 Matriz BCG | `adm.html` | `GET /api/relatorios/bcg` | `test_relatorios.py`, `check-melhorias.mjs` |
| RF10 Baixa de estoque | `adm.html`, `cozinha.html` | `PUT /api/pedidos/{id}/status`, `GET /api/insumos/movimentos` | `test_estoque.py`, `check-melhorias.mjs` |
| RF11 Abertura da mesa | `atendente.html`, `user.html` | `PATCH /api/mesas/{id}/status`, `POST /api/pedidos` | `test_mesa_qr.py`, `check-melhorias.mjs` |

## Objetivos do TAP

| Objetivo específico | Situação |
|---|---|
| Cardápio digital acessível via QR Code | Entregue (RF01) |
| Pedidos em tempo real para clientes e cozinha | Entregue (RF02, RF03, RF04) |
| Controle de mesas, reservas e disponibilidade | Entregue (RF05, RF06) |
| Painel administrativo | Entregue (RF07, RF08) |
| Dashboards de desempenho dos pratos | Entregue (RF07) |
| Classificação de produtos pela Matriz BCG | Entregue (RF09) |
| Status do pedido em tempo real para o cliente | Entregue (RF03) |
| Comunicação em tempo real com a cozinha via WebSocket | Entregue (RF03, RF04) |

## Além do TAP

O TAP exclui aplicativo nativo do escopo. O repositório tem a pasta `android/`, um empacotamento Capacitor das mesmas telas web, documentado em [MOBILE.md](../MOBILE.md). PDV, insumos e fichas técnicas também foram acrescentados ao longo do projeto.
