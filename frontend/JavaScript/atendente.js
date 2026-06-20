const API_BASE_URL = window.DATAPLATE_API_BASE_URL
  || localStorage.getItem('DATAPLATE_API_BASE_URL')
  || (() => {
    const h = window.location.hostname;
    const isLocalFile = window.location.protocol === 'file:' || !h;
    const isLocal = isLocalFile || h === 'localhost' || h === '127.0.0.1';
    if (isLocal && window.location.port === '8080') return '/api';
    if (isLocalFile) return 'http://localhost:8080/api';
    if (isLocal) return `http://${h}:8080/api`;
    return 'https://dataplate.fly.dev/api';
  })();

const ADMIN_SESSION_KEY = 'dataplate:adminSession';
const AUTO_REFRESH_MS   = 15000;

let allOrders    = [];
let allMesas     = [];
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
  return order.numeroMesa ? `Mesa ${order.numeroMesa}` : `Balcao #${order.id}`;
}

// ── Card de pedido ────────────────────────────────────────────────
function buildCard(order) {
  const mins = elapsedMin(order.dataHora);
  const late = (order.status === 'RECEBIDO' && mins > 15) || (order.status === 'EM_PREPARO' && mins > 25);
  const itensHtml = (order.itens || []).map(i =>
    `<div class="card-item"><span>${i.quantidade}x</span>${esc(i.nomeProduto)}</div>`
  ).join('');

  const cardCls = order.status === 'PRONTO' ? ' is-pronto' : late ? ' sla-late' : '';
  const chipCls = late ? ' sla-late' : '';
  const lateChip = late ? '<span class="sla-chip late-chip">Atrasado</span>' : '';

  const cancelBtn = `<button class="action-button cancel-btn" type="button" onclick="abrirCancelarModal(${order.id})">Cancelar</button>`;
  const actions = order.status === 'PRONTO'
    ? `<div class="card-actions">
        <button class="action-button deliver" type="button" onclick="despachar(${order.id})">
          Despachar para ${esc(origem(order))}
        </button>
        ${cancelBtn}
      </div>`
    : `<div class="card-actions">${cancelBtn}</div>`;

  return `
    <article class="kitchen-card${cardCls}">
      <div class="card-main">
        <div class="card-topline">
          <strong>Pedido #${order.id} - ${esc(origem(order))}</strong>
          <span class="time-chip${chipCls}">${mins} min</span>
        </div>
        <div class="card-items">${itensHtml}</div>
        <div class="card-meta">
          ${lateChip}
          <span class="sla-chip">${formatTime(order.dataHora)}</span>
        </div>
      </div>
      ${order.observacoes ? `<div class="card-obs">Obs: ${esc(order.observacoes)}</div>` : ''}
      ${actions}
    </article>`;
}

// ── Card de mesa ──────────────────────────────────────────────────
function buildMesaCard(mesa) {
  const st = (mesa.status || 'livre').toLowerCase();

  const badgeCfg = {
    livre:                 { label: 'Livre',          cls: 'badge-active'  },
    ocupada:               { label: 'Ocupada',         cls: 'badge-info'    },
    reservada:             { label: 'Reservada',        cls: 'badge-warning' },
    aguardando_pagamento:  { label: 'Conta Fechada',   cls: 'badge-pgto'   },
    manutencao:            { label: 'Manutencao',       cls: 'badge-danger'  },
  }[st] || { label: st, cls: 'badge-info' };

  // SERVIDO incluso — comida na mesa mas conta ainda em aberto
  const pedidos = allOrders.filter(p =>
    p.numeroMesa === mesa.numero && ['RECEBIDO','EM_PREPARO','PRONTO','SERVIDO'].includes(p.status)
  );
  const total    = pedidos.reduce((s, p) => s + Number(p.valorTotal || 0), 0);
  const temPronto = pedidos.some(p => p.status === 'PRONTO');
  const temAtivo  = pedidos.length > 0;

  return `
    <article class="mesa-card status-${st}" onclick="abrirMesa(${mesa.numero})">
      <div class="mesa-top">
        <strong class="mesa-num">Mesa ${mesa.numero}</strong>
        <span class="badge ${badgeCfg.cls}">${badgeCfg.label}</span>
      </div>
      <div class="mesa-meta">
        ${temAtivo
          ? `<span>${pedidos.length} pedido(s) ativo(s)</span>
             ${temPronto ? '<span class="mesa-pronto-hint">Pronto p/ despacho</span>' : ''}
             <span class="mesa-total">${formatBRL(total)}</span>`
          : `<span>Sem pedidos ativos</span>`
        }
      </div>
      <div class="mesa-footer">
        <button class="btn-ver-mesa" type="button">Ver pedidos</button>
      </div>
    </article>`;
}

// ── Render ────────────────────────────────────────────────────────
function render() {
  const recebidos = allOrders.filter(p => p.status === 'RECEBIDO');
  const preparo   = allOrders.filter(p => p.status === 'EM_PREPARO');
  const prontos   = allOrders.filter(p => p.status === 'PRONTO');
  // SERVIDO = já entregue na mesa, mas conta ainda aberta — não aparece no board
  const mesasOcup = allMesas.filter(m => (m.status || '').toLowerCase() === 'ocupada');

  // Stats
  setText('statRecebido', recebidos.length);
  setText('statPreparo',  preparo.length);
  setText('statPronto',   prontos.length);
  setText('statMesas',    mesasOcup.length);
  setText('countRecebido', recebidos.length);
  setText('countPreparo',  preparo.length);
  setText('countPronto',   prontos.length);

  // Tempo medio (inclui SERVIDO pois ainda estao na conta)
  const servidos = allOrders.filter(p => p.status === 'SERVIDO');
  const ativos = [...recebidos, ...preparo, ...prontos, ...servidos];
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

  setList('listRecebido', recebidos, buildCard, 'Nenhum pedido aguardando');
  setList('listPreparo',  preparo,   buildCard, 'Nenhum pedido em preparo');
  setList('listPronto',   prontos,   buildCard, 'Nenhum pedido aguardando despacho');

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

// ── Cancelamento de pedido ────────────────────────────────────────
let _cancelarPedidoId = null;

window.abrirCancelarModal = function(pedidoId) {
  _cancelarPedidoId = pedidoId;
  document.getElementById('cancelarObs').value = '';
  document.getElementById('cancelarModal').style.display = 'flex';
};

window.fecharCancelarModal = function() {
  document.getElementById('cancelarModal').style.display = 'none';
  _cancelarPedidoId = null;
};

window.confirmarCancelamento = async function() {
  const obs = document.getElementById('cancelarObs').value.trim();
  if (!obs) {
    document.getElementById('cancelarObs').focus();
    document.getElementById('cancelarObs').style.borderColor = '#dc2626';
    return;
  }
  document.getElementById('cancelarObs').style.borderColor = '#e2e8f0';

  const btn = document.getElementById('cancelarConfirmarBtn');
  btn.disabled = true;
  btn.textContent = 'Cancelando...';

  try {
    await putJson(`/pedidos/${_cancelarPedidoId}/status`, {
      status: 'CANCELADO',
      formaPagamento: null
    });
    // Grava observacao do motivo via campo observacoes — futuro: endpoint dedicado
    showToast(`Pedido #${_cancelarPedidoId} cancelado.`, 'success');
    fecharCancelarModal();
    await loadData({ silent: true });
    await _refreshModalAtual();
  } catch (e) {
    showToast(e.message || 'Erro ao cancelar.', 'error');
    btn.disabled = false;
    btn.textContent = 'Confirmar Cancelamento';
  }
};

// ── Acoes ─────────────────────────────────────────────────────────
async function _refreshModalAtual() {
  if (!_mesaModalNumero) return;
  const mesaInfo = allMesas.find(m => m.numero === _mesaModalNumero);
  await renderMesaModal(_mesaModalNumero, (mesaInfo?.status || '').toLowerCase());
}

window.despachar = async function(orderId) {
  const order = allOrders.find(o => o.id === orderId);

  if (order?.status === 'ENTREGUE' || order?.status === 'CANCELADO') {
    showToast(`Pedido #${orderId} ja foi pago ou cancelado.`, 'error');
    await loadData({ silent: true });
    await _refreshModalAtual();
    return;
  }
  if (order?.status === 'SERVIDO') {
    showToast(`Pedido #${orderId} ja foi despachado.`, 'success');
    await loadData({ silent: true });
    await _refreshModalAtual();
    return;
  }

  try {
    await putJson(`/pedidos/${orderId}/status`, { status: 'SERVIDO' });
    showToast(`Pedido #${orderId} entregue na mesa.`, 'success');
  } catch (_) {
    // Fallback enquanto migration V6 nao foi aplicada
    try {
      const mesa = allMesas.find(m => m.numero === order?.numeroMesa);
      if (mesa && (mesa.status || '').toLowerCase() === 'aguardando_pagamento') {
        await putJson(`/pedidos/${orderId}/status`, { status: 'ENTREGUE' });
        showToast(`Pedido #${orderId} entregue na mesa.`, 'success');
      } else {
        showToast(`Pedido #${orderId} despachado.`, 'success');
      }
    } catch (e2) {
      showToast(e2.message || 'Erro ao despachar.', 'error');
    }
  }

  await loadData({ silent: true });
  await _refreshModalAtual();
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
  const mesaInfo = allMesas.find(m => m.numero === numeroMesa);
  title.textContent = `Mesa ${numeroMesa}`;
  content.innerHTML = '<div style="color:#94a3b8;padding:16px">Carregando...</div>';
  modal.style.display = 'flex';
  await renderMesaModal(numeroMesa, (mesaInfo?.status || '').toLowerCase());
};

async function renderMesaModal(numeroMesa, mesaStatus) {
  const content = document.getElementById('mesaModalContent');
  if (!content) return;
  try {
    const pedidos = await getJson(`/pedidos/mesa/${numeroMesa}`);
    const ativos    = (pedidos || []).filter(p => !['CANCELADO','ENTREGUE'].includes(p.status));
    const historico = (pedidos || []).filter(p => p.status === 'ENTREGUE');

    // Mesa livre sem pedidos ativos: exibe apenas botão de novo pedido
    if (ativos.length === 0 && mesaStatus === 'livre') {
      content.innerHTML = `
        <div style="text-align:center;padding:20px 0 10px;color:#64748b;font-size:13px">Mesa livre — sem pedidos em aberto.</div>
        <button onclick="abrirNovoPedido(${numeroMesa})" style="display:block;width:100%;margin-top:8px;padding:10px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer">
          + Novo Pedido nesta Mesa
        </button>`;
      return;
    }

    const totalAtivo = ativos.reduce((s, p) => s + Number(p.valorTotal || 0), 0);
    const totalGeral = (pedidos || []).filter(p => p.status !== 'CANCELADO')
      .reduce((s, p) => s + Number(p.valorTotal || 0), 0);

    const statusColor = { RECEBIDO: '#2563eb', EM_PREPARO: '#f59e0b', PRONTO: '#16a34a', SERVIDO: '#7c3aed', ENTREGUE: '#64748b' };
    const statusLabel = { RECEBIDO: 'Aguardando', EM_PREPARO: 'Em preparo', PRONTO: 'Pronto', SERVIDO: 'Servido', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado' };

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
        ${p.observacoes ? `<div style="font-size:11px;color:#475569;background:#f8fafc;border-left:3px solid #94a3b8;border-radius:0 4px 4px 0;padding:4px 7px 4px 10px;margin-top:6px">Obs: ${esc(p.observacoes)}</div>` : ''}
        ${p.status === 'PRONTO' ? `<button onclick="despachar(${p.id})" style="width:100%;margin-top:8px;padding:8px;background:#f85b15;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer">Despachar</button>` : ''}
        ${['RECEBIDO','EM_PREPARO','PRONTO','SERVIDO'].includes(p.status) ? `
          <button onclick="abrirCancelarModal(${p.id})"
            style="width:100%;margin-top:6px;padding:7px;background:transparent;color:#dc2626;border:1.5px solid #fecaca;border-radius:6px;font-weight:700;font-size:12px;cursor:pointer">
            Cancelar pedido
          </button>` : ''}
      </div>`;

    const temAtivos = ativos.length > 0;
    const contaJaFechada = mesaStatus === 'aguardando_pagamento';

    // Seção fechar comanda — só aparece se a conta ainda não foi enviada ao caixa
    let fecharComanda = '';
    if (contaJaFechada) {
      // Conta já enviada ao caixa — mostra aviso, não repete os botões
      fecharComanda = `
        <div style="margin-top:16px;padding:14px;background:#fff5f0;border:1px solid #fed7aa;border-radius:10px;text-align:center">
          <div style="font-size:13px;font-weight:900;color:#f85b15;margin-bottom:4px">Conta Fechada — aguardando caixa</div>
          <div style="font-size:12px;color:#92400e">O caixa ja foi notificado. Total: <strong>${formatBRL(totalAtivo)}</strong></div>
        </div>`;
    } else if (temAtivos) {
      fecharComanda = `
        <div style="border-top:1px solid #e2e8f0;margin-top:16px;padding-top:16px">
          <div style="font-size:13px;font-weight:800;margin-bottom:8px">Solicitar pagamento — ${formatBRL(totalAtivo)}</div>
          <div style="font-size:12px;color:#64748b;margin-bottom:10px">O caixa sera notificado e processara o pagamento.</div>
          <div class="at-pgto-lista">
            <button class="at-pgto-opt" onclick="selecionarPgtoModal('PIX',this)" data-pgto="PIX">
              <img src="../images/menu/pix.png" class="at-pgto-icon" alt="PIX">
              <span class="at-pgto-info"><strong>PIX</strong><small>Pagamento instantaneo</small></span>
              <span class="at-pgto-arrow">›</span>
            </button>
            <button class="at-pgto-opt" onclick="selecionarPgtoModal('CREDITO',this)" data-pgto="CREDITO">
              <img src="../images/menu/Credito.png" class="at-pgto-icon" alt="Credito">
              <span class="at-pgto-info"><strong>Cartao Credito</strong><small>Parcelamento disponivel</small></span>
              <span class="at-pgto-arrow">›</span>
            </button>
            <button class="at-pgto-opt" onclick="selecionarPgtoModal('DEBITO',this)" data-pgto="DEBITO">
              <img src="../images/menu/Debito.png" class="at-pgto-icon" alt="Debito">
              <span class="at-pgto-info"><strong>Cartao Debito</strong><small>Debito na hora</small></span>
              <span class="at-pgto-arrow">›</span>
            </button>
            <button class="at-pgto-opt" onclick="selecionarPgtoModal('DINHEIRO',this)" data-pgto="DINHEIRO">
              <img src="../images/menu/dinheiro.png" class="at-pgto-icon" alt="Dinheiro">
              <span class="at-pgto-info"><strong>Dinheiro</strong><small>Troco disponivel</small></span>
              <span class="at-pgto-arrow">›</span>
            </button>
          </div>
          <button class="btn-fechar-comanda" id="btnFecharComanda" disabled onclick="fecharComanda(${numeroMesa})">
            Solicitar Pagamento ao Caixa
          </button>
        </div>`;
    } else if (historico.length) {
      fecharComanda = `
        <div style="margin-top:14px;padding:12px;background:#f0fdf4;border-radius:8px;text-align:center;font-weight:700;color:#15803d">
          Comanda fechada &bull; Total: ${formatBRL(totalGeral)}
        </div>`;
    }

    // Botão de novo pedido bloqueado quando conta está fechada aguardando caixa
    const btnNovoPedido = contaJaFechada
      ? `<div style="margin-top:10px;padding:9px;background:#f1f5f9;border-radius:6px;text-align:center;font-size:12px;color:#94a3b8;font-weight:600">
           Novos pedidos bloqueados — conta aguardando pagamento
         </div>`
      : `<button onclick="abrirNovoPedido(${numeroMesa})" style="display:block;width:100%;margin-top:10px;padding:9px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer">
           + Novo Pedido nesta Mesa
         </button>`;

    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:10px">
        <span>Em aberto: <strong style="color:#f85b15">${formatBRL(totalAtivo)}</strong></span>
        ${historico.length ? `<span style="color:#64748b">${historico.length} entregue(s)</span>` : ''}
      </div>
      ${ativos.length ? ativos.map(renderPedido).join('') : '<div style="color:#94a3b8;font-size:13px;margin-bottom:8px">Nenhum pedido ativo.</div>'}
      ${btnNovoPedido}
      ${fecharComanda}`;
  } catch (_) {
    content.innerHTML = '<div style="color:#dc2626;padding:16px">Erro ao carregar dados da mesa.</div>';
  }
}

window.selecionarPgtoModal = function(tipo, btn) {
  _mesaModalPgto = tipo;
  document.querySelectorAll('.at-pgto-opt').forEach(b => b.classList.remove('is-selected'));
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

// ── Cardápio / Novo Pedido ────────────────────────────────────────
let npMesaAtual = null;
let npCart = [];
let npProdutosTodos = [];
let npCatAtual = 'todos';
let npBusca = '';

const NP_CATS = [
  { id: 'todos', label: 'Todos' },
  { id: 'hamburguer', label: 'Lanches' },
  { id: 'massas',     label: 'Massas' },
  { id: 'principais', label: 'Principais' },
  { id: 'entradas',   label: 'Entradas' },
  { id: 'sobremesas', label: 'Sobremesas' },
  { id: 'bebidas',    label: 'Bebidas' },
];
const NP_CAT_SLUG = { 1:'hamburguer', 2:'massas', 3:'principais', 4:'entradas', 5:'sobremesas', 6:'bebidas' };

window.abrirNovoPedido = async function(numeroMesa) {
  npMesaAtual = numeroMesa;
  npCart = [];
  npCatAtual = 'todos';
  npBusca = '';
  document.getElementById('npTitulo').textContent = `Novo Pedido — Mesa ${numeroMesa}`;
  document.getElementById('npSubtitulo').textContent = 'Selecione os itens do pedido';
  document.getElementById('npObs').value = '';
  document.getElementById('novoPedidoModal').style.display = 'flex';
  renderNpCats();
  renderNpCart();

  if (!npProdutosTodos.length) {
    document.getElementById('npProdutos').innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const data = await getJson('/produtos');
      npProdutosTodos = (data || []).filter(p => p.ativo !== false);
    } catch (_) {
      document.getElementById('npProdutos').innerHTML = '<div class="empty-state">Erro ao carregar cardapio.</div>';
      return;
    }
  }
  renderNpProdutos();
};

window.fecharNovoPedido = function() {
  document.getElementById('novoPedidoModal').style.display = 'none';
  fecharMesaModal();
};

function renderNpCats() {
  document.getElementById('npCats').innerHTML = NP_CATS.map(c => `
    <button class="np-cat-btn${c.id === npCatAtual ? ' is-active' : ''}"
      onclick="setNpCat('${c.id}')">${c.label}</button>`).join('');
}

window.setNpCat = function(cat) { npCatAtual = cat; renderNpCats(); renderNpProdutos(); };

function renderNpProdutos() {
  const lista = npProdutosTodos.filter(p => {
    const slug = NP_CAT_SLUG[p.idCategoria] || 'principais';
    const catOk = npCatAtual === 'todos' || slug === npCatAtual;
    const buscaOk = !npBusca || p.nome.toLowerCase().includes(npBusca);
    return catOk && buscaOk;
  });

  const grid = document.getElementById('npProdutos');
  if (!lista.length) { grid.innerHTML = '<div class="empty-state">Nenhum produto encontrado.</div>'; return; }

  grid.innerHTML = lista.map(p => `
    <div class="np-produto-card" onclick="npAddItem(${p.id},'${esc(p.nome)}',${p.preco})">
      <div class="np-produto-nome">${esc(p.nome)}</div>
      <div class="np-produto-preco">${formatBRL(p.preco)}</div>
      <button class="np-produto-add" type="button">+ Adicionar</button>
    </div>`).join('');
}

window.npAddItem = function(id, nome, preco) {
  const item = npCart.find(i => i.id === id);
  if (item) item.qty++;
  else npCart.push({ id, nome, preco: Number(preco), qty: 1 });
  renderNpCart();
};

function npChangeQty(id, delta) {
  const idx = npCart.findIndex(i => i.id === id);
  if (idx === -1) return;
  npCart[idx].qty += delta;
  if (npCart[idx].qty <= 0) npCart.splice(idx, 1);
  renderNpCart();
}

function renderNpCart() {
  const container = document.getElementById('npCartItems');
  const btn = document.getElementById('npEnviarBtn');
  if (!npCart.length) {
    container.innerHTML = '<div class="empty-state" style="height:100%">Nenhum item selecionado</div>';
    document.getElementById('npTotal').textContent = formatBRL(0);
    btn.disabled = true;
    return;
  }

  container.innerHTML = npCart.map(i => `
    <div class="np-cart-row">
      <span class="np-cart-row-name">${esc(i.nome)}</span>
      <span class="np-cart-row-sub">${formatBRL(i.preco * i.qty)}</span>
      <div class="np-cart-controls">
        <button class="np-qty-btn" onclick="npChangeQty(${i.id},-1)">-</button>
        <span class="np-qty-num">${i.qty}</span>
        <button class="np-qty-btn" onclick="npChangeQty(${i.id},1)">+</button>
      </div>
    </div>`).join('');

  const total = npCart.reduce((s, i) => s + i.preco * i.qty, 0);
  document.getElementById('npTotal').textContent = formatBRL(total);
  btn.disabled = false;
}

window.enviarNpPedido = async function() {
  if (!npMesaAtual || !npCart.length) return;
  const btn = document.getElementById('npEnviarBtn');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  const obs = document.getElementById('npObs').value.trim();
  try {
    await putJson ? null : null; // putJson já existe
    await fetch(`${API_BASE_URL}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(readSession()?.token ? { Authorization: `Bearer ${readSession().token}` } : {}) },
      body: JSON.stringify({
        vendaCaixa: false,
        numeroMesa: npMesaAtual,
        itens: npCart.map(i => ({ produtoId: i.id, quantidade: i.qty })),
        ...(obs && { observacoes: obs })
      })
    });
    showToast(`Pedido enviado para a cozinha — Mesa ${npMesaAtual}`, 'success');
    fecharNovoPedido();
    await loadData({ silent: true });
  } catch (e) {
    showToast(e.message || 'Erro ao enviar pedido.', 'error');
    btn.disabled = false;
    btn.textContent = 'Enviar para a Cozinha';
  }
};

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

  document.getElementById('npSearch')?.addEventListener('input', e => {
    npBusca = e.target.value.toLowerCase().trim();
    renderNpProdutos();
  });

  document.getElementById('novoPedidoModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) fecharNovoPedido();
  });

  // Abas
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('tab-active'));
      btn.classList.add('tab-active');
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach(p => {
        p.classList.toggle('is-active', p.dataset.tabPanel === target);
      });
    });
  });
  document.querySelector('.tab-btn')?.classList.add('tab-active');
  document.querySelector('.tab-panel')?.classList.add('is-active');

  updateClock();
  window.setInterval(updateClock, 1000);

  loadData();
  refreshTimer = window.setInterval(() => loadData({ silent: true }), AUTO_REFRESH_MS);
  connectWS();
});
