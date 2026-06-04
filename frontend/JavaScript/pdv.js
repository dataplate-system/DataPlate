/**
 * PDV Caixa DataPlate
 */

// -- CONFIG -------------------------------------------------------
const ADMIN_SESSION_KEY = 'dataplate:adminSession';
const ACTIVE_STATUSES   = new Set(['RECEBIDO', 'EM_PREPARO', 'PRONTO']);

const API_BASE_URL = window.DATAPLATE_API_BASE_URL
  || localStorage.getItem('DATAPLATE_API_BASE_URL')
  || (() => {
    const h = window.location.hostname;
    const isFile  = window.location.protocol === 'file:' || !h;
    const isLocal = isFile || h === 'localhost' || h === '127.0.0.1';
    if (isLocal && window.location.port === '8080') return '/api';
    if (isFile)  return 'http://localhost:8080/api';
    if (isLocal) return `http://${h}:8080/api`;
    return 'https://dataplate.onrender.com/api';
  })();

const CATEGORIA_SLUG  = { 1:'hamburguer', 2:'massas', 3:'principais', 4:'entradas', 5:'sobremesas', 6:'bebidas' };
const CATEGORIA_EMOJI = { 1:'🍔', 2:'🍝', 3:'🍽️', 4:'🥗', 5:'🍰', 6:'🥤' };

// -- ESTADO -------------------------------------------------------
let cart            = [];
let pagamentoVenda  = '';
let pagamentoConta  = '';
let categoriaAtual  = 'todos';
let termoBusca      = '';
let todosOsProdutos = [];
let todasAsMesas    = [];
let mesaSelecionada = null;
let pedidosAbertos  = [];
let tabAtual        = 'venda';
let modoAtual       = 'caixa';

// -- SESSÃO -------------------------------------------------------
function readSession() {
  try { return JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY) || 'null'); }
  catch (_) { return null; }
}

function pdvLogout() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  window.location.href = 'adm-login.html';
}

// ── COBRANÇAS PENDENTES ──────────────────────────────────────────
let _pdvPgtoMesa = null;
let _pdvPgtoSelecionado = '';
let _cobrancasTimer = null;

async function verificarCobrancas() {
  try {
    const mesas = await apiGet('/mesas');
    const pendentes = (mesas || []).filter(m =>
      (m.status || '').toLowerCase() === 'aguardando_pagamento'
    );

    const banner = document.getElementById('pdvCobrancasBanner');
    const lista  = document.getElementById('pdvCobrancasLista');
    if (!banner || !lista) return;

    if (!pendentes.length) {
      banner.style.display = 'none';
      return;
    }

    banner.style.display = 'block';
    lista.innerHTML = pendentes.map(m => {
      const pendStore = JSON.parse(localStorage.getItem('dataplate:pgto_pendente') || '{}');
      const info = pendStore[String(m.numero)];
      const pgtoLabel = info?.formaPagamento ? ` • ${info.formaPagamento}` : '';
      return `<button onclick="abrirPagamentoMesa(${m.id},${m.numero},'${m.localizacao||''}')"
        style="padding:6px 12px;border:1.5px solid #f59e0b;border-radius:6px;background:#fff;font-weight:700;font-size:12px;cursor:pointer;color:#92400e">
        Mesa ${m.numero}${pgtoLabel} &#x25B6;
      </button>`;
    }).join('');
  } catch (_) {}
}

window.abrirPagamentoMesa = async function(mesaId, numeroMesa, localizacao) {
  _pdvPgtoMesa = { id: mesaId, numero: numeroMesa, localizacao };
  _pdvPgtoSelecionado = '';

  try {
    const pedidos = await apiGet(`/pedidos/mesa/${numeroMesa}`);
    const ativos  = (pedidos || []).filter(p => !['CANCELADO','ENTREGUE'].includes(p.status));
    const total   = ativos.reduce((s, p) => s + Number(p.valorTotal || 0), 0);

    document.getElementById('pdvPgtoTitulo').textContent = `Mesa ${numeroMesa}`;
    document.getElementById('pdvPgtoTotal').textContent  = `Total a cobrar: ${formatBRL(total)}`;
    document.getElementById('pdvPgtoConfirmar').disabled = true;
    document.querySelectorAll('.pdv-pgto-opt').forEach(b => b.classList.remove('is-selected'));

    // Pre-selecionar forma preferida do atendente
    const pendStore = JSON.parse(localStorage.getItem('dataplate:pgto_pendente') || '{}');
    const sugestao  = pendStore[String(numeroMesa)]?.formaPagamento;
    if (sugestao) {
      const btn = document.querySelector(`.pdv-pgto-opt[onclick*="${sugestao}"]`);
      if (btn) { selecionarPdvPgto(sugestao, btn); }
    }

    const modal = document.getElementById('pdvPgtoModal');
    if (modal) { modal.style.display = 'flex'; }
  } catch (e) {
    showToast(e.message || 'Erro ao carregar mesa.', 'error');
  }
};

window.selecionarPdvPgto = function(tipo, btn) {
  _pdvPgtoSelecionado = tipo;
  document.querySelectorAll('.pdv-pgto-opt').forEach(b => b.classList.remove('is-selected'));
  btn.classList.add('is-selected');
  const confirmar = document.getElementById('pdvPgtoConfirmar');
  if (confirmar) confirmar.disabled = false;
};

window.fecharPdvPgtoModal = function() {
  const modal = document.getElementById('pdvPgtoModal');
  if (modal) modal.style.display = 'none';
  _pdvPgtoMesa = null;
  _pdvPgtoSelecionado = '';
};

window.confirmarPagamentoMesa = async function() {
  if (!_pdvPgtoMesa || !_pdvPgtoSelecionado) return;
  const btn = document.getElementById('pdvPgtoConfirmar');
  if (btn) { btn.disabled = true; btn.textContent = 'Processando...'; }

  try {
    const pedidos = await apiGet(`/pedidos/mesa/${_pdvPgtoMesa.numero}`);
    const ativos  = (pedidos || []).filter(p => !['CANCELADO','ENTREGUE'].includes(p.status));
    const total   = ativos.reduce((s, p) => s + Number(p.valorTotal || 0), 0);

    // Marcar todos os pedidos como ENTREGUE
    await Promise.all(ativos.map(p => apiPut(`/pedidos/${p.id}/status`, { status: 'ENTREGUE' })));

    // Mesa volta a LIVRE
    await apiPut(`/mesas/${_pdvPgtoMesa.id}`, {
      numero:      _pdvPgtoMesa.numero,
      capacidade:  4,
      status:      'livre',
      localizacao: _pdvPgtoMesa.localizacao || ''
    });

    // Remove do storage local
    const pendStore = JSON.parse(localStorage.getItem('dataplate:pgto_pendente') || '{}');
    delete pendStore[String(_pdvPgtoMesa.numero)];
    localStorage.setItem('dataplate:pgto_pendente', JSON.stringify(pendStore));

    showToast(`Mesa ${_pdvPgtoMesa.numero} paga — ${formatBRL(total)} via ${_pdvPgtoSelecionado}`, 'success');
    fecharPdvPgtoModal();
    verificarCobrancas();
  } catch (e) {
    showToast(e.message || 'Erro ao confirmar pagamento.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar Pagamento'; }
  }
};

function getAuthHeader() {
  const s = readSession();
  return s?.token ? { Authorization: `Bearer ${s.token}` } : {};
}

// -- API ----------------------------------------------------------
async function apiFetch(path, opts = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...getAuthHeader(), ...(opts.headers || {}) }
  });
}

async function apiGet(path) {
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return r.json();
}

async function apiPost(path, body) {
  const r = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(data?.message || data?.mensagem || data?.erro || `Erro ${r.status}`);
  return data;
}

async function apiPut(path, body) {
  const r = await apiFetch(path, { method: 'PUT', body: JSON.stringify(body) });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(data?.message || data?.mensagem || data?.erro || `Erro ${r.status}`);
  return data;
}

// -- HELPERS ------------------------------------------------------
function formatBRL(v) {
  return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
}

function esc(v) {
  const d = document.createElement('div');
  d.textContent = v == null ? '' : String(v);
  return d.innerHTML;
}

function showToast(msg, type = 'error') {
  const el = Object.assign(document.createElement('div'), { className: `toast ${type}`, textContent: msg });
  document.getElementById('toastArea').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function normalizeStatus(s) {
  const v = String(s || '').toLowerCase();
  return v === 'disponivel' ? 'livre' : v;
}

function moneyInputValue(id) {
  const raw = document.getElementById(id)?.value || '';
  const value = Number(String(raw).replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function calcularDesconto() {
  return Math.min(moneyInputValue('descontoInput'), calcularTotalCarrinho());
}

function calcularTotalPagar() {
  return Math.max(0, calcularTotalCarrinho() - calcularDesconto());
}

function atualizarResumoCaixa() {
  const totalPagar = calcularTotalPagar();
  const recebido = moneyInputValue('valorRecebidoInput');
  const troco = pagamentoVenda === 'DINHEIRO' ? Math.max(0, recebido - totalPagar) : 0;

  const totalPagarEl = document.getElementById('totalPagar');
  const trocoEl = document.getElementById('trocoValor');
  const cashRow = document.getElementById('cashRow');

  if (totalPagarEl) totalPagarEl.textContent = formatBRL(totalPagar);
  if (trocoEl) trocoEl.textContent = formatBRL(troco);
  if (cashRow) cashRow.hidden = pagamentoVenda !== 'DINHEIRO';
}

function aplicarModoPDV(modo) {
  modoAtual = modo === 'mesa' ? 'mesa' : 'caixa';

  document.querySelectorAll('.mode-btn').forEach(btn =>
    btn.classList.toggle('is-active', btn.dataset.mode === modoAtual)
  );

  const modoMesa = modoAtual === 'mesa';
  document.getElementById('mesaSelector').hidden = !modoMesa;
  document.getElementById('orderTabs').hidden = !modoMesa || !mesaSelecionada;
  document.getElementById('checkoutSummary').hidden = modoMesa;
  document.getElementById('pagamentoVendaSection').hidden = modoMesa;
  document.getElementById('finalizarBtn').textContent = modoMesa ? 'Enviar à cozinha' : 'Finalizar venda';

  if (!modoMesa) {
    mudarTab('venda');
  } else if (mesaSelecionada) {
    mudarTab(pedidosAbertos.length > 0 ? 'conta' : 'venda');
  }

  renderCarrinho();
}

// -- MESAS --------------------------------------------------------
async function carregarMesas() {
  const loadingDot = document.getElementById('mesaLoading');
  loadingDot?.classList.remove('hidden');

  try {
    const data = await apiGet('/mesas');
    todasAsMesas = (data || [])
      .filter(m => m.ativo !== false)
      .sort((a, b) => (a.numero || 0) - (b.numero || 0));
    popularSelectMesas();
  } catch (_) {
    showToast('Não foi possível carregar as mesas.', 'error');
  } finally {
    loadingDot?.classList.add('hidden');
  }
}

function popularSelectMesas() {
  const sel = document.getElementById('mesaSelect');
  // mantém placeholder
  while (sel.options.length > 1) sel.remove(1);

  todasAsMesas.forEach(m => {
    const st = normalizeStatus(m.status);
    const statusTexto = { livre: 'livre', ocupada: 'ocupada', reservada: 'reservada', manutencao: 'manutencao' }[st] || st;
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.dataset.numero   = m.numero;
    opt.dataset.status   = st;
    opt.dataset.localizacao = m.localizacao || '';
    opt.textContent = `Mesa ${m.numero}${m.localizacao ? ' · ' + m.localizacao : ''}  (${statusTexto})`;
    sel.appendChild(opt);
  });
}

function atualizarDotStatus(st) {
  const dot = document.getElementById('mesaStatusDot');
  if (!dot) return;
  dot.className = 'mesa-status-dot ' + (st || '');
}

function atualizarInfoMesa(mesa) {
  const el = document.getElementById('mesaInfo');
  if (!el) return;
  if (!mesa) { el.textContent = ''; return; }

  const statusMap = { livre: 'Livre', ocupada: 'Ocupada', reservada: 'Reservada', manutencao: 'Em manutenção' };
  const partes = [`Status: ${statusMap[normalizeStatus(mesa.status)] || mesa.status}`];
  if (mesa.capacidade) partes.push(`${mesa.capacidade} lugares`);
  el.textContent = partes.join(' · ');
}

async function onMesaChange() {
  const sel = document.getElementById('mesaSelect');
  const opt = sel.selectedOptions[0];

  if (!opt?.value) {
    mesaSelecionada = null;
    atualizarDotStatus('');
    atualizarInfoMesa(null);
    document.getElementById('orderTabs').hidden = true;
    atualizarBotaoFinalizar();
    return;
  }

  mesaSelecionada = todasAsMesas.find(m => m.id === Number(opt.value)) || {
    id: Number(opt.value),
    numero: Number(opt.dataset.numero),
    status: opt.dataset.status,
    localizacao: opt.dataset.localizacao
  };

  atualizarDotStatus(normalizeStatus(mesaSelecionada.status));
  atualizarInfoMesa(mesaSelecionada);
  document.getElementById('orderTabs').hidden = modoAtual !== 'mesa';

  await carregarPedidosAbertos();

  if (modoAtual === 'mesa') {
    mudarTab(pedidosAbertos.length > 0 ? 'conta' : 'venda');
  }
  atualizarBotaoFinalizar();
}

// -- PEDIDOS ABERTOS DA MESA --------------------------------------
async function carregarPedidosAbertos() {
  pedidosAbertos = [];
  if (!mesaSelecionada) return;

  const loading = document.getElementById('contaLoading');
  loading.hidden = false;
  document.getElementById('contaItens').innerHTML = '';

  try {
    const pedidosMesa = await apiGet(`/pedidos/mesa/${mesaSelecionada.numero}`);
    pedidosAbertos = (pedidosMesa || []).filter(p => ACTIVE_STATUSES.has(p.status));
  } catch (_) {
    showToast('Não foi possível verificar pedidos desta mesa.', 'error');
  } finally {
    loading.hidden = true;
  }

  renderContaMesa();
  atualizarBotaoFecharConta();
}

function calcularTotalConta() {
  return pedidosAbertos.reduce((s, p) => s + Number(p.valorTotal || 0), 0);
}

function statusPedidoLabel(s) {
  return { RECEBIDO: 'Recebido', EM_PREPARO: 'Em preparo', PRONTO: 'Pronto' }[s] || s;
}

function renderContaMesa() {
  const container = document.getElementById('contaItens');
  container.innerHTML = '';

  if (!pedidosAbertos.length) {
    container.innerHTML = `
      <div class="order-empty">
        <span>🧾</span>
        <p>Nenhum pedido aberto nesta mesa</p>
      </div>`;
    document.getElementById('contaTotal').textContent = 'R$ 0,00';
    return;
  }

  pedidosAbertos.forEach(pedido => {
    (pedido.itens || []).forEach(item => {
      const row = document.createElement('div');
      row.className = 'conta-row';
      row.innerHTML = `
        <div class="conta-row-info">
          <span class="conta-row-pedido">Pedido #${pedido.id} · ${statusPedidoLabel(pedido.status)}</span>
          <span class="conta-row-name">${esc(item.nomeProduto)}</span>
          <span class="conta-row-qty">${item.quantidade}x ${formatBRL(item.precoUnitario)}</span>
        </div>
        <span class="conta-row-sub">${formatBRL(item.subtotal ?? item.quantidade * item.precoUnitario)}</span>`;
      container.appendChild(row);
    });
  });

  document.getElementById('contaTotal').textContent = formatBRL(calcularTotalConta());
}

// -- TABS ---------------------------------------------------------
function mudarTab(tab) {
  tabAtual = tab;
  document.querySelectorAll('.order-tab').forEach(b => b.classList.toggle('is-active', b.dataset.tab === tab));
  document.getElementById('panelVenda').hidden = tab !== 'venda';
  document.getElementById('panelConta').hidden = tab !== 'conta';
}

// -- ENTRADA POR CÓDIGO -------------------------------------------
function initCodigoInput() {
  const input = document.getElementById('codigoInput');
  if (!input) return;

  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const codigo = input.value.trim().toUpperCase();
    if (!codigo) return;

    if (modoAtual === 'mesa' && !mesaSelecionada) {
      showToast('Selecione uma mesa antes de lançar itens.', 'info');
      flashCodigo('error');
      return;
    }

    const produto = todosOsProdutos.find(p =>
      p.codigo && p.codigo.toUpperCase() === codigo
    );

    if (!produto) {
      flashCodigo('error');
      showToast(`Código "${codigo}" não encontrado.`, 'error');
      input.select();
      return;
    }

    adicionarAoCarrinho(produto.id, produto.nome, Number(produto.preco));
    if (tabAtual !== 'venda') mudarTab('venda');
    flashCodigo('ok');
    input.value = '';
    input.focus();
  });
}

function flashCodigo(tipo) {
  const wrap = document.querySelector('.codigo-wrap');
  if (!wrap) return;
  wrap.classList.remove('is-ok', 'is-error');
  void wrap.offsetWidth; // reflow para reiniciar animação
  wrap.classList.add(tipo === 'ok' ? 'is-ok' : 'is-error');
  setTimeout(() => wrap.classList.remove('is-ok', 'is-error'), 900);
}

// -- PRODUTOS -----------------------------------------------------
async function carregarProdutos() {
  const loading = document.getElementById('produtosLoading');
  loading.classList.remove('hidden');
  try {
    const data = await apiGet('/produtos');
    todosOsProdutos = (data || []).filter(p => p.ativo !== false);
    renderProdutos();
  } catch (_) {
    showToast('Não foi possível carregar o cardápio.', 'error');
  } finally {
    loading.classList.add('hidden');
  }
}

function getProdutosVisiveis() {
  return todosOsProdutos.filter(p => {
    const slug = CATEGORIA_SLUG[p.idCategoria] || 'principais';
    return (categoriaAtual === 'todos' || slug === categoriaAtual)
      && (!termoBusca || p.nome.toLowerCase().includes(termoBusca));
  });
}

function renderProdutos() {
  const grid = document.getElementById('produtosGrid');
  Array.from(grid.querySelectorAll('.produto-card, .grid-empty')).forEach(el => el.remove());

  const lista = getProdutosVisiveis();

  if (!lista.length) {
    const p = document.createElement('p');
    p.className = 'grid-empty';
    p.textContent = 'Nenhum produto encontrado.';
    grid.appendChild(p);
    return;
  }

  lista.forEach(p => {
    const card = document.createElement('article');
    card.className = 'produto-card';

    const emoji   = CATEGORIA_EMOJI[p.idCategoria] || '🍽️';
    const imgSrc  = p.imagem;
    const imgHtml = imgSrc
      ? `<img class="produto-img" src="${esc(imgSrc)}" alt="${esc(p.nome)}" loading="lazy"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        + `<div class="produto-img-placeholder" style="display:none">${emoji}</div>`
      : `<div class="produto-img-placeholder">${emoji}</div>`;

    card.innerHTML = `
      ${imgHtml}
      <div class="produto-info">
        <span class="produto-nome">${esc(p.nome)}</span>
        <span class="produto-preco">${formatBRL(p.preco)}</span>
        <button class="btn-add">+ Adicionar</button>
      </div>`;

    card.querySelector('.btn-add').addEventListener('click', e => {
      e.stopPropagation();
      if (modoAtual === 'mesa' && !mesaSelecionada) { showToast('Selecione uma mesa primeiro.', 'info'); return; }
      adicionarAoCarrinho(p.id, p.nome, Number(p.preco));
      if (tabAtual !== 'venda') mudarTab('venda');
    });

    grid.appendChild(card);
  });
}

// -- CARRINHO -----------------------------------------------------
function adicionarAoCarrinho(produtoId, nome, preco) {
  const item = cart.find(i => i.produtoId === produtoId);
  if (item) { item.quantidade++; } else { cart.push({ produtoId, nome, preco, quantidade: 1 }); }
  renderCarrinho();
}

function alterarQtd(produtoId, delta) {
  const idx = cart.findIndex(i => i.produtoId === produtoId);
  if (idx === -1) return;
  cart[idx].quantidade += delta;
  if (cart[idx].quantidade <= 0) cart.splice(idx, 1);
  renderCarrinho();
}

function removerItem(produtoId) {
  cart = cart.filter(i => i.produtoId !== produtoId);
  renderCarrinho();
}

function calcularTotalCarrinho() {
  return cart.reduce((s, i) => s + i.preco * i.quantidade, 0);
}

function renderCarrinho() {
  const container = document.getElementById('cartItems');
  container.innerHTML = '';

  if (!cart.length) {
    container.innerHTML = `
      <div class="order-empty">
        <span>🛒</span>
        <p>${modoAtual === 'mesa' ? 'Adicione produtos ao pedido da mesa' : 'Adicione produtos para iniciar a venda'}</p>
      </div>`;
  } else {
    cart.forEach(item => {
      const row = document.createElement('div');
      row.className = 'cart-row';
      row.innerHTML = `
        <span class="cart-row-name">${esc(item.nome)}</span>
        <span class="cart-row-sub">${formatBRL(item.preco * item.quantidade)}</span>
        <div class="cart-row-controls">
          <button class="qty-btn" data-id="${item.produtoId}" data-d="-1">−</button>
          <span class="qty-num">${item.quantidade}</span>
          <button class="qty-btn" data-id="${item.produtoId}" data-d="1">+</button>
          <button class="btn-remove" data-id="${item.produtoId}" title="Remover">✕</button>
        </div>`;
      container.appendChild(row);
    });

    container.querySelectorAll('.qty-btn').forEach(b =>
      b.addEventListener('click', () => alterarQtd(Number(b.dataset.id), Number(b.dataset.d)))
    );
    container.querySelectorAll('.btn-remove').forEach(b =>
      b.addEventListener('click', () => removerItem(Number(b.dataset.id)))
    );
  }

  document.getElementById('cartTotal').textContent = formatBRL(calcularTotalCarrinho());
  atualizarResumoCaixa();
  atualizarBotaoFinalizar();
}

// -- PAGAMENTO ----------------------------------------------------
function selecionarPagamento(tipo, grupo) {
  if (grupo === 'venda') {
    pagamentoVenda = tipo;
    document.querySelectorAll('.pgto-btn:not(.pgto-conta)').forEach(b =>
      b.classList.toggle('is-selected', b.dataset.pgto === tipo)
    );
    atualizarResumoCaixa();
    atualizarBotaoFinalizar();
  } else {
    pagamentoConta = tipo;
    document.querySelectorAll('.pgto-btn.pgto-conta').forEach(b =>
      b.classList.toggle('is-selected', b.dataset.pgto === tipo)
    );
    atualizarBotaoFecharConta();
  }
}

// -- BOTÕES -------------------------------------------------------
function atualizarBotaoFinalizar() {
  const btn = document.getElementById('finalizarBtn');
  if (modoAtual === 'mesa') {
    btn.disabled = !(mesaSelecionada && cart.length);
    return;
  }

  const totalPagar = calcularTotalPagar();
  const dinheiroOk = pagamentoVenda !== 'DINHEIRO' || moneyInputValue('valorRecebidoInput') >= totalPagar;
  btn.disabled = !(cart.length && pagamentoVenda && dinheiroOk);
}

function atualizarBotaoFecharConta() {
  document.getElementById('fecharContaBtn').disabled = !(mesaSelecionada && pedidosAbertos.length && pagamentoConta);
}

// -- CRIAR PEDIDO -------------------------------------------------
async function finalizarPedido() {
  const vendaCaixa = modoAtual === 'caixa';
  if (!vendaCaixa && !mesaSelecionada) { showToast('Selecione uma mesa.', 'error'); return; }
  if (!cart.length)     { showToast('Adicione ao menos um produto.', 'error'); return; }
  if (vendaCaixa && !pagamentoVenda)  { showToast('Selecione a forma de pagamento.', 'error'); return; }
  if (vendaCaixa && pagamentoVenda === 'DINHEIRO' && moneyInputValue('valorRecebidoInput') < calcularTotalPagar()) {
    showToast('Valor recebido insuficiente.', 'error');
    return;
  }

  const btn = document.getElementById('finalizarBtn');
  btn.disabled = true;
  btn.textContent = vendaCaixa ? 'Finalizando...' : 'Enviando...';

  const obs = document.getElementById('pedidoObs').value.trim();
  const desconto = calcularDesconto();
  const observacoes = [
    vendaCaixa && desconto > 0 ? `Desconto: ${formatBRL(desconto)}` : '',
    obs
  ].filter(Boolean).join(' | ');

  try {
    if (vendaCaixa) {
      const payload = {
        vendaCaixa: true,
        formaPagamento: pagamentoVenda,
        ...(desconto > 0 && { desconto }),
        itens: cart.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
        ...(observacoes && { observacoes })
      };
      const pedido = await apiPost('/pedidos', payload);
      const totalPagar = calcularTotalPagar();
      mostrarSucesso({
        titulo: 'Venda finalizada!',
        mensagem: `Venda <strong>#${pedido?.id || ''}</strong> registrada no caixa.<br>
                   Total cobrado: <strong>${formatBRL(totalPagar)}</strong> - ${pgtoLabel(pagamentoVenda)}`
      });
      cart = [];
      pagamentoVenda = '';
      document.getElementById('pedidoObs').value = '';
      document.getElementById('descontoInput').value = '';
      document.getElementById('valorRecebidoInput').value = '';
      document.querySelectorAll('.pgto-btn:not(.pgto-conta)').forEach(b => b.classList.remove('is-selected'));
      renderCarrinho();
      return;
    }

    // Mesa: separar itens que precisam de preparo dos prontos (tempoPreparo === 0)
    const basePayload = {
      vendaCaixa: false,
      numeroMesa: mesaSelecionada.numero,
      mesaId: mesaSelecionada.id,
      ...(observacoes && { observacoes })
    };

    const precisamPreparo = cart.filter(i => {
      const p = todosOsProdutos.find(p => p.id === i.produtoId);
      return !p || (p.tempoPreparo ?? 1) > 0;
    });
    const jaProntos = cart.filter(i => {
      const p = todosOsProdutos.find(p => p.id === i.produtoId);
      return p && (p.tempoPreparo ?? 1) === 0;
    });

    const pedidosCriados = [];

    if (precisamPreparo.length) {
      const p = await apiPost('/pedidos', {
        ...basePayload,
        itens: precisamPreparo.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade }))
      });
      pedidosCriados.push({ id: p.id, tipo: 'cozinha', total: p.valorTotal });
    }

    if (jaProntos.length) {
      const p = await apiPost('/pedidos', {
        ...basePayload,
        itens: jaProntos.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade }))
      });
      // Itens prontos pulam a cozinha
      await apiPut(`/pedidos/${p.id}/status`, { status: 'PRONTO' });
      pedidosCriados.push({ id: p.id, tipo: 'pronto', total: p.valorTotal });
    }

    const linhas = pedidosCriados.map(pc =>
      pc.tipo === 'cozinha'
        ? `Pedido <strong>#${pc.id}</strong> enviado para a cozinha.`
        : `Pedido <strong>#${pc.id}</strong> pronto para entrega imediata (item sem preparo).`
    ).join('<br>');

    mostrarSucesso({
      titulo: `Mesa ${mesaSelecionada.numero} - pedido registrado`,
      mensagem: linhas
    });
    cart = [];
    pagamentoVenda = '';
    document.getElementById('pedidoObs').value = '';
    document.querySelectorAll('.pgto-btn:not(.pgto-conta)').forEach(b => b.classList.remove('is-selected'));
    renderCarrinho();
    await carregarPedidosAbertos();
  } catch (e) {
    showToast(e.message || 'Erro ao criar pedido.', 'error');
    btn.disabled = false;
    btn.textContent = vendaCaixa ? 'Finalizar venda' : 'Enviar à cozinha';
  }
}

// -- FECHAR CONTA -------------------------------------------------
async function fecharConta() {
  if (!mesaSelecionada)       { showToast('Selecione uma mesa.', 'error'); return; }
  if (!pedidosAbertos.length) { showToast('Nenhum pedido aberto nesta mesa.', 'error'); return; }
  if (!pagamentoConta)        { showToast('Selecione a forma de pagamento.', 'error'); return; }

  const btn = document.getElementById('fecharContaBtn');
  btn.disabled = true;
  btn.textContent = 'Fechando...';

  const total = calcularTotalConta();

  try {
    await Promise.all(
      pedidosAbertos.map(p => apiPut(`/pedidos/${p.id}/status`, { status: 'ENTREGUE' }))
    );

    mostrarSucesso({
      titulo: 'Conta fechada!',
      mensagem: `Mesa <strong>${mesaSelecionada.numero}</strong> encerrada com sucesso.<br>
                 Total cobrado: <strong>${formatBRL(total)}</strong> · ${pgtoLabel(pagamentoConta)}`
    });

    pedidosAbertos = [];
    pagamentoConta = '';
    document.querySelectorAll('.pgto-btn.pgto-conta').forEach(b => b.classList.remove('is-selected'));
    renderContaMesa();
  } catch (e) {
    showToast(e.message || 'Erro ao fechar a conta.', 'error');
    btn.disabled = false;
    btn.textContent = 'Fechar Conta';
  }
}

function pgtoLabel(tipo) {
  return { PIX: 'PIX', CREDITO: 'Crédito', DEBITO: 'Débito', DINHEIRO: 'Dinheiro' }[tipo] || tipo;
}

// -- SUCESSO -------------------------------------------------------
function mostrarSucesso({ titulo, mensagem }) {
  document.getElementById('successTitle').textContent = titulo;
  document.getElementById('successMsg').innerHTML = mensagem;
  document.getElementById('successOverlay').hidden = false;
}

function fecharSucesso() {
  document.getElementById('successOverlay').hidden = true;
  document.getElementById('finalizarBtn').textContent = modoAtual === 'mesa' ? 'Enviar à cozinha' : 'Finalizar venda';
  document.getElementById('fecharContaBtn').textContent = 'Fechar Conta';
  atualizarBotaoFinalizar();
  atualizarBotaoFecharConta();
}

// -- INIT ----------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  const session = readSession();
  if (!session) { window.location.replace('adm-login.html'); return; }

  const op = document.getElementById('operatorLabel');
  if (op && session.name) op.textContent = session.name;

  // Header session info
  const sessionInfo = document.getElementById('pdvSessionInfo');
  const avatar = document.getElementById('pdvAvatar');
  const userName = document.getElementById('pdvUserName');
  const userRole = document.getElementById('pdvUserRole');
  if (sessionInfo) sessionInfo.style.display = 'flex';
  if (avatar) avatar.textContent = session.initials || session.name?.slice(0, 2).toUpperCase() || 'AT';
  if (userName) userName.textContent = session.name || 'Atendente';
  if (userRole) userRole.textContent = session.role || 'Operacional';

  // Suporte a parâmetro de URL: pdv.html?modo=mesa&mesa=3
  const _urlParams = new URLSearchParams(window.location.search);
  const _urlModoMesa = _urlParams.get('modo') === 'mesa';
  const _urlNumeroMesa = _urlParams.get('mesa');

  verificarCobrancas();
  _cobrancasTimer = window.setInterval(verificarCobrancas, 15000);

  carregarMesas().then(() => {
    if (_urlModoMesa && _urlNumeroMesa) {
      aplicarModoPDV('mesa');
      // Pre-selecionar a mesa pelo número
      const sel = document.getElementById('mesaSelect');
      const opt = Array.from(sel.options).find(o => o.dataset.numero === _urlNumeroMesa);
      if (opt) {
        sel.value = opt.value;
        onMesaChange();
      }
    }
  });
  carregarProdutos();
  initCodigoInput();
  aplicarModoPDV(_urlModoMesa ? 'mesa' : 'caixa');

  document.querySelectorAll('.mode-btn').forEach(btn =>
    btn.addEventListener('click', () => aplicarModoPDV(btn.dataset.mode))
  );

  // Mesa dropdown
  document.getElementById('mesaSelect').addEventListener('change', onMesaChange);

  // Categorias
  document.getElementById('categoriasFiltro').addEventListener('click', e => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    categoriaAtual = btn.dataset.cat;
    renderProdutos();
  });

  // Busca
  document.getElementById('produtoSearch').addEventListener('input', e => {
    termoBusca = e.target.value.toLowerCase().trim();
    renderProdutos();
  });

  ['descontoInput', 'valorRecebidoInput'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      atualizarResumoCaixa();
      atualizarBotaoFinalizar();
    });
  });

  // Tabs
  document.getElementById('orderTabs').addEventListener('click', e => {
    const btn = e.target.closest('.order-tab');
    if (!btn) return;
    mudarTab(btn.dataset.tab);
    if (btn.dataset.tab === 'conta') carregarPedidosAbertos();
  });

  // Pagamento - nova venda
  document.querySelectorAll('.pgto-btn:not(.pgto-conta)').forEach(b =>
    b.addEventListener('click', () => selecionarPagamento(b.dataset.pgto, 'venda'))
  );

  // Pagamento - conta
  document.querySelectorAll('.pgto-btn.pgto-conta').forEach(b =>
    b.addEventListener('click', () => selecionarPagamento(b.dataset.pgto, 'conta'))
  );

  // Botões de ação
  document.getElementById('finalizarBtn').addEventListener('click', finalizarPedido);
  document.getElementById('fecharContaBtn').addEventListener('click', fecharConta);

  // Overlay
  document.getElementById('novoBtn').addEventListener('click', fecharSucesso);
  document.getElementById('successOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) fecharSucesso();
  });
});
