const botoes = document.querySelectorAll(".categorias button");
const itens = document.querySelectorAll(".item");
const searchInput = document.getElementById("search");

let pedidoEmAndamento = localStorage.getItem("pedidoAtivo") === "true";

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
        <div class="acoes">
          <span onclick="remover(${index})"><img src="../images/lixeira.png" alt="Remover"></span>
        </div>
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

// CONFIRMAR PEDIDO


function iniciarStatusPedido() {

  let etapa = 1;

  const status = [
    { titulo: "Pedido Recebido", msg: "Seu pedido foi recebido" },
    { titulo: "Em Preparo", msg: "Nosso chef está preparando" },
    { titulo: "Pronto", msg: "Seu pedido está pronto" },
    { titulo: "Entregue", msg: "Aproveite sua refeição!" }
  ];

  function atualizarTela() {
    document.getElementById("statusAtual").innerText = status[etapa - 1].titulo;
    document.getElementById("mensagemStatus").innerText = status[etapa - 1].msg;

    document.querySelectorAll(".step").forEach((el, i) => {
      el.classList.remove("ativo");
      if (i < etapa) el.classList.add("ativo");
    });
  }

  atualizarTela();

  let intervalo = setInterval(() => {
    etapa++;

    if (etapa > 4) {
      clearInterval(intervalo);
      localStorage.removeItem("carrinho"); // limpa carrinho
      return;
    }

    atualizarTela();

  }, 3000); // muda a cada 3 segundos
}

function novoPedido() {
  // esconder status
  document.getElementById("telaStatus").style.display = "none";

  // voltar para lista inicial
  document.getElementById("telaLista").style.display = "block";

  // resetar etapas visuais
  document.querySelectorAll(".step").forEach(el => {
    el.classList.remove("ativo");
  });

  // resetar textos
  document.getElementById("statusAtual").innerText = "Pedido Recebido";
  document.getElementById("mensagemStatus").innerText = "Seu pedido foi recebido";
}

// pagamento

function confirmarPedido() {
  document.getElementById("telaCarrinho").style.display = "none";
  document.getElementById("telaPagamento").style.display = "block";
}

let pagamentoSelecionado = "";

// selecionar opção
function selecionarPagamento(elemento, tipo) {
  document.querySelectorAll(".opcao").forEach(op => {
    op.classList.remove("ativa");
  });

  elemento.classList.add("ativa");
  pagamentoSelecionado = tipo;

  document.getElementById("formaSelecionada").innerText =
    "Selecionado: " + tipo;
}

// finalizar pagamento
function finalizarPagamento() {
  if (pagamentoSelecionado === "") {
    alert("Escolha uma forma de pagamento!");
    return;
  }

  // marcar pedido ativo
  localStorage.setItem("pedidoAtivo", "true");
  pedidoEmAndamento = true;

  document.getElementById("telaPagamento").style.display = "none";
  document.getElementById("telaStatus").style.display = "block";

  iniciarStatusPedido();
}

function voltarPagamento() {
  document.getElementById("telaPagamento").style.display = "none";
  document.getElementById("telaCarrinho").style.display = "block";

  // limpar seleção
  pagamentoSelecionado = "";
  document.getElementById("formaSelecionada").innerText = "";

  document.querySelectorAll(".opcao").forEach(op => {
    op.classList.remove("ativa");
  });
}

// botão estatus

function iniciarStatusPedido() {

  let etapa = 1;

  const status = [
    { titulo: "Pedido Recebido", msg: "Seu pedido foi recebido" },
    { titulo: "Em Preparo", msg: "Nosso chef está preparando" },
    { titulo: "Pronto", msg: "Seu pedido está pronto" },
    { titulo: "Entregue", msg: "Aproveite sua refeição!" }
  ];

  function atualizarTela() {
    document.getElementById("statusAtual").innerText = status[etapa - 1].titulo;
    document.getElementById("mensagemStatus").innerText = status[etapa - 1].msg;

    document.querySelectorAll(".step").forEach((el, i) => {
      el.classList.remove("ativo");
      if (i < etapa) el.classList.add("ativo");
    });
  }

  atualizarTela();

  let intervalo = setInterval(() => {
    etapa++;

    if (etapa > 4) {
      clearInterval(intervalo);

      localStorage.removeItem("carrinho");
      localStorage.removeItem("pedidoAtivo");
      pedidoEmAndamento = false;

      return;
    }

    atualizarTela();

  }, 3000);
}

function novoPedido() {
  document.getElementById("telaStatus").style.display = "none";
  document.getElementById("telaLista").style.display = "block";

  localStorage.removeItem("pedidoAtivo");
  pedidoEmAndamento = false;

  document.querySelectorAll(".step").forEach(el => {
    el.classList.remove("ativo");
  });

  document.getElementById("statusAtual").innerText = "Pedido Recebido";
  document.getElementById("mensagemStatus").innerText = "Seu pedido foi recebido";
}

function abrirPedidoEmAndamento() {
  if (pedidoEmAndamento) {
    document.getElementById("telaLista").style.display = "none";
    document.getElementById("telaStatus").style.display = "block";
  } else {
    alert("Nenhum pedido em andamento!");
  }
}

function atualizarBotaoPedido() {
  const btn = document.getElementById("btnPedido");

  if (!btn) return;

  if (pedidoEmAndamento) {
    btn.style.display = "block";
  } else {
    btn.style.display = "none";
  }
}

// roda ao abrir app
atualizarBotaoPedido();


function atualizarBadge() {
  const badge = document.getElementById("badgePedido");

  if (!badge) return;

  if (pedidoEmAndamento) {
    badge.style.display = "block";
    badge.innerText = "1";
  } else {
    badge.style.display = "none";
  }
}

localStorage.setItem("pedidoAtivo", "true");
pedidoEmAndamento = true;

atualizarBadge();

pedidoEmAndamento = false;

atualizarBadge();

atualizarBadge();

