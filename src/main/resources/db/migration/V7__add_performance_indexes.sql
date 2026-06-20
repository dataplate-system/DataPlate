-- Pedido: filtros mais comuns em relatórios e listagens
CREATE INDEX IF NOT EXISTS idx_pedido_data_hora ON pedido(data_hora DESC);
CREATE INDEX IF NOT EXISTS idx_pedido_id_status ON pedido(id_status);
CREATE INDEX IF NOT EXISTS idx_pedido_id_mesa ON pedido(id_mesa);
CREATE INDEX IF NOT EXISTS idx_pedido_data_status ON pedido(data_hora, id_status);

-- ItensPedido: joins com pedido e produto
CREATE INDEX IF NOT EXISTS idx_item_pedido_id_pedido ON item_pedido(id_pedido);
CREATE INDEX IF NOT EXISTS idx_item_pedido_id_produto ON item_pedido(id_produto);

-- Produto insumos: joins
CREATE INDEX IF NOT EXISTS idx_produto_insumos_produto ON produto_insumos(produto_id);
CREATE INDEX IF NOT EXISTS idx_produto_insumos_insumo ON produto_insumos(insumo_id);

-- Histórico de status: queries de tempo médio
CREATE INDEX IF NOT EXISTS idx_psh_status ON pedido_status_historico(status);
CREATE INDEX IF NOT EXISTS idx_psh_registrado_em ON pedido_status_historico(registrado_em);
