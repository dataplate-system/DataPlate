-- Fotografias distintas para produtos diferentes. Preserva fotos personalizadas.
UPDATE produto SET imagem = '../images/menu/hamburguer-classico.jpg'
WHERE codigo = 'TEST-BURG-01' AND imagem = '../images/menu/hamburguer.jpg';
UPDATE produto SET imagem = '../images/menu/suco-laranja-natural.jpg'
WHERE codigo = 'TEST-DRINK-01' AND imagem = '../images/menu/suco-laranja.jpg';
UPDATE produto SET imagem = '../images/menu/spaghetti-sugo.jpg'
WHERE codigo = 'TEST-PASTA-01' AND imagem = '../images/menu/massa-tomate.jpg';
