const API_BASE_URL = window.DATAPLATE_API_BASE_URL
  || localStorage.getItem('DATAPLATE_API_BASE_URL')
  || (() => {
    const h = window.location.hostname;
    const isLocalFile = window.location.protocol === 'file:' || !h;
    const isLocal = isLocalFile || h === 'localhost' || h === '127.0.0.1';
    if (isLocal && window.location.port === '8081') return '/api';
    if (isLocalFile) return 'http://localhost:8081/api';
    if (isLocal) return `http://${h}:8081/api`;
    return `http://${h}:8081/api`;
  })();

const ADMIN_SESSION_KEY = 'dataplate:adminSession';
const LOGIN_PAGE = 'adm-login.html';
const ROLE_TO_KEY = {
  ADMIN: 'admin',
  GERENTE: 'gerente',
  FUNCIONARIO: 'atendente',
  CAIXA: 'caixa',
  COZINHA: 'cozinha'
};
const HOME_BY_KEY = {
  admin: 'adm.html',
  gerente: 'adm.html',
  atendente: 'atendente.html',
  caixa: 'pdv.html',
  cozinha: 'cozinha.html'
};
const ALLOWED_KEYS = ['cozinha', 'gerente'];
const CLOSED_STATUSES = ['ENTREGUE', 'CANCELADO'];
const KITCHEN_CLOSED_KEY = 'dataplate:kitchenClosedOrders';
const MAX_CLOSED_ORDERS = 60;

function origemPedido(order) {
  return order.numeroMesa ? `Mesa ${order.numeroMesa}` : `Balcao #${order.id}`;
}
const ACTIVE_STATUSES = ['RECEBIDO', 'EM_PREPARO', 'PRONTO'];
const AUTO_REFRESH_MS = 15000;
const KITCHEN_URGENT_KEY = 'dataplate:kitchenUrgentOrders';
const KITCHEN_CHECKLIST_KEY = 'dataplate:kitchenChecklist';

const STATUS_META = {
  RECEBIDO: {
    label: 'Novo pedido',
    badgeClass: 'status-recebido',
    listId: 'listRecebido',
    countId: 'countRecebido',
    statId: 'statRecebido',
    nextStatus: 'EM_PREPARO',
    actionLabel: 'Iniciar preparo',
    actionClass: ''
  },
  EM_PREPARO: {
    label: 'Em preparo',
    badgeClass: 'status-em_preparo',
    listId: 'listPreparo',
    countId: 'countPreparo',
    statId: 'statPreparo',
    nextStatus: 'PRONTO',
    actionLabel: 'Marcar pronto',
    actionClass: 'ready'
  },
  // A cozinha encerra o fluxo em PRONTO; servir e cobrar ficam com atendente/caixa
  PRONTO: {
    label: 'Pronto',
    badgeClass: 'status-pronto',
    listId: 'listPronto',
    countId: 'countPronto',
    statId: 'statPronto',
    nextStatus: null,
    actionLabel: null,
    actionClass: ''
  },
  SERVIDO: {
    label: 'Servido',
    badgeClass: 'status-finalizado',
    listId: 'listFinalizados',
    countId: 'countFinalizados',
    nextStatus: null,
    actionLabel: null,
    actionClass: ''
  },
  ENTREGUE: {
    label: 'Finalizado',
    badgeClass: 'status-finalizado',
    listId: 'listFinalizados',
    countId: 'countFinalizados',
    nextStatus: null,
    actionLabel: null,
    actionClass: ''
  }
};

const SLA_LIMITS = {
  RECEBIDO: { warning: 8, late: 15 },
  EM_PREPARO: { warning: 18, late: 25 },
  PRONTO: { warning: 6, late: 12 }
};

const fallbackOrders = [
  {
    id: 1028,
    numeroMesa: 7,
    status: 'RECEBIDO',
    dataHora: new Date(Date.now() - 5 * 60000).toISOString(),
    valorTotal: 86.9,
    itens: [
      { nomeProduto: 'Burger Gourmet', quantidade: 2, precoUnitario: 32.9, subtotal: 65.8 },
      { nomeProduto: 'Agua sem gas', quantidade: 2, precoUnitario: 2.9, subtotal: 5.8 },
      { nomeProduto: 'Bolo de Chocolate', quantidade: 1, precoUnitario: 18.9, subtotal: 18.9 }
    ]
  },
  {
    id: 1029,
    numeroMesa: 12,
    status: 'EM_PREPARO',
    dataHora: new Date(Date.now() - 18 * 60000).toISOString(),
    valorTotal: 91.4,
    itens: [
      { nomeProduto: 'Pasta Carbonara', quantidade: 1, precoUnitario: 38.5, subtotal: 38.5 },
      { nomeProduto: 'Salmao Grelhado', quantidade: 1, precoUnitario: 52.9, subtotal: 52.9 }
    ]
  },
  {
    id: 1030,
    numeroMesa: 4,
    status: 'PRONTO',
    dataHora: new Date(Date.now() - 28 * 60000).toISOString(),
    valorTotal: 47.8,
    itens: [
      { nomeProduto: 'Salada Caesar', quantidade: 1, precoUnitario: 24.9, subtotal: 24.9 },
      { nomeProduto: 'Tiramisu', quantidade: 1, precoUnitario: 22.9, subtotal: 22.9 }
    ]
  }
];

let kitchenOrders = [];
let autoRefreshTimer = null;
let kitchenSocket = null;
let websocketRetryTimer = null;
let websocketRetryDelay = 1000;
let wsKitchenLoadTimer = null;
let fallbackMode = false;
let fallbackNoticeShown = false;
let urgentOrderIds = new Set();
let checklistState = {};
const updatingOrderIds = new Set();
let closedOrders = new Map();

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY) || 'null');
  } catch (_) {
    return null;
  }
}

function readJsonStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadOperationalState() {
  urgentOrderIds = new Set(readJsonStorage(KITCHEN_URGENT_KEY, []));
  checklistState = readJsonStorage(KITCHEN_CHECKLIST_KEY, {});
  const hoje = new Date().toDateString();
  closedOrders = new Map(
    normalizeOrders(readClosedOrders())
      .filter((order) => CLOSED_STATUSES.includes(order.status)
        && new Date(order.dataHora).toDateString() === hoje)
      .map((order) => [orderKey(order.id), order])
  );
}

// backendRole manda; sem ele (modo demo, sem token) vale o userKey
function sessionRoleKey(session) {
  if (!session?.token) return null;
  if (session.backendRole) return ROLE_TO_KEY[session.backendRole] || null;
  return null;
}

function ensureSession() {
  const session = readSession();
  const roleKey = sessionRoleKey(session);
  if (!roleKey) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    window.location.replace(LOGIN_PAGE);
    return null;
  }
  if (!ALLOWED_KEYS.includes(roleKey)) {
    window.location.replace(HOME_BY_KEY[roleKey]);
    return null;
  }
  return session;
}

function applyNavVisibility(session) {
  const roleKey = sessionRoleKey(session);
  document.querySelectorAll('[data-roles]').forEach((el) => {
    const roles = String(el.dataset.roles || '').split(/\s+/).filter(Boolean);
    const visible = roles.includes(roleKey);
    el.hidden = !visible;
    el.style.display = visible ? '' : 'none';
  });
}

function applySession(session) {
  document.getElementById('sessionInitials').textContent = session.initials || 'CZ';
  document.getElementById('sessionName').textContent = session.name || 'Cozinha';
  document.getElementById('sessionRole').textContent = session.role || 'Pedidos e preparo';
  applyNavVisibility(session);
}

function stopRealtime() {
  window.clearTimeout(websocketRetryTimer);
  window.clearTimeout(wsKitchenLoadTimer);
  window.clearInterval(autoRefreshTimer);
  websocketRetryTimer = null; wsKitchenLoadTimer = null; autoRefreshTimer = null;
  if (kitchenSocket) { kitchenSocket.onclose = null; kitchenSocket.close(); kitchenSocket = null; }
}

function logout() {
  stopRealtime();
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  window.location.replace(LOGIN_PAGE);
}

let sessionExpiredHandled = false;
function handleSessionExpired() {
  if (sessionExpiredHandled) return;
  sessionExpiredHandled = true;
  showToast('Sessao expirada. Entre novamente.', 'warning');
  stopRealtime();
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  window.setTimeout(() => window.location.replace(LOGIN_PAGE), 1200);
}

function readClosedOrders() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(KITCHEN_CLOSED_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch (_) {
    return [];
  }
}

function writeClosedOrders() {
  try {
    sessionStorage.setItem(KITCHEN_CLOSED_KEY, JSON.stringify(Array.from(closedOrders.values())));
  } catch (_) { /* armazenamento indisponivel: segue so em memoria */ }
}

function rememberClosedOrder(order) {
  if (!order || order.id == null || !CLOSED_STATUSES.includes(order.status)) return;
  closedOrders.set(orderKey(order.id), order);
  const hoje = new Date().toDateString();
  Array.from(closedOrders.entries()).forEach(([key, item]) => {
    if (new Date(item.dataHora).toDateString() !== hoje) closedOrders.delete(key);
  });
  while (closedOrders.size > MAX_CLOSED_ORDERS) {
    closedOrders.delete(closedOrders.keys().next().value);
  }
  writeClosedOrders();
}

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
  if (typeof body === 'string') return body || fallback;
  if (typeof body.detail === 'string') return body.detail;
  return body.message || body.mensagem || body.erro || fallback;
}

async function apiFetch(endpoint, options = {}) {
  const session = readSession();
  const headers = { ...(options.headers || {}) };
  if (session?.token && !headers.Authorization) {
    headers.Authorization = `Bearer ${session.token}`;
  }
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });
  if (response.status === 401 && session?.token) handleSessionExpired();
  return response;
}

async function responseError(response, fallback) {
  const body = await readResponseBody(response);
  const message = response.status === 403
    ? extractErrorMessage(body, 'Acesso negado')
    : extractErrorMessage(body, fallback);
  const error = new Error(message);
  error.status = response.status;
  return error;
}

async function getJson(endpoint) {
  const response = await apiFetch(endpoint);
  if (!response.ok) throw await responseError(response, 'Erro ao carregar dados.');
  return readResponseBody(response);
}

async function putJson(endpoint, payload) {
  const response = await apiFetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw await responseError(response, 'Não foi possível atualizar o pedido.');
  return readResponseBody(response);
}


function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCurrency(value) {
  if (value == null || value === '') return '-';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatTime(value) {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function elapsedMinutes(value) {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
}

function formatElapsed(value) {
  const minutes = elapsedMinutes(value);
  if (minutes < 1) return 'agora';
  if (minutes === 1) return '1 min';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
  return `${Math.floor(minutes / 1440)}d ${Math.floor(minutes % 1440 / 60)}h`;
}

function getSlaState(order) {
  if (!ACTIVE_STATUSES.includes(order.status)) return { level: 'ok', label: 'Encerrado', minutes: 0 };
  const limits = SLA_LIMITS[order.status] || SLA_LIMITS.RECEBIDO;
  const minutes = elapsedMinutes(order.dataHora);
  if (minutes >= limits.late) return { level: 'late', label: 'Atrasado', minutes };
  if (minutes >= limits.warning) return { level: 'warning', label: 'Atenção', minutes };
  return { level: 'ok', label: 'No prazo', minutes };
}

function orderKey(orderOrId) {
  return String(typeof orderOrId === 'object' ? orderOrId.id : orderOrId);
}

function isUrgentOrder(orderOrId) {
  return urgentOrderIds.has(orderKey(orderOrId));
}

function toggleUrgentOrder(orderId) {
  const key = orderKey(orderId);
  if (urgentOrderIds.has(key)) urgentOrderIds.delete(key);
  else urgentOrderIds.add(key);
  writeJsonStorage(KITCHEN_URGENT_KEY, Array.from(urgentOrderIds));
}

function itemKey(item, index) {
  return `${index}:${item.produtoId || item.nomeProduto || 'item'}`;
}

function getItems(order) {
  return Array.isArray(order.itens) ? order.itens : [];
}

function getChecklistForOrder(orderOrId) {
  return checklistState[orderKey(orderOrId)] || {};
}

function setChecklistItem(orderId, key, checked) {
  const orderState = { ...getChecklistForOrder(orderId) };
  if (checked) orderState[key] = true;
  else delete orderState[key];
  checklistState[orderKey(orderId)] = orderState;
  writeJsonStorage(KITCHEN_CHECKLIST_KEY, checklistState);
}

function getChecklistStats(order) {
  const items = getItems(order);
  const orderState = getChecklistForOrder(order);
  const done = items.reduce((total, item, index) =>
    total + (orderState[itemKey(item, index)] ? 1 : 0), 0);
  return {
    done,
    total: items.length,
    percent: items.length ? Math.round((done / items.length) * 100) : 0
  };
}

function cleanupOrderState(orderId) {
  const key = orderKey(orderId);
  urgentOrderIds.delete(key);
  delete checklistState[key];
  writeJsonStorage(KITCHEN_URGENT_KEY, Array.from(urgentOrderIds));
  writeJsonStorage(KITCHEN_CHECKLIST_KEY, checklistState);
}

function itemText(item) {
  return `${Number(item.quantidade || 0)}x ${item.nomeProduto || 'Item'}`;
}

function normalizeOrders(orders) {
  // API retorna paginado {content:[...]} ou array simples
  const list = Array.isArray(orders) ? orders : (orders?.content || []);
  return list
    .map((order) => ({
      ...order,
      status: String(order.status || '').toUpperCase(),
      itens: getItems(order),
      valorTotal: order.valorTotal == null ? null : Number(order.valorTotal)
    }))
    .filter((order) => order.id != null);
}

function orderSearchText(order) {
  const sla = getSlaState(order);
  return [
    order.id,
    order.numeroMesa,
    STATUS_META[order.status]?.label || order.status,
    isUrgentOrder(order) ? 'urgente prioridade' : '',
    sla.label,
    ...getItems(order).map((item) => item.nomeProduto)
  ].join(' ').toLowerCase();
}

function getFilteredOrders() {
  const search = document.getElementById('orderSearch')?.value.trim().toLowerCase() || '';
  const status = document.getElementById('statusFilter')?.value || '';
  const priority = document.getElementById('priorityFilter')?.value || '';
  const sort = document.getElementById('sortFilter')?.value || 'oldest';

  return kitchenOrders
    .filter((order) => ACTIVE_STATUSES.includes(order.status))
    .filter((order) => !status || order.status === status)
    .filter((order) => {
      if (priority === 'urgent') return isUrgentOrder(order);
      if (priority === 'late') return getSlaState(order).level === 'late';
      return true;
    })
    .filter((order) => !search || orderSearchText(order).includes(search))
    .sort((a, b) => {
      const urgentDiff = Number(isUrgentOrder(b)) - Number(isUrgentOrder(a));
      if (urgentDiff !== 0) return urgentDiff;
      const lateDiff = Number(getSlaState(b).level === 'late') - Number(getSlaState(a).level === 'late');
      if (lateDiff !== 0) return lateDiff;
      if (sort === 'table') return Number(a.numeroMesa || 0) - Number(b.numeroMesa || 0);
      if (sort === 'urgent') {
        const warningDiff = Number(getSlaState(b).level === 'warning') - Number(getSlaState(a).level === 'warning');
        if (warningDiff !== 0) return warningDiff;
      }
      return new Date(a.dataHora || 0) - new Date(b.dataHora || 0);
    });
}

function showToast(message, type = 'error') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function setLoadingState() {
  ACTIVE_STATUSES.forEach((status) => {
    const list = document.getElementById(STATUS_META[status].listId);
    if (list) list.innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div>';
  });
}

function updateClock() {
  const now = new Date();
  document.getElementById('currentTime').textContent =
    now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('currentDate').textContent =
    now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
}

function getAction(order) {
  const meta = STATUS_META[order.status];
  if (!meta?.nextStatus) return '';
  const isUpdating = updatingOrderIds.has(orderKey(order.id));
  return `
    <button
      class="action-button ${meta.actionClass}"
      type="button"
      data-order-action
      data-order-id="${order.id}"
      data-next-status="${meta.nextStatus}"
      ${isUpdating ? 'disabled aria-busy="true"' : ''}
    >
      ${isUpdating ? 'Atualizando...' : meta.actionLabel}
    </button>
  `;
}

function buildProgress(order) {
  const progress = getChecklistStats(order);
  if (!progress.total) return '';
  return `
    <div class="progress-track" aria-label="Progresso dos itens">
      <span style="width:${progress.percent}%"></span>
    </div>
  `;
}

function buildCard(order) {
  const meta = STATUS_META[order.status] || {};
  const items = getItems(order);
  const visibleItems = items.slice(0, 4);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);
  const sla = getSlaState(order);
  const isUrgent = isUrgentOrder(order);

  const chips = [
    isUrgent ? '<span class="priority-chip">Urgente</span>' : '',
    sla.level !== 'ok' ? `<span class="sla-chip ${sla.level}">${escapeHtml(sla.label)}</span>` : ''
  ].filter(Boolean).join('');

  return `
    <article class="kitchen-card ${isUrgent ? 'is-urgent' : ''} sla-${sla.level}" data-order-id="${order.id}">
      <div class="card-main">
        <div class="card-topline">
          <strong>Pedido #${escapeHtml(order.id)} - ${escapeHtml(origemPedido(order))}</strong>
          <span class="status-badge ${meta.badgeClass || ''}">${escapeHtml(meta.label || order.status)}</span>
          ${ACTIVE_STATUSES.includes(order.status) ? `<span class="time-chip sla-${sla.level}">${formatElapsed(order.dataHora)}</span>` : ''}
        </div>
        <div class="card-items">
          ${
            visibleItems.length
              ? visibleItems.map((item) => `
                <div class="card-item">
                  <span>${escapeHtml(item.quantidade || 0)}x</span>
                  ${escapeHtml(item.nomeProduto || 'Item')}
                </div>
              `).join('')
              : '<div class="card-item">Sem itens</div>'
          }
          ${hiddenCount ? `<div class="card-item card-item-more">+${hiddenCount} item(ns)</div>` : ''}
        </div>
        ${order.observacoes ? `<div class="card-obs">Obs: ${escapeHtml(order.observacoes)}</div>` : ''}
        ${chips || formatTime(order.dataHora) ? `
        <div class="card-footer">
          <div class="card-chips">${chips}</div>
          <span class="card-time-label">${formatTime(order.dataHora)} &bull; ${formatCurrency(order.valorTotal)}</span>
        </div>` : ''}
      </div>
      <div class="card-actions">${getAction(order)}
        ${ACTIVE_STATUSES.includes(order.status) && !fallbackMode ? `<button type="button" class="order-icon" title="Alterar pedido" aria-label="Alterar pedido" data-edit-order="${order.id}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z"/></svg></button><button type="button" class="order-icon icon-remove" title="Cancelar pedido" aria-label="Cancelar pedido" data-cancel-order="${order.id}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M6 18 18 6"/></svg></button>` : ''}
      </div>
    </article>
  `;
}

function renderStats(activeOrders) {
  const counts = activeOrders.reduce((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {});

  ACTIVE_STATUSES.forEach((status) => {
    const meta = STATUS_META[status];
    const count = counts[status] || 0;
    document.getElementById(meta.statId).textContent = String(count);
    document.getElementById(meta.countId).textContent = String(count);
  });

  const avg = activeOrders.length
    ? Math.round(activeOrders.reduce((total, order) => total + elapsedMinutes(order.dataHora), 0) / activeOrders.length)
    : null;
  document.getElementById('statTempo').textContent = avg == null ? '--' : `${avg} min`;
  document.getElementById('statAtrasado').textContent =
    String(activeOrders.filter((order) => getSlaState(order).level === 'late').length);

  const label = activeOrders.length === 1 ? 'pedido ativo' : 'pedidos ativos';
  document.getElementById('queueSummary').textContent = `${activeOrders.length} ${label}`;
}

function renderNextOrder(filteredOrders) {
  const strip = document.getElementById('nextOrderStrip');
  const nextOrder = filteredOrders.find((order) => order.status === 'RECEBIDO')
    || filteredOrders.find((order) => order.status === 'EM_PREPARO');

  if (!nextOrder) {
    strip.className = 'next-order-strip is-empty';
    strip.innerHTML = '<div class="next-order-main"><span>Pedido da vez</span><strong>Nenhum pedido aguardando preparo</strong></div>';
    return;
  }

  const sla = getSlaState(nextOrder);
  const isUrgent = isUrgentOrder(nextOrder);
  const items = getItems(nextOrder);
  const itemCount = items.reduce((total, item) => total + Number(item.quantidade || 0), 0);

  strip.className = `next-order-strip sla-${sla.level}`;
  strip.innerHTML = `
    <div class="next-order-main">
      <span>Pedido da vez</span>
      <strong>#${escapeHtml(nextOrder.id)} - ${escapeHtml(origemPedido(nextOrder))}</strong>
      <div class="next-order-meta">
        ${isUrgent ? '<span class="priority-chip">Urgente</span>' : ''}
        <span class="sla-chip ${sla.level}">${escapeHtml(sla.label)}</span>
        <span class="sla-chip">${formatElapsed(nextOrder.dataHora)}</span>
        <span class="sla-chip">${itemCount || items.length} item(ns)</span>
      </div>
    </div>
    <div class="next-order-actions">
      ${getAction(nextOrder)}
    </div>
  `;
}

function renderColumns(filteredOrders) {
  const selectedStatus =
    document.getElementById('statusFilter')?.value || '';

  ACTIVE_STATUSES.forEach((status) => {
    const meta = STATUS_META[status];
    const list = document.getElementById(meta.listId);

    if (!list) return;

    const column = list.closest('.kitchen-column');

    if (selectedStatus && status !== selectedStatus) {
      if (column) {
        column.style.display = 'none';
      }
      return;
    }

    if (column) {
      column.style.display = '';
    }

    const orders = filteredOrders.filter(
      (order) => order.status === status
    );

    list.innerHTML = orders.length
      ? orders.map(buildCard).join('')
      : '<div class="empty-state">Nenhum pedido</div>';
  });

  // Cancelados só aparecem quando estiver em "Todos"
  const canceladosColumn =
    document.getElementById('listCancelados')
      ?.closest('.kitchen-column');

  const finalizadosColumn =
    document.getElementById('listFinalizados')
      ?.closest('.kitchen-column');

  if (canceladosColumn) {
    canceladosColumn.style.display =
      selectedStatus ? 'none' : '';
  }

  if (finalizadosColumn) {
    finalizadosColumn.style.display =
      selectedStatus ? 'none' : '';
  }
}

function renderTable(filteredOrders) {
  const tbody = document.getElementById('ordersTableBody');
  if (!filteredOrders.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="order-detail-empty">Nenhum pedido encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = filteredOrders.map((order) => {
    const meta = STATUS_META[order.status] || {};
    const items = getItems(order);
    const label = items.length ? items.map(itemText).join(', ') : 'Sem itens';
    const sla = getSlaState(order);
    const isUrgent = isUrgentOrder(order);
    return `
      <tr>
        <td><strong>#${escapeHtml(order.id)}</strong></td>
        <td>${escapeHtml(origemPedido(order))}</td>
        <td>${escapeHtml(label)}</td>
        <td><span class="sla-chip ${sla.level}">${formatElapsed(order.dataHora)}</span></td>
        <td>${isUrgent ? '<span class="priority-chip">Urgente</span>' : '<span class="sla-chip">Normal</span>'}</td>
        <td>${formatCurrency(order.valorTotal)}</td>
        <td><span class="status-badge ${meta.badgeClass || ''}">${escapeHtml(meta.label || order.status)}</span></td>
        <td>${getAction(order).replace('action-button', 'row-action')}</td>
      </tr>
    `;
  }).join('');
}



function buildCanceladoCard(order) {
  const hora  = formatTime(order.dataHora);
  const itens = (order.itens || []).slice(0, 4).map(i =>
    `<div class="card-item"><span>${escapeHtml(i.quantidade || 0)}x</span>${escapeHtml(i.nomeProduto || 'Item')}</div>`
  ).join('');
  const motivo = order.observacoes
    ? `<div class="card-obs">Motivo: ${escapeHtml(order.observacoes)}</div>`
    : '';
  return `
    <article class="kitchen-card cancelado-card">
      <div class="card-main">
        <div class="card-topline">
          <strong>Pedido #${escapeHtml(order.id)} - ${escapeHtml(origemPedido(order))}</strong>
          <span class="cancelado-hora">${hora}</span>
        </div>
        <div class="card-items">${itens || '<div class="card-item">Sem itens</div>'}</div>
      </div>
      ${motivo}
    </article>`;
}

function renderCancelados() {
  const hoje = new Date().toDateString();
  const cancelados = kitchenOrders
    .filter(o => o.status === 'CANCELADO' && new Date(o.dataHora).toDateString() === hoje)
    .sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora));

  const countEl = document.getElementById('countCancelados');
  const listEl  = document.getElementById('listCancelados');
  if (countEl) countEl.textContent = cancelados.length;
  if (listEl) {
    listEl.innerHTML = cancelados.length
      ? cancelados.map(buildCanceladoCard).join('')
      : '<div class="empty-state">Nenhum cancelamento hoje</div>';
  }
}

function renderFinalizados() {
  const finalizados = kitchenOrders
    .filter((order) => order.status === 'SERVIDO' || order.status === 'ENTREGUE')
    .sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora));

  const countEl = document.getElementById('countFinalizados');
  const listEl = document.getElementById('listFinalizados');
  if (countEl) countEl.textContent = String(finalizados.length);
  if (listEl) {
    listEl.innerHTML = finalizados.length
      ? finalizados.map(buildCard).join('')
      : '<div class="empty-state">Nenhum pedido finalizado</div>';
  }
}

function renderKitchen() {
  const activeOrders = kitchenOrders.filter((order) =>
    ACTIVE_STATUSES.includes(order.status)
  );

  const filteredOrders = getFilteredOrders();

  // Estatísticas gerais continuam mostrando todos
  renderStats(activeOrders);

  // Atualiza os contadores das colunas com o resultado filtrado
  ACTIVE_STATUSES.forEach((status) => {
    const meta = STATUS_META[status];

    const quantidade = filteredOrders.filter(
      (order) => order.status === status
    ).length;

    const contador = document.getElementById(meta.countId);

    if (contador) {
      contador.textContent = String(quantidade);
    }
  });

  renderNextOrder(filteredOrders);
  renderColumns(filteredOrders);
  renderFinalizados();
  renderCancelados();
  renderTable(filteredOrders);
}

function getFallbackOrders() {
  return normalizeOrders(fallbackOrders);
}

// /pedidos/ativos nao traz encerrados: busca o estado final de quem saiu da fila
async function resolveVanishedOrders(ativos) {
  const ativosIds = new Set(ativos.map((order) => orderKey(order.id)));
  const vanished = kitchenOrders.filter((order) =>
    !CLOSED_STATUSES.includes(order.status)
    && !ativosIds.has(orderKey(order.id))
    && !closedOrders.has(orderKey(order.id))
  );
  await Promise.all(vanished.map(async (order) => {
    try {
      const [atual] = normalizeOrders([await getJson(`/pedidos/${encodeURIComponent(order.id)}`)]);
      if (atual) rememberClosedOrder(atual);
    } catch (_) { /* sem detalhe: o pedido apenas sai da fila */ }
  }));
}

async function loadOrders({ silent = false } = {}) {
  if (!silent) setLoadingState();

  try {
    const ativos = normalizeOrders(await getJson('/pedidos/ativos'));
    if (!fallbackMode) await resolveVanishedOrders(ativos);
    const ativosIds = new Set(ativos.map((order) => orderKey(order.id)));
    const novos = ativos.concat(
      Array.from(closedOrders.values()).filter((order) => !ativosIds.has(orderKey(order.id)))
    );
    verificarNovosPedidosAudio(novos);
    verificarCancelamentos(novos);
    kitchenOrders = novos;
    fallbackMode = false;
    fallbackNoticeShown = false;
  } catch (error) {
    console.error('[cozinha]', error);
    if (error.status === 401 && readSession()?.token) return;
    if (error.status === 403) {
      showToast(error.message || 'Acesso negado');
      renderKitchen();
      return;
    }
    if (!fallbackMode || kitchenOrders.length === 0) kitchenOrders = getFallbackOrders();
    fallbackMode = true;
    if (!fallbackNoticeShown) {
      showToast('API indisponível. Exibindo pedidos de demonstração.', 'warning');
      fallbackNoticeShown = true;
    }
  }

  renderKitchen();
}

async function changeOrderStatus(orderId, nextStatus) {
  const id = Number(orderId);
  const order = kitchenOrders.find((item) => Number(item.id) === id);
  if (!order || updatingOrderIds.has(orderKey(id))) return;
  if (!nextStatus || STATUS_META[order.status]?.nextStatus !== nextStatus) return;

  updatingOrderIds.add(orderKey(id));
  renderKitchen();
  try {
    if (!fallbackMode) await putJson(`/pedidos/${id}/status`, { status: nextStatus });

    kitchenOrders = kitchenOrders.map((item) =>
      Number(item.id) === id ? { ...item, status: nextStatus } : item
    );

    if (!ACTIVE_STATUSES.includes(nextStatus)) {
      cleanupOrderState(id);
    }

    showToast('Status atualizado com sucesso!', 'success');
    renderKitchen();
    if (!fallbackMode) await loadOrders({ silent: true });
  } catch (error) {
    console.error('[cozinha-status]', error);
    if (error.status === 401 && readSession()?.token) return;
    showToast(error.message || 'Não foi possível atualizar o pedido.');
    if (error.status === 409 && !fallbackMode) loadOrders({ silent: true });
  } finally {
    updatingOrderIds.delete(orderKey(id));
    renderKitchen();
  }
}

// -- Som de notificação ------------------------------------------
let _audioCtx = null;
let _pedidosConhecidos = new Set();

function getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

function tocarNotificacaoNovoPedido() {
  try {
    const ctx = getAudioCtx();
    const play = () => {
      [[880, 0, 0.15], [1100, 0.18, 0.15], [880, 0.36, 0.2]].forEach(([freq, delay, dur]) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + dur + 0.05);
      });
    };
    // AudioContext fica suspended ate primeiro clique do usuario (politica do browser)
    if (ctx.state === 'suspended') {
      ctx.resume().then(play);
    } else {
      play();
    }
  } catch (_) {}
}

// Desbloqueia AudioContext no primeiro clique para garantir que o som funcione
document.addEventListener('click', function unlockAudio() {
  try { getAudioCtx().resume(); } catch (_) {}
  document.removeEventListener('click', unlockAudio);
}, { once: true });

function verificarNovosPedidosAudio(pedidos) {
  const ids = new Set((pedidos || []).filter((p) => p.status === 'RECEBIDO').map((p) => p.id));
  let temNovo = false;
  ids.forEach((id) => { if (!_pedidosConhecidos.has(id)) temNovo = true; });
  _pedidosConhecidos = ids;
  if (temNovo && _pedidosConhecidos.size > 0) tocarNotificacaoNovoPedido();
}

let _canceladosAlertados = new Set();

function verificarCancelamentos(novos) {
  const canceladosAgora = novos.filter(p => p.status === 'CANCELADO');
  canceladosAgora.forEach(p => {
    if (_canceladosAlertados.has(p.id)) return;
    _canceladosAlertados.add(p.id);

    // Verifica se estava ativo antes (estava em kitchenOrders com status diferente)
    const anterior = kitchenOrders.find(k => k.id === p.id);
    if (anterior && anterior.status === 'EM_PREPARO') {
      showToast(
        `RETIRAR DO PREPARO — Pedido #${p.id} (${origemPedido(p)}) foi CANCELADO`,
        'error'
      );
    } else if (anterior && ACTIVE_STATUSES.includes(anterior.status)) {
      showToast(`Pedido #${p.id} (${origemPedido(p)}) foi cancelado.`, 'error');
    }
  });
}

function startAutoRefresh() {
  window.clearInterval(autoRefreshTimer);
  if (!document.getElementById('autoRefresh')?.checked) return;
  autoRefreshTimer = window.setInterval(() => loadOrders({ silent: true }), AUTO_REFRESH_MS);
}

function buildKitchenWebSocketUrl() {
  const apiUrl = API_BASE_URL.startsWith('http')
    ? API_BASE_URL
    : `${window.location.origin}${API_BASE_URL}`;
  return apiUrl.replace(/^http/, 'ws').replace(/\/api\/?$/, '/ws');
}

function connectKitchenWebSocket() {
  const token = readSession()?.token;
  // Sem token (modo demo) o backend recusa a conexao; fica so o polling
  if (!token || sessionExpiredHandled) return null;

  if (kitchenSocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(kitchenSocket.readyState)) {
    return kitchenSocket;
  }

  try {
    const socket = new WebSocket(buildKitchenWebSocketUrl());
    kitchenSocket = socket;
    socket.addEventListener('open', () => {
      // O token vai na primeira mensagem: URLs ficam registradas nos logs de acesso.
      socket.send(JSON.stringify({ type: 'AUTH', token }));
      websocketRetryDelay = 1000;
      window.clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    });
    socket.addEventListener('message', (event) => {
      let payload = event.data;
      try {
        payload = JSON.parse(event.data);
      } catch (_) {
        payload = { type: event.data };
      }
      if (payload?.pedido) {
        const [pedido] = normalizeOrders([payload.pedido]);
        rememberClosedOrder(pedido);
      }
      if (payload?.type === 'NOVO_PEDIDO') {
        tocarNotificacaoNovoPedido();
        window.clearTimeout(wsKitchenLoadTimer);
        wsKitchenLoadTimer = window.setTimeout(() => loadOrders({ silent: true }), 300);
      } else if (payload?.type === 'PEDIDO_ATUALIZADO') {
        window.clearTimeout(wsKitchenLoadTimer);
        wsKitchenLoadTimer = window.setTimeout(() => loadOrders({ silent: true }), 300);
      }
    });
    socket.addEventListener('close', (event) => {
      if (kitchenSocket !== socket) return;
      kitchenSocket = null;
      window.clearTimeout(websocketRetryTimer);
      if (sessionExpiredHandled) return;
      if (!autoRefreshTimer && document.getElementById('autoRefresh')?.checked) {
        autoRefreshTimer = window.setInterval(() => loadOrders({ silent: true }), AUTO_REFRESH_MS);
      }
      // 1008 = token recusado: nao insiste; o polling detecta sessao expirada (401)
      if (event.code === 1008) {
        loadOrders({ silent: true });
        return;
      }
      websocketRetryTimer = window.setTimeout(connectKitchenWebSocket, websocketRetryDelay);
      websocketRetryDelay = Math.min(websocketRetryDelay * 2, 30000);
    });
    socket.addEventListener('error', () => socket.close());
  } catch (error) {
    console.error('[cozinha-ws]', error);
    window.clearTimeout(websocketRetryTimer);
    websocketRetryTimer = window.setTimeout(connectKitchenWebSocket, websocketRetryDelay);
  }

  return kitchenSocket;
}

let editDraft = null;
let editProducts = [];

async function openOrderEdit(id) {
  if (fallbackMode) return;
  try {
    const [order, products] = await Promise.all([getJson(`/pedidos/${id}`), getJson('/produtos')]);
    if (!ACTIVE_STATUSES.includes(order.status)) throw new Error('Este pedido já saiu da fila da cozinha.');
    editDraft = { ...order, itens: order.itens.map(item => ({ ...item })) };
    editProducts = products;
    document.getElementById('editOrderTitle').textContent = `Alterar pedido #${order.id} · ${origemPedido(order)}`;
    document.getElementById('editOrderNotes').value = order.observacoes || '';
    document.getElementById('editOrderReason').value = '';
    document.getElementById('editOrderError').textContent = '';
    document.getElementById('editProductSelect').innerHTML = products.map(p => `<option value="${p.id}">${escapeHtml(p.nome)} · ${formatCurrency(p.preco)}</option>`).join('');
    renderEditItems();
    document.getElementById('editOrderDialog').showModal();
  } catch (error) { showToast(error.message || 'Não foi possível abrir o pedido.', 'error'); }
}

function renderEditItems() {
  document.getElementById('editOrderItems').innerHTML = editDraft.itens.map((item, index) => `
    <div class="edit-item"><span>${escapeHtml(item.nomeProduto)}<small>${formatCurrency(item.precoUnitario)} / unidade</small></span>
    <label>Qtd.<input type="number" min="1" max="999" step="1" required value="${item.quantidade}" data-edit-quantity="${index}" aria-label="Quantidade de ${escapeHtml(item.nomeProduto)}" /></label>
    <button type="button" class="order-icon icon-remove" title="Remover item" data-remove-edit-item="${index}" aria-label="Remover ${escapeHtml(item.nomeProduto)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg></button></div>`).join('') || '<p>Adicione ao menos um produto.</p>';
  renderEditTotal();
}

function renderEditTotal() {
  const originalSubtotal = editDraft.itensOriginalSubtotal ?? editDraft.itens.reduce((sum, i) => sum + i.quantidade * i.precoUnitario, 0);
  editDraft.itensOriginalSubtotal = originalSubtotal;
  const discount = Math.max(0, originalSubtotal - editDraft.valorTotal);
  const total = Math.max(0, editDraft.itens.reduce((sum, i) => sum + i.quantidade * i.precoUnitario, 0) - discount);
  document.getElementById('editOrderTotal').textContent = `Novo total: ${formatCurrency(total)}`;
}

async function saveOrderEdit(event) {
  event.preventDefault();
  const button = document.getElementById('saveEditOrder');
  const errorEl = document.getElementById('editOrderError');
  if (button.disabled) return;
  if (!editDraft.itens.length) { errorEl.textContent = 'Adicione ao menos um produto.'; return; }
  button.disabled = true;
  errorEl.textContent = '';
  try {
    await putJson(`/pedidos/${editDraft.id}/itens`, {
      atualizadoEm: editDraft.atualizadoEm,
      itens: editDraft.itens.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
      observacoes: document.getElementById('editOrderNotes').value,
      motivo: document.getElementById('editOrderReason').value.trim()
    });
    cleanupOrderState(editDraft.id);
    document.getElementById('editOrderDialog').close();
    showToast('Pedido alterado. Atendimento e caixa recebem a atualização.', 'success');
    await loadOrders({ silent: true });
  } catch (error) { errorEl.textContent = error.message || 'Não foi possível salvar a alteração.'; }
  finally { button.disabled = false; }
}

function bindEvents() {
  let cancelOrderId = null;
  const cancelDialog = document.getElementById('cancelOrderDialog');
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-cancel-order]');
    if (!button) return;
    cancelOrderId = Number(button.dataset.cancelOrder);
    document.getElementById('cancelOrderForm').reset();
    document.getElementById('cancelOrderError').textContent = '';
    document.getElementById('cancelOrderTitle').textContent = `Cancelar pedido #${cancelOrderId}`;
    cancelDialog.showModal();
  });
  document.getElementById('closeCancelOrder').addEventListener('click', () => cancelDialog.close());
  document.getElementById('cancelOrderForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.getElementById('confirmCancelOrder');
    if (button.disabled) return;
    const motivo = document.getElementById('cancelOrderReason').value.trim();
    if (!motivo) return;
    button.disabled = true;
    try {
      await putJson(`/pedidos/${cancelOrderId}/status`, { status: 'CANCELADO', motivo, origemCancelamento: 'Cozinha' });
      cancelDialog.close();
      cleanupOrderState(cancelOrderId);
      showToast('Pedido cancelado. O gerente recebe o motivo e a origem.', 'success');
      await loadOrders({ silent: true });
    } catch (error) { document.getElementById('cancelOrderError').textContent = error.message; }
    finally { button.disabled = false; }
  });
  document.getElementById('editOrderForm').addEventListener('submit', saveOrderEdit);
  document.getElementById('closeEditOrder').addEventListener('click', () => document.getElementById('editOrderDialog').close());
  document.getElementById('addEditItem').addEventListener('click', () => {
    const id = Number(document.getElementById('editProductSelect').value);
    const product = editProducts.find(p => p.id === id);
    if (!product) return;
    const existing = editDraft.itens.find(i => i.produtoId === id);
    if (existing) existing.quantidade++;
    else editDraft.itens.push({ produtoId: id, nomeProduto: product.nome, quantidade: 1, precoUnitario: Number(product.preco) });
    renderEditItems();
  });
  document.getElementById('editOrderItems').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-edit-item]');
    if (!button) return;
    editDraft.itens.splice(Number(button.dataset.removeEditItem), 1);
    renderEditItems();
  });
  document.getElementById('editOrderItems').addEventListener('input', (event) => {
    if (!event.target.matches('[data-edit-quantity]')) return;
    editDraft.itens[Number(event.target.dataset.editQuantity)].quantidade = Number(event.target.value);
    renderEditTotal();
  });
  document.getElementById('logoutButton')?.addEventListener('click', logout);
  document.getElementById('reloadKitchen')?.addEventListener('click', () => loadOrders());
  document.getElementById('clearFilters')?.addEventListener('click', () => {
    document.getElementById('orderSearch').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('priorityFilter').value = '';
    document.getElementById('sortFilter').value = 'oldest';
    renderKitchen();
  });

  ['orderSearch', 'statusFilter', 'priorityFilter', 'sortFilter'].forEach((id) => {
    document.getElementById(id)?.addEventListener(id === 'orderSearch' ? 'input' : 'change', renderKitchen);
  });
  document.getElementById('autoRefresh')?.addEventListener('change', startAutoRefresh);

  document.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit-order]');
    if (edit) { openOrderEdit(Number(edit.dataset.editOrder)); return; }
    const urgent = event.target.closest('[data-toggle-urgent]');
    if (urgent) {
      event.preventDefault();
      toggleUrgentOrder(urgent.dataset.toggleUrgent);
      renderKitchen();
      showToast(isUrgentOrder(urgent.dataset.toggleUrgent) ? 'Pedido marcado como urgente.' : 'Urgência removida.', 'success');
      return;
    }

    const notify = event.target.closest('[data-notify-service]');
    if (notify) {
      event.preventDefault();
      showToast(`Atendimento avisado sobre o pedido #${notify.dataset.notifyService}.`, 'success');
      return;
    }


    const action = event.target.closest('[data-order-action]');
    if (action) {
      event.preventDefault();
      changeOrderStatus(action.dataset.orderId, action.dataset.nextStatus);
      return;
    }

  });

  document.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-check-item]');
    if (!checkbox) return;
    setChecklistItem(checkbox.dataset.orderId, checkbox.dataset.itemKey, checkbox.checked);
    renderKitchen();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const session = ensureSession();
  if (!session) return;

  loadOperationalState();
  applySession(session);
  bindEvents();

  updateClock();
  window.setInterval(updateClock, 1000);

   window.setInterval(() => {
    renderKitchen();
  }, 30000);

  loadOrders();
  startAutoRefresh();
  connectKitchenWebSocket();
});
