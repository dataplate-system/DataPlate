/**
 * PDV Caixa DataPlate
 */

// ── CONFIG ───────────────────────────────────────────────────────
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

// ── ESTADO ───────────────────────────────────────────────────────
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

// ── SESSÃO ───────────────────────────────────────────────────────
function readSession() {
  try { return JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY) || 'null'); }
  catch (_) { return null; }
}

function getAuthHeader() {
  const s = readSession();
  return s?.token ? { Authorization: `Bearer ${s.token}` } : {};
}

// ── API ──────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...getAuthHeader(), ...(opts.headers || {}) }
  });
}

async function apiGet(path) {
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
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

// ── HELPERS ──────────────────────────────────────────────────────
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

// ── MESAS ────────────────────────────────────────────────────────
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
  document.getElementById('orderTabs').hidden = false;

  await carregarPedidosAbertos();

  mudarTab(pedidosAbertos.length > 0 ? 'conta' : 'venda');
  atualizarBotaoFinalizar();
}

// ── PEDIDOS ABERTOS DA MESA ──────────────────────────────────────
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

// ── TABS ─────────────────────────────────────────────────────────
function mudarTab(tab) {
  tabAtual = tab;
  document.querySelectorAll('.order-tab').forEach(b => b.classList.toggle('is-active', b.dataset.tab === tab));
  document.getElementById('panelVenda').hidden = tab !== 'venda';
  document.getElementById('panelConta').hidden = tab !== 'conta';
}

// ── ENTRADA POR CÓDIGO ───────────────────────────────────────────
function initCodigoInput() {
  const input = document.getElementById('codigoInput');
  if (!input) return;

  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const codigo = input.value.trim().toUpperCase();
    if (!codigo) return;

    if (!mesaSelecionada) {
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

// ── PRODUTOS ─────────────────────────────────────────────────────
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
      if (!mesaSelecionada) { showToast('Selecione uma mesa primeiro.', 'info'); return; }
      adicionarAoCarrinho(p.id, p.nome, Number(p.preco));
      if (tabAtual !== 'venda') mudarTab('venda');
    });

    grid.appendChild(card);
  });
}

// ── CARRINHO ─────────────────────────────────────────────────────
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
        <p>Adicione produtos ao pedido</p>
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
  atualizarBotaoFinalizar();
}

// ── PAGAMENTO ────────────────────────────────────────────────────
function selecionarPagamento(tipo, grupo) {
  if (grupo === 'venda') {
    pagamentoVenda = tipo;
    document.querySelectorAll('.pgto-btn:not(.pgto-conta)').forEach(b =>
      b.classList.toggle('is-selected', b.dataset.pgto === tipo)
    );
    atualizarBotaoFinalizar();
  } else {
    pagamentoConta = tipo;
    document.querySelectorAll('.pgto-btn.pgto-conta').forEach(b =>
      b.classList.toggle('is-selected', b.dataset.pgto === tipo)
    );
    atualizarBotaoFecharConta();
  }
}

// ── BOTÕES ───────────────────────────────────────────────────────
function atualizarBotaoFinalizar() {
  document.getElementById('finalizarBtn').disabled = !(mesaSelecionada && cart.length && pagamentoVenda);
}

function atualizarBotaoFecharConta() {
  document.getElementById('fecharContaBtn').disabled = !(mesaSelecionada && pedidosAbertos.length && pagamentoConta);
}

// ── CRIAR PEDIDO ─────────────────────────────────────────────────
async function finalizarPedido() {
  if (!mesaSelecionada) { showToast('Selecione uma mesa.', 'error'); return; }
  if (!cart.length)     { showToast('Adicione ao menos um produto.', 'error'); return; }
  if (!pagamentoVenda)  { showToast('Selecione a forma de pagamento.', 'error'); return; }

  const btn = document.getElementById('finalizarBtn');
  btn.disabled = true;
  btn.textContent = 'Enviando…';

  const obs = document.getElementById('pedidoObs').value.trim();
  const payload = {
    numeroMesa: mesaSelecionada.numero,
    mesaId: mesaSelecionada.id,
    itens: cart.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
    ...(obs && { observacoes: obs })
  };

  try {
    const pedido = await apiPost('/pedidos', payload);
    mostrarSucesso({
      titulo: 'Pedido aberto!',
      mensagem: `Pedido <strong>#${pedido?.id || ''}</strong> registrado para a <strong>Mesa ${mesaSelecionada.numero}</strong>.<br>
                 Total: <strong>${formatBRL(pedido?.valorTotal ?? calcularTotalCarrinho())}</strong> · ${pgtoLabel(pagamentoVenda)}`
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
    btn.textContent = 'Abrir Pedido';
  }
}

// ── FECHAR CONTA ─────────────────────────────────────────────────
async function fecharConta() {
  if (!mesaSelecionada)       { showToast('Selecione uma mesa.', 'error'); return; }
  if (!pedidosAbertos.length) { showToast('Nenhum pedido aberto nesta mesa.', 'error'); return; }
  if (!pagamentoConta)        { showToast('Selecione a forma de pagamento.', 'error'); return; }

  const btn = document.getElementById('fecharContaBtn');
  btn.disabled = true;
  btn.textContent = 'Fechando…';

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

// ── SUCESSO ───────────────────────────────────────────────────────
function mostrarSucesso({ titulo, mensagem }) {
  document.getElementById('successTitle').textContent = titulo;
  document.getElementById('successMsg').innerHTML = mensagem;
  document.getElementById('successOverlay').hidden = false;
}

function fecharSucesso() {
  document.getElementById('successOverlay').hidden = true;
  document.getElementById('finalizarBtn').textContent = 'Abrir Pedido';
  document.getElementById('fecharContaBtn').textContent = 'Fechar Conta';
  atualizarBotaoFinalizar();
  atualizarBotaoFecharConta();
}

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const session = readSession();
  if (!session) { window.location.replace('adm-login.html'); return; }

  const op = document.getElementById('operatorLabel');
  if (op && session.name) op.textContent = session.name;

  carregarMesas();
  carregarProdutos();
  initCodigoInput();

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

  // Tabs
  document.getElementById('orderTabs').addEventListener('click', e => {
    const btn = e.target.closest('.order-tab');
    if (!btn) return;
    mudarTab(btn.dataset.tab);
    if (btn.dataset.tab === 'conta') carregarPedidosAbertos();
  });

  // Pagamento — nova venda
  document.querySelectorAll('.pgto-btn:not(.pgto-conta)').forEach(b =>
    b.addEventListener('click', () => selecionarPagamento(b.dataset.pgto, 'venda'))
  );

  // Pagamento — conta
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
