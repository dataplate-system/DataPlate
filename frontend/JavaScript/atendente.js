const API_BASE_URL = window.DATAPLATE_API_BASE_URL
  || localStorage.getItem('DATAPLATE_API_BASE_URL')
  || (() => {
    const h = window.location.hostname;
    const isLocalFile = window.location.protocol === 'file:' || !h;
    const isLocal = isLocalFile || h === 'localhost' || h === '127.0.0.1';
    if (isLocal && window.location.port === '8080') return '/api';
    if (isLocalFile) return 'http://localhost:8080/api';
    if (isLocal) return `http://${h}:8080/api`;
    return 'https://dataplate.onrender.com/api';
  })();

const ADMIN_SESSION_KEY = 'dataplate:adminSession';
const AUTO_REFRESH_MS   = 15000;

let allOrders  = [];
let allMesas   = [];
let wsRetryDelay = 1000;
let wsTimer = null;
let ws = null;
let refreshTimer = null;

// ── Sessao ─────────────────────────────────────────────────────────
function readSession() {
  try { return JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY) || 'null'); }
  catch (_) { return null; }
}
function ensureSession() {
  const s = readSession();
  if (!s) { window.location.replace('adm-login.html'); return null; }
  return s;
}
function logout() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  window.location.href = 'adm-login.html';
}

// ── API ────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const s = readSession();
  const headers = { ...(opts.headers || {}) };
  if (s?.token) headers.Authorization = `Bearer ${s.token}`;
  return fetch(`${API_BASE_URL}${path}`, { ...opts, headers });
}
async function getJson(path) {
  const r = await apiFetch(path);
  if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.message || 'Erro ao carregar.'); }
  return r.json();
}
async function putJson(path, body) {
  const r = await apiFetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.message || 'Erro ao atualizar.'); }
  return r.json();
}

// ── Utilitarios ───────────────────────────────────────────────────
function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatBRL(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function elapsedMin(v) {
  if (!v) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(v).getTime()) / 60000));
}
function formatTime(v) {
  if (!v) return '--:--';
  const d = new Date(v);
  return isNaN(d) ? '--:--' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function showToast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}
function setStatus(text, mode) {
  const el = document.getElementById('connectionStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('online', mode === 'online');
  el.classList.toggle('offline', mode === 'offline');
}

// ── Relogio ───────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const t = document.getElementById('currentTime');
  const d = document.getElementById('currentDate');
  if (t) t.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d) d.textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
}

// ── Origem do pedido ──────────────────────────────────────────────
function origem(order) {
  return order.numeroMesa ? `Mesa ${order.numeroMesa}` : 'Caixa';
}

// ── Card READ-ONLY (Recebido / Em preparo) ────────────────────────
function buildReadonlyCard(order, slaBg) {
  const mins  = elapsedMin(order.dataHora);
  const late  = (order.status === 'RECEBIDO' && mins > 15) || (order.status === 'EM_PREPARO' && mins > 25);
  const itens = (order.itens || []).slice(0, 3).map(i => `${i.quantidade}x ${esc(i.nomeProduto)}`).join(', ');
  const extra = (order.itens?.length || 0) > 3 ? ` +${order.itens.length - 3}` : '';
  return `
    <article class="kitchen-card sla-${late ? 'late' : 'ok'}">
      <div class="card-topline">
        <strong>Pedido #${order.id} - ${esc(origem(order))}</strong>
        <span class="time-chip${late ? ' sla-late' : ''}">${mins} min</span>
      </div>
      <div class="card-items-text">${esc(itens)}${extra}</div>
      ${order.observacoes ? `<div class="card-obs">&#x1F4DD; ${esc(order.observacoes)}</div>` : ''}
      <div class="card-time">${formatTime(order.dataHora)}</div>
    </article>`;
}

// ── Card DESPACHAR (Pronto) ───────────────────────────────────────
function buildProntoCard(order) {
  const mins  = elapsedMin(order.dataHora);
  const itens = (order.itens || []).slice(0, 3).map(i => `${i.quantidade}x ${esc(i.nomeProduto)}`).join(', ');
  const extra = (order.itens?.length || 0) > 3 ? ` +${order.itens.length - 3}` : '';
  return `
    <article class="kitchen-card is-pronto">
      <div class="card-topline">
        <strong>Pedido #${order.id} - ${esc(origem(order))}</strong>
        <span class="time-chip sla-ok">${mins} min</span>
      </div>
      <div class="card-items-text">${esc(itens)}${extra}</div>
      ${order.observacoes ? `<div class="card-obs">&#x1F4DD; ${esc(order.observacoes)}</div>` : ''}
      <div class="card-time">${formatTime(order.dataHora)}</div>
      <button class="btn-despachar" type="button" onclick="despachar(${order.id})">
        &#x1F69A; Despachar para ${esc(origem(order))}
      </button>
    </article>`;
}

// ── Card de mesa ──────────────────────────────────────────────────
function buildMesaCard(mesa) {
  const st = (mesa.status || 'livre').toLowerCase();
  const stLabel = { livre: 'Livre', ocupada: 'Ocupada', reservada: 'Reservada', manutencao: 'Manutencao' }[st] || st;
  const pedidos = allOrders.filter(p =>
    p.numeroMesa === mesa.numero && ['RECEBIDO','EM_PREPARO','PRONTO'].includes(p.status)
  );
  const total = pedidos.reduce((s, p) => s + Number(p.valorTotal || 0), 0);
  const temPronto = pedidos.some(p => p.status === 'PRONTO');
  const temAtivo  = pedidos.length > 0;

  return `
    <article class="mesa-card status-${st}${temPronto ? ' has-pronto' : ''}" onclick="abrirMesa(${mesa.numero})">
      <div class="mesa-top">
        <strong class="mesa-num">Mesa ${mesa.numero}</strong>
        ${temPronto ? '<span class="pronto-badge">PRONTO</span>' : ''}
      </div>
      <div class="mesa-status-label">${stLabel}</div>
      ${temAtivo ? `<div class="mesa-total">${formatBRL(total)}</div>` : ''}
      ${temAtivo ? `<div class="mesa-pedidos">${pedidos.length} pedido(s) ativo(s)</div>` : ''}
    </article>`;
}

// ── Render ────────────────────────────────────────────────────────
function render() {
  const recebidos = allOrders.filter(p => p.status === 'RECEBIDO');
  const preparo   = allOrders.filter(p => p.status === 'EM_PREPARO');
  const prontos   = allOrders.filter(p => p.status === 'PRONTO');
  const mesasOcup = allMesas.filter(m => (m.status || '').toLowerCase() === 'ocupada');

  // Stats
  setText('statRecebido', recebidos.length);
  setText('statPreparo',  preparo.length);
  setText('statPronto',   prontos.length);
  setText('statMesas',    mesasOcup.length);
  setText('countRecebido', recebidos.length);
  setText('countPreparo',  preparo.length);
  setText('countPronto',   prontos.length);

  // Tempo medio
  const ativos = [...recebidos, ...preparo, ...prontos];
  if (ativos.length) {
    const avg = Math.round(ativos.reduce((s, o) => s + elapsedMin(o.dataHora), 0) / ativos.length);
    setText('statTempo', avg + ' min');
  } else {
    setText('statTempo', '--');
  }

  // Proximo prioritario
  const strip = document.getElementById('nextOrderStrip');
  if (strip) {
    const next = prontos[0] || recebidos[0];
    if (next) {
      const mins = elapsedMin(next.dataHora);
      strip.innerHTML = `
        <div class="next-order-main">
          <span>Prioritario</span>
          <strong>#${next.id} - ${esc(origem(next))}</strong>
          ${next.status === 'PRONTO' ? '<span class="badge-pronto">PRONTO</span>' : '<span class="badge-aguard">AGUARDANDO</span>'}
          <span class="next-time">${mins} min</span>
        </div>`;
    } else {
      strip.innerHTML = '<div class="next-order-main"><span>Prioritario</span><strong>Nenhum pedido ativo</strong></div>';
    }
  }

  // Colunas
  setList('listRecebido', recebidos, o => buildReadonlyCard(o, 'recebido'), 'Nenhum pedido aguardando');
  setList('listPreparo',  preparo,   o => buildReadonlyCard(o, 'preparo'),  'Nenhum pedido em preparo');
  setList('listPronto',   prontos,   o => buildProntoCard(o),              'Nenhum pedido pronto');

  // Mesas
  const grid = document.getElementById('mesasGrid');
  if (grid) {
    grid.innerHTML = allMesas.length
      ? allMesas.map(buildMesaCard).join('')
      : '<div class="empty-state">Nenhuma mesa cadastrada</div>';
  }
  setText('mesasResumo', `${mesasOcup.length} ocupada(s) / ${allMesas.length} total`);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(val);
}
function setList(id, arr, buildFn, empty) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = arr.length ? arr.map(buildFn).join('') : `<div class="empty-state">${empty}</div>`;
}

// ── Acoes ─────────────────────────────────────────────────────────
window.despachar = async function(orderId) {
  try {
    await putJson(`/pedidos/${orderId}/status`, { status: 'ENTREGUE' });
    showToast(`Pedido #${orderId} despachado!`, 'success');
    await loadData({ silent: true });
  } catch (e) {
    showToast(e.message || 'Erro ao despachar.', 'error');
  }
};

let _mesaModalNumero = null;
let _mesaModalPgto    = '';

// ── Modal de mesa ─────────────────────────────────────────────────
window.abrirMesa = async function(numeroMesa) {
  const modal = document.getElementById('mesaModal');
  const title = document.getElementById('mesaModalTitle');
  const content = document.getElementById('mesaModalContent');
  if (!modal) return;
  _mesaModalNumero = numeroMesa;
  _mesaModalPgto   = '';
  title.textContent = `Mesa ${numeroMesa}`;
  content.innerHTML = '<div style="color:#94a3b8;padding:16px">Carregando...</div>';
  modal.style.display = 'flex';
  await renderMesaModal(numeroMesa);
};

async function renderMesaModal(numeroMesa) {
  const content = document.getElementById('mesaModalContent');
  if (!content) return;
  try {
    const pedidos = await getJson(`/pedidos/mesa/${numeroMesa}`);
    const ativos    = (pedidos || []).filter(p => !['CANCELADO','ENTREGUE'].includes(p.status));
    const historico = (pedidos || []).filter(p => p.status === 'ENTREGUE');
    const totalAtivo = ativos.reduce((s, p) => s + Number(p.valorTotal || 0), 0);
    const totalGeral = (pedidos || []).filter(p => p.status !== 'CANCELADO')
      .reduce((s, p) => s + Number(p.valorTotal || 0), 0);

    const statusColor = { RECEBIDO: '#2563eb', EM_PREPARO: '#f59e0b', PRONTO: '#16a34a', ENTREGUE: '#64748b' };
    const statusLabel = { RECEBIDO: 'Aguardando', EM_PREPARO: 'Em preparo', PRONTO: 'Pronto', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado' };

    const renderItens = p => (p.itens || []).map(i =>
      `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;color:#64748b">
        <span>${i.quantidade}x ${esc(i.nomeProduto)}</span>
        <span>${formatBRL(i.subtotal ?? i.precoUnitario * i.quantidade)}</span>
       </div>`
    ).join('');

    const renderPedido = p => `
      <div style="margin-bottom:10px;padding:10px;background:#f8fafc;border-radius:8px;border-left:3px solid ${statusColor[p.status] || '#ccc'}">
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:6px">
          <span>#${p.id} &bull; ${statusLabel[p.status] || p.status}</span>
          <strong>${formatBRL(p.valorTotal)}</strong>
        </div>
        ${renderItens(p)}
        ${p.observacoes ? `<div style="font-size:11px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:5px;padding:4px 7px;margin-top:6px">&#x1F4DD; ${esc(p.observacoes)}</div>` : ''}
        ${p.status === 'PRONTO' ? `<button onclick="despachar(${p.id}).then(()=>renderMesaModal(${numeroMesa}))" style="width:100%;margin-top:8px;padding:8px;background:#16a34a;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer">Despachar</button>` : ''}
      </div>`;

    // Seção fechar comanda
    const temAtivos = ativos.length > 0;
    const fecharComanda = temAtivos ? `
      <div style="border-top:1px solid #e2e8f0;margin-top:16px;padding-top:16px">
        <div style="font-size:13px;font-weight:800;margin-bottom:8px">Solicitar pagamento — ${formatBRL(totalAtivo)}</div>
        <div style="font-size:12px;color:#64748b;margin-bottom:10px">O caixa será notificado e processará o pagamento.</div>
        <div class="pgto-opcoes">
          <button class="pgto-btn-modal" onclick="selecionarPgtoModal('PIX',this)">PIX</button>
          <button class="pgto-btn-modal" onclick="selecionarPgtoModal('CREDITO',this)">Cartão Crédito</button>
          <button class="pgto-btn-modal" onclick="selecionarPgtoModal('DEBITO',this)">Cartão Débito</button>
          <button class="pgto-btn-modal" onclick="selecionarPgtoModal('DINHEIRO',this)">Dinheiro</button>
        </div>
        <button class="btn-fechar-comanda" id="btnFecharComanda" disabled onclick="fecharComanda(${numeroMesa})">
          Solicitar Pagamento ao Caixa
        </button>
      </div>` : historico.length ? `
      <div style="margin-top:14px;padding:12px;background:#f0fdf4;border-radius:8px;text-align:center;font-weight:700;color:#15803d">
        Comanda fechada &bull; Total: ${formatBRL(totalGeral)}
      </div>` : '';

    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:10px">
        <span>Em aberto: <strong style="color:#f85b15">${formatBRL(totalAtivo)}</strong></span>
        ${historico.length ? `<span style="color:#64748b">${historico.length} entregue(s)</span>` : ''}
      </div>
      ${ativos.length ? ativos.map(renderPedido).join('') : '<div style="color:#94a3b8;font-size:13px;margin-bottom:8px">Nenhum pedido ativo.</div>'}
      <a href="pdv.html?modo=mesa&mesa=${numeroMesa}" style="display:block;text-align:center;margin-top:10px;padding:9px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px">
        + Novo Pedido nesta Mesa
      </a>
      ${fecharComanda}`;
  } catch (_) {
    content.innerHTML = '<div style="color:#dc2626;padding:16px">Erro ao carregar dados da mesa.</div>';
  }
}

window.selecionarPgtoModal = function(tipo, btn) {
  _mesaModalPgto = tipo;
  document.querySelectorAll('.pgto-btn-modal').forEach(b => b.classList.remove('is-selected'));
  btn.classList.add('is-selected');
  const btnFechar = document.getElementById('btnFecharComanda');
  if (btnFechar) btnFechar.disabled = false;
};

// Solicitar pagamento: não fecha direto — avisa o caixa
window.fecharComanda = async function(numeroMesa) {
  if (!_mesaModalPgto) { showToast('Selecione a forma de pagamento preferida.', 'error'); return; }
  const btn = document.getElementById('btnFecharComanda');
  if (btn) { btn.disabled = true; btn.textContent = 'Solicitando...'; }

  try {
    const mesa = allMesas.find(m => m.numero === numeroMesa);
    if (!mesa?.id) throw new Error('Mesa não encontrada.');

    // Marca a mesa como "aguardando_pagamento" — o caixa é notificado no PDV
    await putJson(`/mesas/${mesa.id}`, {
      numero:      mesa.numero,
      capacidade:  mesa.capacidade || 4,
      status:      'aguardando_pagamento',
      localizacao: mesa.localizacao || ''
    });

    // Salva a forma preferida localmente para o caixa ver
    const pendentes = JSON.parse(localStorage.getItem('dataplate:pgto_pendente') || '{}');
    pendentes[String(mesa.numero)] = { formaPagamento: _mesaModalPgto, solicitadoEm: new Date().toISOString() };
    localStorage.setItem('dataplate:pgto_pendente', JSON.stringify(pendentes));

    showToast(`Mesa ${numeroMesa}: pagamento solicitado (${_mesaModalPgto}). Caixa foi notificado.`, 'success');
    fecharMesaModal();
    await loadData({ silent: true });
  } catch (e) {
    showToast(e.message || 'Erro ao solicitar pagamento.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Solicitar Pagamento'; }
  }
};

window.fecharMesaModal = function() {
  const modal = document.getElementById('mesaModal');
  if (modal) modal.style.display = 'none';
};

// ── Carregar dados ────────────────────────────────────────────────
async function loadData({ silent = false } = {}) {
  try {
    const [ordersRaw, mesasRaw] = await Promise.all([
      getJson('/pedidos?page=0&size=200'),
      getJson('/mesas')
    ]);
    const list = Array.isArray(ordersRaw) ? ordersRaw : (ordersRaw?.content || []);
    allOrders = list.map(o => ({ ...o, status: String(o.status || '').toUpperCase() }));
    allMesas  = (mesasRaw || []).filter(m => m.ativo !== false).sort((a, b) => a.numero - b.numero);
    setStatus('Conectado', 'online');
  } catch (err) {
    console.error('[atendente]', err);
    setStatus('Offline', 'offline');
  }
  render();
}

// ── WebSocket ─────────────────────────────────────────────────────
function connectWS() {
  const apiUrl = API_BASE_URL.startsWith('http') ? API_BASE_URL : `${window.location.origin}${API_BASE_URL}`;
  const wsUrl  = apiUrl.replace(/^http/, 'ws').replace(/\/api$/, '/ws');
  if (ws && [WebSocket.OPEN, WebSocket.CONNECTING].includes(ws.readyState)) return;
  try {
    ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => { wsRetryDelay = 1000; });
    ws.addEventListener('message', (e) => {
      try {
        const p = JSON.parse(e.data);
        if (['NOVO_PEDIDO','PEDIDO_ATUALIZADO','VENDA_CAIXA'].includes(p?.type)) loadData({ silent: true });
      } catch (_) {}
    });
    ws.addEventListener('close', () => {
      window.clearTimeout(wsTimer);
      wsTimer = window.setTimeout(connectWS, wsRetryDelay);
      wsRetryDelay = Math.min(wsRetryDelay * 2, 30000);
    });
    ws.addEventListener('error', () => ws.close());
  } catch (_) {
    window.clearTimeout(wsTimer);
    wsTimer = window.setTimeout(connectWS, wsRetryDelay);
  }
}

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const session = ensureSession();
  if (!session) return;

  document.getElementById('sessionInitials').textContent = session.initials || 'AT';
  document.getElementById('sessionName').textContent     = session.name    || 'Atendente';
  document.getElementById('sessionRole').textContent     = session.role    || 'Operacional';

  document.getElementById('logoutButton').addEventListener('click', logout);
  document.getElementById('refreshButton').addEventListener('click', () => loadData());
  document.getElementById('reloadPanel').addEventListener('click', () => loadData());

  document.getElementById('mesaModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) fecharMesaModal();
  });

  updateClock();
  window.setInterval(updateClock, 1000);

  loadData();
  refreshTimer = window.setInterval(() => loadData({ silent: true }), AUTO_REFRESH_MS);
  connectWS();
});
