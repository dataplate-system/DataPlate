# Avaliação do DataPlate — 03/11/2026

## Proposta e situação atual

O TAP e o README propõem integrar cardápio por QR Code, salão, cozinha e gestão,
com análise do desempenho dos produtos. O repositório também possui PDV,
reservas, clientes, fornecedores, funcionários, insumos e fichas técnicas,
perfis de acesso e versão móvel. A prioridade recomendada é consolidar o ciclo
pedido → preparo → serviço → pagamento, antes de ampliar para delivery ou
integrações externas.

Esta avaliação considera a proposta, as telas operacionais, os modelos e as
rotas de pedidos, mesas, produtos, categorias, estoque e relatórios. Não é uma
auditoria exaustiva de segurança nem uma homologação de todos os módulos.

## Entregue nesta branch

- Status das mesas em uma área própria abaixo do número, com fonte pequena,
  quebra somente entre palavras e cores por situação.
- Espera do atendente considera RECEBIDO, EM_PREPARO e PRONTO. SERVIDO mantém
  a conta aberta, mas sai do cálculo. Indicadores voltam a `--` sem fila.
- Atualização do painel considera alterações de itens e valores, além do status,
  e recalcula a espera mesmo com WebSocket conectado e sem eventos novos.
- Cozinha com três colunas principais coloridas. Servidos/finalizados e
  cancelados ficam abaixo; encerrados não exibem cronômetro nem atraso.
- Cozinha/Gerente podem alterar produtos, quantidades e observações de pedidos
  na fila. Motivo obrigatório; total recalculado; preços dos produtos mantidos
  são preservados; novos produtos usam o preço atual. Desconto absoluto
  existente e marcadores financeiros permanecem. Pedido PRONTO volta para
  EM_PREPARO. Pedido servido, finalizado (ENTREGUE) ou cancelado não aceita edição.
- Edição exige a versão `atualizadoEm`, trava a linha no banco e recusa versões
  antigas com HTTP 409. Registra usuário, data, motivo e resumo no histórico
  existente (resumo limitado aos 255 caracteres disponíveis nessa coluna).
  Publica PEDIDO_ATUALIZADO para os demais painéis.
- PDV com cartões uniformes, preço e botão visíveis, ordenação por categoria e
  nome, busca que aceita acentos e código e filtros provenientes do cadastro.
- Fotografias reais de referência vinculadas aos produtos de demonstração.
  Fotos locais e fontes em `frontend/images/menu/FONTES.md`. Não são fotos
  dos pratos reais do restaurante. Migração 007 preserva fotos personalizadas.

## Próximas melhorias recomendadas

| Prioridade | Melhoria | Motivo e resultado esperado |
| --- | --- | --- |
| Alta | Separar pagamento de preparo e entrega | Hoje há informações financeiras em observações e o fechamento usa status ENTREGUE. Criar pagamento próprio permite distinguir balcão já pago, conta aberta, estorno e diferença após edição. Evita confundir comida pronta com dinheiro recebido. |
| Alta | Relatórios de recebido, em aberto e cancelado | `_faturamento` soma pedidos não cancelados, incluindo abertos. O total é útil como volume lançado, mas não representa necessariamente dinheiro recebido. Exibir as três medidas com nomes claros e ticket médio correspondente. |
| Alta | Fechar conta em uma única transação | `liquidarContaMesa` envia uma requisição por pedido e outra para liberar a mesa. O código trata falhas parciais, mas um endpoint transacional de fechamento reduziria essa situação. Deve aceitar chave de idempotência para evitar pagamento duplicado. |
| Alta | Complementos, retiradas e alergênicos por item | Hoje observações são principalmente do pedido inteiro. Modificadores estruturados como “sem cebola”, ponto da carne e restrição alimentar tornam o ticket inequívoco e podem recalcular adicionais. |
| Alta | Linha do tempo visível das alterações | Já existe histórico de status com usuário e motivo. Uma tela com antes/depois completos, confirmação de leitura e destaque “pedido alterado” ajuda cozinha e atendente a identificar a mudança sem comparar de memória. Ampliar armazenamento de auditoria para conteúdo completo. |
| Média | Estoque com movimentação pela ficha técnica | Há insumos e produto_insumos; não foi localizada baixa no fluxo de pedidos. Registrar consumo, perda e estorno, vinculados ao pedido, e sugerir indisponibilidade quando faltar ingrediente. Definir em qual etapa ocorre o consumo. |
| Média | Tempos por etapa e metas configuráveis | A espera atual usa a criação do pedido e limites fixos. Usar histórico para medir espera até iniciar, preparo e demora na retirada; configurar metas por categoria e turno. Isso identifica onde ocorre o gargalo. |
| Média | Abertura e fechamento de caixa por turno | Registrar saldo inicial, entradas, saídas, conferência por forma de pagamento e diferença. Complementa as vendas sem depender de integração bancária. |
| Média | Chamados da mesa pelo QR Code | Cliente solicita atendimento, água ou conta e o atendente recebe uma fila com confirmação. Usar token da mesa e intervalo mínimo entre chamados para evitar repetição. |
| Média | Saúde da conexão e recuperação | Exibir claramente última sincronização, reconexão e falha de envio. Pedidos demonstrativos não devem parecer reais durante indisponibilidade da API. Para repetição de envio, usar idempotência no backend. |
| Média | Consolidar o tema visual | O design-system contém várias camadas de sobrescrita; cores semânticas estavam sendo substituídas. Organizar tokens de status e componentes compartilhados reduz correções pontuais e diferenças entre telas. |
| Baixa | Harmonizar documentação e módulos atuais | O TAP exclui aplicativo nativo, enquanto existe estrutura Android/Capacitor. Atualizar escopo, acessos e instruções de execução para refletir o produto realmente entregue. |

## Ordem sugerida

1. Pagamentos próprios, fechamento transacional e indicadores financeiros.
2. Modificadores por item e histórico completo das alterações.
3. Movimentação de estoque e metas de tempo por etapa.
4. Chamados por QR Code, caixa por turno e padronização visual.

Integração bancária, emissão fiscal e delivery estão fora do escopo atual do TAP.
Podem ser discutidos em uma fase posterior, com requisitos específicos.

## Validação desta entrega

- Compilação Python e verificação de sintaxe dos três JavaScripts alterados.
- Seis testes de integração em PostgreSQL: edição, cálculo/preço, substituição
  com desconto e pagamento preservados, concorrência, estado encerrado,
  permissão e itens inválidos. Cada teste reverte sua transação externa.
- Teste Playwright em desktop e celular: badges legíveis, média sem pedidos
  servidos, fila vazia, formulário de edição, filtros reais de categoria,
  fotografias carregadas, botões dentro dos cartões e ausência de rolagem
  horizontal indevida. As ordens de teste no navegador são respostas simuladas;
  a persistência é coberta separadamente pelos testes no PostgreSQL.
- Docker reconstruído e migração de fotos aplicada no ambiente local.
