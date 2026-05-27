const botoes = document.querySelectorAll(".categorias button");
const itens = document.querySelectorAll(".item");
const searchInput = document.getElementById("search");
const API_BASE_URL = (() => {
  const h = window.location.hostname;
  const isLocal = h === 'localhost' || h === '127.0.0.1';
  if (isLocal && window.location.port === '8080') return '/api';
  if (isLocal) return `http://${h}:8080/api`;
  return 'https://dataplate.onrender.com/api';
})();

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
}

function extractErrorMessage(body, fallback) {
  if (!body) return fallback;
  if (typeof body === "string") return body || fallback;
  return body.message || body.mensagem || body.erro || fallback;
}

let pedidoEmAndamento = localStorage.getItem("pedidoAtivo") === "true";

let categoriaAtual = "todos";

let produtosCardapio = [];

function getImagemProduto(produto) {
  return produto.imagem || "../images/menu/hamburguer.jpg";
}

function getCategoriaProduto(produto) {
  const categorias = {
    1: "hamburguer",
    2: "massas",
    3: "principais",
    4: "entradas",
    5: "sobremesas",
    6: "bebidas"
  };
  return categorias[Number(produto.idCategoria)] || "principais";
}

function formatarPreco(valor) {
  return "R$ " + Number(valor || 0).toFixed(2).replace(".", ",");
}

function escaparHtml(valor) {
  const div = document.createElement("div");
  div.textContent = valor == null ? "" : String(valor);
  return div.innerHTML;
}

function escaparJsString(valor) {
  return String(valor == null ? "" : valor)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, " ");
}

function esconderTelasProduto() {
  document.querySelectorAll('[id^="telaProduto"]').forEach((tela) => {
    tela.style.display = "none";
  });
}

// BOTÃO VOLTAR
function voltarPagina() {
  window.history.back(); // volta para a página anterior
}

// BOTÃO CARRINHO
function abrirCarrinho() {
  document.getElementById("telaLista").style.display = "none";

  // esconder todos os produtos
  esconderTelasProduto();

  document.getElementById("telaCarrinho").style.display = "block";

  carregarCarrinho();
}




// FUNÇÃO PRINCIPAL (filtra tudo junto)
function filtrar() {
  const textoBusca = searchInput.value.toLowerCase();
  const itensAtuais = document.querySelectorAll("#listaPratos .item");

  itensAtuais.forEach(item => {
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
if (searchInput) {
  searchInput.addEventListener("input", filtrar);
}

// CODIGO DO CARINHO


function carregarCarrinho() {
  let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];

  const lista = document.getElementById("listaCarrinho");
  if (!lista) return;

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
          <span onclick="remover(${index})"><img src="../images/ui/lixeira.png" alt="Remover"></span>
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

function adicionarCarrinho(produtoId, nome, preco, imagem, qtd) {
  if (!produtoId || !nome || !preco || !imagem || !Number.isInteger(qtd) || qtd < 1) {
    alert("Selecione uma quantidade válida antes de adicionar ao carrinho.");
    return;
  }

  let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];

  carrinho.push({
    produtoId: produtoId,
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
  esconderTelasProduto();

}

function voltarListaDinamica() {
  esconderTelasProduto();
  document.getElementById("telaLista").style.display = "block";
}

function abrirProdutoDinamico(produtoId) {
  const produto = produtosCardapio.find((item) => Number(item.id) === Number(produtoId));
  if (!produto) return;

  esconderTelasProduto();
  document.getElementById("telaLista").style.display = "none";

  let tela = document.getElementById("telaProdutoDinamico");
  if (!tela) {
    tela = document.createElement("div");
    tela.id = "telaProdutoDinamico";
    tela.style.display = "none";
    document.body.appendChild(tela);
  }

  const imagem = getImagemProduto(produto);
  const nome = escaparHtml(produto.nome);
  const descricao = escaparHtml(produto.descricao || "Sem descrição cadastrada.");
  tela.innerHTML = `
    <header class="topo">
      <button class="voltar" onclick="voltarListaDinamica()">←</button>
      <img src="../images/brand/logo-emp.png" class="logo-topo">
      <button class="carrinho" onclick="abrirCarrinho()">🛒</button>
    </header>
    <div class="topo-img">
      <img src="${escaparHtml(imagem)}">
    </div>
    <div class="container">
      <h2>${nome}</h2>
      <p>${descricao}</p>
      <span class="preco">${formatarPreco(produto.preco)}</span>
      <h3>Quantidade</h3>
      <div class="quantidade">
        <button onclick="diminuirQtd(this)">-</button>
        <span class="qtd">1</span>
        <button onclick="aumentarQtd(this)">+</button>
      </div>
      <button class="btn-carrinho" onclick="adicionarCarrinho(${produto.id}, '${escaparJsString(produto.nome)}', ${Number(produto.preco || 0)}, '${escaparJsString(imagem)}', parseInt(this.parentElement.querySelector('.qtd').innerText))">
        Adicionar ao carrinho
      </button>
    </div>
  `;
  tela.style.display = "block";
}

async function carregarCardapio() {
  const lista = document.getElementById("listaPratos");
  if (!lista) return;

  try {
    const response = await fetch(`${API_BASE_URL}/produtos`);
    if (!response.ok) {
      const body = await readResponseBody(response);
      throw new Error(extractErrorMessage(body, "Nao foi possivel carregar o cardapio."));
    }

    const produtos = await response.json();
    produtosCardapio = produtos.filter((produto) => produto.ativo !== false);
    if (!produtosCardapio.length) return;

    lista.innerHTML = produtosCardapio.map((produto) => `
      <div class="item" data-categoria="${getCategoriaProduto(produto)}" onclick="abrirProdutoDinamico(${produto.id})">
        <img src="${escaparHtml(getImagemProduto(produto))}">
        <div class="info">
          <h3>${escaparHtml(produto.nome)}</h3>
          <p>${escaparHtml(produto.descricao || "Sem descrição cadastrada.")}</p>
          <span class="preco">${formatarPreco(produto.preco)}</span>
        </div>
      </div>
    `).join("");
    filtrar();
  } catch (error) {
    console.error("Erro ao carregar cardapio:", error);
  }
}

// pagamento

function confirmarPedido() {
  const carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];

  if (!carrinho.length) {
    alert("Adicione pelo menos um produto ao carrinho antes de confirmar o pedido.");
    return;
  }

  atualizarResumoPagamento();

  document.getElementById("telaCarrinho").style.display = "none";
  document.getElementById("telaPagamento").style.display = "block";
  atualizarTotalPagamento();
}

function atualizarResumoPagamento() {

  let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];

  let total = 0;

  carrinho.forEach(item => {
    total += item.preco * item.quantidade;
  });

  document.getElementById("totalPagamento").innerText =
    "R$ " + total.toFixed(2).replace(".", ",");
}


async function pagamentoAprovado() {
  const carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];
  if (!carrinho.length) {
    alert("Adicione pelo menos um produto ao carrinho antes de finalizar o pagamento.");
    return;
  }

  const pedido = {
    numeroMesa: 1,
    itens: carrinho.map(item => ({
      produtoId: item.produtoId,
      quantidade: item.quantidade
    }))
  };

  try {
    const response = await fetch(`${API_BASE_URL}/pedidos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(pedido)
    });

    if (!response.ok) {
      const body = await readResponseBody(response);
      throw new Error(extractErrorMessage(body, "Nao foi possivel salvar o pedido."));
    }
  } catch (error) {
    console.error("Erro ao salvar pedido:", error);
    alert(error.message);
    return;
  }

  localStorage.setItem("pedidoAtivo", "true");
  pedidoEmAndamento = true;
  localStorage.removeItem("carrinho");
  atualizarBadge();

  document.getElementById("telaPix").style.display = "block";
  gerarPixAutomatico();
  document.getElementById("telaCredito").style.display = "none";
  document.getElementById("telaDebito").style.display = "none";
  document.getElementById("telaDinheiro").style.display = "none";
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
// PAGAMENTO


// ================= PAGAMENTO =================

let pagamentoSelecionado = "";

// telas de pagamento
const telasPagamento = {
  Pix: "telaPix",
  Credito: "telaCredito",
  Debito: "telaDebito",
  Dinheiro: "telaDinheiro"
};

// selecionar forma
function selecionarPagamento(elemento, tipo) {

  document.querySelectorAll(".opcao").forEach(op => {
    op.classList.remove("ativa");
  });

  elemento.classList.add("ativa");

  pagamentoSelecionado = tipo;
}

// finalizar pagamento
function finalizarPagamento(){

  if(pagamentoSelecionado === "Pix"){

    document.getElementById("telaPagamento").style.display = "none";

    document.getElementById("telaPix").style.display = "block";

    gerarPixAutomatico();

  }

  else if(pagamentoSelecionado === "Credito"){

    document.getElementById("telaPagamento").style.display = "none";

    document.getElementById("telaCredito").style.display = "block";

  }

  else if(pagamentoSelecionado === "Debito"){

    document.getElementById("telaPagamento").style.display = "none";

    document.getElementById("telaDebito").style.display = "block";

  }

  else if(pagamentoSelecionado === "Dinheiro"){

    document.getElementById("telaPagamento").style.display = "none";

    document.getElementById("telaDinheiro").style.display = "block";

  }

}

// voltar pagamento
function fecharTelaPagamento() {

  // fecha telas internas
  Object.values(telasPagamento).forEach(id => {
    document.getElementById(id).style.display = "none";
  });

  // fecha tela pagamento
  document.getElementById("telaPagamento").style.display = "none";

  // volta carrinho
  document.getElementById("telaCarrinho").style.display = "block";

  pagamentoSelecionado = "";

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
  { titulo: "Pronto", msg: "Seu pedido está pronto" }
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

    if (etapa > 3) {
      clearInterval(intervalo);

      localStorage.removeItem("carrinho");
      localStorage.removeItem("pedidoAtivo");
      pedidoEmAndamento = false;

      return;
    }

    atualizarTela();

  }, 5000);
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
carregarCardapio();
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

atualizarBadge();



function gerarPixAutomatico(){

  // PEGA O TOTAL
  let textoTotal =
    document.getElementById("totalPagamento")
    .innerText;

  // REMOVE R$
  textoTotal = textoTotal
    .replace("R$", "")
    .replace(/\s/g, "")
    .replace(",", ".");

  let valor = parseFloat(textoTotal);

  // VALIDAÇÃO
  if(isNaN(valor) || valor <= 0){

    alert("Erro ao gerar Pix. Total inválido.");

    return;
  }

  // MOSTRA VALOR
  document.getElementById("valorPix").innerText =
    "R$ " + valor.toFixed(2).replace(".", ",");

  // SUA CHAVE PIX
  let chavePix = "pix@dataplate.com";

  // CÓDIGO PIX
  let payloadPix =
`Pagamento DataPlate
Valor: R$ ${valor.toFixed(2)}
PIX: ${chavePix}`;

  // GERA QR CODE
  let qrCode =
`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payloadPix)}`;

  // APLICA QR
  document.getElementById("qrCodePix").src =
    qrCode;

  // MOSTRA CHAVE
  document.getElementById("chavePix").innerText =
    chavePix;

}
function atualizarTotalPagamento(){

  let total = 0;

  carrinho.forEach(item => {
    total += item.preco * item.quantidade;
  });

  document.getElementById("totalPagamento").innerText =
    "R$ " + total.toFixed(2).replace(".", ",");

}
