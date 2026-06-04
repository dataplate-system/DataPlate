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
const ACTIVE_STATUSES = ['RECEBIDO', 'EM_PREPARO', 'PRONTO'];
const AUTO_REFRESH_MS = 15000;
const KITCHEN_URGENT_KEY = 'dataplate:kitchenUrgentOrders';
const KITCHEN_CHECKLIST_KEY = 'dataplate:kitchenChecklist';

const STATUS_META = {
  RECEBIDO: {
    label: 'Recebido',
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
  PRONTO: {
    label: 'Pronto',
    badgeClass: 'status-pronto',
    listId: 'listPronto',
    countId: 'countPronto',
    statId: 'statPronto',
    nextStatus: null,
    actionLabel: null,
    actionClass: 'deliver'
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
let selectedOrderId = null;
let autoRefreshTimer = null;
let kitchenSocket = null;
let websocketRetryTimer = null;
let websocketRetryDelay = 1000;
let fallbackMode = false;
let fallbackNoticeShown = false;
let urgentOrderIds = new Set();
let checklistState = {};

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
}

function ensureSession() {
  const session = readSession();
  if (!session) {
    window.location.replace('adm-login.html');
    return null;
  }
  return session;
}

function applySession(session) {
  document.getElementById('sessionInitials').textContent = session.initials || 'CZ';
  document.getElementById('sessionName').textContent = session.name || 'Cozinha';
  document.getElementById('sessionRole').textContent = session.role || 'Pedidos e preparo';
}

function logout() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  window.location.href = 'adm-login.html';
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
  return body.message || body.mensagem || body.erro || fallback;
}

async function apiFetch(endpoint, options = {}) {
  const session = readSession();
  const headers = { ...(options.headers || {}) };
  if (session?.token && !headers.Authorization) {
    headers.Authorization = `Bearer ${session.token}`;
  }
  return fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });
}

async function getJson(endpoint) {
  const response = await apiFetch(endpoint);
  if (!response.ok) {
    const body = await readResponseBody(response);
    throw new Error(extractErrorMessage(body, 'Erro ao carregar dados.'));
  }
  return readResponseBody(response);
}

async function putJson(endpoint, payload) {
  const response = await apiFetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await readResponseBody(response);
    throw new Error(extractErrorMessage(body, 'Não foi possível atualizar o pedido.'));
  }
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
  return `${minutes} min`;
}

function getSlaState(order) {
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

function setConnectionStatus(text, mode) {
  const status = document.getElementById('connectionStatus');
  if (!status) return;
  status.textContent = text;
  status.classList.toggle('online', mode === 'online');
  status.classList.toggle('offline', mode === 'offline');
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
  return `
    <button
      class="action-button ${meta.actionClass}"
      type="button"
      data-order-action
      data-order-id="${order.id}"
      data-next-status="${meta.nextStatus}"
    >
      ${meta.actionLabel}
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

  return `
    <article class="kitchen-card ${selectedOrderId === order.id ? 'is-selected' : ''} ${isUrgent ? 'is-urgent' : ''} sla-${sla.level}" data-order-id="${order.id}">
      <button class="card-main" type="button" data-order-select="${order.id}">
        <div class="card-topline">
          <strong>Pedido #${escapeHtml(order.id)} - Mesa ${escapeHtml(order.numeroMesa || '-')}</strong>
          <span class="time-chip sla-${sla.level}">${formatElapsed(order.dataHora)}</span>
        </div>
        <div class="card-items">
          ${
            visibleItems.length
              ? visibleItems.map((item) => `
                <div class="card-item">
                  <span>${escapeHtml(item.quantidade || 0)}x</span>
                  <strong>${escapeHtml(item.nomeProduto || 'Item')}</strong>
                </div>
              `).join('')
              : '<div class="card-item"><strong>Sem itens</strong></div>'
          }
          ${hiddenCount ? `<div class="card-item"><strong>+ ${hiddenCount} item(ns)</strong></div>` : ''}
        </div>
        ${order.observacoes ? `<div class="card-obs">&#x1F4DD; ${escapeHtml(order.observacoes)}</div>` : ''}
        <div class="card-meta">
          ${isUrgent ? '<span class="priority-chip">Urgente</span>' : ''}
          <span class="sla-chip ${sla.level}">${escapeHtml(sla.label)}</span>
          <span>${escapeHtml(meta.label || order.status)}</span>
          <span>${formatTime(order.dataHora)}</span>
          <span>${formatCurrency(order.valorTotal)}</span>
        </div>
        ${buildProgress(order)}
      </button>
      <div class="card-actions">${getAction(order)}</div>
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
    || filteredOrders.find((order) => order.status === 'EM_PREPARO')
    || filteredOrders[0];

  if (!nextOrder) {
    strip.className = 'next-order-strip is-empty';
    strip.innerHTML = '<div class="next-order-main"><span>Pedido da vez</span><strong>Nenhum pedido ativo</strong></div>';
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
      <strong>#${escapeHtml(nextOrder.id)} - Mesa ${escapeHtml(nextOrder.numeroMesa || '-')}</strong>
      <div class="next-order-meta">
        ${isUrgent ? '<span class="priority-chip">Urgente</span>' : ''}
        <span class="sla-chip ${sla.level}">${escapeHtml(sla.label)}</span>
        <span class="sla-chip">${formatElapsed(nextOrder.dataHora)}</span>
        <span class="sla-chip">${itemCount || items.length} item(ns)</span>
      </div>
    </div>
    <div class="next-order-actions">
      <button class="secondary-button" type="button" data-order-select="${nextOrder.id}">Detalhes</button>
      ${getAction(nextOrder)}
    </div>
  `;
}

function renderColumns(filteredOrders) {
  ACTIVE_STATUSES.forEach((status) => {
    const meta = STATUS_META[status];
    const list = document.getElementById(meta.listId);
    const orders = filteredOrders.filter((order) => order.status === status);
    list.innerHTML = orders.length
      ? orders.map(buildCard).join('')
      : '<div class="empty-state">Nenhum pedido</div>';
  });
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
      <tr data-order-row="${order.id}">
        <td><strong>#${escapeHtml(order.id)}</strong></td>
        <td>Mesa ${escapeHtml(order.numeroMesa || '-')}</td>
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

function renderDetail() {
  const detail = document.getElementById('orderDetail');
  const statusLabel = document.getElementById('detailStatus');
  const order = kitchenOrders.find((item) => item.id === selectedOrderId && ACTIVE_STATUSES.includes(item.status));
  if (!order) {
    detail.className = 'order-detail-empty';
    detail.textContent = 'Nenhum pedido selecionado.';
    statusLabel.textContent = '--';
    return;
  }

  const meta = STATUS_META[order.status] || {};
  const sla = getSlaState(order);
  const isUrgent = isUrgentOrder(order);
  const progress = getChecklistStats(order);
  const items = getItems(order);
  const checklist = getChecklistForOrder(order);

  statusLabel.textContent = meta.label || order.status;
  detail.className = 'order-detail';
  detail.innerHTML = `
    <div class="detail-title">
      <strong>Pedido #${escapeHtml(order.id)}</strong>
      <span class="status-badge ${meta.badgeClass || ''}">${escapeHtml(meta.label || order.status)}</span>
    </div>
    <div class="detail-list">
      <div><span>Mesa</span><strong>${escapeHtml(order.numeroMesa || '-')}</strong></div>
      <div><span>Entrada</span><strong>${formatTime(order.dataHora)}</strong></div>
      <div><span>Espera</span><strong>${formatElapsed(order.dataHora)}</strong></div>
      <div><span>Prazo</span><strong>${escapeHtml(sla.label)}</strong></div>
      <div><span>Prioridade</span><strong>${isUrgent ? 'Urgente' : 'Normal'}</strong></div>
      <div><span>Total</span><strong>${formatCurrency(order.valorTotal)}</strong></div>
    </div>
    <div>
      <div class="detail-progress-row">
        <span class="progress-label">Itens preparados</span>
        <strong>${progress.done}/${progress.total}</strong>
      </div>
      <div class="progress-track"><span style="width:${progress.percent}%"></span></div>
    </div>
    <div class="detail-items">
      ${
        items.length
          ? items.map((item, index) => {
            const key = itemKey(item, index);
            return `
              <label>
                <input
                  type="checkbox"
                  data-check-item
                  data-order-id="${order.id}"
                  data-item-key="${escapeHtml(key)}"
                  ${checklist[key] ? 'checked' : ''}
                />
                <span>${escapeHtml(itemText(item))}</span>
                <strong>${formatCurrency(item.subtotal ?? (Number(item.quantidade || 0) * Number(item.precoUnitario || 0)))}</strong>
              </label>
            `;
          }).join('')
          : '<label><span>Sem itens</span><strong>-</strong></label>'
      }
    </div>
    <div class="detail-actions">
      ${getAction(order)}
      <button class="action-button secondary-action" type="button" data-notify-service="${order.id}">Chamar atendimento</button>
      <button class="action-button secondary-action" type="button" data-print-order="${order.id}">Imprimir ficha</button>
    </div>
  `;
}

function maintainSelection(filteredOrders) {
  const selectedStillVisible = filteredOrders.some((order) => order.id === selectedOrderId);
  if (!selectedStillVisible) selectedOrderId = filteredOrders[0]?.id || null;
}

function renderKitchen() {
  const activeOrders = kitchenOrders.filter((order) => ACTIVE_STATUSES.includes(order.status));
  const filteredOrders = getFilteredOrders();
  maintainSelection(filteredOrders);
  renderStats(activeOrders);
  renderNextOrder(filteredOrders);
  renderColumns(filteredOrders);
  renderTable(filteredOrders);
  renderDetail();
}

function getFallbackOrders() {
  return normalizeOrders(fallbackOrders);
}

async function loadOrders({ silent = false } = {}) {
  if (!silent) setLoadingState();

  try {
    const novos = normalizeOrders(await getJson('/pedidos'));
    verificarNovosPedidosAudio(novos);
    kitchenOrders = novos;
    fallbackMode = false;
    fallbackNoticeShown = false;
    setConnectionStatus('Conectado', 'online');
  } catch (error) {
    console.error('[cozinha]', error);
    if (!fallbackMode || kitchenOrders.length === 0) kitchenOrders = getFallbackOrders();
    fallbackMode = true;
    setConnectionStatus('Demonstração', 'offline');
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
  if (!order) return;

  try {
    if (!fallbackMode) await putJson(`/pedidos/${id}/status`, { status: nextStatus });

    kitchenOrders = kitchenOrders.map((item) =>
      Number(item.id) === id ? { ...item, status: nextStatus } : item
    );

    if (!ACTIVE_STATUSES.includes(nextStatus)) {
      cleanupOrderState(id);
      selectedOrderId = null;
    }

    showToast('Status atualizado com sucesso!', 'success');
    renderKitchen();
    if (!fallbackMode) await loadOrders({ silent: true });
  } catch (error) {
    console.error('[cozinha-status]', error);
    showToast(error.message || 'Não foi possível atualizar o pedido.');
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

function startAutoRefresh() {
  window.clearInterval(autoRefreshTimer);
  if (!document.getElementById('autoRefresh')?.checked) return;
  autoRefreshTimer = window.setInterval(() => loadOrders({ silent: true }), AUTO_REFRESH_MS);
}

function connectKitchenWebSocket() {
  const apiUrl = API_BASE_URL.startsWith('http')
    ? API_BASE_URL
    : `${window.location.origin}${API_BASE_URL}`;
  const wsBaseUrl = apiUrl.replace(/^http/, 'ws').replace(/\/api$/, '/ws');

  if (kitchenSocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(kitchenSocket.readyState)) {
    return kitchenSocket;
  }

  try {
    kitchenSocket = new WebSocket(wsBaseUrl);
    kitchenSocket.addEventListener('open', () => {
      websocketRetryDelay = 1000;
      if (!fallbackMode) setConnectionStatus('Conectado', 'online');
    });
    kitchenSocket.addEventListener('message', (event) => {
      let payload = event.data;
      try {
        payload = JSON.parse(event.data);
      } catch (_) {
        payload = { type: event.data };
      }
      if (payload?.type === 'NOVO_PEDIDO') {
        tocarNotificacaoNovoPedido();
        loadOrders({ silent: true });
      } else if (payload?.type === 'PEDIDO_ATUALIZADO') {
        loadOrders({ silent: true });
      }
    });
    kitchenSocket.addEventListener('close', () => {
      window.clearTimeout(websocketRetryTimer);
      websocketRetryTimer = window.setTimeout(connectKitchenWebSocket, websocketRetryDelay);
      websocketRetryDelay = Math.min(websocketRetryDelay * 2, 30000);
    });
    kitchenSocket.addEventListener('error', () => kitchenSocket.close());
  } catch (error) {
    console.error('[cozinha-ws]', error);
    window.clearTimeout(websocketRetryTimer);
    websocketRetryTimer = window.setTimeout(connectKitchenWebSocket, websocketRetryDelay);
  }

  return kitchenSocket;
}

function bindEvents() {
  document.getElementById('logoutButton')?.addEventListener('click', logout);
  document.getElementById('reloadKitchen')?.addEventListener('click', () => loadOrders());
  document.getElementById('refreshButton')?.addEventListener('click', () => loadOrders());
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

    const print = event.target.closest('[data-print-order]');
    if (print) {
      event.preventDefault();
      window.print();
      return;
    }

    const action = event.target.closest('[data-order-action]');
    if (action) {
      event.preventDefault();
      changeOrderStatus(action.dataset.orderId, action.dataset.nextStatus);
      return;
    }

    const select = event.target.closest('[data-order-select], [data-order-row]');
    if (select) {
      selectedOrderId = Number(select.dataset.orderSelect || select.dataset.orderRow);
      renderKitchen();
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
  loadOrders();
  startAutoRefresh();
  connectKitchenWebSocket();
});
