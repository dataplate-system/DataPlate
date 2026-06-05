/**
 * PDV Caixa DataPlate
 */

// -- CONFIG -------------------------------------------------------
const ADMIN_SESSION_KEY = 'dataplate:adminSession';
// SERVIDO = entregue na mesa mas conta ainda aberta (incluso no fechamento)
const ACTIVE_STATUSES = new Set(['RECEBIDO', 'EM_PREPARO', 'PRONTO', 'SERVIDO']);

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

// ── HISTÓRICO DE VENDAS ──────────────────────────────────────────
const _historicoMap = new Map();

async function carregarHistorico() {
  const lista = document.getElementById('historicoLista');
  if (!lista) return;
  lista.innerHTML = '<div class="order-empty"><p>Carregando...</p></div>';
  try {
    const data = await apiGet('/pedidos?page=0&size=80');
    const pedidos = (Array.isArray(data) ? data : data?.content || [])
      .filter(p => p.status === 'ENTREGUE')
      .sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora));

    if (!pedidos.length) {
      lista.innerHTML = '<div class="order-empty"><p>Nenhuma venda finalizada.</p></div>';
      return;
    }

    _historicoMap.clear();
    pedidos.forEach(p => _historicoMap.set(p.id, p));

    lista.innerHTML = pedidos.map(p => {
      const origem = p.numeroMesa ? `Mesa ${p.numeroMesa}` : 'Balcao';
      const hora   = new Date(p.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const itens  = (p.itens || []).slice(0, 2).map(i => `${i.quantidade}x ${esc(i.nomeProduto)}`).join(', ');
      const extra  = (p.itens?.length || 0) > 2 ? ` +${p.itens.length - 2}` : '';
      return `
        <div class="historico-item" data-pedido-id="${p.id}" style="cursor:pointer" title="Clique para gerar recibo">
          <div class="historico-item-top">
            <span class="historico-pedido">#${p.id} · ${origem}</span>
            <span class="historico-hora">${hora}</span>
          </div>
          <div class="historico-itens">${esc(itens)}${extra}</div>
          <div class="historico-total-row">
            <span class="historico-total">${formatBRL(p.valorTotal)}</span>
            <span class="historico-recibo-hint">Gerar recibo</span>
          </div>
        </div>`;
    }).join('');
  } catch (_) {
    lista.innerHTML = '<div class="order-empty"><p>Erro ao carregar historico.</p></div>';
  }
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

    const section = document.getElementById('pendentesSection');
    const grid    = document.getElementById('pendentesGrid');
    if (!section || !grid) return;

    if (!pendentes.length) {
      section.hidden = true;
      return;
    }

    const pendStore = JSON.parse(localStorage.getItem('dataplate:pgto_pendente') || '{}');

    // Busca totais das mesas pendentes
    const cards = await Promise.all(pendentes.map(async m => {
      let total = 0;
      try {
        const pedidos = await apiGet(`/pedidos/mesa/${m.numero}`);
        const ativos  = (pedidos || []).filter(p => !['CANCELADO','ENTREGUE'].includes(p.status));
        total = ativos.reduce((s, p) => s + Number(p.valorTotal || 0), 0);
      } catch (_) {}

      const info = pendStore[String(m.numero)];
      const pgto = info?.formaPagamento || '';
      const pgtoLabel = { PIX: 'PIX', CREDITO: 'Cartao Credito', DEBITO: 'Cartao Debito', DINHEIRO: 'Dinheiro' }[pgto] || pgto;

      return `
        <div class="pendente-card" onclick="abrirPagamentoMesa(${m.id},${m.numero},'${esc(m.localizacao||'')}')">
          <div class="pendente-card-header">
            <span class="pendente-mesa">Mesa ${m.numero}</span>
            <span class="pendente-total">${formatBRL(total)}</span>
          </div>
          ${pgtoLabel ? `<div class="pendente-pgto">${pgtoLabel}</div>` : ''}
          <button class="pendente-btn">Processar pagamento</button>
        </div>`;
    }));

    grid.innerHTML = cards.join('');
    section.hidden = false;
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
    if (modal) { modal.hidden = false; }
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
  if (modal) modal.hidden = true;
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

    // Marcar todos os pedidos como ENTREGUE gravando a forma de pagamento
    await Promise.all(ativos.map(p => apiPut(`/pedidos/${p.id}/status`, {
      status: 'ENTREGUE',
      formaPagamento: _pdvPgtoSelecionado
    })));

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

    _reciboAtual = {
      origem: `Mesa ${_pdvPgtoMesa.numero}`,
      pedidos: ativos,
      total,
      formaPagamento: _pdvPgtoSelecionado
    };

    const numMesa = _pdvPgtoMesa.numero;
    const pgtoStr = pgtoLabel(_pdvPgtoSelecionado);
    fecharPdvPgtoModal();
    verificarCobrancas();
    mostrarSucesso({
      titulo: `Mesa ${numMesa} — pagamento confirmado`,
      mensagem: `Total cobrado: <strong>${formatBRL(total)}</strong> via ${pgtoStr}`,
      temRecibo: true
    });
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
  return { RECEBIDO: 'Recebido', EM_PREPARO: 'Em preparo', PRONTO: 'Pronto', SERVIDO: 'Servido' }[s] || s;
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
      // Detecta se algum item precisa de preparo na cozinha
      const precisaPreparo = cart.some(i => {
        const p = todosOsProdutos.find(p => p.id === i.produtoId);
        return !p || (p.tempoPreparo == null) || p.tempoPreparo > 0;
      });

      const payload = {
        vendaCaixa: true,
        formaPagamento: pagamentoVenda,
        ...(desconto > 0 && { desconto }),
        itens: cart.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
        ...(observacoes && { observacoes })
      };
      const pedido = await apiPost('/pedidos', payload);
      const totalPagar = calcularTotalPagar();

      _reciboAtual = {
        origem: precisaPreparo ? `Balcao #${pedido?.id || ''}` : 'Balcao',
        pedidos: [{ id: pedido?.id, itens: cart.map(i => ({
          nomeProduto: i.nome,
          quantidade: i.quantidade,
          precoUnitario: i.preco,
          subtotal: i.preco * i.quantidade
        })) }],
        total: totalPagar,
        formaPagamento: pagamentoVenda,
        desconto: calcularDesconto()
      };

      const mensagemCozinha = precisaPreparo
        ? `Pedido enviado a cozinha como <strong>Balcao #${pedido?.id || ''}</strong>.<br>Chamar cliente quando estiver pronto.`
        : `Itens entregues imediatamente.`;

      mostrarSucesso({
        titulo: precisaPreparo ? `Balcao #${pedido?.id || ''} — aguardando preparo` : 'Venda finalizada!',
        mensagem: `${mensagemCozinha}<br>Total: <strong>${formatBRL(totalPagar)}</strong> · ${pgtoLabel(pagamentoVenda)}`,
        temRecibo: true
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
      pedidosAbertos.map(p => apiPut(`/pedidos/${p.id}/status`, {
        status: 'ENTREGUE',
        formaPagamento: pagamentoConta
      }))
    );

    _reciboAtual = {
      origem: `Mesa ${mesaSelecionada.numero}`,
      pedidos: pedidosAbertos,
      total,
      formaPagamento: pagamentoConta
    };

    mostrarSucesso({
      titulo: 'Conta fechada!',
      mensagem: `Mesa <strong>${mesaSelecionada.numero}</strong> encerrada.<br>
                 Total: <strong>${formatBRL(total)}</strong> · ${pgtoLabel(pagamentoConta)}`,
      temRecibo: true
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

// -- RECIBO --------------------------------------------------------
let _reciboAtual = null;
let _reciboHistoricoAtual = null;

function extrairPagamentoObs(observacoes) {
  const obs = (observacoes || '').toLowerCase();
  if (obs.includes('pagamento: pix'))      return 'PIX';
  if (obs.includes('pagamento: credito'))  return 'CREDITO';
  if (obs.includes('pagamento: debito'))   return 'DEBITO';
  if (obs.includes('pagamento: dinheiro')) return 'DINHEIRO';
  return '';
}

const PGTO_LABELS = { PIX: 'PIX', CREDITO: 'Cartao Credito', DEBITO: 'Cartao Debito', DINHEIRO: 'Dinheiro' };

function imprimirRecibo({ origem, pedidos, total, formaPagamento, desconto = 0, nomeCliente = '' }) {
  const session  = readSession();
  const operador = session?.name || 'Caixa';
  const agora    = new Date();
  const dataStr  = agora.toLocaleDateString('pt-BR');
  const horaStr  = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Tenta extrair método das observações se não foi passado diretamente
  let pgto = formaPagamento;
  if (!pgto && pedidos?.length) {
    pgto = extrairPagamentoObs(pedidos[0]?.observacoes);
  }
  const pgtoLabel = PGTO_LABELS[pgto] || pgto || 'Nao informado';

  const itensRows = pedidos.flatMap(p =>
    (p.itens || []).map(i => {
      const sub = i.subtotal ?? i.precoUnitario * i.quantidade;
      return `<tr>
        <td style="padding:3px 6px;text-align:left">${i.quantidade}x ${esc(i.nomeProduto)}</td>
        <td style="padding:3px 6px;text-align:right;white-space:nowrap">${formatBRL(sub)}</td>
      </tr>`;
    })
  ).join('');

  const nomeRow = nomeCliente.trim()
    ? `<tr><td colspan="2" style="padding:4px 6px;font-size:12px;color:#555">Cliente: <strong>${esc(nomeCliente.trim())}</strong></td></tr>`
    : '';

  const descontoRow = desconto > 0
    ? `<tr><td style="padding:2px 6px;text-align:left;color:#555">Desconto</td><td style="padding:2px 6px;text-align:right;color:#555">- ${formatBRL(desconto)}</td></tr>`
    : '';

  const logoPath = '../images/brand/logo-emp.png';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Recibo #${pedidos[0]?.id || ''}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Courier New',Courier,monospace; font-size:13px; background:#fff; color:#111; width:300px; margin:0 auto; padding:16px 8px; }
    .sep  { border:none; border-top:1px dashed #999; margin:8px 0; }
    .sep2 { border:none; border-top:2px solid #111; margin:8px 0; }
    .center { text-align:center; }
    table { width:100%; border-collapse:collapse; }
    .total-row td { font-weight:900; font-size:14px; padding:4px 6px; }
    @media print { body { padding:0; } }
  </style>
</head>
<body>
  <div class="center" style="margin-bottom:6px">
    <img src="${logoPath}" alt="Logo" style="max-width:72px;max-height:72px;object-fit:contain;border-radius:8px" onerror="this.style.display='none'">
  </div>
  <p class="center" style="font-size:16px;font-weight:900;letter-spacing:1px">Raizes do Sabor</p>
  <p class="center" style="font-size:10px;color:#555;margin-top:2px">Comprovante de Venda</p>
  <hr class="sep2">
  <table>
    <tr><td style="padding:2px 6px">Data:</td><td style="padding:2px 6px;text-align:right">${dataStr}</td></tr>
    <tr><td style="padding:2px 6px">Hora:</td><td style="padding:2px 6px;text-align:right">${horaStr}</td></tr>
    <tr><td style="padding:2px 6px">Operador:</td><td style="padding:2px 6px;text-align:right">${esc(operador)}</td></tr>
    <tr><td style="padding:2px 6px">Origem:</td><td style="padding:2px 6px;text-align:right">${esc(origem)}</td></tr>
    ${nomeRow}
  </table>
  <hr class="sep">
  <table>
    <thead>
      <tr>
        <th style="padding:3px 6px;text-align:left;font-size:11px;color:#555">ITEM</th>
        <th style="padding:3px 6px;text-align:right;font-size:11px;color:#555">VALOR</th>
      </tr>
    </thead>
    <tbody>${itensRows}</tbody>
  </table>
  <hr class="sep">
  <table>
    ${descontoRow}
    <tr class="total-row">
      <td>TOTAL</td>
      <td style="text-align:right">${formatBRL(total)}</td>
    </tr>
  </table>
  <hr class="sep">
  <table>
    <tr><td style="padding:2px 6px">Pagamento:</td><td style="padding:2px 6px;text-align:right;font-weight:700">${esc(pgtoLabel)}</td></tr>
  </table>
  <hr class="sep2">
  <p class="center" style="font-size:12px;margin-top:4px">Obrigado pela preferencia!</p>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=360,height=620,toolbar=0,menubar=0,location=0,scrollbars=0');
  if (!win) { showToast('Permita popups para imprimir o recibo.', 'error'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 350);
}

// -- SUCESSO -------------------------------------------------------
function mostrarSucesso({ titulo, mensagem, temRecibo = false }) {
  document.getElementById('successTitle').textContent = titulo;
  document.getElementById('successMsg').innerHTML = mensagem;
  document.getElementById('nomeClienteInput').value = '';
  const btnRecibo = document.getElementById('gerarReciboBtn');
  const nomeWrap  = document.querySelector('.recibo-nome-wrap');
  btnRecibo.style.display  = temRecibo ? 'block' : 'none';
  if (nomeWrap) nomeWrap.style.display = temRecibo ? 'block' : 'none';
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
  const avatar   = document.getElementById('pdvAvatar');
  const userName = document.getElementById('pdvUserName');
  const userRole = document.getElementById('pdvUserRole');
  if (avatar)    avatar.textContent    = session.initials || session.name?.slice(0, 2).toUpperCase() || 'CX';
  if (userName)  userName.textContent  = session.name || 'Caixa';
  if (userRole)  userRole.textContent  = session.role || 'Operacional';

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

  // Abas de alto nível (Venda / Histórico)
  document.querySelectorAll('.pdv-top-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pdv-top-tab').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const vista = btn.dataset.top;
      document.getElementById('vistaPdv').hidden      = vista !== 'pdv';
      document.getElementById('vistaHistorico').hidden = vista !== 'historico';
      if (vista === 'historico') carregarHistorico();
    });
  });

  // Botão gerar recibo no overlay de sucesso
  document.getElementById('gerarReciboBtn').addEventListener('click', () => {
    if (!_reciboAtual) return;
    const nome = document.getElementById('nomeClienteInput').value.trim();
    imprimirRecibo({ ..._reciboAtual, nomeCliente: nome });
  });

  // Click no histórico → abre modal de recibo
  document.getElementById('historicoLista').addEventListener('click', e => {
    const item = e.target.closest('[data-pedido-id]');
    if (!item) return;
    const pedidoId = Number(item.dataset.pedidoId);
    const p = _historicoMap.get(pedidoId);
    if (!p) return;
    _reciboHistoricoAtual = {
      origem: p.numeroMesa ? `Mesa ${p.numeroMesa}` : 'Balcao',
      pedidos: [p],
      total: p.valorTotal,
      formaPagamento: ''
    };
    const info = document.getElementById('reciboHistoricoInfo');
    const origem = p.numeroMesa ? `Mesa ${p.numeroMesa}` : 'Balcao';
    info.textContent = `#${p.id} · ${origem} · ${formatBRL(p.valorTotal)}`;
    document.getElementById('nomeClienteHistoricoInput').value = '';
    document.getElementById('reciboHistoricoModal').hidden = false;
  });

  document.getElementById('reciboHistoricoImprimir').addEventListener('click', () => {
    if (!_reciboHistoricoAtual) return;
    const nome = document.getElementById('nomeClienteHistoricoInput').value.trim();
    imprimirRecibo({ ..._reciboHistoricoAtual, nomeCliente: nome });
    document.getElementById('reciboHistoricoModal').hidden = true;
  });

  document.getElementById('reciboHistoricoModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.hidden = true;
  });
});
