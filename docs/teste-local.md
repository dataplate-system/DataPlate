# Acessos e massa de testes local

| Perfil | CPF de teste | Senha | Responsabilidade |
| --- | --- | --- | --- |
| Administrador | 000.000.000-01 | `admin123` | Usuarios e configuracoes do sistema |
| Gerente | 000.000.000-02 | `admin123` | Gestao e todos os paineis operacionais |
| Atendente | 000.000.000-03 | `admin123` | Salao, pedidos e despacho |
| Cozinha | 000.000.000-04 | `admin123` | Preparo e alteracao dos pedidos |
| Caixa | 000.000.000-05 | `admin123` | PDV, cobranca e fechamento de mesas |

Estes acessos usam CPFs sinteticos com digitos verificadores validos. O cliente continua
acessando o cardapio pelo QR Code, sem conta de funcionario.

Entrada: http://localhost:5500/pages/adm-login.html.
Atualize as telas com Ctrl+F5 e saia da sessao anterior para testar outro perfil.
O servidor valida CPF/senha e confirma o perfil por `/api/auth/me`. O modo
demonstracao do navegador nao autentica; sessoes sem token nao abrem os paineis.
As permissoes continuam verificadas na API para cada requisicao.

## Dados disponiveis

- Mesas 101–108 com pedidos nas fases recebido, em preparo, pronto e servido.
- Mesas 107 e 108 aguardando pagamento; 109 e 110 reservadas; 111 e 112 livres.
- Pedido de balcao pago e pronto para retirada, cancelamento e venda de hoje.
- Historico de 120 pedidos distribuidos pelos 30 dias anteriores.
- Dez clientes, tres fornecedores vinculados a insumos e cinco insumos novos,
  incluindo estoque normal, baixo e zerado.
- Fichas tecnicas de teste para os primeiros produtos que ainda nao tinham receita.
- Catalogo existente preservado, com fotografias locais.

O prefixo dos pedidos novos e `T26-` e as mesas ficam na Area de testes 2026.
O carregamento preserva registros existentes, nao encerra pedidos antigos e
nao modifica o estado dos cenarios ja testados em execucoes seguintes.

## Roteiro sugerido

1. Gerente: conferir dashboard, filtros de data, estoque, fichas tecnicas,
   fornecedores, clientes, funcionarios e reservas.
2. Atendente: abrir mesa 111 ou 112 e lancar pedido. Confirmar chegada na cozinha.
3. Cozinha: iniciar preparo, alterar itens/quantidades/observacoes com motivo,
   marcar pronto e conferir atualizacao no atendente.
4. Atendente: servir pedido pronto, solicitar fechamento e conferir que pedidos
   servidos nao entram na media de espera.
5. Caixa: cobrar mesa 107 ou 108, selecionar forma de pagamento, fechar e verificar
   liberacao da mesa. Testar venda de balcao e entrega do balcao pronto.

No atendente, pedidos prontos de balcao possuem "Confirmar retirada no balcao";
o servidor exige pagamento ja registrado pelo caixa e nao efetua nova cobranca.
As mesas aguardando pagamento aparecem primeiro. Os quatro resumos por status
sao filtros: clicar seleciona o status; clicar novamente ou em "Mostrar todas"
remove o filtro. Observacoes exibem instrucoes do cliente, sem marcadores da carga.
6. Atendente: cancelar um pedido recebido com motivo e verificar aviso na cozinha.
7. Administrador: conferir usuarios/perfis. Validar que um perfil operacional
   nao consegue entrar no painel de administracao.
8. Cliente: gerar QR Code de mesa livre com o Gerente, abrir o cardapio e enviar
   pedido. Em celular, acessar pelo IP local do computador.

Recuperacao de senha por e-mail depende de SMTP configurado; dados de teste nao
substituem o provedor de e-mail. Os enderecos `example.com` sao ficticios.

## Reexecutar e validar

O PDV possui abas Nova venda, Pendências e Histórico. Pendências reúne as
contas a receber e retiradas no balcão, com contador e busca por mesa/pedido/cliente.
O carrinho permanece ao trocar de aba. Pagamentos selecionados aparecem em azul
com marca de confirmação; no modal também aparece o nome da forma escolhida.
O catálogo de demonstração utiliza uma fotografia distinta para cada produto.

Na pasta DataPlate-main, com os servicos locais ativos:

```powershell
docker exec backend-python-api-1 python -m app.local_test_data
node scripts/check-auth-local.mjs
node scripts/check-operacao.mjs
node scripts/check-pdv-controls.mjs
```

O primeiro comando redefine **somente as cinco senhas de teste acima** para os
valores documentados e acrescenta o que faltar. Nao executa automaticamente ao
reiniciar a API e nao redefine senhas de outros usuarios.
