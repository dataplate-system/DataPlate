-- Fotografias de referencia para o catalogo atual (codigos PRD-*).
-- Atualiza apenas produtos sem imagem; fotos cadastradas pelo gerente permanecem.
-- Reexecutar esta migracao e seguro.
WITH fotos(codigo, arquivo) AS (VALUES
  ('PRD-001', 'bolinho-bacalhau.jpg'),
  ('PRD-002', 'pao-alho.jpg'),
  ('PRD-003', 'hamburguer-classico.jpg'),
  ('PRD-004', 'massa-cremosa.jpg'),
  ('PRD-005', 'frango-arroz.jpg'),
  ('PRD-006', 'salada-caesar.jpg'),
  ('PRD-007', 'suco-laranja-natural.jpg'),
  ('PRD-008', 'refrigerante.jpg'),
  ('PRD-021', 'batata-cheddar-bacon.jpg'),
  ('PRD-022', 'isca-frango.jpg'),
  ('PRD-023', 'caldinho-feijao.jpg'),
  ('PRD-024', 'hamburguer.jpg'),
  ('PRD-025', 'sanduiche-costela.jpg'),
  ('PRD-026', 'wrap-frango.jpg'),
  ('PRD-027', 'spaghetti-sugo.jpg'),
  ('PRD-028', 'lasanha.jpg'),
  ('PRD-029', 'nhoque-sugo.jpg'),
  ('PRD-030', 'file-fritas.jpg'),
  ('PRD-031', 'tilapia-legumes.jpg'),
  ('PRD-032', 'strogonoff.jpg'),
  ('PRD-033', 'salada-horta.jpg'),
  ('PRD-034', 'petit-gateau.jpg'),
  ('PRD-035', 'pudim.jpg'),
  ('PRD-036', 'mousse-maracuja.jpg'),
  ('PRD-037', 'brownie.jpg'),
  ('PRD-038', 'agua.jpg'),
  ('PRD-039', 'limonada-suica.jpg'),
  ('PRD-040', 'cerveja.jpg'),
  ('PRD-041', 'cafe-expresso.jpg')
)
UPDATE produto p SET imagem = '../images/menu/' || f.arquivo
FROM fotos f
WHERE p.codigo = f.codigo AND (p.imagem IS NULL OR btrim(p.imagem) = '');
