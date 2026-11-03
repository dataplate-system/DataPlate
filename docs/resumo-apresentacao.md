# Resumo da etapa de melhorias do DataPlate

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
  Atendente, Cozinha e Caixa, com CPFs sintéticos válidos e senhas próprias.

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
