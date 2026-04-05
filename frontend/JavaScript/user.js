const botoes = document.querySelectorAll(".categorias button");
const itens = document.querySelectorAll(".item");
const searchInput = document.getElementById("search");

let categoriaAtual = "todos";

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