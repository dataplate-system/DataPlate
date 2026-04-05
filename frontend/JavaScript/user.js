const botoes = document.querySelectorAll(".categorias button");
const itens = document.querySelectorAll(".item");
const searchInput = document.getElementById("search");

let categoriaAtual = "todos";

// BOTÃO VOLTAR
function voltarPagina() {
  window.history.back(); // volta para a página anterior
}

// BOTÃO CARRINHO
function abrirCarrinho() {
  // você pode redirecionar para outra página
  window.location.href = "carrinho.html";

  // OU se quiser só testar:
  // alert("Abrir carrinho de pedidos");
}

// FUNÇÃO PRINCIPAL (filtra tudo junto)
function filtrar() {
  const textoBusca = searchInput.value.toLowerCase();

  itens.forEach(item => {
    const nome = item.querySelector("h3").textContent.toLowerCase();
    const categoriaItem = item.getAttribute("data-categoria");

    const correspondeCategoria =
      categoriaAtual === "todos" || categoriaAtual === categoriaItem;

    const correspondeBusca = nome.includes(textoBusca);

    if (correspondeCategoria && correspondeBusca) {
      item.style.display = "flex";
    } else {
      item.style.display = "none";
    }
  });
}

function abrirProduto() {
  document.getElementById("telaLista").style.display = "none";
  document.getElementById("telaProduto").style.display = "block";
}

function voltarLista() {
  document.getElementById("telaProduto").style.display = "none";
  document.getElementById("telaLista").style.display = "block";
}

// QUANTIDADE
let qtd = 1;

function aumentar() {
  qtd++;
  document.getElementById("qtd").innerText = qtd;
}

function diminuir() {
  if (qtd > 1) {
    qtd--;
    document.getElementById("qtd").innerText = qtd;
  }
}
// CLIQUE NOS BOTÕES
botoes.forEach(botao => {
  botao.addEventListener("click", () => {

    // remove ativo
    botoes.forEach(b => b.classList.remove("ativo"));

    // ativa botão
    botao.classList.add("ativo");

    // atualiza categoria
    categoriaAtual = botao.getAttribute("data-categoria");

    filtrar();
  });
});

// DIGITAÇÃO NA BUSCA
searchInput.addEventListener("input", filtrar);