# Resumo da etapa de melhorias do DataPlate

Comparativo antes e depois, com capturas e medições: `docs/apresentacao/melhorias/comparativo.html`.

## Roteiro da demonstração

Antes de começar, rode `.\dev-start-python.ps1`, entre como Gerente e gere o QR Code de uma
mesa livre. Abra o cardápio pelo QR Code no celular. Deixe abertas as telas do atendente e da
cozinha e o painel do Gerente.

1. **Mesa fechada.** No celular, mostre o aviso e tente pedir: o pedido não avança.
2. **Abrir a mesa.** No atendente, clique na mesa e em "Abrir mesa". Em até 15 segundos o aviso
   some, e o cliente envia o pedido.
3. **Tempo real.** O pedido chega na cozinha sem recarregar a tela. Inicie o preparo.
4. **Estoque.** No Gerente, abra Insumos e mostre a baixa em "Últimas Movimentações".
5. **Financeiro.** Em Relatórios, mostre lançado, recebido e em aberto. O novo pedido entra em
   aberto até o caixa fechar a conta.
6. **Matriz BCG.** Em Relatórios, abra "Matriz BCG" e explique os quadrantes e as ações sugeridas.

Se errar a senha cinco vezes, o login desse CPF fica bloqueado por 5 minutos. Para liberar na
hora, reinicie a API.

## Sugestão de fala sobre as melhorias

"O Termo de Abertura previa a Matriz BCG e ela ainda não existia. Implementamos usando a
participação no faturamento e o crescimento em relação ao período anterior, com uma ação
sugerida para cada item. Também corrigimos o relatório financeiro, que somava como receita
pedidos ainda não pagos: em novembro eram R$ 578,60 de R$ 1.273,70. A venda agora baixa o estoque
pela ficha técnica, e o QR Code só aceita pedido depois que a equipe abre a mesa. Na segurança,
limitamos as tentativas de login e tiramos o CPF do token e dos logs. Os testes da API passaram
de 15 para 66 e agora rodam em integração contínua."

## Etapa anterior

Nesta etapa, melhoramos o fluxo entre atendente, cozinha e caixa. O objetivo foi
deixar as telas mais organizadas e reduzir erros durante o atendimento.

## O que foi adicionado

- Edição de pedidos pela cozinha: trocar produtos, ajustar quantidades e
  observações, informar o motivo e recalcular o total. Se o pedido já estava
  pronto, ele volta ao preparo para conferência.
- Filtros de mesas por disponibilidade, ocupação, reserva e pagamento pendente.
- Confirmação de retirada de pedidos de balcão já pagos pela tela do atendente.
- Uma área de pendências no PDV, com contador, busca, contas a receber e retiradas.
- Dados locais para demonstração: clientes, fornecedores, insumos, reservas,
  mesas e pedidos em diferentes etapas, além do histórico de vendas.
- Testes automatizados dos fluxos alterados.

## O que foi alterado

- Os textos e as cores das mesas foram ajustados para facilitar a leitura.
- A cozinha passou a ter colunas com cores por etapa do pedido.
- O PDV foi dividido em Nova venda, Pendências e Histórico, preservando o
  carrinho na troca de abas.
- As formas de pagamento selecionadas ganharam cor, borda e marca de confirmação.
- O catálogo local passou a usar fotografias reais diferentes para os produtos.
- Foram definidos acessos de teste separados para Administrador, Gerente,
  Atendente, Cozinha e Caixa, com CPFs fictícios e a mesma senha de teste.

## O que foi corrigido

- Pedidos servidos não entram mais na média de espera da fila.
- As observações dos pedidos exibem as instruções do cliente sem o texto técnico
  da carga de testes.
- Pedidos de balcão prontos e já pagos podem ser despachados pelo atendente.
- As mesas aguardando pagamento aparecem primeiro e podem ser filtradas.
- Os filtros de produtos do PDV usam as categorias cadastradas no banco.
- Os painéis exigem uma sessão validada pelo servidor, e a API confere o perfil
  em cada operação protegida.

## Como foi desenvolvido e validado

Usamos HTML, CSS e JavaScript nas telas, Python com FastAPI no servidor e
PostgreSQL no banco, executados localmente com Docker. As alterações de pedidos
são comunicadas aos outros painéis por WebSocket.

A edição usa a versão do pedido e uma trava no banco para evitar que duas
alterações simultâneas sobrescrevam uma à outra. O histórico registra o usuário,
a data e o motivo da alteração.

Foram executados nove testes de integração, testes dos cinco logins e testes
de interface em desktop e celular, incluindo seleção de pagamento, filtros,
edição de pedidos e preservação do carrinho.

Antes da entrega, a branch foi atualizada com as mudanças mais recentes da
equipe, incluindo os ajustes do dashboard e das integrações.

## Sugestão de fala

“Nós melhoramos a integração entre o salão, a cozinha e o caixa. Agora a cozinha
consegue alterar pedidos com motivo registrado, o atendente consegue filtrar
as mesas e confirmar retiradas de balcão, e o PDV está mais organizado. Também
corrigimos o cálculo do tempo de espera, melhoramos as imagens e deixamos clara
a forma de pagamento selecionada. Criamos acessos por perfil e uma base local
com cenários para demonstração. Por fim, atualizamos o código com o trabalho da
equipe e executamos testes no servidor e nas telas, em computador e celular.”
