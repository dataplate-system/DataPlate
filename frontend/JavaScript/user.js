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
  document.getElementById("telaLista").style.display = "none";

  // esconder todos os produtos
  document.getElementById("telaProduto").style.display = "none";
  document.getElementById("telaProduto2").style.display = "none";
  document.getElementById("telaProduto3").style.display = "none";
  document.getElementById("telaProduto4").style.display = "none";
  document.getElementById("telaProduto5").style.display = "none";
  document.getElementById("telaProduto6").style.display = "none";
  document.getElementById("telaProduto7").style.display = "none";

  document.getElementById("telaCarrinho").style.display = "block";

  carregarCarrinho();
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
// ABRIR PRODUTO HAMBURGER
function abrirProduto() {
  document.getElementById("telaLista").style.display = "none";
  document.getElementById("telaProduto").style.display = "block";
}

function voltarLista() {
  document.getElementById("telaProduto").style.display = "none";
  document.getElementById("telaLista").style.display = "block";
}

// ABRIR PRODUTO PASTA CARBONARA

function abrirProduto2() {
  document.getElementById("telaLista").style.display = "none";
  document.getElementById("telaProduto2").style.display = "block";
}

function voltarLista2() {
  document.getElementById("telaProduto2").style.display = "none";
  document.getElementById("telaLista").style.display = "block";
}

// ABRIR PRODUTO SALMAO

function abrirProduto3() {
  document.getElementById("telaLista").style.display = "none";
  document.getElementById("telaProduto3").style.display = "block";
}

function voltarLista3() {
  document.getElementById("telaProduto3").style.display = "none";
  document.getElementById("telaLista").style.display = "block";
}

// ABRIR PRODUTO SALADA

function abrirProduto4() {
  document.getElementById("telaLista").style.display = "none";
  document.getElementById("telaProduto4").style.display = "block";
}

function voltarLista4() {
  document.getElementById("telaProduto4").style.display = "none";
  document.getElementById("telaLista").style.display = "block";
}

// ABRIR PRODUTO BOLO DE CHOCOLATE

function abrirProduto5() {
  document.getElementById("telaLista").style.display = "none";
  document.getElementById("telaProduto5").style.display = "block";
}

function voltarLista5() {
  document.getElementById("telaProduto5").style.display = "none";
  document.getElementById("telaLista").style.display = "block";
}

// ABRIR PRODUTO TIRAMESEU

function abrirProduto6() {
  document.getElementById("telaLista").style.display = "none";
  document.getElementById("telaProduto6").style.display = "block";
}

function voltarLista6() {
  document.getElementById("telaProduto6").style.display = "none";
  document.getElementById("telaLista").style.display = "block";
}

// ABRIR PRODUTO ÁGUA

function abrirProduto7() {
  document.getElementById("telaLista").style.display = "none";
  document.getElementById("telaProduto7").style.display = "block";
}

function voltarLista7() {
  document.getElementById("telaProduto7").style.display = "none";
  document.getElementById("telaLista").style.display = "block";
}
// QUANTIDADE

function aumentarQtd(btn) {
  let qtd = btn.parentElement.querySelector(".qtd");
  qtd.innerText = parseInt(qtd.innerText) + 1;
}

function diminuirQtd(btn) {
  let qtd = btn.parentElement.querySelector(".qtd");
  if (qtd.innerText > 1)
    qtd.innerText = parseInt(qtd.innerText) - 1;
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

// CODIGO DO CARINHO


function carregarCarrinho() {
  let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];

  const lista = document.getElementById("listaCarrinho");
  lista.innerHTML = "";

  let total = 0;

  carrinho.forEach((item, index) => {
    total += item.preco * item.quantidade;

    lista.innerHTML += `
      <div class="item">
        <img src="${item.imagem}">
        <div class="info">
          <h3>${item.nome}</h3>
          <p>R$ ${item.preco}</p>
          <div class="quantidade">
            <button onclick="diminuir(${index})">-</button>
            <span>${item.quantidade}</span>
            <button onclick="aumentar(${index})">+</button>
          </div>
        </div>
        <button onclick="remover(${index})">🗑️</button>
      </div>
    `;
  });

  document.getElementById("total").innerText = "Total: R$ " + total.toFixed(2);
}

function aumentar(i) {
  let carrinho = JSON.parse(localStorage.getItem("carrinho"));
  carrinho[i].quantidade++;
  localStorage.setItem("carrinho", JSON.stringify(carrinho));
  carregarCarrinho();
}

function diminuir(i) {
  let carrinho = JSON.parse(localStorage.getItem("carrinho"));
  if (carrinho[i].quantidade > 1) {
    carrinho[i].quantidade--;
  }
  localStorage.setItem("carrinho", JSON.stringify(carrinho));
  carregarCarrinho();
}

function remover(i) {
  let carrinho = JSON.parse(localStorage.getItem("carrinho"));
  carrinho.splice(i, 1);
  localStorage.setItem("carrinho", JSON.stringify(carrinho));
  carregarCarrinho();
}

carregarCarrinho();


//adição de produtos ao carrinho

function adicionarCarrinho(nome, preco, imagem, qtd) {
  let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];

  carrinho.push({
    nome: nome,
    preco: preco,
    imagem: imagem,
    quantidade: qtd
  });

  localStorage.setItem("carrinho", JSON.stringify(carrinho));

  alert("Produto adicionado ao carrinho!");
}

function voltarCarrinho() {
  document.getElementById("telaCarrinho").style.display = "none";
  document.getElementById("telaLista").style.display = "block";

  // esconder produtos
  document.getElementById("telaProduto").style.display = "none";
  document.getElementById("telaProduto2").style.display = "none";
  document.getElementById("telaProduto3").style.display = "none";
  document.getElementById("telaProduto4").style.display = "none";
  document.getElementById("telaProduto5").style.display = "none";
  document.getElementById("telaProduto6").style.display = "none";
  document.getElementById("telaProduto7").style.display = "none";

}
