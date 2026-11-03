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
    if (isLocal && window.location.port === '8081') return '/api';
    if (isFile)  return 'http://localhost:8081/api';
    if (isLocal) return `http://${h}:8081/api`;
    return `http://${h}:8081/api`;
  })();

const WS_BASE_URL = (() => {
  const apiUrl = API_BASE_URL.startsWith('http')
    ? API_BASE_URL
    : `${window.location.origin}${API_BASE_URL}`;
  return apiUrl.replace(/^http/, 'ws').replace(/\/api$/, '/ws');
})();

const DEMO_MODE = window.DATAPLATE_DEMO_MODE === true
  || localStorage.getItem('DATAPLATE_DEMO_MODE') === 'true';

// Perfis (RN-AC): PDV liberado para CAIXA e GERENTE
const ROLE_TO_PERFIL = { ADMIN: 'admin', GERENTE: 'gerente', FUNCIONARIO: 'atendente', CAIXA: 'caixa', COZINHA: 'cozinha' };
const TELA_INICIAL = { admin: 'adm.html', gerente: 'adm.html', atendente: 'atendente.html', caixa: 'pdv.html', cozinha: 'cozinha.html' };
const PERFIS_PDV = new Set(['caixa', 'gerente']);

// Limite de desconto do Caixa (acima disso exige Gerente)
const LIMITE_DESCONTO_CAIXA_PERCENTUAL = 10;
const MSG_DESCONTO_LIMITE = `Desconto acima do limite de ${LIMITE_DESCONTO_CAIXA_PERCENTUAL}% exige o perfil Gerente`;

// Fechamento de conta: so pedidos ja preparados podem ser cobrados
const STATUS_COBRAVEIS = new Set(['PRONTO', 'SERVIDO']);
const STATUS_EM_PRODUCAO = new Set(['RECEBIDO', 'EM_PREPARO']);

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

function perfilDaSessao(session) {
  if (!session) return null;
  if (session.backendRole) return ROLE_TO_PERFIL[String(session.backendRole).toUpperCase()] || null;
  // Sessao sem perfil do backend so e aceita no modo demonstracao
  if (DEMO_MODE && TELA_INICIAL[session.userKey]) return session.userKey;
  return null;
}

function encerrarSessao() {
  try { sessionStorage.removeItem(ADMIN_SESSION_KEY); } catch (_) {}
  window.location.replace('adm-login.html');
}

// Retorna o perfil se o acesso ao PDV for permitido; senao redireciona e retorna null
function verificarAcessoPdv() {
  const session = readSession();
  if (!session || (!session.token && !DEMO_MODE)) { encerrarSessao(); return null; }

  const perfil = perfilDaSessao(session);
  if (!perfil) { encerrarSessao(); return null; }

  if (!PERFIS_PDV.has(perfil)) {
    window.location.replace(TELA_INICIAL[perfil]);
    return null;
  }
  return perfil;
}

const PERFIL_ATUAL = verificarAcessoPdv();

function pdvVoltarAoDashboard() {
  window.clearInterval(_cobrancasTimer);
  _cobrancasTimer = null;
  if (PERFIL_ATUAL === 'gerente') {
    window.location.replace('adm.html');
    return;
  }
  encerrarSessao();
}

function aplicarPermissoesTela() {
  document.querySelectorAll('[data-roles]').forEach(el => {
    const roles = String(el.dataset.roles || '').split(/\s+/).filter(Boolean);
    el.hidden = !roles.includes(PERFIL_ATUAL);
  });

  const brand = document.querySelector('.pdv-brand-link');
  if (brand) brand.setAttribute('href', TELA_INICIAL[PERFIL_ATUAL] || 'pdv.html');

  const voltarBtn = document.getElementById('pdvLogoutBtn');
  if (voltarBtn) voltarBtn.textContent = PERFIL_ATUAL === 'gerente' ? 'Voltar ao painel' : 'Sair';
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
          ${p.clienteNome ? `<div class="historico-itens">Cliente: ${esc(p.clienteNome)}</div>` : ''}
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
      let semPedidos = false;
      try {
        const pedidos = await apiGet(`/pedidos/mesa/${m.numero}`);
        const ativos  = (pedidos || []).filter(p => !['CANCELADO','ENTREGUE'].includes(p.status));
        total = ativos.reduce((s, p) => s + Number(p.valorTotal || 0), 0);
        semPedidos = ativos.length === 0;
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
          ${semPedidos
            ? `<button type="button" class="pendente-btn" onclick="event.stopPropagation();liberarMesaPendente(${m.id},${m.numero},this)">Liberar mesa (sem pedidos)</button>`
            : '<button class="pendente-btn">Processar pagamento</button>'}
        </div>`;
    }));

    grid.innerHTML = cards.join('');
    section.hidden = false;
  } catch (_) {}
}

function removerPagamentoPendente(numeroMesa) {
  const pendStore = JSON.parse(localStorage.getItem('dataplate:pgto_pendente') || '{}');
  delete pendStore[String(numeroMesa)];
  localStorage.setItem('dataplate:pgto_pendente', JSON.stringify(pendStore));
}

// Mesa aguardando pagamento cujos pedidos foram cancelados: o Caixa so libera.
window.liberarMesaPendente = async function(mesaId, numeroMesa, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Liberando...'; }
  try {
    const pedidos = await apiGet(`/pedidos/mesa/${numeroMesa}`);
    const ativos  = (pedidos || []).filter(p => !['CANCELADO','ENTREGUE'].includes(p.status));
    const resultado = await liquidarContaMesa(mesaId, ativos, null);
    if (!resultado.semCobranca) {
      showToast('A mesa possui pedidos em aberto; processe o pagamento.', 'error');
      return;
    }
    removerPagamentoPendente(numeroMesa);
    showToast(`Mesa ${numeroMesa} liberada (sem pedidos a cobrar).`, 'success');
  } catch (e) {
    showToast(e.message || 'Erro ao liberar mesa.', 'error');
  } finally {
    atualizarPendencias();
    carregarMesas();
  }
};

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

    const resultado = await liquidarContaMesa(_pdvPgtoMesa.id, ativos, _pdvPgtoSelecionado);

    // Remove do storage local
    removerPagamentoPendente(_pdvPgtoMesa.numero);

    if (resultado.semCobranca) {
      const numLiberada = _pdvPgtoMesa.numero;
      fecharPdvPgtoModal();
      if (btn) { btn.textContent = 'Confirmar Pagamento'; }
      atualizarPendencias();
      carregarMesas();
      showToast(`Mesa ${numLiberada} liberada (sem pedidos a cobrar).`, 'success');
      return;
    }

    _reciboAtual = {
      origem: `Mesa ${_pdvPgtoMesa.numero}`,
      pedidos: resultado.pedidos,
      total: resultado.total,
      formaPagamento: _pdvPgtoSelecionado
    };

    const numMesa = _pdvPgtoMesa.numero;
    const pgtoStr = pgtoLabel(_pdvPgtoSelecionado);
    fecharPdvPgtoModal();
    if (btn) { btn.textContent = 'Confirmar Pagamento'; }
    atualizarPendencias();
    carregarMesas();
    if (resultado.avisoMesa) showToast(resultado.avisoMesa, 'error');
    mostrarSucesso({
      titulo: `Mesa ${numMesa} — pagamento confirmado`,
      mensagem: `Total cobrado: <strong>${formatBRL(resultado.total)}</strong> via ${pgtoStr}`,
      temRecibo: true
    });
  } catch (e) {
    showToast(e.message || 'Erro ao confirmar pagamento.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar Pagamento'; }
    atualizarPendencias();
  }
};

// Cobra os pedidos da mesa (PRONTO/SERVIDO -> ENTREGUE) e libera a mesa.
// Pedidos ainda na cozinha impedem o fechamento. Sem pedidos em aberto, so libera a mesa.
async function liquidarContaMesa(mesaId, pedidos, formaPagamento) {
  const lista = pedidos || [];
  if (lista.every(p => ['CANCELADO', 'ENTREGUE'].includes(p.status))) {
    await apiPatch(`/mesas/${mesaId}/status`, { status: 'livre' });
    return { pedidos: [], total: 0, avisoMesa: '', semCobranca: true };
  }
  const emProducao = lista.filter(p => STATUS_EM_PRODUCAO.has(p.status));
  if (emProducao.length) {
    const ids = emProducao.map(p => `#${p.id} (${statusPedidoLabel(p.status)})`).join(', ');
    throw new Error(`Conta nao pode ser fechada: pedidos ainda na cozinha: ${ids}.`);
  }

  const cobraveis = lista.filter(p => STATUS_COBRAVEIS.has(p.status));
  if (!cobraveis.length) throw new Error('Nenhum pedido pronto para cobranca nesta mesa.');

  const resultados = await Promise.allSettled(cobraveis.map(p =>
    apiPut(`/pedidos/${p.id}/status`, { status: 'ENTREGUE', formaPagamento })
  ));
  const falhas = resultados
    .map((r, i) => (r.status === 'rejected' ? `#${cobraveis[i].id}: ${r.reason?.message || 'erro'}` : null))
    .filter(Boolean);

  if (falhas.length) {
    const pagos = cobraveis.length - falhas.length;
    const parcial = pagos ? `${pagos} de ${cobraveis.length} pedidos foram pagos. ` : '';
    throw new Error(`${parcial}Falha ao registrar pagamento (${falhas.join('; ')}). A mesa nao foi liberada.`);
  }

  const total = cobraveis.reduce((s, p) => s + Number(p.valorTotal || 0), 0);
  let avisoMesa = '';
  try {
    await apiPatch(`/mesas/${mesaId}/status`, { status: 'livre' });
  } catch (e) {
    avisoMesa = `Pagamento registrado, mas a mesa nao foi liberada: ${e.message}`;
  }
  return { pedidos: cobraveis, total, avisoMesa };
}

// ── BALCAO PRONTO PARA ENTREGA ───────────────────────────────────
// Venda de balcao ja paga; ao entregar ao cliente o Caixa conclui (PRONTO/SERVIDO -> ENTREGUE).
const _balcaoProntosMap = new Map();

async function verificarBalcaoProntos() {
  const section = document.getElementById('balcaoProntosSection');
  const grid    = document.getElementById('balcaoProntosGrid');
  if (!section || !grid) return;

  try {
    const ativos = await apiGet('/pedidos/ativos');
    // SERVIDO incluso: pedidos de balcao despachados por engano ainda precisam ser concluidos aqui
    const prontos = (ativos || []).filter(p => !p.numeroMesa && ['PRONTO', 'SERVIDO'].includes(p.status));

    _balcaoProntosMap.clear();
    prontos.forEach(p => _balcaoProntosMap.set(p.id, p));

    if (!prontos.length) {
      section.hidden = true;
      grid.innerHTML = '';
      return;
    }

    grid.innerHTML = prontos.map(p => {
      const pgto = extrairPagamentoObs(p.observacoes);
      return `
        <div class="pendente-card">
          <div class="pendente-card-header">
            <span class="pendente-mesa">Balcao #${Number(p.id)}</span>
            <span class="pendente-total">${formatBRL(p.valorTotal)}</span>
          </div>
          ${p.clienteNome ? `<div class="pendente-pgto">${esc(p.clienteNome)}</div>` : ''}
          ${pgto ? `<div class="pendente-pgto">${esc(pgtoLabel(pgto))}</div>` : ''}
          <button type="button" class="pendente-btn" data-entregar-balcao="${Number(p.id)}">Entregar ao cliente</button>
        </div>`;
    }).join('');
    section.hidden = false;
  } catch (_) {}
}

async function entregarPedidoBalcao(pedidoId, btn) {
  const pedido = _balcaoProntosMap.get(pedidoId);
  if (!pedido) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Entregando...'; }
  try {
    await apiPut(`/pedidos/${pedidoId}/status`, {
      status: 'ENTREGUE',
      formaPagamento: extrairPagamentoObs(pedido.observacoes) || 'NAO_INFORMADO'
    });
    showToast(`Balcao #${pedidoId} entregue.`, 'success');
  } catch (e) {
    showToast(e.message || 'Erro ao concluir entrega.', 'error');
  } finally {
    verificarBalcaoProntos();
  }
}

function atualizarPendencias() {
  verificarCobrancas();
  verificarBalcaoProntos();
}

function getAuthHeader() {
  const s = readSession();
  return s?.token ? { Authorization: `Bearer ${s.token}` } : {};
}

// -- API ----------------------------------------------------------
async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API_BASE_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...getAuthHeader(), ...(opts.headers || {}) }
  });
  // Sessao expirada/invalida: volta ao login (sessao demo sem token nao e encerrada)
  if (r.status === 401 && readSession()?.token) encerrarSessao();
  return r;
}

// FastAPI usa "detail"; o handler de banco usa "mensagem"
function readErrorMessage(body) {
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (typeof body.detail === 'string') return body.detail;
  if (Array.isArray(body.detail)) {
    return body.detail
      .map(item => String(item?.msg || '').replace(/^Value error,\s*/i, ''))
      .filter(Boolean)
      .join('; ');
  }
  return body.mensagem || body.message || body.erro || '';
}

async function apiRequest(path, opts = {}) {
  const r = await apiFetch(path, opts);
  const text = await r.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch (_) { data = text; }
  }
  if (!r.ok) {
    let msg = readErrorMessage(data);
    if (r.status === 401) msg = 'Sessao expirada. Entre novamente.';
    else if (r.status === 403 && !msg) msg = 'Acesso negado';
    const error = new Error(msg || `Erro ${r.status}`);
    error.status = r.status;
    throw error;
  }
  return data;
}

function apiGet(path) {
  return apiRequest(path);
}

function apiPost(path, body) {
  return apiRequest(path, { method: 'POST', body: JSON.stringify(body) });
}

function apiPut(path, body) {
  return apiRequest(path, { method: 'PUT', body: JSON.stringify(body) });
}

function apiPatch(path, body) {
  return apiRequest(path, { method: 'PATCH', body: JSON.stringify(body) });
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

// Caixa: desconto limitado a 10% do subtotal (Gerente sem limite). Comparacao em centavos.
function descontoExcedeLimite() {
  if (PERFIL_ATUAL !== 'caixa') return false;
  const descontoCentavos = Math.round(calcularDesconto() * 100);
  const limiteCentavos = calcularTotalCarrinho() * LIMITE_DESCONTO_CAIXA_PERCENTUAL;
  return descontoCentavos > limiteCentavos + 1e-6;
}

function atualizarResumoCaixa() {
  const totalPagar = calcularTotalPagar();
  const recebido = moneyInputValue('valorRecebidoInput');
  const troco = pagamentoVenda === 'DINHEIRO' ? Math.max(0, recebido - totalPagar) : 0;

  const totalPagarEl = document.getElementById('totalPagar');
  const trocoEl = document.getElementById('trocoValor');
  const cashRow = document.getElementById('cashRow');
  const avisoDesconto = document.getElementById('descontoAviso');

  if (totalPagarEl) totalPagarEl.textContent = formatBRL(totalPagar);
  if (trocoEl) trocoEl.textContent = formatBRL(troco);
  if (cashRow) cashRow.hidden = pagamentoVenda !== 'DINHEIRO';
  if (avisoDesconto) {
    const excede = descontoExcedeLimite();
    avisoDesconto.hidden = !excede;
    avisoDesconto.textContent = excede ? MSG_DESCONTO_LIMITE : '';
  }
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
  const selecionadaAntes = sel.value;
  // mantém placeholder
  while (sel.options.length > 1) sel.remove(1);

  todasAsMesas.forEach(m => {
    const st = normalizeStatus(m.status);
    const statusTexto = { livre: 'livre', ocupada: 'ocupada', reservada: 'reservada', manutencao: 'manutencao', aguardando_pagamento: 'aguardando pagamento' }[st] || st;
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.dataset.numero   = m.numero;
    opt.dataset.status   = st;
    opt.dataset.localizacao = m.localizacao || '';
    opt.textContent = `Mesa ${m.numero}${m.localizacao ? ' · ' + m.localizacao : ''}  (${statusTexto})`;
    sel.appendChild(opt);
  });

  // Mantem a mesa selecionada apos recarregar (ex.: depois de fechar a conta)
  if (selecionadaAntes && todasAsMesas.some(m => String(m.id) === selecionadaAntes)) {
    sel.value = selecionadaAntes;
    if (mesaSelecionada && String(mesaSelecionada.id) === selecionadaAntes) {
      mesaSelecionada = todasAsMesas.find(m => String(m.id) === selecionadaAntes);
      atualizarDotStatus(normalizeStatus(mesaSelecionada.status));
      atualizarInfoMesa(mesaSelecionada);
    }
  }
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

  const statusMap = { livre: 'Livre', ocupada: 'Ocupada', reservada: 'Reservada', manutencao: 'Em manutenção', aguardando_pagamento: 'Aguardando pagamento' };
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

async function carregarClientesPedido() {
  const select = document.getElementById('clientePedidoSelect');
  if (!select) return;
  try {
    const clientes = await apiGet('/clientes');
    select.innerHTML = '<option value="">Venda sem cliente vinculado</option>'
      + (clientes || []).map(cliente =>
        `<option value="${Number(cliente.id)}">${esc(cliente.nome)} · ${esc(cliente.cpf || '')}</option>`
      ).join('');
  } catch (error) {
    select.innerHTML = '<option value="">Cadastro de clientes indisponível</option>';
    console.error('[clientes do pedido]', error);
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
  btn.disabled = !(cart.length && pagamentoVenda && dinheiroOk && !descontoExcedeLimite());
}

function mesaSoParaLiberar() {
  return Boolean(mesaSelecionada) && !pedidosAbertos.length
    && ['ocupada', 'aguardando_pagamento'].includes(normalizeStatus(mesaSelecionada.status));
}

function atualizarBotaoFecharConta() {
  const btn = document.getElementById('fecharContaBtn');
  const soLiberar = mesaSoParaLiberar();
  btn.textContent = soLiberar ? 'Liberar mesa' : 'Fechar Conta';
  btn.disabled = !(soLiberar || (mesaSelecionada && pedidosAbertos.length && pagamentoConta));
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
  if (vendaCaixa && descontoExcedeLimite()) {
    showToast(MSG_DESCONTO_LIMITE, 'error');
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
        ...(document.getElementById('clientePedidoSelect')?.value && {
          clienteId: Number(document.getElementById('clientePedidoSelect').value)
        }),
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
      document.getElementById('clientePedidoSelect').value = '';
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
      ...(document.getElementById('clientePedidoSelect')?.value && {
        clienteId: Number(document.getElementById('clientePedidoSelect').value)
      }),
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

    // Mesa passa a ocupada (so o status; capacidade/reserva nao sao alteradas)
    if (['livre', 'reservada'].includes(normalizeStatus(mesaSelecionada.status))) {
      try {
        await apiPatch(`/mesas/${mesaSelecionada.id}/status`, { status: 'ocupada' });
        mesaSelecionada.status = 'ocupada';
        atualizarDotStatus('ocupada');
        atualizarInfoMesa(mesaSelecionada);
        carregarMesas();
      } catch (e) {
        showToast(`Pedido registrado, mas o status da mesa nao foi atualizado: ${e.message}`, 'error');
      }
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
    document.getElementById('clientePedidoSelect').value = '';
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
  if (!pedidosAbertos.length) {
    // Mesa ocupada/aguardando sem pedidos (ex.: pedido cancelado): apenas libera
    if (mesaSoParaLiberar()) {
      try {
        await liquidarContaMesa(mesaSelecionada.id, [], null);
        removerPagamentoPendente(mesaSelecionada.numero);
        mesaSelecionada.status = 'livre';
        showToast(`Mesa ${mesaSelecionada.numero} liberada (sem pedidos a cobrar).`, 'success');
        atualizarDotStatus('livre');
        atualizarBotaoFecharConta();
        carregarMesas();
        atualizarPendencias();
      } catch (e) {
        showToast(e.message || 'Erro ao liberar mesa.', 'error');
      }
      return;
    }
    showToast('Nenhum pedido aberto nesta mesa.', 'error');
    return;
  }
  if (!pagamentoConta)        { showToast('Selecione a forma de pagamento.', 'error'); return; }

  const btn = document.getElementById('fecharContaBtn');
  btn.disabled = true;
  btn.textContent = 'Fechando...';

  try {
    const resultado = await liquidarContaMesa(mesaSelecionada.id, pedidosAbertos, pagamentoConta);

    _reciboAtual = {
      origem: `Mesa ${mesaSelecionada.numero}`,
      pedidos: resultado.pedidos,
      total: resultado.total,
      formaPagamento: pagamentoConta
    };

    if (!resultado.avisoMesa) mesaSelecionada.status = 'livre';
    mostrarSucesso({
      titulo: 'Conta fechada!',
      mensagem: `Mesa <strong>${mesaSelecionada.numero}</strong> encerrada.<br>
                 Total: <strong>${formatBRL(resultado.total)}</strong> · ${pgtoLabel(pagamentoConta)}`,
      temRecibo: true
    });
    if (resultado.avisoMesa) showToast(resultado.avisoMesa, 'error');

    pedidosAbertos = [];
    pagamentoConta = '';
    document.querySelectorAll('.pgto-btn.pgto-conta').forEach(b => b.classList.remove('is-selected'));
    renderContaMesa();
    carregarMesas();
    atualizarPendencias();
  } catch (e) {
    showToast(e.message || 'Erro ao fechar a conta.', 'error');
    btn.textContent = 'Fechar Conta';
    // Recarrega para refletir pagamentos parciais
    await carregarPedidosAbertos();
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

// -- WEBSOCKET -----------------------------------------------------
const PDV_WS_EVENTOS = new Set(['PEDIDO_ATUALIZADO', 'NOVO_PEDIDO', 'VENDA_CAIXA']);
let pdvSocket = null;
let pdvWsRetryTimer = null;
let pdvWsRetryDelay = 1000;
let pdvWsReloadTimer = null;

function pdvWsUrl(token) {
  const sep = WS_BASE_URL.includes('?') ? '&' : '?';
  return `${WS_BASE_URL}${sep}token=${encodeURIComponent(token)}`;
}

function agendarReconexaoWs() {
  window.clearTimeout(pdvWsRetryTimer);
  pdvWsRetryTimer = window.setTimeout(connectPdvWebSocket, pdvWsRetryDelay);
  pdvWsRetryDelay = Math.min(pdvWsRetryDelay * 2, 30000);
}

function connectPdvWebSocket() {
  const token = readSession()?.token;
  if (!token) return; // modo demo: sem token o servidor recusa; fica so o polling
  if (pdvSocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(pdvSocket.readyState)) return;

  try {
    pdvSocket = new WebSocket(pdvWsUrl(token));

    pdvSocket.addEventListener('open', () => { pdvWsRetryDelay = 1000; });

    pdvSocket.addEventListener('message', (event) => {
      let payload = null;
      try { payload = JSON.parse(event.data); } catch (_) { return; }
      if (!PDV_WS_EVENTOS.has(payload?.type)) return;

      window.clearTimeout(pdvWsReloadTimer);
      pdvWsReloadTimer = window.setTimeout(() => {
        atualizarPendencias();
        if (modoAtual === 'mesa' && mesaSelecionada) carregarPedidosAbertos();
      }, 500);
    });

    pdvSocket.addEventListener('close', (event) => {
      // 1008 = token invalido/perfil sem acesso: nao insiste
      if (event.code === 1008) return;
      agendarReconexaoWs();
    });

    pdvSocket.addEventListener('error', () => { pdvSocket.close(); });
  } catch (error) {
    console.error('Erro ao conectar WebSocket:', error);
    agendarReconexaoWs();
  }
}

// -- INIT ----------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  if (!PERFIL_ATUAL) return;
  aplicarPermissoesTela();

  const mobileProducts = document.getElementById('pdvMobileProducts');
  const mobileOrder = document.getElementById('pdvMobileOrder');
  const setMobilePdvView = (view) => {
    const showOrder = view === 'order';
    document.body.classList.toggle('mobile-pdv-order', showOrder);
    mobileProducts?.classList.toggle('is-active', !showOrder);
    mobileOrder?.classList.toggle('is-active', showOrder);
    mobileProducts?.setAttribute('aria-pressed', String(!showOrder));
    mobileOrder?.setAttribute('aria-pressed', String(showOrder));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  mobileProducts?.addEventListener('click', () => setMobilePdvView('products'));
  mobileOrder?.addEventListener('click', () => setMobilePdvView('order'));
  document.getElementById('pdvLogoutBtn')?.addEventListener('click', pdvVoltarAoDashboard);

  const session = readSession();

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

  atualizarPendencias();
  _cobrancasTimer = window.setInterval(atualizarPendencias, 15000);
  connectPdvWebSocket();

  document.getElementById('balcaoProntosGrid')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-entregar-balcao]');
    if (!btn) return;
    entregarPedidoBalcao(Number(btn.dataset.entregarBalcao), btn);
  });

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
  carregarClientesPedido();
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
