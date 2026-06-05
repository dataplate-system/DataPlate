-- Adiciona status SERVIDO (comida entregue na mesa, conta ainda em aberto)
-- Entre PRONTO (pronto na cozinha) e ENTREGUE (conta paga)
INSERT INTO status_pedido (nome, descricao, cor, ordem)
SELECT 'SERVIDO', 'Pedido entregue na mesa, aguardando pagamento', '#7C3AED', 6
WHERE NOT EXISTS (SELECT 1 FROM status_pedido WHERE nome = 'SERVIDO');
