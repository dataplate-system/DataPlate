-- Fichas tecnicas dos produtos de demonstracao que nao tinham receita.
-- Sem ficha nao ha custo, e a Matriz BCG do cardapio nao calcula o lucro do item.
-- Idempotente: so cria insumos ausentes e so preenche produtos ainda sem ficha.

INSERT INTO insumos (nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
SELECT v.nome, v.unidade, v.atual, v.minima, v.custo, TRUE
FROM (VALUES
    ('Bacalhau Dessalgado', 'kg', 6.000, 2.000, 89.90),
    ('Tortilha de Trigo', 'un', 60.000, 20.000, 2.50),
    ('Manga', 'kg', 8.000, 3.000, 9.90),
    ('Polpa de Maracujá', 'kg', 6.000, 2.000, 18.90)
) AS v(nome, unidade, atual, minima, custo)
WHERE NOT EXISTS (SELECT 1 FROM insumos i WHERE i.nome = v.nome);

INSERT INTO produto_insumos (produto_id, insumo_id, quantidade)
SELECT p.id_produto, i.id, v.quantidade
FROM (VALUES
    ('Bolinho de Bacalhau (6 un.)', 'Bacalhau Dessalgado', 0.090),
    ('Bolinho de Bacalhau (6 un.)', 'Batata', 0.120),
    ('Bolinho de Bacalhau (6 un.)', 'Óleo de Soja', 0.080),
    ('Caldinho de Feijão', 'Feijão Carioca', 0.150),
    ('Caldinho de Feijão', 'Bacon', 0.030),
    ('Caldinho de Feijão', 'Cebola', 0.020),
    ('Wrap de Frango', 'Tortilha de Trigo', 1.000),
    ('Wrap de Frango', 'Peito de Frango', 0.150),
    ('Wrap de Frango', 'Alface Americana', 0.200),
    ('Wrap de Frango', 'Tomate', 0.050),
    ('Nhoque ao Sugo', 'Batata', 0.300),
    ('Nhoque ao Sugo', 'Farinha de Trigo', 0.080),
    ('Nhoque ao Sugo', 'Tomate', 0.200),
    ('Salada Tropical', 'Alface Americana', 0.500),
    ('Salada Tropical', 'Manga', 0.150),
    ('Salada Tropical', 'Tomate', 0.080),
    ('Salada Tropical', 'Polpa de Maracujá', 0.040),
    ('Mousse de Maracujá', 'Leite Condensado', 0.250),
    ('Mousse de Maracujá', 'Creme de Leite', 0.100),
    ('Mousse de Maracujá', 'Polpa de Maracujá', 0.080)
) AS v(produto, insumo, quantidade)
JOIN produto p ON p.nome = v.produto
JOIN insumos i ON i.nome = v.insumo
WHERE NOT EXISTS (SELECT 1 FROM produto_insumos pi WHERE pi.produto_id = p.id_produto);
