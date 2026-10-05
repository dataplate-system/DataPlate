# Revisao visual e responsividade

Branch: `feature/responsividade-visual-mesas`.

Abra `comparativo.html` para apresentar as imagens lado a lado. As pastas `antes` e `depois` contem capturas do celular (390 px) e desktop (1440 px). Os arquivos `-tela.png` mostram a janela; os demais mostram a pagina completa. As capturas anteriores usam as mesmas telas e dados com a folha nova de estilos desabilitada.

## Entregas

- Cabecalhos com botoes que quebram linha, navegacao entre modulos no celular e menus administrativos acessiveis por toque.
- Cards, graficos e formularios ajustados a telas pequenas; tabelas extensas com rolagem dentro do seu proprio contenedor.
- Caixa com catalogo e pedido empilhados, sem bloquear a rolagem vertical.
- Cardapio com categorias horizontais e mais espaco para os produtos.
- Mesas livres verdes, reservadas ambar, ocupadas azuis, aguardando pagamento roxas e manutencao vermelhas; rotulos e bordas consistentes no admin e atendente.
- Cards das mesas administrativas acessiveis com Tab, Enter e Espaco.

## Verificacao

Navegador Chrome via Playwright, larguras 320, 390, 768 e 1440 px. Login, admin, mesas, clientes, cozinha, atendente, PDV e cardapio. Revisao adicional das secoes administrativas em 320 px, menu de Operacoes, abertura de Nova Mesa e cores distintas de reserva/ocupacao. Nenhum pedido, reserva ou cadastro foi alterado pelos testes.

Para repetir no PowerShell, defina `DATAPLATE_TEST_CPF` e `DATAPLATE_TEST_PASSWORD` com uma conta local de administrador e execute `node scripts/check-mobile.mjs depois` e `node scripts/check-sections.mjs`. API na porta 8081, frontend na 5500 e Chrome instalado. O relatorio `depois/verificacao.json` registra as medidas verificadas.

As correcoes anteriores do schema do banco e o arquivo local de seed foram preservados e nao integram o commit desta atividade.
