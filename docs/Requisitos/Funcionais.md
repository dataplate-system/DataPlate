## RF01 - Controle Atômico: O sistema deve abater ingredientes do estoque individualmente ao confirmar um pedido.

## RF02 - Fila Preditiva: O sistema deve calcular o tempo de espera baseado em $N_{pedidos} / C_{equipe}$.

## RF03 - Smart Pricing: O sistema deve sugerir descontos automáticos para itens com alta taxa de estoque e validade próxima.

## RF04 - Gestão de Ficha Técnica: O sistema deve permitir a composição de pratos através do vínculo de múltiplos ingredientes e suas respectivas quantidades, utilizando a tabela de ficha técnica para definir o custo de produção.

## RF05 - Monitoramento de Insumos: O sistema deve emitir alertas automáticos quando o nível de um ingrediente na tabela ingredientes atingir um limite mínimo de segurança pré-definido.

## RF06 - Registro e Histórico de Pedidos: O sistema deve registrar cada pedido realizado, associando os pratos consumidos para alimentar os cálculos de tempo da Fila Preditiva (RF02) e o abatimento de estoque (RF01).

## RF07 - Cálculo de Margem de Contribuição: O sistema deve calcular automaticamente a diferença entre o preco_venda (tabela pratos) e o custo total dos insumos (tabela ingredientes + ficha técnica), auxiliando na estratégia de Smart Pricing (RF03).
