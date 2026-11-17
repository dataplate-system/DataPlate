-- Corrige apenas imagens antigas ou ausentes dos produtos de demonstracao.
-- Fotos personalizadas permanecem intactas; reexecutar esta migracao e seguro.
WITH fotos(codigo, arquivo) AS (VALUES
  ('TEST-BURG-01', 'hamburguer.jpg'),
  ('TEST-SALAD-01', 'salada-caesar.jpg'),
  ('TEST-MAIN-01', 'file-fritas.jpg'),
  ('TEST-PASTA-01', 'massa-tomate.jpg'),
  ('TEST-DESSERT-01', 'pudim.jpg'),
  ('TEST-DRINK-01', 'suco-laranja.jpg'),
  ('LDEMO-P01', 'hamburguer.jpg'),
  ('LDEMO-P02', 'burger-frango.jpg'),
  ('LDEMO-P03', 'massa-tomate.jpg'),
  ('LDEMO-P04', 'massa-cremosa.jpg'),
  ('LDEMO-P05', 'frango-arroz.jpg'),
  ('LDEMO-P06', 'salmao-grelhado.jpg'),
  ('LDEMO-P07', 'salada-horta.jpg'),
  ('LDEMO-P08', 'salada-frango.jpg'),
  ('LDEMO-P09', 'bolo-chocolate.jpg'),
  ('LDEMO-P10', 'creme-chocolate.jpg'),
  ('LDEMO-P11', 'agua.jpg'),
  ('LDEMO-P12', 'suco-laranja.jpg')
)
UPDATE produto p SET imagem = '../images/menu/' || f.arquivo
FROM fotos f WHERE p.codigo = f.codigo AND (
  p.imagem IS NULL OR p.imagem = '' OR p.imagem IN (
    '../images/menu/hamburguer.jpg', '../images/menu/pasta-carbonara.jpg',
    '../images/menu/salmao-grelhado.jpg', '../images/menu/salada-caesar.jpg',
    '../images/menu/bolo-chocolate.jpg', '../images/menu/tiramisu.jpg', '../images/menu/agua.jpg'
  )
);
