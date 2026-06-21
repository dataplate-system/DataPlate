/**
 * ADMIN PANEL - Navigation and Modal Management
 */

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
const isAdminPanelPage = /adm\.html(?:$|[?#])/.test(window.location.href);
const ADMIN_PANEL_USERS = {
  gerente: {
    name: 'Gerente Principal',
    initials: 'GP',
    cpf: '000.000.000-00',
    role: 'Administrador'
  },
  atendente: {
    name: 'Atendente',
    initials: 'AT',
    cpf: '111.111.111-11',
    role: 'Operacional'
  },
  cozinha: {
    name: 'Cozinha',
    initials: 'CZ',
    cpf: '222.222.222-22',
    role: 'Pedidos e preparo'
  },
  caixa: {
    name: 'Caixa',
    initials: 'CX',
    cpf: '333.333.333-33',
    role: 'PDV e vendas'
  }
};

if (isAdminPanelPage) {
  const _rawSession = sessionStorage.getItem(ADMIN_SESSION_KEY);
  if (!_rawSession) {
    window.location.replace('adm-login.html');
  } else {
    try {
      const _s = JSON.parse(_rawSession);
      if (_s?.userKey === 'atendente') window.location.replace('atendente.html');
      if (_s?.userKey === 'cozinha')   window.location.replace('cozinha.html');
      if (_s?.userKey === 'caixa')     window.location.replace('pdv.html');
    } catch (_) {}
  }
}

const WS_BASE_URL = (() => {
  const apiUrl = API_BASE_URL.startsWith('http')
    ? API_BASE_URL
    : `${window.location.origin}${API_BASE_URL}`;

  return apiUrl.replace(/^http/, 'ws').replace(/\/api$/, '/ws');
})();

async function buscarEnderecoPorCep(cep) {
  const response = await fetch(`${API_BASE_URL}/cep/${cep}`);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((body && body.mensagem) || 'CEP nao encontrado.');
  }
  return body;
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
  const session = readAdminSession();
  const headers = { ...(options.headers || {}) };
  if (session?.token && !headers.Authorization) {
    headers.Authorization = `Bearer ${session.token}`;
  }
  return fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });
}

function showSuccessModal(title, message, duration = 4000) {
  const overlay = document.createElement('div');
  overlay.className = 'success-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.setProperty('--success-duration', `${duration}ms`);

  overlay.innerHTML = `
    <div class="success-box">
      <button class="success-close-btn" aria-label="Fechar">&#x2715;</button>
      <div class="success-icon-wrap">
        <svg viewBox="0 0 24 24"><polyline points="4 12 9 17 20 7"/></svg>
      </div>
      <h3 class="success-title">${title}</h3>
      <p class="success-message">${message}</p>
      <div class="success-progress-bar"><div class="success-progress-fill"></div></div>
      <button class="btn-primary success-btn">Concluir</button>
    </div>`;

  document.body.appendChild(overlay);

  function close() {
    overlay.style.animation = 'none';
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.2s';
    window.setTimeout(() => overlay.remove(), 200);
  }

  const timer = window.setTimeout(close, duration);

  overlay.querySelector('.success-close-btn').addEventListener('click', () => { window.clearTimeout(timer); close(); });
  overlay.querySelector('.success-btn').addEventListener('click', () => { window.clearTimeout(timer); close(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { window.clearTimeout(timer); close(); } });
}

function showConfirmModal(title, message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');

    overlay.innerHTML = `
      <div class="confirm-box">
        <button class="confirm-close-btn" aria-label="Fechar">&#x2715;</button>
        <div class="confirm-icon-wrap">
          <svg viewBox="0 0 24 24">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </div>
        <h3 class="confirm-title">${title}</h3>
        <p class="confirm-message">${message}</p>
        <div class="confirm-actions">
          <button class="btn-secondary confirm-cancel-btn">Cancelar</button>
          <button class="btn-danger confirm-ok-btn">Excluir</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    function close(result) {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.18s';
      window.setTimeout(() => overlay.remove(), 180);
      resolve(result);
    }

    overlay.querySelector('.confirm-ok-btn').addEventListener('click', () => close(true));
    overlay.querySelector('.confirm-cancel-btn').addEventListener('click', () => close(false));
    overlay.querySelector('.confirm-close-btn').addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(false); });
  });
}

function showToast(message, type = 'error') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:9999;display:grid;gap:8px;max-width:360px;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `padding:12px 14px;border-radius:8px;color:#fff;box-shadow:0 10px 30px rgba(15,23,42,.18);font:500 14px/1.35 Inter,system-ui,sans-serif;background:${type === 'success' ? '#16a34a' : '#dc2626'};`;
  container.appendChild(toast);
  window.setTimeout(() => toast.remove(), 4500);
}

// Destaca o campo CPF quando o erro indica duplicidade
function mostrarErroCpf(form, mensagem) {
  const ehDuplicado = /cpf|ja cadastrado|already exists|duplicate|unique/i.test(mensagem);
  if (!ehDuplicado) { showToast(mensagem); return; }

  const campo = form?.querySelector('[name="cpf"], [name="cnpj"]');
  if (campo) {
    campo.style.borderColor = '#dc2626';
    campo.style.boxShadow  = '0 0 0 3px rgba(220,38,38,.18)';
    campo.setCustomValidity('CPF já cadastrado no sistema.');
    campo.reportValidity();
    campo.addEventListener('input', () => {
      campo.style.borderColor = '';
      campo.style.boxShadow  = '';
      campo.setCustomValidity('');
    }, { once: true });
  }
  showToast('CPF já está cadastrado no sistema.', 'error');
}

function readAdminSession() {
  try {
    return JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY) || 'null');
  } catch (_) {
    return null;
  }
}

function applyAdminSession() {
  const session = readAdminSession();
  if (!session) return;

  const isLegacyCashier = session.userKey === 'chefe'
    || session.initials === 'CC'
    || session.name === 'Chefe de Caixa';
  const userKey = isLegacyCashier ? 'atendente' : session.userKey || Object.keys(ADMIN_PANEL_USERS).find((key) =>
    ADMIN_PANEL_USERS[key].initials === session.initials
  ) || 'gerente';
  const normalizedSession = {
    ...session,
    ...(ADMIN_PANEL_USERS[userKey] || {}),
    userKey
  };
  const headerName = document.getElementById('headerUserName');
  const headerAvatar = document.getElementById('headerUserAvatar');
  const headerRole = document.getElementById('headerUserRole');
  const footerName = document.querySelector('.footer-user-name');
  const footerRole = document.querySelector('.footer-user-role');
  const footerAvatar = document.querySelector('.footer-user-avatar');
  const profileName = document.querySelector('#profileModal input[name="name"]');
  const profileCpf = document.querySelector('#profileModal input[name="cpf"]');
  const profileRole = document.querySelector('#profileModal input[name="role"]');
  const profileSummaryName = document.querySelector('#profileModal .profile-summary strong');
  const profileSummaryCpf = document.querySelector('#profileModal .profile-summary span');
  const profileAvatar = document.querySelector('#profileModal .user-avatar-large');

  if (headerName) headerName.textContent = normalizedSession.name || 'Gerente Principal';
  if (headerAvatar) headerAvatar.textContent = normalizedSession.initials || 'AD';
  if (headerRole) headerRole.textContent = normalizedSession.role || 'Administrador';
  if (footerName) footerName.textContent = normalizedSession.name || 'Gerente Principal';
  if (footerRole) footerRole.textContent = normalizedSession.role || 'Administrador';
  if (footerAvatar) footerAvatar.textContent = normalizedSession.initials || 'AD';
  if (profileName) profileName.value = normalizedSession.name || 'Administrador';
  if (profileCpf) profileCpf.value = normalizedSession.cpf || '';
  if (profileRole) profileRole.value = normalizedSession.role || 'Administrador';
  if (profileSummaryName) profileSummaryName.textContent = normalizedSession.name || 'Administrador';
  if (profileSummaryCpf) profileSummaryCpf.textContent = normalizedSession.cpf || '';
  if (profileAvatar) profileAvatar.textContent = normalizedSession.initials || 'AD';
  if (isLegacyCashier || session.userKey !== userKey) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(normalizedSession));
  }

  // Controle de visibilidade por role
  const backendRole = normalizedSession.backendRole || '';
  const isAdmin = backendRole === 'ADMIN' || normalizedSession.userKey === 'gerente';
  if (!isAdmin) {
    document.querySelectorAll('[data-role="admin"]').forEach((el) => {
      el.style.display = 'none';
    });
    // também oculta atalhos da home que exigem admin
    document.querySelectorAll('.home-shortcut[data-role="admin"]').forEach((el) => {
      el.style.display = 'none';
    });
  }
}

window.logoutAdmin = function() {
  window.clearTimeout(websocketRetryTimer);
  window.clearTimeout(wsAdminLoadTimer);
  websocketRetryTimer = null; wsAdminLoadTimer = null;
  if (adminSocket) { adminSocket.onclose = null; adminSocket.close(); adminSocket = null; }
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  window.location.replace('adm-login.html');
};

async function postJson(endpoint, payload) {
  const response = await apiFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await readResponseBody(response);
    const message = extractErrorMessage(body, 'Nao foi possivel salvar os dados.');
    throw new Error(`${message} (${endpoint})`);
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
    const message = extractErrorMessage(body, 'Nao foi possivel atualizar.');
    throw new Error(`${message} (${endpoint})`);
  }
  return readResponseBody(response);
}

async function deleteJson(endpoint) {
  const response = await apiFetch(endpoint, { method: 'DELETE' });
  if (!response.ok) {
    const body = await readResponseBody(response);
    const message = extractErrorMessage(body, 'Nao foi possivel excluir.');
    throw new Error(`${message} (${endpoint})`);
  }
  return readResponseBody(response);
}

async function getJson(endpoint) {
  const response = await apiFetch(endpoint);
  if (!response.ok) {
    const body = await readResponseBody(response);
    const message = extractErrorMessage(body, 'Erro ao carregar dados.');
    throw new Error(`${message} (${endpoint})`);
  }
  return readResponseBody(response);
}

// =============================================
// NAVIGATION: Section Switching
// =============================================

function navigateTo(sectionId) {
  // Hide all sections
  document.querySelectorAll('.content-section').forEach(section => {
    section.classList.remove('active');
  });

  // Show selected section
  const selectedSection = document.getElementById(sectionId);
  if (selectedSection) {
    selectedSection.classList.add('active');
  }
  document.body.classList.toggle('admin-home-active', sectionId === 'home' || !selectedSection);

  // Hide logo and intro text when navigating to a section
  const logoCenter = document.querySelector('.logocenter');
  const nomeCenter = document.querySelector('.nomecenter');
  const textCenter = document.getElementById('textcenter');
  const searchInput = document.querySelector('.pesquisa');
  const searchBox = document.querySelector('.search-box');
  
  if (selectedSection) {
    if (logoCenter) logoCenter.style.display = 'none';
    if (nomeCenter) nomeCenter.style.display = 'none';
    if (textCenter) textCenter.style.display = 'none';
    if (searchInput) searchInput.style.display = 'none';
    if (searchBox) searchBox.style.display = 'none';
  } else {
    if (logoCenter) logoCenter.style.display = 'block';
    if (nomeCenter) nomeCenter.style.display = 'block';
    if (textCenter) textCenter.style.display = 'block';
    if (searchInput) searchInput.style.display = 'block';
    if (searchBox) searchBox.style.display = 'flex';
  }

  // Mapa: seção → [grupo pai, nome de exibição]
  const NAV_MAP = {
    pedidos:             ['Operações',    'Pedidos'],
    cancelamentos:       ['Operações',    'Cancelamentos'],
    pagamentos:          ['Operações',    'Pagamentos'],
    mesas:               ['Operações',    'Mesas'],
    cozinha:             ['Operações',    'Cozinha'],
    clientes:            ['Cadastros',    'Clientes'],
    fornecedores:        ['Cadastros',    'Fornecedores'],
    funcionarios:        ['Cadastros',    'Funcionários'],
    cardapio:            ['Cadastros',    'Cardápio'],
    insumos:             ['Cadastros',    'Insumos'],
    dashboard:           ['Relatórios',   'Dashboard'],
    'rel-financeiro':    ['Relatórios',   'Financeiro'],
    'rel-cardapio':      ['Relatórios',   'Desempenho do Cardápio'],
    'rel-operacional':   ['Relatórios',   'Operacional'],
    'config-restaurante':['Configurações','Restaurante'],
    'config-usuarios':   ['Configurações','Usuários'],
    'config-integracao': ['Configurações','Integrações'],
    'config-notificacoes':['Configurações','Notificações'],
  };

  // Destacar botão pai do top nav
  document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
  const navInfo = NAV_MAP[sectionId];
  if (navInfo) {
    document.querySelectorAll('.nav-button').forEach(btn => {
      if (btn.textContent.trim() === navInfo[0]) btn.classList.add('active');
    });
  }

  // Atualizar breadcrumb no header
  const bc = document.getElementById('headerBreadcrumb');
  if (bc) {
    if (navInfo) {
      bc.innerHTML = `<span>${navInfo[0]}</span><span class="bc-sep">›</span><span class="bc-current">${navInfo[1]}</span>`;
    } else {
      bc.innerHTML = '';
    }
  }

  // Persist section in URL hash so F5 restores it
  history.replaceState(null, '', sectionId && sectionId !== 'home'
    ? '#' + sectionId
    : location.pathname
  );

  // Load data for the section being shown
  const sectionLoaders = {
    home:           carregarHomeStats,
    dashboard:      carregarRelatorios,
    clientes:       carregarClientes,
    funcionarios:   carregarFuncionarios,
    fornecedores:   carregarFornecedores,
    cardapio:       carregarProdutos,
    pedidos:        carregarPedidos,
    cancelamentos:  carregarCancelamentos,
    pagamentos:     carregarPagamentos,
    mesas:          () => { carregarMesas(); carregarPedidosProntos(); },
    cozinha:        carregarCozinha,
    'rel-vendas':      () => { preencherDatasRelatorio('rel-vendas', 30);    const r = getRelDateRange('rel-vendas');      carregarRelVendas(r.inicio, r.fim); },
    'rel-financeiro':  () => { preencherDatasRelatorio('rel-financeiro', 30); const r = getRelDateRange('rel-financeiro');  carregarRelFinanceiro(r.inicio, r.fim); },
    'rel-cardapio':    () => { preencherDatasRelatorio('rel-cardapio', 30);   const r = getRelDateRange('rel-cardapio');    carregarRelCardapio(r.inicio, r.fim); },
    'rel-operacional': () => { preencherDatasRelatorio('rel-operacional', 30); const r = getRelDateRange('rel-operacional'); carregarRelOperacional(r.inicio, r.fim); },
    'config-usuarios': carregarUsuarios,
    'config-restaurante': carregarConfiguracaoRestaurante,
    insumos: carregarInsumos
  };
  if (sectionLoaders[sectionId]) sectionLoaders[sectionId]();
}
window.navigateTo = navigateTo;

const ADMIN_HOME_ROUTES = [
  { id: 'dashboard', labels: ['dashboard', 'painel', 'indicadores', 'controle'] },
  { id: 'clientes', labels: ['clientes', 'cliente', 'cadastro de clientes'] },
  { id: 'fornecedores', labels: ['fornecedores', 'fornecedor'] },
  { id: 'funcionarios', labels: ['funcionarios', 'funcionários', 'funcionario', 'funcionário', 'colaboradores'] },
  { id: 'cardapio', labels: ['cardapio', 'cardápio', 'menu', 'itens', 'produtos'] },
  { id: 'pedidos', labels: ['pedidos', 'pedido', 'vendas'] },
  { id: 'cancelamentos', labels: ['cancelamentos', 'cancelado', 'cancelados', 'cancelamento'] },
  { id: 'mesas', labels: ['mesas', 'mesa', 'salao', 'salão'] },
  { id: 'cozinha', labels: ['cozinha', 'preparo'] },
  { id: 'rel-vendas', labels: ['relatorio de vendas', 'relatório de vendas', 'vendas'] },
  { id: 'rel-financeiro', labels: ['relatorio financeiro', 'relatório financeiro', 'financeiro'] },
  { id: 'rel-cardapio', labels: ['desempenho do cardapio', 'desempenho do cardápio', 'relatorio cardapio', 'relatório cardápio'] },
  { id: 'rel-operacional', labels: ['relatorio operacional', 'relatório operacional', 'operacional'] },
  { id: 'config-restaurante', labels: ['restaurante', 'configuracao restaurante', 'configuração restaurante'] },
  { id: 'config-usuarios', labels: ['usuarios', 'usuários', 'permissoes', 'permissões'] },
  { id: 'config-integracao', labels: ['integracao', 'integração', 'integracoes', 'integrações'] },
  { id: 'config-notificacoes', labels: ['notificacoes', 'notificações', 'avisos'] }
];

function normalizeRouteSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function findAdminRoute(value) {
  const term = normalizeRouteSearch(value);
  if (!term) return null;

  return ADMIN_HOME_ROUTES.find((route) =>
    route.labels.some((label) => normalizeRouteSearch(label) === term)
  ) || ADMIN_HOME_ROUTES.find((route) =>
    route.labels.some((label) => normalizeRouteSearch(label).includes(term) || term.includes(normalizeRouteSearch(label)))
  ) || null;
}

function initAdminHomeSearch() {
  const form = document.getElementById('adminHomeSearchForm');
  const input = document.getElementById('adminHomeSearch');
  const hint = document.getElementById('adminHomeSearchHint');
  if (!form || !input) return;

  function clearHint() {
    if (!hint) return;
    hint.textContent = 'Digite o nome de uma tela e pressione Enter.';
    hint.classList.remove('is-error');
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const route = findAdminRoute(input.value);
    if (!route) {
      if (hint) {
        hint.textContent = 'Tela não encontrada. Tente Clientes, Cardápio, Mesas, Cozinha ou Dashboard.';
        hint.classList.add('is-error');
      }
      input.focus();
      return;
    }

    clearHint();
    input.value = '';
    navigateTo(route.id);
  });

  input.addEventListener('input', clearHint);
}

// =============================================
// MODAL MANAGEMENT
// =============================================

function setBodyScrollLock() {
  const hasActiveModal = document.querySelector('.modal.active');
  document.body.style.overflow = hasActiveModal ? 'hidden' : '';
}

function createModalIfMissing(modalId) {
  const modalTitles = {
    addClientModal: 'Novo Cliente',
    addFunctModal: 'Novo Funcionário',
    addSupplierModal: 'Novo Fornecedor',
    addDishModal: 'Novo Prato',
    tableModal: 'Nova Mesa',
    addUserModal: 'Novo Usuário'
  };

  const title = modalTitles[modalId];
  if (!title) return null;

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = modalId;
  modal.innerHTML = `
    <div class="modal-content">
      <button type="button" class="modal-close" onclick="closeModal('${modalId}')">x</button>
      <div class="modal-header">${title}</div>
      <form>
        <div class="form-row">
          <div class="form-group">
            <label>Nome</label>
            <input type="text" name="name" placeholder="${title}" />
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-secondary" onclick="closeModal('${modalId}')">Cancelar</button>
          <button type="submit" class="btn-primary">Cadastrar</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

window.openModal = function(modalId) {
  const modal = document.getElementById(modalId) || createModalIfMissing(modalId);
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.setAttribute('aria-hidden', 'false');
    setBodyScrollLock();
  }
};

window.closeModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    setBodyScrollLock();
  }
};

window.openAddDishModal = () => window.openModal('addDishModal');
window.openAddUserModal = () => window.openModal('addUserModal');

// =============================================
// FORM VALIDATION AND INPUT MASKS
// =============================================

function onlyDigits(value) {
  return (value || '').replace(/\D/g, '');
}

function formatCpf(value) {
  return onlyDigits(value)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function formatCnpj(value) {
  return onlyDigits(value)
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function formatPhone(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }

  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

function formatCep(value) {
  return onlyDigits(value).slice(0, 8).replace(/(\d{5})(\d{1,3})$/, '$1-$2');
}

// Máscara de moeda BRL (estilo ATM): digitar "800000" -> "R$ 8.000,00"
function formatCurrencyInput(value) {
  const digits = onlyDigits(value).slice(0, 13);
  if (!digits) return '';
  const padded = digits.padStart(3, '0');
  const intPart = padded.slice(0, -2).replace(/^0+/, '') || '0';
  const decPart = padded.slice(-2);
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${withDots},${decPart}`;
}

// Converte "R$ 8.000,00" -> 8000.00 (float para enviar Ã  API)
function parseCurrencyValue(value) {
  const digits = onlyDigits(value);
  if (!digits) return null;
  return Number(digits) / 100;
}

// Converte float da API -> string de dígitos para formatCurrencyInput
function floatToInputDigits(value) {
  const num = Number(value) || 0;
  return String(Math.round(num * 100));
}

function isRepeatedDigits(digits) {
  return /^(\d)\1+$/.test(digits);
}

function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || isRepeatedDigits(cpf)) return false;

  const calcDigit = (base) => {
    let sum = 0;
    for (let i = 0; i < base.length; i += 1) {
      sum += Number(base[i]) * (base.length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return calcDigit(cpf.slice(0, 9)) === Number(cpf[9])
    && calcDigit(cpf.slice(0, 10)) === Number(cpf[10]);
}

function isValidCnpj(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || isRepeatedDigits(cnpj)) return false;

  const calcDigit = (base, weights) => {
    const sum = base.split('').reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const secondWeights = [6, ...firstWeights];
  return calcDigit(cnpj.slice(0, 12), firstWeights) === Number(cnpj[12])
    && calcDigit(cnpj.slice(0, 13), secondWeights) === Number(cnpj[13]);
}

function setFieldValue(form, name, value) {
  const field = form.querySelector(`[name="${name}"]`);
  if (!field || value == null || value === '') return;

  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function fillAddressFromCep(form, endereco) {
  setFieldValue(form, 'address', endereco.logradouro);
  setFieldValue(form, 'complemento', endereco.complemento);
  setFieldValue(form, 'bairro', endereco.bairro);
  setFieldValue(form, 'cidade', endereco.localidade);
  setFieldValue(form, 'uf', endereco.uf);
}

function configureCepAutocomplete(form) {
  if (!form) return;

  form.querySelectorAll('[name="cep"]').forEach((field) => {
    if (field.dataset.cepAutocompleteConfigured === 'true') return;
    field.dataset.cepAutocompleteConfigured = 'true';

    let lastCep = '';

    async function buscarCep() {
      const cep = onlyDigits(field.value);

      field.setCustomValidity('');
      if (cep.length === 0) return;
      if (cep.length !== 8) {
        field.setCustomValidity('Digite um CEP com 8 digitos.');
        return;
      }
      if (cep === lastCep) return;

      lastCep = cep;
      field.disabled = true;

      try {
        const endereco = await buscarEnderecoPorCep(cep);
        fillAddressFromCep(form, endereco);
      } catch (error) {
        lastCep = '';
        field.setCustomValidity(error.message || 'CEP nao encontrado.');
        field.reportValidity();
      } finally {
        field.disabled = false;
      }
    }

    field.addEventListener('blur', buscarCep);
    field.addEventListener('input', () => {
      field.setCustomValidity('');
      if (onlyDigits(field.value).length === 8) buscarCep();
    });
  });
}

function fieldLabel(field) {
  const label = field.closest('.form-group')?.querySelector('label');
  return (label?.textContent || field.name || field.placeholder || '').trim();
}

function configureField(field) {
  if (field.dataset.validationConfigured === 'true') return;
  field.dataset.validationConfigured = 'true';

  const type = (field.getAttribute('type') || field.tagName).toLowerCase();
  const label = fieldLabel(field).toLowerCase();
  const placeholder = (field.getAttribute('placeholder') || '').toLowerCase();
  const key = `${label} ${placeholder} ${field.name || ''}`;
  const isOptional = field.dataset.optional === 'true';

  if (isOptional) {
    field.required = false;
  }

  if (!isOptional && !['button', 'submit', 'reset', 'checkbox', 'radio', 'hidden'].includes(type)) {
    field.required = true;
  }

  if (key.includes('cpf')) {
    field.classList.add('masked-input');
    field.inputMode = 'numeric';
    field.maxLength = 14;
    field.pattern = '\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}';
    field.title = 'Digite um CPF no formato 000.000.000-00';
    field.addEventListener('input', () => { field.value = formatCpf(field.value); });
  } else if (key.includes('cnpj')) {
    field.classList.add('masked-input');
    field.inputMode = 'numeric';
    field.maxLength = 18;
    field.pattern = '\\d{2}\\.\\d{3}\\.\\d{3}/\\d{4}-\\d{2}';
    field.title = 'Digite um CNPJ no formato 00.000.000/0000-00';
    field.addEventListener('input', () => { field.value = formatCnpj(field.value); });
  } else if (key.includes('telefone') || type === 'tel') {
    field.classList.add('masked-input');
    field.inputMode = 'tel';
    field.maxLength = 15;
    field.pattern = '\\(\\d{2}\\) \\d{4,5}-\\d{4}';
    field.title = 'Digite um telefone no formato (11) 99999-9999';
    field.addEventListener('input', () => { field.value = formatPhone(field.value); });
  } else if (key.includes('cep')) {
    field.classList.add('masked-input');
    field.inputMode = 'numeric';
    field.maxLength = 9;
    field.pattern = '\\d{5}-\\d{3}';
    field.title = 'Digite um CEP no formato 00000-000';
    field.addEventListener('input', () => { field.value = formatCep(field.value); });
  } else if (key.includes('salário') || key.includes('salario') || key.includes('salary') ||
             key.includes('preço') || key.includes('preco') || key.includes('price') ||
             (field.name === 'salary' || field.name === 'price')) {
    field.classList.add('masked-input');
    field.inputMode = 'numeric';
    field.addEventListener('input', () => {
      const pos = field.selectionStart;
      const prevLen = field.value.length;
      field.value = formatCurrencyInput(field.value) || '';
      const newLen = field.value.length;
      field.setSelectionRange(pos + (newLen - prevLen), pos + (newLen - prevLen));
    });
    field.addEventListener('focus', () => {
      if (field.value === '' || field.value === 'R$ 0,00') field.value = '';
    });
    field.addEventListener('blur', () => {
      if (!field.value.trim()) field.value = '';
    });
  } else if (type === 'number') {
    field.min = field.min || '0';
    field.step = field.step || '1';
  } else if (type === 'email') {
    field.autocomplete = field.autocomplete || 'email';
  }
}

function validateFields(container) {
  container.querySelectorAll('input, select, textarea').forEach(configureField);

  const cpfOrCnpjFields = container.querySelectorAll('input[pattern]');
  cpfOrCnpjFields.forEach(field => {
    field.setCustomValidity('');
    if (field.value && !new RegExp(`^${field.pattern}$`).test(field.value)) {
      field.setCustomValidity(field.title || 'Preencha o campo no formato correto.');
    }
  });
}

function validateForm(form) {
  validateFields(form);

  if (!form.checkValidity()) {
    form.reportValidity();
    return false;
  }

  return true;
}

function validateContainer(container) {
  validateFields(container);
  const invalidField = container.querySelector('input:invalid, select:invalid, textarea:invalid');

  if (invalidField) {
    invalidField.reportValidity();
    return false;
  }

  return true;
}

function generateClientCode() {
  const storageKey = 'dataplate:lastClientCode';
  const storedCode = Number(localStorage.getItem(storageKey)) || 0;
  const tableCount = document.querySelectorAll('#clientes .data-table tbody tr').length;
  const nextCode = Math.max(storedCode, tableCount) + 1;
  localStorage.setItem(storageKey, String(nextCode));
  return String(nextCode).padStart(3, '0');
}

function generateSupplierCode() {
  const storageKey = 'dataplate:lastSupplierCode';
  const storedCode = Number(localStorage.getItem(storageKey)) || 0;
  const tableCount = document.querySelectorAll('#fornecedores .data-table tbody tr').length;
  const nextCode = Math.max(storedCode, tableCount) + 1;
  localStorage.setItem(storageKey, String(nextCode));
  return String(nextCode).padStart(3, '0');
}

function generateEmployeeCode() {
  const storageKey = 'dataplate:lastEmployeeCode';
  const storedCode = Number(localStorage.getItem(storageKey)) || 0;
  const tableCount = document.querySelectorAll('#funcionarios .data-table tbody tr').length;
  const nextCode = Math.max(storedCode, tableCount) + 1;
  localStorage.setItem(storageKey, String(nextCode));
  return String(nextCode).padStart(3, '0');
}

function displayCode(record, prefix) {
  if (record.codigo) return record.codigo;
  if (!record.id) return '-';
  return `${prefix}-${String(record.id).padStart(3, '0')}`;
}

function resetConfiguredField(field) {
  field.dataset.validationConfigured = 'false';
  field.classList.remove('masked-input');
  field.removeAttribute('pattern');
  field.removeAttribute('title');
  field.value = '';
  configureField(field);
}

function configureClientPersonType(form) {
  if (!form) return;

  const typeSelect = form.querySelector('[name="tipoPessoa"]');
  const nameLabel = form.querySelector('[data-client-name-label]');
  const documentLabel = form.querySelector('[data-client-document-label]');
  const nameInput = form.querySelector('[name="name"]');
  const documentInput = form.querySelector('[name="cpf"], [name="cnpj"]');
  if (!typeSelect || !nameLabel || !documentLabel || !nameInput || !documentInput) return;

  const isJuridica = typeSelect.value === 'juridica';
  nameLabel.textContent = isJuridica ? 'Razão Social' : 'Nome';
  nameInput.placeholder = isJuridica ? 'Razão Social' : 'Nome completo';
  nameInput.autocomplete = isJuridica ? 'organization' : 'name';
  documentLabel.textContent = isJuridica ? 'CNPJ' : 'CPF';
  documentInput.name = isJuridica ? 'cnpj' : 'cpf';
  documentInput.placeholder = isJuridica ? '00.000.000/0000-00' : '000.000.000-00';
  documentInput.maxLength = isJuridica ? 18 : 14;
  resetConfiguredField(documentInput);
}

function initClientForm() {
  const form = document.getElementById('addClientForm');
  if (!form) return;

  const typeSelect = form.querySelector('[name="tipoPessoa"]');
  configureClientPersonType(form);
  configureCepAutocomplete(form);
  typeSelect?.addEventListener('change', () => configureClientPersonType(form));
}

function initCepAutocomplete() {
  document.querySelectorAll('form').forEach(configureCepAutocomplete);
}

function setModalMode(form, modalId, editing) {
  const modal = document.getElementById(modalId);
  const header = modal?.querySelector('.modal-header');
  const submit = form?.querySelector('button[type="submit"]');
  const titles = {
    addClientModal: editing ? 'Editar Cliente' : 'Novo Cliente',
    addFunctModal: editing ? 'Editar Funcionário' : 'Novo Funcionário',
    addSupplierModal: editing ? 'Editar Fornecedor' : 'Novo Fornecedor',
    addDishModal: editing ? 'Editar Item' : 'Novo Item'
  };
  if (header && titles[modalId]) header.textContent = titles[modalId];
  if (submit) submit.textContent = editing ? 'Atualizar' : 'Cadastrar';
}

function resetCrudForm(form, modalId) {
  if (!form) return;
  form.reset();
  const idField = form.querySelector('[name="id"]');
  if (idField) idField.value = '';
  setModalMode(form, modalId, false);
}

function splitPhone(value) {
  const parts = String(value || '').split('/').map(part => part.trim()).filter(Boolean);
  return { phone: parts[0] || '', phone2: parts[1] || '' };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

function getCategoryLabel(idCategoria) {
  const labels = {
    1: 'Sanduíches',
    2: 'Massas',
    3: 'Itens Principais',
    4: 'Saladas',
    5: 'Sobremesas',
    6: 'Bebidas'
  };
  return labels[Number(idCategoria)] || idCategoria || '-';
}

function getCategorySlug(idCategoria) {
  const slugs = {
    1: 'hamburguer',
    2: 'massas',
    3: 'principais',
    4: 'entradas',
    5: 'sobremesas',
    6: 'bebidas'
  };
  return slugs[Number(idCategoria)] || 'principais';
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
  const modalTrigger = e.target.closest('[data-open-modal]');
  if (modalTrigger) {
    e.preventDefault();
    const modalId = modalTrigger.getAttribute('data-open-modal');
    const modal = document.getElementById(modalId);
    const form = modal?.querySelector('form');
    resetCrudForm(form, modalId);
    if (modalId === 'addClientModal') configureClientPersonType(form);
    if (modalId === 'addDishModal') {
      window.__produtoAtivoId = null;
      const secFT = document.getElementById('fichaTecnicaSection');
      if (secFT) secFT.style.display = 'none';
      const formFT = document.getElementById('fichaTecnicaForm');
      if (formFT) formFT.style.display = 'none';
    }
    window.openModal(modalTrigger.getAttribute('data-open-modal'));
    return;
  }

  if (e.target.classList.contains('modal')) {
    window.closeModal(e.target.id);
  }
});

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.active').forEach(modal => {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    });
    setBodyScrollLock();
  }
});

// =============================================
// MODAL FORM SUBMISSIONS
// =============================================

// Add Client Modal
document.getElementById('addClientForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm(e.target)) return;
  const id = e.target.querySelector('[name="id"]')?.value;
  const codeInput = e.target.querySelector('[name="codigo"]');
  const fd = new FormData(e.target);
  const telefones = [fd.get('phone'), fd.get('phone2')].filter(Boolean).join(' / ');
  const documento = fd.get('cpf') || fd.get('cnpj');
  const endereco = [
    fd.get('address'),
    fd.get('num') && `NÂº ${fd.get('num')}`,
    fd.get('complemento'),
    fd.get('bairro') && `Bairro ${fd.get('bairro')}`,
    [fd.get('cidade'), fd.get('uf')].filter(Boolean).join(' - '),
    fd.get('cep') && `CEP ${fd.get('cep')}`
  ]
    .filter(Boolean)
    .join(', ');
  const payload = { codigo: codeInput?.value || null, nome: fd.get('name'), cpf: documento, email: fd.get('email'), telefone: telefones, endereco };
  const request = id ? putJson(`/clientes/${id}`, payload) : postJson('/clientes', payload);
  request
    .then((cliente) => {
      closeModal('addClientModal');
      resetCrudForm(e.target, 'addClientModal');
      configureClientPersonType(e.target);
      carregarClientes();
      showSuccessModal(
        id ? 'Cliente atualizado!' : 'Cliente cadastrado!',
        id ? `Os dados de <strong>${cliente.nome}</strong> foram salvos com sucesso.`
           : `<strong>${cliente.nome}</strong> foi adicionado Ã  lista de clientes.`
      );
    })
    .catch((err) => mostrarErroCpf(e.target, err.message || 'Erro ao salvar cliente.'));
});

// Add Employee Modal
document.getElementById('addFunctForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm(e.target)) return;
  const id = e.target.querySelector('[name="id"]')?.value;
  const codeInput = e.target.querySelector('[name="codigo"]');
  const fd = new FormData(e.target);
  const payload = { codigo: codeInput?.value || null, nome: fd.get('name'), cpf: fd.get('cpf'), telefone: fd.get('phone'), cargo: fd.get('role'), salario: parseCurrencyValue(fd.get('salary')) };
  const request = id ? putJson(`/funcionarios/${id}`, payload) : postJson('/funcionarios', payload);
  request
    .then((func) => {
      closeModal('addFunctModal');
      resetCrudForm(e.target, 'addFunctModal');
      carregarFuncionarios();
      showSuccessModal(
        id ? 'Funcionário atualizado!' : 'Funcionário cadastrado!',
        id ? `Os dados de <strong>${func.nome}</strong> foram salvos com sucesso.`
           : `<strong>${func.nome}</strong> foi adicionado Ã  equipe.`
      );
    })
    .catch((err) => mostrarErroCpf(e.target, err.message || 'Erro ao salvar funcionário.'));
});

// Add Supplier Modal
document.getElementById('addSupplierForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm(e.target)) return;
  const id = e.target.querySelector('[name="id"]')?.value;
  const codeInput = e.target.querySelector('[name="codigo"]');
  const fd = new FormData(e.target);
  const telefones = [fd.get('phone'), fd.get('phone2')].filter(Boolean).join(' / ');
  const payload = { codigo: codeInput?.value || null, razaoSocial: fd.get('company'), cnpj: fd.get('cnpj'), especialidade: fd.get('specialty'), telefone: telefones, email: fd.get('email') };
  const request = id ? putJson(`/fornecedores/${id}`, payload) : postJson('/fornecedores', payload);
  request
    .then((forn) => {
      closeModal('addSupplierModal');
      resetCrudForm(e.target, 'addSupplierModal');
      carregarFornecedores();
      showSuccessModal(
        id ? 'Fornecedor atualizado!' : 'Fornecedor cadastrado!',
        id ? `Os dados de <strong>${forn.razaoSocial}</strong> foram salvos com sucesso.`
           : `<strong>${forn.razaoSocial}</strong> foi adicionado Ã  lista de fornecedores.`
      );
    })
    .catch((err) => showToast(err.message || 'Erro ao salvar fornecedor.'));
});

// Add Dish Modal
document.querySelector('.category-create-button')?.addEventListener('click', () => {
  const form = document.getElementById('addDishForm');
  const categoryInput = form?.querySelector('[name="newCategory"]');
  const categorySelect = form?.querySelector('[name="category"]');
  const categoryName = categoryInput?.value.trim();

  if (!categoryName || !categorySelect) return;

  const alreadyExists = Array.from(categorySelect.options).some(
    option => option.textContent.trim().toLowerCase() === categoryName.toLowerCase()
  );

  if (alreadyExists) {
    showToast('Essa categoria já existe.');
    return;
  }

  const categoryIds = Array.from(categorySelect.options)
    .map(option => Number(option.value))
    .filter(Number.isFinite);
  const nextCategoryId = Math.max(...categoryIds, 0) + 1;
  const option = new Option(categoryName, String(nextCategoryId), true, true);

  categorySelect.add(option);
  categoryInput.value = '';
});

document.querySelector('.category-remove-button')?.addEventListener('click', async () => {
  const form = document.getElementById('addDishForm');
  const categorySelect = form?.querySelector('[name="category"]');
  const selectedOption = categorySelect?.selectedOptions[0];

  if (!categorySelect || !selectedOption) return;

  const categoryName = selectedOption.textContent.trim();
  const ok = await showConfirmModal('Remover categoria?', `Deseja remover a categoria <strong>${categoryName}</strong> desta lista?`);
  if (!ok) return;

  selectedOption.remove();

  if (categorySelect.options.length > 0) {
    categorySelect.selectedIndex = 0;
  }
});

document.getElementById('addDishForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateForm(e.target)) return;
  const formData = new FormData(e.target);
  const id = e.target.querySelector('[name="id"]')?.value;
  const previous = id ? (window.__produtos || []).find((item) => String(item.id) === String(id)) : null;
  let imagem = previous?.imagem || null;

  try {
    const imageData = await fileToDataUrl(formData.get('image'));
    if (imageData) imagem = imageData;
  } catch (error) {
    showToast(error.message || 'Erro ao ler imagem.');
    return;
  }

  const produto = {
    codigo: formData.get('codigo') || null,
    nome: formData.get('name'),
    idCategoria: Number(formData.get('category')),
    preco: parseCurrencyValue(formData.get('price')),
    descricao: formData.get('description'),
    imagem,
    tempoPreparo: Number(formData.get('prepTime')) || null,
    ativo: formData.get('available') === 'on',
    destaque: formData.get('featured') === 'on'
  };

  const request = id ? putJson(`/produtos/${id}`, produto) : postJson('/produtos', produto);
  request
    .then((produtoSalvo) => {
      closeModal('addDishModal');
      resetCrudForm(e.target, 'addDishModal');
      carregarProdutos();
      showSuccessModal(
        id ? 'Prato atualizado!' : 'Prato cadastrado!',
        id ? `<strong>${produtoSalvo.nome}</strong> foi atualizado no cardápio.`
           : `<strong>${produtoSalvo.nome}</strong> foi adicionado ao cardápio com sucesso.`
      );
    })
    .catch((error) => {
      console.error('Erro ao salvar prato:', error);
      const msg = error.message || '';
      // Mensagem amigável quando a categoria (FK) não existe no banco
      if (msg.includes('categoria') || msg.includes('id_categoria') || msg.includes('violates foreign key') || msg.includes('constraint')) {
        showToast('Categoria não encontrada no banco. Verifique se as migrations do Flyway (V1) foram executadas corretamente.', 'error');
      } else {
        showToast(msg || 'Erro ao salvar prato.');
      }
    });
});

// Add User Modal
document.getElementById('addUserForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm(e.target)) return;
  const fd = new FormData(e.target);
  const accessTypeMap = { 'Administrador': 'ADMIN', 'Gerente': 'ADMIN', 'Operacional': 'FUNCIONARIO', 'Visualização': 'FUNCIONARIO' };
  const payload = {
    nome: fd.get('name'),
    cpf: fd.get('cpf'),
    senha: fd.get('temporaryPassword'),
    role: accessTypeMap[fd.get('accessType')] || 'FUNCIONARIO'
  };
  postJson('/auth/register', payload)
    .then(() => {
      showToast('Usuario criado com sucesso!', 'success');
      closeModal('addUserModal');
      e.target.reset();
      carregarUsuarios();
    })
    .catch((err) => mostrarErroCpf(e.target, err.message || 'Erro ao criar usuário.'));
});

// ── PAGAMENTOS ─────────────────────────────────────────────────────
const PGTO_ICONS = {
  PIX:      'PIX',
  CREDITO:  'Cartao Credito',
  DEBITO:   'Cartao Debito',
  DINHEIRO: 'Dinheiro'
};

function extrairMetodoPagamento(observacoes) {
  const obs = (observacoes || '').toUpperCase();
  if (obs.includes('PAGAMENTO: PIX'))      return 'PIX';
  if (obs.includes('PAGAMENTO: CREDITO'))  return 'CREDITO';
  if (obs.includes('PAGAMENTO: DEBITO'))   return 'DEBITO';
  if (obs.includes('PAGAMENTO: DINHEIRO')) return 'DINHEIRO';
  return '';
}

function pgtoDataPadrao() {
  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - 30);
  const fmt = d => d.toISOString().slice(0, 10);
  return { inicio: fmt(inicio), fim: fmt(hoje) };
}

async function carregarPagamentos() {
  const ini = document.getElementById('pgtoDataInicio');
  const fim = document.getElementById('pgtoDataFim');
  if (!ini.value || !fim.value) {
    const def = pgtoDataPadrao();
    ini.value = def.inicio;
    fim.value = def.fim;
  }

  const tbody = document.getElementById('pgtoTabelaBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px">Carregando...</td></tr>';

  try {
    const data = await getJson('/pedidos?page=0&size=200');
    const todos = Array.isArray(data) ? data : (data?.content || []);

    const iniDate = new Date(ini.value + 'T00:00:00');
    const fimDate = new Date(fim.value + 'T23:59:59');

    const transacoes = todos.filter(p => {
      if (p.status !== 'ENTREGUE') return false;
      const d = new Date(p.dataHora);
      return d >= iniDate && d <= fimDate;
    }).sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora));

    // Totais por método
    const totais = { PIX: 0, CREDITO: 0, DEBITO: 0, DINHEIRO: 0, outros: 0 };
    const qtds   = { PIX: 0, CREDITO: 0, DEBITO: 0, DINHEIRO: 0 };

    transacoes.forEach(p => {
      const metodo = extrairMetodoPagamento(p.observacoes);
      const val = Number(p.valorTotal || 0);
      if (metodo && totais[metodo] !== undefined) {
        totais[metodo] += val;
        qtds[metodo]++;
      } else {
        totais.outros += val;
      }
    });

    const totalGeral = Object.values(totais).reduce((s, v) => s + v, 0);

    const fmt = v => 'R$ ' + Number(v).toFixed(2).replace('.', ',');
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setEl('pgtoTotalPix',     fmt(totais.PIX));
    setEl('pgtoTotalCredito', fmt(totais.CREDITO));
    setEl('pgtoTotalDebito',  fmt(totais.DEBITO));
    setEl('pgtoTotalDinheiro',fmt(totais.DINHEIRO));
    setEl('pgtoTotalGeral',   fmt(totalGeral));
    setEl('pgtoQtdPix',      `${qtds.PIX} venda(s)`);
    setEl('pgtoQtdCredito',  `${qtds.CREDITO} venda(s)`);
    setEl('pgtoQtdDebito',   `${qtds.DEBITO} venda(s)`);
    setEl('pgtoQtdDinheiro', `${qtds.DINHEIRO} venda(s)`);
    setEl('pgtoQtdTotal',    `${transacoes.length} transacao(oes)`);

    if (!tbody) return;
    if (!transacoes.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px">Nenhuma transacao encontrada.</td></tr>';
      return;
    }

    tbody.innerHTML = transacoes.map(p => {
      const metodo = extrairMetodoPagamento(p.observacoes);
      const origem = p.numeroMesa ? `Mesa ${p.numeroMesa}` : 'Balcao';
      const hora   = new Date(p.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const data   = new Date(p.dataHora).toLocaleDateString('pt-BR');
      const itens  = (p.itens || []).slice(0, 2).map(i => `${i.quantidade}x ${escapeHtml(i.nomeProduto)}`).join(', ');
      const extra  = (p.itens?.length || 0) > 2 ? ` +${p.itens.length - 2}` : '';
      const pgtoLabel = PGTO_ICONS[metodo] || '<span style="color:#94a3b8">Nao registrado</span>';

      return `<tr>
        <td><strong>#${p.id}</strong></td>
        <td style="white-space:nowrap">${data} ${hora}</td>
        <td>${origem}</td>
        <td style="font-size:12px;color:#64748b">${itens}${extra}</td>
        <td><strong>${pgtoLabel}</strong></td>
        <td><strong style="color:#16a34a">${fmt(p.valorTotal)}</strong></td>
      </tr>`;
    }).join('');

    // Guarda para exportar
    window._pgtoTransacoes = transacoes;

  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#dc2626;padding:24px">Erro: ${escapeHtml(e.message)}</td></tr>`;
  }
}

window.carregarPagamentos = carregarPagamentos;

window.exportarPagamentosCSV = function() {
  const transacoes = window._pgtoTransacoes || [];
  if (!transacoes.length) { alert('Nenhuma transacao para exportar.'); return; }

  const header = 'ID,Data,Hora,Origem,Pagamento,Total\n';
  const rows = transacoes.map(p => {
    const d    = new Date(p.dataHora);
    const data = d.toLocaleDateString('pt-BR');
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const orig = p.numeroMesa ? `Mesa ${p.numeroMesa}` : 'Balcao';
    const pgto = extrairMetodoPagamento(p.observacoes) || 'Nao registrado';
    const val  = Number(p.valorTotal).toFixed(2).replace('.', ',');
    return `${p.id},"${data}","${hora}","${orig}","${pgto}","R$ ${val}"`;
  }).join('\n');

  const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `pagamentos-${new Date().toISOString().slice(0,10)}.csv` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// Table Control
const TABLES_STORAGE_KEY = 'dataplate:adminTables';
let selectedTableId = null;

const tableStatusMeta = {
  disponivel:            { label: 'Disponível',      badge: 'badge-active',   cardClass: 'status-disponivel' },
  reservada:             { label: 'Reservada',        badge: 'badge-warning',  cardClass: 'status-reservada' },
  ocupada:               { label: 'Ocupada',          badge: 'badge-info',     cardClass: 'status-ocupada' },
  manutencao:            { label: 'Manutenção',       badge: 'badge-danger',   cardClass: 'status-manutencao' },
  aguardando_pagamento:  { label: 'Conta Fechada',   badge: 'badge-pgto',     cardClass: 'status-aguardando' }
};

let admPedidosAtivos = [];

function apiStatusToUiStatus(status) {
  const value = String(status || '').toLowerCase();
  return value === 'livre' ? 'disponivel' : value;
}

function uiStatusToApiStatus(status) {
  const value = String(status || '').toLowerCase();
  return value === 'disponivel' ? 'livre' : value;
}

function mesaApiToTable(mesa) {
  return {
    id: mesa.id,
    number: mesa.numero,
    seats: mesa.capacidade,
    area: mesa.localizacao || 'Salão principal',
    reference: mesa.localizacao || '',
    status: apiStatusToUiStatus(mesa.status),
    reservationName: '',
    reservationPhone: '',
    reservationDate: '',
    notes: ''
  };
}

function tableToMesaPayload(table) {
  return {
    numero: table.number,
    capacidade: table.seats,
    status: uiStatusToApiStatus(table.status),
    localizacao: table.reference || table.area || null
  };
}

function toDateTimeLocal(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function currentReservationBoundary() {
  const date = new Date();
  date.setSeconds(0, 0);
  return date;
}

function reservationMinDateTimeLocal() {
  return toDateTimeLocal(currentReservationBoundary());
}

function isReservationInPast(value) {
  if (!value) return false;
  const selectedDate = new Date(value);
  if (Number.isNaN(selectedDate.getTime())) return false;
  return selectedDate.getTime() < currentReservationBoundary().getTime();
}

function updateReservationDateConstraints(form = document.getElementById('tableForm')) {
  const dateField = form?.querySelector('[name="reservationDate"]');
  if (!dateField) return;

  const status = form?.querySelector('[name="status"]')?.value;
  dateField.min = reservationMinDateTimeLocal();
  dateField.setCustomValidity(status === 'reservada' && isReservationInPast(dateField.value)
    ? 'Selecione uma data e horário que ainda não passou.'
    : ''
  );
}

function dateFromToday(days, time) {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hours, minutes || 0, 0, 0);
  return toDateTimeLocal(date);
}

function nextReservationSlot() {
  const date = new Date();
  date.setHours(20, 0, 0, 0);
  if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
  return toDateTimeLocal(date);
}

function defaultTables() {
  return [
    { id: 1, number: 1, seats: 2, area: 'Salão principal', reference: 'Janela frontal', status: 'disponivel', reservationName: '', reservationPhone: '', reservationDate: '', notes: 'Boa para casal' },
    { id: 2, number: 2, seats: 4, area: 'Salão principal', reference: 'Centro do salão', status: 'reservada', reservationName: 'Carla Mendes', reservationPhone: '(11) 98888-2211', reservationDate: nextReservationSlot(), notes: 'Aniversário' },
    { id: 3, number: 3, seats: 4, area: 'Salão principal', reference: 'Perto do caixa', status: 'ocupada', reservationName: '', reservationPhone: '', reservationDate: '', notes: 'Pedido em andamento' },
    { id: 4, number: 4, seats: 6, area: 'Varanda', reference: 'Vista para rua', status: 'disponivel', reservationName: '', reservationPhone: '', reservationDate: '', notes: '' },
    { id: 5, number: 5, seats: 8, area: 'Espaço família', reference: 'Canto reservado', status: 'reservada', reservationName: 'Rafael Souza', reservationPhone: '(11) 97777-1444', reservationDate: dateFromToday(1, '19:30'), notes: 'Cadeira infantil' },
    { id: 6, number: 6, seats: 2, area: 'Bar', reference: 'Balcão lateral', status: 'disponivel', reservationName: '', reservationPhone: '', reservationDate: '', notes: '' },
    { id: 7, number: 7, seats: 4, area: 'Mezanino', reference: 'Escada esquerda', status: 'manutencao', reservationName: '', reservationPhone: '', reservationDate: '', notes: 'Aguardando reparo no apoio' },
    { id: 8, number: 8, seats: 4, area: 'Ãrea externa', reference: 'Guarda-sol 2', status: 'disponivel', reservationName: '', reservationPhone: '', reservationDate: '', notes: 'Pet friendly' },
    { id: 9, number: 9, seats: 6, area: 'Mezanino', reference: 'Parede de quadros', status: 'ocupada', reservationName: '', reservationPhone: '', reservationDate: '', notes: 'Conta aberta' },
    { id: 10, number: 10, seats: 10, area: 'Espaço família', reference: 'Mesa grande', status: 'reservada', reservationName: 'Fernanda Lima', reservationPhone: '(11) 96666-8800', reservationDate: dateFromToday(2, '21:00'), notes: 'Grupo corporativo' }
  ];
}

function getTables() {
  try {
    const saved = JSON.parse(localStorage.getItem(TABLES_STORAGE_KEY) || 'null');
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch (_) {}

  const seeded = defaultTables();
  saveTables(seeded);
  return seeded;
}

function saveTables(tables) {
  localStorage.setItem(TABLES_STORAGE_KEY, JSON.stringify(tables));
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function formatReservationDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function getStatusMeta(status) {
  return tableStatusMeta[status] || tableStatusMeta.disponivel;
}

function buildStatusBadge(status) {
  const meta = getStatusMeta(status);
  return `<span class="badge ${meta.badge}">${meta.label}</span>`;
}

function getFilteredTables(tables) {
  const search = document.getElementById('tableSearch')?.value.toLowerCase().trim() || '';
  const filterValue = document.getElementById('tableFilter')?.value || '';
  const [filterType, filterTarget] = filterValue.split(':');

  return tables.filter((table) => {
    const haystack = [
      table.number,
      table.seats,
      table.area,
      table.reference,
      table.status,
      table.reservationName,
      table.reservationPhone,
      table.notes
    ].join(' ').toLowerCase();

    const matchesSearch = !search || haystack.includes(search);
    const matchesFilter = !filterValue
      || (filterType === 'status' && table.status === filterTarget)
      || (filterType === 'area' && table.area === filterTarget);
    return matchesSearch && matchesFilter;
  });
}

function renderTableFilter(tables) {
  const select = document.getElementById('tableFilter');
  if (!select) return;

  const current = select.value || '';
  const areas = Array.from(new Set(tables.map((table) => table.area).filter(Boolean))).sort();
  const readableStatusOptions = [
    ['status:disponivel', 'Disponível'],
    ['status:reservada', 'Reservada'],
    ['status:ocupada', 'Ocupada'],
    ['status:manutencao', 'Manutenção']
  ];
  const areaOptions = areas.map((area) => [`area:${area}`, area]);
  const options = [['', 'Filtrar'], ...readableStatusOptions, ...areaOptions];
  select.innerHTML = options
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join('');
  select.value = options.some(([value]) => value === current) ? current : '';
}

function renderTableStats(tables) {
  const available = tables.filter((table) => table.status === 'disponivel');
  const reserved = tables.filter((table) => table.status === 'reservada');
  const seats = available.reduce((sum, table) => sum + Number(table.seats || 0), 0);
  const next = reserved
    .filter((table) => table.reservationDate && new Date(table.reservationDate).getTime() >= Date.now())
    .sort((a, b) => new Date(a.reservationDate) - new Date(b.reservationDate))[0];

  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };

  setText('tablesTotal', tables.length);
  setText('tablesAvailable', available.length);
  setText('tablesReserved', reserved.length);
  setText('tablesSeats', seats);
  setText('nextReservation', next
    ? `Próxima reserva: Mesa ${next.number}, ${formatReservationDate(next.reservationDate)}`
    : 'Próxima reserva: --'
  );
}

function buildTableActions(table) {
  const reserveLabel = table.status === 'reservada' ? 'Editar reserva' : 'Reservar';
  const occupyButton = table.status !== 'ocupada'
    ? `<button class="btn-small" onclick="occupyTable(${table.id})">Ocupar</button>`
    : '';
  const releaseButton = table.status !== 'disponivel'
    ? `<button class="btn-small" onclick="releaseTable(${table.id})">Liberar</button>`
    : '';

  return `
    <button class="btn-small" onclick="openTableModal(${table.id})">Editar</button>
    <button class="btn-small" onclick="reserveTable(${table.id})">${reserveLabel}</button>
    ${occupyButton}
    ${releaseButton}
    <button class="btn-icon btn-icon-delete" title="Excluir" onclick="deleteTable(${table.id})"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 4 14 4"/><path d="M5 4V2h6v2"/><path d="M13 4l-1 10H4L3 4"/><line x1="6" y1="7" x2="6" y2="11"/><line x1="10" y1="7" x2="10" y2="11"/></svg></button>
  `;
}

function buildTableRow(table) {
  const location = [table.area, table.reference].filter(Boolean).join(' - ');
  return `<tr>
    <td><strong>Mesa ${escapeHtml(table.number)}</strong></td>
    <td>${escapeHtml(table.seats)} lugares</td>
    <td>${escapeHtml(location || '-')}</td>
    <td>${buildStatusBadge(table.status)}</td>
    <td>${escapeHtml(table.reservationName || '-')}</td>
    <td>${escapeHtml(table.reservationPhone || '-')}</td>
    <td>${formatReservationDate(table.reservationDate)}</td>
    <td>${escapeHtml(table.notes || '-')}</td>
    <td class="table-actions">${buildTableActions(table)}</td>
  </tr>`;
}

function buildTableCard(table) {
  const meta = getStatusMeta(table.status);
  const activeClass = selectedTableId === table.id ? 'active' : '';
  const fmtBRL = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');

  // Dados operacionais — pedidos ativos para esta mesa
  const pedidosMesa = admPedidosAtivos.filter(p => p.numeroMesa === table.number);
  const totalMesa   = pedidosMesa.reduce((s, p) => s + Number(p.valorTotal || 0), 0);
  const temPronto   = pedidosMesa.some(p => String(p.status).toUpperCase() === 'PRONTO');

  const operacionalHtml = pedidosMesa.length
    ? `<span style="color:#111827;font-weight:700">${fmtBRL(totalMesa)}</span>
       <span>${pedidosMesa.length} pedido(s) ativo(s)</span>
       ${temPronto ? '<span style="color:#16a34a;font-weight:800">Pronto para entrega</span>' : ''}
       ${table.status === 'aguardando_pagamento' ? '<span style="color:#f85b15;font-weight:800">Aguardando pagamento</span>' : ''}`
    : `<span>${table.status === 'reservada' ? escapeHtml(table.reservationName || 'Reserva sem nome') : 'Sem pedidos ativos'}</span>`;

  return `
    <article class="table-card ${meta.cardClass} ${activeClass}" onclick="selectTable(${table.id})">
      <div class="table-card-header">
        <div class="table-card-number">Mesa ${escapeHtml(table.number)}</div>
        ${buildStatusBadge(table.status)}
      </div>
      <div class="table-card-meta">
        <span>${escapeHtml(table.seats)} lugares</span>
        <span>${escapeHtml(table.area || '-')}</span>
        ${operacionalHtml}
      </div>
      <div class="table-card-actions" onclick="event.stopPropagation()">
        <button class="btn-small" onclick="reserveTable(${table.id})">Reservar</button>
        <button class="btn-small" onclick="openTableModal(${table.id})">Editar</button>
      </div>
    </article>
  `;
}

function renderTableDetail(table) {
  const panel = document.getElementById('tableDetailPanel');
  if (!panel) return;

  if (!table) {
    panel.innerHTML = `
      <div class="empty-detail">
        <strong>Selecione uma mesa</strong>
        <span>Os detalhes da reserva e da localização aparecem aqui.</span>
      </div>
    `;
    return;
  }

  const location = [table.area, table.reference].filter(Boolean).join(' - ');
  panel.innerHTML = `
    <div class="table-detail-content">
      <div class="detail-title">
        <strong>Mesa ${escapeHtml(table.number)}</strong>
        ${buildStatusBadge(table.status)}
      </div>
      <div class="detail-list">
        <div><span>Lugares</span><strong>${escapeHtml(table.seats)}</strong></div>
        <div><span>Localização</span><strong>${escapeHtml(location || '-')}</strong></div>
        <div><span>Reserva</span><strong>${escapeHtml(table.reservationName || '-')}</strong></div>
        <div><span>Telefone</span><strong>${escapeHtml(table.reservationPhone || '-')}</strong></div>
        <div><span>Data/Hora</span><strong>${formatReservationDate(table.reservationDate)}</strong></div>
        <div><span>Observações</span><strong>${escapeHtml(table.notes || '-')}</strong></div>
      </div>
      <div class="detail-actions">
        <button type="button" class="btn-secondary" onclick="openTableModal(${table.id})">Editar</button>
        <button type="button" class="btn-primary" onclick="reserveTable(${table.id})">Reservar</button>
      </div>
      <div id="mesaConsumoPanel" style="margin-top:16px;border-top:1px solid var(--color-border);padding-top:14px">
        <div style="color:#94a3b8;font-size:13px">Carregando consumo...</div>
      </div>
      <div style="margin-top:12px">
        <a href="pdv.html?modo=mesa&mesa=${escapeHtml(table.number)}" class="btn-primary" style="display:block;text-align:center;text-decoration:none;padding:10px;border-radius:6px;font-size:13px;font-weight:700">
          + Novo Pedido nesta Mesa (PDV)
        </a>
      </div>
    </div>
  `;

  carregarConsumoMesa(table.number);
}

async function carregarPedidosProntos() {
  const banner = document.getElementById('mesasProntosBanner');
  const texto = document.getElementById('mesasProntosTexto');
  const lista = document.getElementById('mesasProntosLista');
  if (!banner) return;
  try {
    const data = await getJson('/pedidos/ativos');
    const todos = Array.isArray(data) ? data : (data.content || []);
    const prontos = todos.filter(p => p.status === 'PRONTO');
    if (!prontos.length) {
      banner.style.display = 'none';
      return;
    }
    banner.style.display = 'flex';
    texto.textContent = `${prontos.length} pedido(s) pronto(s) para entrega`;
    lista.innerHTML = prontos.map(p =>
      `<span style="margin-right:12px">
        <strong>#${p.id}</strong> - ${pedidoOrigemLabel(p)}
        <button class="btn-small" style="margin-left:6px;background:#16a34a;color:#fff;border:none" onclick="alterarStatusPedido(${p.id},'ENTREGUE');carregarPedidosProntos()">
          Entregar
        </button>
      </span>`
    ).join('');

    // Guarda todos os pedidos ativos para enriquecer os cards de mesa
    admPedidosAtivos = (data?.content || data || []).filter(p =>
      !['CANCELADO','ENTREGUE'].includes(String(p.status || '').toUpperCase())
    );
    renderTables();
  } catch (_) {
    banner.style.display = 'none';
  }
}

window.carregarPedidosProntos = carregarPedidosProntos;

async function carregarConsumoMesa(numeroMesa) {
  const panel = document.getElementById('mesaConsumoPanel');
  if (!panel) return;
  try {
    const pedidos = await getJson(`/pedidos/mesa/${numeroMesa}`);
    const ativos = (pedidos || []).filter(p => !['CANCELADO', 'ENTREGUE'].includes(p.status));
    const historico = (pedidos || []).filter(p => ['ENTREGUE'].includes(p.status));

    if (!ativos.length && !historico.length) {
      panel.innerHTML = '<div style="color:#94a3b8;font-size:13px">Nenhum pedido nesta mesa.</div>';
      return;
    }

    const totalAtivo = ativos.reduce((s, p) => s + Number(p.valorTotal || 0), 0);
    const totalGasto = (pedidos || []).filter(p => p.status !== 'CANCELADO')
      .reduce((s, p) => s + Number(p.valorTotal || 0), 0);

    const renderItens = (pedido) => (pedido.itens || [])
      .map(i => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0">
        <span>${escapeHtml(i.nomeProduto)} x${i.quantidade}</span>
        <span>${formatCurrency(i.subtotal ?? i.precoUnitario * i.quantidade)}</span>
      </div>`).join('');

    const renderPedido = (p) => `
      <div style="margin-bottom:10px;padding:10px;background:#f8fafc;border-radius:8px;border-left:3px solid ${
        p.status === 'PRONTO' ? '#10b981' : p.status === 'EM_PREPARO' ? '#f59e0b' : '#2563eb'
      }">
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:6px">
          <span>#${p.id} - ${pedidoStatusBadge(p.status)}</span>
          <strong>${formatCurrency(p.valorTotal)}</strong>
        </div>
        ${renderItens(p)}
        ${p.status === 'PRONTO' ? `<button class="btn-small" style="margin-top:8px;width:100%" onclick="alterarStatusPedido(${p.id},'ENTREGUE');carregarConsumoMesa(${numeroMesa})">Confirmar Entrega</button>` : ''}
      </div>`;

    panel.innerHTML = `
      <div style="font-size:13px;font-weight:700;margin-bottom:10px;display:flex;justify-content:space-between">
        <span>Consumo da Mesa ${escapeHtml(numeroMesa)}</span>
        <span style="color:var(--color-primary)">${formatCurrency(totalAtivo)} em aberto</span>
      </div>
      ${ativos.length ? ativos.map(renderPedido).join('') : '<div style="color:#94a3b8;font-size:12px;margin-bottom:8px">Nenhum pedido ativo.</div>'}
      ${historico.length ? `<div style="font-size:12px;color:#64748b;margin-top:8px">Total consumido (entregue): <strong>${formatCurrency(totalGasto)}</strong></div>` : ''}
    `;
  } catch (_) {
    const panel2 = document.getElementById('mesaConsumoPanel');
    if (panel2) panel2.innerHTML = '<div style="color:#94a3b8;font-size:13px">Erro ao carregar consumo.</div>';
  }
}

function renderTables() {
  const tables = getTables().sort((a, b) => Number(a.number) - Number(b.number));
  renderTableFilter(tables);
  renderTableStats(tables);

  const filtered = getFilteredTables(tables);
  const map = document.getElementById('tablesMap');
  const tbody = document.getElementById('tablesTableBody');
  const selected = filtered.find((table) => table.id === selectedTableId) || filtered[0] || null;
  selectedTableId = selected ? selected.id : null;

  if (map) {
    map.innerHTML = filtered.length
      ? filtered.map(buildTableCard).join('')
      : '<p style="color:#94a3b8;font-size:14px">Nenhuma mesa encontrada.</p>';
  }

  if (tbody) {
    const cols = tbody.closest('table').querySelectorAll('th').length;
    tbody.innerHTML = filtered.length
      ? filtered.map(buildTableRow).join('')
      : `<tr><td colspan="${cols}" style="text-align:center;color:#94a3b8">Nenhuma mesa encontrada</td></tr>`;
  }

  renderTableDetail(selected);
}

function updateTableReservationFields() {
  const form = document.getElementById('tableForm');
  if (!form) return;
  const status = form.querySelector('[name="status"]')?.value;
  const fields = form.querySelectorAll('[name="reservationName"], [name="reservationPhone"], [name="reservationDate"]');
  updateReservationDateConstraints(form);
  fields.forEach((field) => {
    field.closest('.form-group')?.classList.toggle('reservation-highlight', status === 'reservada');
  });
}

function fillTableForm(table) {
  const form = document.getElementById('tableForm');
  if (!form) return;

  form.reset();
  form.querySelector('[name="id"]').value = table?.id || '';
  form.querySelector('[name="number"]').value = table?.number || '';
  form.querySelector('[name="seats"]').value = table?.seats || '';
  form.querySelector('[name="status"]').value = table?.status || 'disponivel';
  form.querySelector('[name="area"]').value = table?.area || 'Salão principal';
  form.querySelector('[name="reference"]').value = table?.reference || '';
  form.querySelector('[name="reservationName"]').value = table?.reservationName || '';
  form.querySelector('[name="reservationPhone"]').value = table?.reservationPhone || '';
  form.querySelector('[name="reservationDate"]').value = table?.reservationDate || '';
  form.querySelector('[name="notes"]').value = table?.notes || '';
  updateReservationDateConstraints(form);
  updateTableReservationFields();
}

function validateTableForm(form) {
  updateReservationDateConstraints(form);
  if (!validateForm(form)) return false;

  const fd = new FormData(form);
  const id = Number(fd.get('id')) || null;
  const number = Number(fd.get('number'));
  const status = fd.get('status');
  const tables = getTables();
  const duplicate = tables.some((table) => Number(table.number) === number && table.id !== id);

  if (duplicate) {
    const numberField = form.querySelector('[name="number"]');
    numberField.setCustomValidity('Já existe uma mesa com esse número.');
    numberField.reportValidity();
    numberField.setCustomValidity('');
    return false;
  }

  if (status === 'reservada') {
    const nameField = form.querySelector('[name="reservationName"]');
    const dateField = form.querySelector('[name="reservationDate"]');
    if (!String(fd.get('reservationName') || '').trim()) {
      nameField.setCustomValidity('Informe o nome da reserva.');
      nameField.reportValidity();
      nameField.setCustomValidity('');
      return false;
    }
    if (!String(fd.get('reservationDate') || '').trim()) {
      dateField.setCustomValidity('Informe a data e hora da reserva.');
      dateField.reportValidity();
      dateField.setCustomValidity('');
      return false;
    }
    if (isReservationInPast(fd.get('reservationDate'))) {
      dateField.setCustomValidity('Selecione uma data e horário que ainda não passou.');
      dateField.reportValidity();
      dateField.setCustomValidity('');
      return false;
    }
  }

  return true;
}

window.openTableModal = function(tableId) {
  const table = tableId ? getTables().find((item) => item.id === tableId) : null;
  const title = document.getElementById('tableModalTitle');
  if (title) title.textContent = table ? `Editar Mesa ${table.number}` : 'Nova Mesa';
  fillTableForm(table);
  window.openModal('tableModal');
};

window.reserveTable = function(tableId) {
  const table = getTables().find((item) => item.id === tableId);
  if (!table) return;
  window.openTableModal(tableId);
  const form = document.getElementById('tableForm');
  if (!form) return;
  form.querySelector('[name="status"]').value = 'reservada';
  const dateField = form.querySelector('[name="reservationDate"]');
  if (!dateField.value || isReservationInPast(dateField.value)) {
    dateField.value = nextReservationSlot();
  }
  updateTableReservationFields();
};

window.occupyTable = function(tableId) {
  const tables = getTables();
  const table = tables.find((item) => item.id === tableId);
  if (!table) return;
  table.status = 'ocupada';
  saveTables(tables);
  putJson(`/mesas/${tableId}`, tableToMesaPayload(table))
    .then(() => showToast(`Mesa ${table.number} marcada como ocupada.`, 'success'))
    .catch((err) => showToast(err.message || 'Erro ao atualizar mesa.'))
    .finally(carregarMesas);
};

window.releaseTable = function(tableId) {
  const tables = getTables();
  const table = tables.find((item) => item.id === tableId);
  if (!table) return;
  table.status = 'disponivel';
  table.reservationName = '';
  table.reservationPhone = '';
  table.reservationDate = '';
  saveTables(tables);
  putJson(`/mesas/${tableId}`, tableToMesaPayload(table))
    .then(() => showToast(`Mesa ${table.number} liberada.`, 'success'))
    .catch((err) => showToast(err.message || 'Erro ao atualizar mesa.'))
    .finally(carregarMesas);
};

window.deleteTable = async function(tableId) {
  const tables = getTables();
  const table = tables.find((item) => item.id === tableId);
  if (!table) return;
  const ok = await showConfirmModal('Excluir mesa?', `Esta ação não pode ser desfeita.<br>Deseja excluir a <strong>Mesa ${table.number}</strong>?`);
  if (!ok) return;
  deleteJson(`/mesas/${tableId}`)
    .then(() => {
      const nextTables = tables.filter((item) => item.id !== tableId);
      if (selectedTableId === tableId) selectedTableId = null;
      saveTables(nextTables);
      showToast(`Mesa ${table.number} excluída.`, 'success');
      carregarMesas();
    })
    .catch((err) => showToast(err.message || 'Erro ao excluir mesa.'));
};

window.selectTable = function(tableId) {
  selectedTableId = tableId;
  renderTables();
};

document.getElementById('tableForm')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  if (!validateTableForm(form)) return;

  const fd = new FormData(form);
  const id = Number(fd.get('id')) || Date.now();
  const status = fd.get('status');
  const table = {
    id,
    number: Number(fd.get('number')),
    seats: Number(fd.get('seats')),
    area: String(fd.get('area') || '').trim(),
    reference: String(fd.get('reference') || '').trim(),
    status,
    reservationName: status === 'reservada' ? String(fd.get('reservationName') || '').trim() : '',
    reservationPhone: status === 'reservada' ? String(fd.get('reservationPhone') || '').trim() : '',
    reservationDate: status === 'reservada' ? String(fd.get('reservationDate') || '').trim() : '',
    notes: String(fd.get('notes') || '').trim()
  };

  const request = Number(fd.get('id'))
    ? putJson(`/mesas/${id}`, tableToMesaPayload(table))
    : postJson('/mesas', tableToMesaPayload(table));

  request
    .then((mesa) => {
      selectedTableId = mesa.id;
      closeModal('tableModal');
      showToast(`Mesa ${table.number} salva com sucesso!`, 'success');
      carregarMesas();
    })
    .catch((err) => showToast(err.message || 'Erro ao salvar mesa.'));
});

document.getElementById('tableForm')?.querySelector('[name="status"]')?.addEventListener('change', updateTableReservationFields);
document.getElementById('tableForm')?.querySelector('[name="reservationDate"]')?.addEventListener('input', () => {
  updateReservationDateConstraints();
});
document.getElementById('tableSearch')?.addEventListener('input', renderTables);
document.getElementById('tableFilter')?.addEventListener('change', renderTables);
document.getElementById('clearTableFilters')?.addEventListener('click', () => {
  const search = document.getElementById('tableSearch');
  const filter = document.getElementById('tableFilter');
  if (search) search.value = '';
  if (filter) filter.value = '';
  renderTables();
});

document.getElementById('profileForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm(e.target)) return;

  const fd = new FormData(e.target);
  const fullName = String(fd.get('name') || '').trim();
  const headerName = document.querySelector('.user-button span');
  const headerAvatar = document.querySelector('.user-button .user-avatar-small');
  const profileAvatar = document.querySelector('#profileModal .user-avatar-large');
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || 'GP';

  if (headerName) headerName.textContent = fullName || 'Gerente';
  if (headerAvatar) headerAvatar.textContent = initials;
  if (profileAvatar) profileAvatar.textContent = initials;

  closeModal('profileModal');
  showSuccessModal('Perfil atualizado!', 'Suas informações foram salvas com sucesso.');
});

document.getElementById('securityForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const newPassword = e.target.querySelector('[name="newPassword"]');
  const confirmPassword = e.target.querySelector('[name="confirmPassword"]');

  confirmPassword.setCustomValidity('');
  if (!validateForm(e.target)) return;

  if (newPassword.value !== confirmPassword.value) {
    confirmPassword.setCustomValidity('As senhas nao conferem.');
    confirmPassword.reportValidity();
    return;
  }

  confirmPassword.setCustomValidity('');
  closeModal('securityModal');
  showSuccessModal('Segurança atualizada!', 'Suas configurações de acesso foram salvas.');
  e.target.reset();
});

document.getElementById('switchUserForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const selectedUser = e.target.querySelector('input[name="user"]:checked');
  const selectedOption = selectedUser?.closest('.switch-user-option');
  const userKey = selectedUser?.value || 'gerente';
  const user = ADMIN_PANEL_USERS[userKey] || {
    name: selectedOption?.querySelector('strong')?.textContent || 'Gerente Principal',
    initials: selectedOption?.querySelector('.user-avatar-small')?.textContent || 'GP',
    cpf: '',
    role: selectedOption?.querySelector('small')?.textContent || 'Administrador'
  };
  const currentSession = readAdminSession() || {};

  sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
    ...currentSession,
    ...user,
    userKey,
    switchedAt: new Date().toISOString()
  }));

  if (userKey === 'cozinha') {
    window.location.href = 'cozinha.html';
    return;
  }

  applyAdminSession();

  closeModal('switchUserModal');
});

// =============================================
// KITCHEN BOARD STATUS UPDATES
// =============================================

// TODO backend: adicionar campo "urgente BOOLEAN DEFAULT FALSE" na tabela pedido
// e endpoint PUT /pedidos/{id}/urgente para sincronizar entre dispositivos.
// Por ora a urgência é propagada via localStorage (funciona no mesmo browser).
window.marcarUrgente = function(pedidoId) {
  const key = 'dataplate:kitchenUrgentOrders';
  let ids = [];
  try { ids = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) {}
  const str = String(pedidoId);
  const jaUrgente = ids.includes(str);
  if (jaUrgente) {
    ids = ids.filter(id => id !== str);
    showToast('Urgência removida do pedido #' + pedidoId, 'success');
  } else {
    ids.push(str);
    showToast('Pedido #' + pedidoId + ' marcado como URGENTE', 'success');
  }
  localStorage.setItem(key, JSON.stringify(ids));
  closeModal('orderDetailsModal');
};

window.alterarStatusPedido = function(pedidoId, novoStatus) {
  putJson(`/pedidos/${pedidoId}/status`, { status: novoStatus })
    .then(() => {
      showToast('Status atualizado com sucesso!', 'success');
      carregarCozinha();
      carregarPedidos(_pedidosPage);
    })
    .catch((err) => showToast(err.message || 'Erro ao atualizar status.'));
};

// =============================================
// SEARCH & FILTER FUNCTIONALITY
// =============================================

function parseTableCurrency(value) {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : 0;
}

function getCellText(row, columnIndex) {
  return row.querySelectorAll('td')[columnIndex]?.textContent.trim() || '';
}

function normalizeFilterText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function dateInputToTableText(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : '';
}

function sortTableRows(rows, option) {
  const column = Number.parseInt(option?.dataset.sortColumn || '', 10);
  if (!Number.isInteger(column)) return rows;

  const type = option.dataset.sortType || 'text';
  const direction = option.dataset.sortDirection === 'desc' ? -1 : 1;
  const sortedRows = [...rows];
  const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

  sortedRows.sort((rowA, rowB) => {
    if (type === 'number') {
      return (parseTableCurrency(getCellText(rowA, column)) - parseTableCurrency(getCellText(rowB, column))) * direction;
    }

    return collator.compare(getCellText(rowA, column), getCellText(rowB, column)) * direction;
  });

  return sortedRows;
}

function applyToolbarFilters(sectionId) {
  const section = document.getElementById(sectionId);
  const tbody = section?.querySelector('.data-table tbody');
  if (!section || !tbody) return;

  const searchTerm = normalizeFilterText(section.querySelector('[data-table-search]')?.value);
  const dateTerm = normalizeFilterText(dateInputToTableText(section.querySelector('[data-table-date]')?.value));
  const select = section.querySelector('[data-table-filter]');
  const selectedOption = select?.selectedOptions?.[0];
  const filterColumn = Number.parseInt(selectedOption?.dataset.filterColumn || '', 10);
  const filterValue = normalizeFilterText(selectedOption?.value);
  const filterMatch = selectedOption?.dataset.filterMatch || 'includes';
  const rows = Array.from(tbody.querySelectorAll('tr')).filter(row => !row.querySelector('td[colspan]'));

  sortTableRows(rows, selectedOption).forEach(row => tbody.appendChild(row));

  rows.forEach(row => {
    const rowText = normalizeFilterText(row.textContent);
    const columnText = normalizeFilterText(getCellText(row, filterColumn));
    const matchesSearch = !searchTerm || rowText.includes(searchTerm);
    const matchesDate = !dateTerm || rowText.includes(dateTerm);
    const matchesFilter = !filterValue
      || !Number.isInteger(filterColumn)
      || (filterMatch === 'exact' ? columnText === filterValue : columnText.includes(filterValue));

    row.style.display = matchesSearch && matchesDate && matchesFilter ? '' : 'none';
  });
}

document.querySelectorAll('[data-table-filter], [data-table-search], [data-table-date]').forEach((element) => {
  const eventName = element?.tagName === 'INPUT' ? 'input' : 'change';
  element?.addEventListener(eventName, () => {
    const sectionId = element.dataset.section || element.closest('.content-section')?.id;
    if (sectionId) applyToolbarFilters(sectionId);
  });
});

// =============================================
// EXPORT FUNCTIONALITY
// =============================================

function getActiveExportSection(trigger) {
  return trigger?.closest?.('.content-section')
    || document.querySelector('.content-section.active')
    || document.getElementById('dashboard');
}

function slugifyFileName(value) {
  return String(value || 'relatorio')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'relatorio';
}

function getSectionTitle(section) {
  return section?.querySelector('.section-header h1, .dashboard-hero h1')?.textContent.trim()
    || 'Relatorio DataPlate';
}

function cleanExportText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim();
}

function getReportSummary(section) {
  return Array.from(section.querySelectorAll('.stat-card')).map((card) => ({
    label: cleanExportText(card.querySelector('.stat-label')?.textContent),
    value: cleanExportText(card.querySelector('.stat-value')?.textContent),
    change: cleanExportText(card.querySelector('.stat-change')?.textContent)
  })).filter((item) => item.label || item.value || item.change);
}

function isActionColumn(text) {
  return /^(acoes|ações|acao|ação)$/i.test(slugifyFileName(text).replace(/-/g, ''));
}

function extractTableData(section) {
  const table = section.querySelector('.data-table');
  if (!table) return { headers: [], rows: [] };

  const headerCells = Array.from(table.querySelectorAll('thead th'));
  const ignoredIndexes = new Set();
  const headers = headerCells.map((cell, index) => {
    const text = cleanExportText(cell.textContent);
    if (!text || isActionColumn(text) || cell.querySelector('input[type="checkbox"]')) {
      ignoredIndexes.add(index);
      return '';
    }
    return text;
  }).filter(Boolean);

  const rows = Array.from(table.querySelectorAll('tbody tr'))
    .filter((row) => row.offsetParent !== null && !row.querySelector('td[colspan]') && !row.classList.contains('skeleton-row'))
    .map((row) => Array.from(row.children)
      .filter((_, index) => !ignoredIndexes.has(index))
      .map((cell) => cleanExportText(cell.textContent)))
    .filter((row) => row.some(Boolean));

  return { headers, rows };
}

function collectExportData(section) {
  return {
    title: getSectionTitle(section),
    generatedAt: new Date().toLocaleString('pt-BR'),
    summary: getReportSummary(section),
    table: extractTableData(section)
  };
}

function downloadBlob(content, fileName, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function exportReportToExcel(data) {
  const rows = [];
  rows.push(`<tr><th colspan="3" style="background:#f85b15;color:#fff;font-size:14pt">DataPlate</th></tr>`);
  rows.push(`<tr><th colspan="3">${escapeXml(data.title)}</th></tr>`);
  rows.push(`<tr><td colspan="3">Gerado em ${escapeXml(data.generatedAt)}</td></tr>`);

  if (data.summary.length) {
    rows.push('<tr></tr><tr><th>Indicador</th><th>Valor</th><th>Variação</th></tr>');
    data.summary.forEach((item) => {
      rows.push(`<tr><td>${escapeXml(item.label)}</td><td>${escapeXml(item.value)}</td><td>${escapeXml(item.change)}</td></tr>`);
    });
  }

  if (data.table.headers.length && data.table.rows.length) {
    rows.push('<tr></tr>');
    rows.push(`<tr>${data.table.headers.map((header) => `<th>${escapeXml(header)}</th>`).join('')}</tr>`);
    data.table.rows.forEach((row) => {
      rows.push(`<tr>${row.map((cell) => `<td>${escapeXml(cell)}</td>`).join('')}</tr>`);
    });
  }

  const html = `<!doctype html><html><head><meta charset="UTF-8"></head><body><table>${rows.join('')}</table></body></html>`;
  const fileName = `${slugifyFileName(data.title)}-${new Date().toISOString().slice(0, 10)}.xls`;
  downloadBlob(html, fileName, 'application/vnd.ms-excel;charset=utf-8');
}

function splitPdfLine(text, maxLength = 94) {
  const words = cleanExportText(text).split(' ');
  const lines = [];
  let current = '';

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function buildPdfLines(data) {
  // Fallback PDF (texto simples, sem jsPDF)
  const sep = '-'.repeat(80);

  const lines = [
    'DataPlate | Sistema de Gestao Gastronomica',
    sep,
    data.title,
    `Gerado em ${data.generatedAt}`,
    ''
  ];

  if (data.summary.length) {
    lines.push('Indicadores');
    lines.push(sep);
    data.summary.forEach((item) => {
      lines.push(`${item.label}: ${item.value}${item.change ? `  (${item.change})` : ''}`);
    });
    lines.push('');
  }

  if (data.table.headers.length && data.table.rows.length) {
    lines.push(sep);
    lines.push(data.table.headers.join('  |  '));
    lines.push(sep);
    data.table.rows.forEach((row) => lines.push(row.join('  |  ')));
  } else {
    lines.push('Nenhuma tabela com registros visiveis nesta tela.');
  }

  lines.push('');
  lines.push(sep);
  lines.push('DataPlate - Todos os direitos reservados');

  return lines.flatMap((line) => splitPdfLine(line));
}

function asciiBytes(value) {
  return Array.from(String(value), (char) => char.charCodeAt(0) & 0x7F);
}

function normalizePdfText(value) {
  return String(value ?? '')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[--]/g, '-');
}

function toWinAnsiByte(char) {
  const code = char.charCodeAt(0);
  return code <= 255 ? code : 63;
}

function pdfLiteralBytes(value) {
  const bytes = [40];
  const text = normalizePdfText(value);

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '\\' || char === '(' || char === ')') {
      bytes.push(92, toWinAnsiByte(char));
    } else if (char === '\n') {
      bytes.push(92, 110);
    } else if (char === '\r') {
      bytes.push(92, 114);
    } else {
      bytes.push(toWinAnsiByte(char));
    }
  }

  bytes.push(41);
  return bytes;
}

function joinBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;

  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });

  return output;
}

function buildSimplePdf(lines) {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginLeft = 42;
  const lineHeight = 16;
  const linesPerPage = 46;
  const pages = [];

  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }

  const objects = [
    asciiBytes('<< /Type /Catalog /Pages 2 0 R >>'),
    [],
    asciiBytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  ];
  const pageRefs = [];

  pages.forEach((pageLines) => {
    const pageNumber = objects.length + 1;
    const contentNumber = objects.length + 2;
    pageRefs.push(`${pageNumber} 0 R`);

    const streamParts = [
      asciiBytes(`BT\n/F1 10 Tf\n${marginLeft} ${pageHeight - 52} Td\n`)
    ];
    pageLines.forEach((line, index) => {
      if (index > 0) streamParts.push(asciiBytes(`0 -${lineHeight} Td\n`));
      streamParts.push(pdfLiteralBytes(line), asciiBytes(' Tj\n'));
    });
    streamParts.push(asciiBytes('ET'));
    const stream = joinBytes(streamParts);

    objects.push(asciiBytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNumber} 0 R >>`));
    objects.push(joinBytes([
      asciiBytes(`<< /Length ${stream.length} >>\nstream\n`),
      stream,
      asciiBytes('\nendstream')
    ]));
  });

  objects[1] = asciiBytes(`<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageRefs.length} >>`);

  const pdfParts = [asciiBytes('%PDF-1.4\n')];
  const offsets = [0];
  let byteLength = pdfParts[0].length;

  objects.forEach((object, index) => {
    offsets.push(byteLength);
    const objectParts = [
      asciiBytes(`${index + 1} 0 obj\n`),
      object,
      asciiBytes('\nendobj\n')
    ];
    const objectBytes = joinBytes(objectParts);
    pdfParts.push(objectBytes);
    byteLength += objectBytes.length;
  });

  const xrefOffset = byteLength;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  pdfParts.push(asciiBytes(xref));

  return new Blob([joinBytes(pdfParts)], { type: 'application/pdf' });
}

function exportReportToPdf(data) {
  // Usa jsPDF quando disponível (qualidade profissional)
  if (window.jspdf?.jsPDF) {
    exportReportToPdfJsPDF(data);
    return;
  }
  // Fallback: PDF texto simples
  const fileName = `${slugifyFileName(data.title)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  downloadBlob(buildSimplePdf(buildPdfLines(data)), fileName, 'application/pdf');
}

function exportReportToPdfJsPDF(data) {
  const { jsPDF } = window.jspdf;

  // Decide orientação conforme qtd de colunas
  const muitasColunas = data.table.headers.length > 5;
  const doc = new jsPDF({ orientation: muitasColunas ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });

  const W    = doc.internal.pageSize.getWidth();
  const PRIMARY = [248, 91, 21];   // laranja DataPlate #f85b15
  const DARK    = [17, 24, 39];    // #111827
  const GRAY    = [100, 116, 139]; // #64748b
  const LIGHT   = [241, 245, 249]; // #f1f5f9
  const WHITE   = [255, 255, 255];

  // â"â" Cabeçalho â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, W, 22, 'F');

  // Palavra "Data" branca + "Plate" branca (simula logo texto)
  doc.setTextColor(...WHITE);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('DataPlate', 12, 14);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Sistema de Gestao Gastronomica', 46, 14);

  // â"â" Título e data â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"
  doc.setTextColor(...DARK);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(data.title, 12, 34);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY);
  doc.text(`Gerado em ${data.generatedAt}`, 12, 40);

  let y = 50;

  // â"â" Indicadores (stat cards) â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"
  if (data.summary.length > 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text('Indicadores', 12, y);
    y += 4;

    const cols    = Math.min(data.summary.length, 4);
    const margin  = 12;
    const gap     = 3;
    const cardW   = (W - margin * 2 - gap * (cols - 1)) / cols;
    const cardH   = 16;

    data.summary.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x   = margin + col * (cardW + gap);
      const cy  = y + row * (cardH + gap);

      doc.setFillColor(...LIGHT);
      doc.roundedRect(x, cy, cardW, cardH, 2, 2, 'F');

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GRAY);
      doc.text(String(item.label || ''), x + 3, cy + 5, { maxWidth: cardW - 6 });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...DARK);
      doc.text(String(item.value || '-'), x + 3, cy + 13);
    });

    const rows = Math.ceil(data.summary.length / cols);
    y += rows * (cardH + gap) + 8;
  }

  // â"â" Tabela â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"
  if (data.table.headers.length > 0 && data.table.rows.length > 0) {
    doc.autoTable({
      head: [data.table.headers],
      body: data.table.rows,
      startY: y,
      theme: 'striped',
      headStyles: {
        fillColor: PRIMARY,
        textColor: WHITE,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 3
      },
      bodyStyles: {
        fontSize: 8,
        textColor: DARK,
        cellPadding: 3
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { lineColor: [226, 232, 240], lineWidth: 0.1, overflow: 'linebreak' },
      columnStyles: {},
      margin: { left: 12, right: 12 },
      didDrawPage: (hookData) => _adicionarRodapePdf(doc, hookData, data.title)
    });
  } else {
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.setFont('helvetica', 'italic');
    doc.text('Nenhum registro encontrado no período selecionado.', 12, y + 6);
    _adicionarRodapePdf(doc, null, data.title);
  }

  // Rodapé na última página se autoTable não foi chamado
  const pags = doc.internal.getNumberOfPages();
  if (data.table.rows.length === 0) {
    for (let p = 1; p <= pags; p++) {
      doc.setPage(p);
      _adicionarRodapePdf(doc, null, data.title, p, pags);
    }
  }

  const fileName = `dataplate-${slugifyFileName(data.title)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}

function _adicionarRodapePdf(doc, hookData, title, pageNum, pageTotal) {
  const pN = pageNum  ?? doc.internal.getNumberOfPages();
  const pT = pageTotal ?? doc.internal.getNumberOfPages();
  const W  = doc.internal.pageSize.getWidth();
  const H  = doc.internal.pageSize.getHeight();
  const GRAY = [100, 116, 139];

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(12, H - 10, W - 12, H - 10);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY);
  doc.text('DataPlate - Todos os direitos reservados', 12, H - 5);
  doc.text(`Pag. ${pN} / ${pT}`, W - 12, H - 5, { align: 'right' });
}

window.exportTable = function(format = 'excel', trigger = null) {
  const section = getActiveExportSection(trigger);
  if (!section) {
    showToast('Nenhuma tela encontrada para exportar.');
    return;
  }

  const data = collectExportData(section);
  const hasData = data.summary.length || data.table.rows.length;
  if (!hasData) {
    showToast('Não há dados visíveis para exportar nesta tela.');
    return;
  }

  if (format === 'pdf') {
    exportReportToPdf(data);
  } else {
    exportReportToExcel(data);
  }
  showToast(`${format === 'pdf' ? 'PDF' : 'Excel'} gerado com sucesso.`, 'success');
};

function filterCurrentSection(button) {
  const section = button.closest('.content-section, .tab-content');
  if (!section) return;

  const table = section.querySelector('table');
  if (!table) return;

  const textFilter = section.querySelector('input[type="text"], input[type="search"]');
  const selectFilter = section.querySelector('select');
  const searchTerm = textFilter ? textFilter.value.toLowerCase().trim() : '';
  const selectedOption = selectFilter ? selectFilter.value.toLowerCase().trim() : '';

  table.querySelectorAll('tbody tr').forEach(row => {
    const rowText = row.textContent.toLowerCase();
    const matchesText = !searchTerm || rowText.includes(searchTerm);
    const matchesSelect = !selectedOption ||
      selectedOption.startsWith('todos') ||
      selectedOption.startsWith('todas') ||
      rowText.includes(selectedOption);

    row.style.display = matchesText && matchesSelect ? '' : 'none';
  });
}

function buttonLabel(button) {
  return (button.getAttribute('title') || button.textContent || '').replace(/\s+/g, ' ').trim();
}

document.addEventListener('click', (e) => {
  const button = e.target.closest('button');
  if (!button || button.closest('.modal')) return;
  if (button.dataset.crudAction) return;

  const label = buttonLabel(button);
  if (!label) return;

  if (button.classList.contains('tab-button')) {
    e.preventDefault();
    const tabs = button.closest('.tabs');
    if (tabs) {
      tabs.querySelectorAll('.tab-button').forEach(tab => tab.classList.remove('active'));
      button.classList.add('active');
    }
    return;
  }

  if (/filtrar|filtro/i.test(label)) {
    e.preventDefault();
    filterCurrentSection(button);
    return;
  }

  if (button.dataset.exportFormat || /exportar|pdf|excel/i.test(label)) {
    e.preventDefault();
    const format = button.dataset.exportFormat || (/pdf/i.test(label) ? 'pdf' : 'excel');
    window.exportTable(format, button);
    return;
  }

  if (/salvar/i.test(label)) {
    const configForm = button.closest('.config-form');
    if (configForm) {
      e.preventDefault();
      if (!validateContainer(configForm)) return;
      showToast('Alterações salvas com sucesso!', 'success');
      return;
    }
  }
});

document.addEventListener('submit', (e) => {
  if (e.defaultPrevented) return;

  e.preventDefault();
  const form = e.target;
  if (!validateForm(form)) return;
  const modal = form.closest('.modal');

  if (modal) {
    window.closeModal(modal.id);
    form.reset();
    return;
  }
});

function exportTableToCSV(buttonSelector) {
  const button = document.querySelector(buttonSelector);
  if (!button) return;

  button.addEventListener('click', (e) => {
    e.preventDefault();
    window.exportTable('excel', button);
  });
}

// (exports via data-export-format no HTML, sem necessidade de init manual)

// =============================================
// WEBSOCKET
// =============================================

let adminSocket = null;
let websocketRetryTimer = null;
let websocketRetryDelay = 1000;
let wsAdminLoadTimer = null;

function connectAdminWebSocket() {
  if (adminSocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(adminSocket.readyState)) return adminSocket;

  try {
    adminSocket = new WebSocket(WS_BASE_URL);

    adminSocket.addEventListener('open', () => {
      websocketRetryDelay = 1000;
      console.info('WebSocket conectado');
    });

    adminSocket.addEventListener('message', (event) => {
      let payload = event.data;
      try {
        payload = JSON.parse(event.data);
      } catch (_) {
        // Mantem payload como texto quando nao for JSON.
      }

      if (payload?.type === 'PEDIDO_ATUALIZADO' || payload?.type === 'NOVO_PEDIDO' || payload?.type === 'VENDA_CAIXA') {
        window.clearTimeout(wsAdminLoadTimer);
        wsAdminLoadTimer = window.setTimeout(() => {
          carregarPedidos();
          carregarCozinha();
          carregarUltimosPedidosDashboard();
          if (document.getElementById('dashboard')?.classList.contains('active')) {
            carregarRelatorios();
          }
        }, 500);
      }
    });

    adminSocket.addEventListener('close', () => {
      window.clearTimeout(websocketRetryTimer);
      websocketRetryTimer = window.setTimeout(connectAdminWebSocket, websocketRetryDelay);
      websocketRetryDelay = Math.min(websocketRetryDelay * 2, 30000);
    });

    adminSocket.addEventListener('error', () => {
      adminSocket.close();
    });
  } catch (error) {
    console.error('Erro ao conectar WebSocket:', error);
    window.clearTimeout(websocketRetryTimer);
    websocketRetryTimer = window.setTimeout(connectAdminWebSocket, websocketRetryDelay);
  }

  return adminSocket;
}

window.connectAdminWebSocket = connectAdminWebSocket;

// =============================================
// INITIALIZATION
// =============================================

document.addEventListener('DOMContentLoaded', () => {
  const initialSection = window.location.hash.slice(1);
  applyAdminSession();

  // Atendente começa direto nas mesas (visão operacional do salão)
  const _sess = readAdminSession();
  const _defaultSection = (_sess?.userKey === 'atendente' && !initialSection) ? 'mesas' : (initialSection || 'home');
  navigateTo(_defaultSection);
  initAdminHomeSearch();
  initClientForm();
  initCepAutocomplete();
  applyCollapsedGroups();

  // Initialize dropdown toggles
  const dropdowns = document.querySelectorAll('.dropdown');
  dropdowns.forEach(dropdown => {
    const button = dropdown.querySelector('button');
    if (button) {
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpening = !dropdown.classList.contains('active');

        dropdowns.forEach(d => {
          d.classList.remove('active');
          d.querySelector('button')?.setAttribute('aria-expanded', 'false');
        });

        if (isOpening) {
          dropdown.classList.add('active');
          button.setAttribute('aria-expanded', 'true');
        }
      });
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    dropdowns.forEach(dropdown => {
      dropdown.classList.remove('active');
      dropdown.querySelector('button')?.setAttribute('aria-expanded', 'false');
    });
  });

  // Close dropdown when clicking a link
  document.querySelectorAll('.dropdown-link').forEach(link => {
    link.addEventListener('click', () => {
      const dropdown = link.closest('.dropdown');
      dropdown?.classList.remove('active');
      dropdown?.querySelector('button')?.setAttribute('aria-expanded', 'false');
    });
  });

  document.querySelectorAll('.modal').forEach(modal => {
    modal.setAttribute('aria-hidden', modal.classList.contains('active') ? 'false' : 'true');
  });

  document
    .querySelectorAll('form input, form select, form textarea, .config-form input, .config-form select, .config-form textarea')
    .forEach(configureField);

  connectAdminWebSocket();

  console.log('Admin panel loaded successfully');
});

// =============================================
// SKELETON LOADING
// =============================================

function showTableSkeleton(sectionId, rowCount = 6) {
  const tbody = document.querySelector(`#${sectionId} .data-table tbody`);
  if (!tbody) return;
  const cols = tbody.closest('table').querySelectorAll('th').length;
  const widths = ['', 'short', 'long', '', 'short', 'long', '', 'short', 'long', ''];
  const row = `<tr class="skeleton-row">${
    Array.from({ length: cols }, (_, i) =>
      `<td><div class="skeleton-cell ${widths[i % widths.length]}"></div></td>`
    ).join('')
  }</tr>`;
  tbody.innerHTML = Array(rowCount).fill(row).join('');
}

function showCozinhaSkeleton() {
  ['col-recebido', 'col-em_preparo', 'col-pronto'].forEach(id => {
    const col = document.getElementById(id);
    if (!col) return;
    Array.from(col.querySelectorAll('.kitchen-card, .skeleton-card, p')).forEach(el => el.remove());
    col.querySelector('.col-count').textContent = '0';
    col.insertAdjacentHTML('beforeend', `
      <div class="skeleton-card"><div class="skeleton-cell long"></div><div class="skeleton-cell"></div><div class="skeleton-cell short"></div></div>
      <div class="skeleton-card"><div class="skeleton-cell long"></div><div class="skeleton-cell"></div><div class="skeleton-cell short"></div></div>
    `);
  });
}

// =============================================
// DATA LOADING FUNCTIONS
// =============================================

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatCurrency(v) {
  if (v == null) return '-';
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
}

function pedidoOrigemLabel(pedido) {
  if (pedido?.origem === 'CAIXA' || pedido?.numeroMesa == null) return 'Caixa';
  return `Mesa ${pedido.numeroMesa}`;
}

const pedidoStatusLabel = {
  RECEBIDO: 'Recebido',
  EM_PREPARO: 'Preparando',
  PRONTO: 'Pronto',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado'
};

const pedidoBadgeClass = {
  RECEBIDO: 'badge-info',
  EM_PREPARO: 'badge-warning',
  PRONTO: 'badge-success',
  ENTREGUE: 'badge-active',
  CANCELADO: 'badge-danger'
};

function pedidoStatusBadge(status) {
  return `<span class="badge ${pedidoBadgeClass[status] || ''}">${pedidoStatusLabel[status] || escapeHtml(status || '-')}</span>`;
}

function setStatByLabel(sectionId, label, value, change) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  const cards = Array.from(section.querySelectorAll('.stat-card'));
  const card = cards.find((item) => normalizeFilterText(item.querySelector('.stat-label')?.textContent) === normalizeFilterText(label));
  if (!card) return;
  const valueEl = card.querySelector('.stat-value');
  const changeEl = card.querySelector('.stat-change');
  if (valueEl) valueEl.textContent = value;
  if (changeEl && change != null) changeEl.textContent = change;
}

function updateDashboardResumo(resumo) {
  const ativos = Number(resumo.pedidosRecebidos || 0)
    + Number(resumo.pedidosEmPreparo || 0)
    + Number(resumo.pedidosProntos || 0);
  setStatByLabel('dashboard', 'Faturamento de hoje', formatCurrency(resumo.faturamento), 'Dados reais do banco');
  setStatByLabel('dashboard', 'Pedidos ativos', String(ativos), `${resumo.pedidosEmPreparo || 0} em preparo e ${resumo.pedidosProntos || 0} prontos`);
  setStatByLabel('dashboard', 'Ticket médio', formatCurrency(resumo.ticketMedio), 'Calculado com pedidos não cancelados');

  // Gráficos do dashboard com dados reais
  if (resumo.topProdutos?.length) {
    renderTopDishesChart(resumo.topProdutos);
  }
  renderOrdersChart({
    entregues: resumo.pedidosEntregues || 0,
    emPreparo: Number(resumo.pedidosRecebidos || 0) + Number(resumo.pedidosEmPreparo || 0) + Number(resumo.pedidosProntos || 0),
    cancelados: resumo.pedidosCancelados || 0
  });

  // Label do salesChart
  const lbl = document.getElementById('dashSalesLabel');
  if (lbl) lbl.textContent = `Faturamento: ${formatCurrency(resumo.faturamento)}`;
}

// Alimenta o salesChart do dashboard com dados de hoje
function carregarSalesChartDashboard() {
  getJson('/relatorios/vendas')
    .then((data) => {
      if (data.timeline?.length) renderSalesChart(data.timeline, 'dashboardSalesChart');
    })
    .catch(() => {});
}

function updateDashboardMesas(mesas) {
  const total = mesas.length;
  const ocupadas = mesas.filter((mesa) => apiStatusToUiStatus(mesa.status) === 'ocupada').length;
  const disponiveis = mesas.filter((mesa) => apiStatusToUiStatus(mesa.status) === 'disponivel').length;
  setStatByLabel('dashboard', 'Mesas ocupadas', `${ocupadas}/${total}`, `${disponiveis} mesas disponíveis`);
}

// ── Grupos colapsáveis do sidebar ─────────────────────────────────
const SHORTCUT_COLLAPSE_KEY = 'dataplate:shortcut_collapsed';

function getCollapsedGroups() {
  try { return JSON.parse(localStorage.getItem(SHORTCUT_COLLAPSE_KEY) || '[]'); }
  catch { return []; }
}

function applyCollapsedGroups() {
  const collapsed = getCollapsedGroups();
  document.querySelectorAll('.shortcut-group[data-group]').forEach(el => {
    const id = el.dataset.group;
    el.classList.toggle('collapsed', collapsed.includes(id));
  });
}

window.toggleShortcutGroup = function(groupId) {
  const el = document.querySelector(`.shortcut-group[data-group="${groupId}"]`);
  if (!el) return;
  el.classList.toggle('collapsed');
  const collapsed = Array.from(document.querySelectorAll('.shortcut-group.collapsed'))
    .map(g => g.dataset.group).filter(Boolean);
  localStorage.setItem(SHORTCUT_COLLAPSE_KEY, JSON.stringify(collapsed));
};

function carregarHomeStats() {
  const el = (id) => document.getElementById(id);

  getJson('/relatorios/resumo')
    .then((resumo) => {
      const ativos      = Number(resumo.pedidosRecebidos || 0) + Number(resumo.pedidosEmPreparo || 0) + Number(resumo.pedidosProntos || 0);
      const prontos     = Number(resumo.pedidosProntos || 0);
      const entregues   = Number(resumo.pedidosEntregues || 0);
      const cancelados  = Number(resumo.pedidosCancelados || 0);
      const totalPed    = ativos + entregues + cancelados;

      // Faturamento
      if (el('homeFaturamento'))       el('homeFaturamento').textContent       = formatCurrency(resumo.faturamento);
      if (el('homeFaturamentoDetalhe'))el('homeFaturamentoDetalhe').textContent = `${totalPed} pedido(s) no dia`;

      // Ticket médio
      if (el('homeTicketMedio'))       el('homeTicketMedio').textContent       = formatCurrency(resumo.ticketMedio);

      // Entregues
      if (el('homeEntregues'))         el('homeEntregues').textContent         = String(entregues);
      if (el('homeEntreguesDetalhe'))  el('homeEntreguesDetalhe').textContent  = entregues > 0
        ? `${formatCurrency(resumo.faturamento)} faturado`
        : 'Nenhum entregue ainda';

      // Prontos p/ despacho
      if (el('homeProntos'))           el('homeProntos').textContent           = String(prontos);
      el('homeStatProntos')?.classList.toggle('has-alert', prontos > 0);

      // Em andamento
      if (el('homePedidosAtivos'))     el('homePedidosAtivos').textContent     = String(ativos);
      if (el('homePedidosDetalhe'))    el('homePedidosDetalhe').textContent    =
        `${resumo.pedidosRecebidos || 0} aguardando · ${resumo.pedidosEmPreparo || 0} em preparo`;

      // Cancelamentos
      if (el('homeCancelamentos'))     el('homeCancelamentos').textContent     = String(cancelados);
      const cancelCard = el('homeStatCancelamentos');
      if (cancelCard) cancelCard.classList.toggle('has-alert', cancelados > 0);
    })
    .catch(() => {});

  getJson('/mesas')
    .then((mesas) => {
      const lista      = mesas || [];
      const ocupadas   = lista.filter((m) => (m.status || '').toLowerCase() === 'ocupada').length;
      const disponiveis= lista.filter((m) => (m.status || '').toLowerCase() === 'disponivel').length;
      const total      = lista.length;
      if (el('homeMesas'))       el('homeMesas').textContent       = `${ocupadas}/${total}`;
      if (el('homeMesasDetalhe'))el('homeMesasDetalhe').textContent = `${disponiveis} disponíve${disponiveis === 1 ? 'l' : 'is'}`;
    })
    .catch(() => {});
}
window.carregarHomeStats = carregarHomeStats;

function carregarRelatorios() {
  // Dashboard: resumo de hoje
  getJson('/relatorios/resumo')
    .then(updateDashboardResumo)
    .catch((err) => console.error('[relatorios]', err));

  getJson('/mesas')
    .then((mesas) => {
      updateDashboardMesas(mesas);
      renderTableOccupancyChart(mesas);
    })
    .catch((err) => console.error('[relatorios-mesas]', err));

  // Últimos pedidos no dashboard
  carregarUltimosPedidosDashboard();

  // Gráfico de vendas por hora do dashboard
  carregarSalesChartDashboard();

  // Alerta de estoque baixo
  verificarEstoqueBaixo();
}

function carregarUltimosPedidosDashboard() {
  const tbody = document.getElementById('dashUltimosPedidosTbody');
  if (!tbody) return;

  getJson('/pedidos?page=0&size=5')
    .then((raw) => {
      const pedidos = Array.isArray(raw) ? raw : (raw.content || []);
      const ultimos = pedidos.slice(0, 5);
      if (!ultimos.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Nenhum pedido registrado</td></tr>';
        return;
      }
      tbody.innerHTML = ultimos.map((p) => `<tr>
        <td><strong>#${p.id}</strong></td>
        <td>${pedidoOrigemLabel(p)}</td>
        <td>${formatCurrency(p.valorTotal)}</td>
        <td><span class="badge ${pedidoBadgeClass[p.status] || ''}">${pedidoStatusLabel[p.status] || p.status}</span></td>
      </tr>`).join('');
    })
    .catch((err) => {
      console.error('[dashboard-pedidos]', err);
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Erro ao carregar pedidos</td></tr>';
    });
}

// â"â" Relatório de Vendas â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"
function carregarRelVendas(inicio, fim) {
  const params = buildDateParams(inicio, fim);
  showTableSkeleton('rel-vendas');
  getJson(`/relatorios/vendas${params}`)
    .then((data) => {
      setStatByLabel('rel-vendas', 'Total de Vendas', formatCurrency(data.faturamento), 'Dados reais do período');
      setStatByLabel('rel-vendas', 'Quantidade de Pedidos', String(data.totalPedidos), 'Pedidos registrados');
      setStatByLabel('rel-vendas', 'Ticket Médio', formatCurrency(data.ticketMedio), 'Calculado do banco');
      const top = data.topProdutos?.[0];
      if (top) setStatByLabel('rel-vendas', 'Produto Mais Vendido', top.nome, `${Number(top.quantidadeVendida || 0)} unidades`);
      else setStatByLabel('rel-vendas', 'Produto Mais Vendido', '-', 'Sem vendas no período');

      // Tabela de vendas por dia
      const tbody = document.querySelector('#rel-vendas .data-table tbody');
      if (tbody) {
        if (!data.porDia?.length) {
          tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px">
            Nenhuma venda registrada no período selecionado.<br>
            <small>Os pedidos aparecem aqui quando forem criados pelo PDV ou pelo cardápio do cliente.</small>
          </td></tr>`;
        } else {
          tbody.innerHTML = data.porDia.map((d) => `<tr>
            <td>${d.data}</td>
            <td>${d.pedidos}</td>
            <td>${formatCurrency(d.faturamento)}</td>
            <td>${formatCurrency(d.ticketMedio)}</td>
            <td>${data.topProdutos?.[0]?.nome || '-'}</td>
          </tr>`).join('');
        }
      }

      // Gráfico de vendas
      renderHistoricoVendas(data.historico || []);
      if (data.timeline?.length) renderSalesChart(data.timeline, 'salesChart');
    })
    .catch((err) => {
      console.error('[rel-vendas]', err);
      showToast(err.message || 'Erro ao carregar relatório de vendas.');
    });
}

function renderHistoricoVendas(historico) {
  const tbody = document.querySelector('#relVendasHistoricoTable tbody');
  if (!tbody) return;
  if (!historico.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8">Nenhuma venda no período selecionado</td></tr>';
    return;
  }
  tbody.innerHTML = historico.map(v => {
    const origem = v.origem === 'CAIXA' || v.numeroMesa == null ? 'Caixa' : `Mesa ${v.numeroMesa}`;
    return `<tr>
      <td><strong>#${v.id}</strong></td>
      <td>${v.dataHora ? new Date(v.dataHora).toLocaleString('pt-BR') : '-'}</td>
      <td>${origem}</td>
      <td>${v.itens}</td>
      <td>${formatCurrency(v.valorTotal)}</td>
      <td>${pedidoStatusBadge(v.status)}</td>
    </tr>`;
  }).join('');
}

// â"â" Relatório Financeiro â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"
function carregarRelFinanceiro(inicio, fim) {
  const params = buildDateParams(inicio, fim);
  getJson(`/relatorios/vendas${params}`)
    .then((data) => {
      setStatByLabel('rel-financeiro', 'Receita Bruta', formatCurrency(data.faturamento), `${data.totalPedidos} pedidos no período`);
      setStatByLabel('rel-financeiro', 'Despesas Totais', data.custoTotal ? formatCurrency(data.custoTotal) : 'Não integrado', data.custoTotal ? 'Calculado via insumos' : 'Vincule insumos aos produtos');
      const lucro = data.custoTotal ? Number(data.faturamento) - Number(data.custoTotal) : null;
      setStatByLabel('rel-financeiro', 'Lucro Líquido', lucro != null ? formatCurrency(lucro) : formatCurrency(data.faturamento), lucro != null ? 'Receita menos custos' : 'Sem dedução de custos');
      const margem = (data.faturamento > 0 && lucro != null) ? ((lucro / Number(data.faturamento)) * 100).toFixed(1) + '%' : '-';
      setStatByLabel('rel-financeiro', 'Margem de Lucro', margem, margem !== '-' ? 'Calculada' : 'Depende dos insumos cadastrados');

      renderProfitChart(data.faturamento, data.custoTotal || 0);

      const tbody = document.querySelector('#rel-financeiro .data-table tbody');
      if (tbody) {
        tbody.innerHTML = `
          <tr><td>Receita de pedidos</td><td>${formatCurrency(data.faturamento)}</td><td>100%</td><td>${data.totalPedidos} pedidos</td></tr>
          <tr><td>Pedidos cancelados</td><td>${data.pedidosCancelados || 0}</td><td>"</td><td>Não geram receita</td></tr>
          ${data.custoTotal ? `<tr><td>Custos operacionais</td><td>${formatCurrency(data.custoTotal)}</td><td>${((Number(data.custoTotal)/Number(data.faturamento))*100).toFixed(1)}%</td><td>Calculado via insumos</td></tr>` : `<tr><td>Custos operacionais</td><td colspan="3" style="color:#94a3b8">Vincule insumos aos produtos para calcular custos</td></tr>`}`;
      }
    })
    .catch((err) => console.error('[rel-financeiro]', err));
}

// â"â" Relatório de Cardápio â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"
function carregarRelCardapio(inicio, fim) {
  const params = buildDateParams(inicio, fim);
  showTableSkeleton('rel-cardapio');
  getJson(`/relatorios/cardapio${params}`)
    .then((data) => {
      const tbody = document.querySelector('#rel-cardapio .data-table tbody');
      if (!tbody) return;
      if (!data.topProdutos?.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8">Nenhum produto vendido no período</td></tr>';
        return;
      }
      const totalQtd = Number(data.totalItensVendidos || 0);
      const totalFat = Number(data.faturamentoTotal || 0);
      tbody.innerHTML = data.topProdutos.map((p) => {
        const pct = totalQtd > 0 ? ((Number(p.quantidadeVendida || 0) / totalQtd) * 100).toFixed(1) : '0.0';
        return `<tr>
          <td><strong>${escapeHtml(p.nome)}</strong></td>
          <td>"</td>
          <td>${Number(p.quantidadeVendida || 0)}</td>
          <td>${formatCurrency(p.faturamento)}</td>
          <td>${pct}%</td>
          <td>"</td>
          <td>"</td>
        </tr>`;
      }).join('');
    })
    .catch((err) => {
      console.error('[rel-cardapio]', err);
      showToast(err.message || 'Erro ao carregar desempenho do cardápio.');
    });
}

// â"â" Relatório Operacional â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"â"
function carregarRelOperacional(inicio, fim) {
  const params = buildDateParams(inicio, fim);
  getJson(`/relatorios/operacional${params}`)
    .then((data) => {
      const tempoMedio = data.tempoMedioPreparoMin > 0
        ? `${data.tempoMedioPreparoMin.toFixed(1)} min`
        : '-';
      const tempoChange = data.tempoMedioPreparoMin > 0
        ? 'Calculado via histórico de status'
        : 'Novos pedidos registrarão o tempo automaticamente';
      setStatByLabel('rel-operacional', 'Tempo Médio de Preparo', tempoMedio, tempoChange);
      setStatByLabel('rel-operacional', 'Taxa de Rejeição', `${data.taxaCancelamento || 0}%`, `${data.pedidosCancelados || 0} cancelados`);
      setStatByLabel('rel-operacional', 'Ocupação Cozinha', `${data.pedidosEntregues || 0}`, 'Pedidos entregues');
      setStatByLabel('rel-operacional', 'Pedidos Entregues no Prazo', `${data.taxaEntrega || 0}%`, `de ${data.totalPedidos || 0} pedidos`);
    })
    .catch((err) => console.error('[rel-operacional]', err));
}

function buildDateParams(inicio, fim) {
  const p = [];
  if (inicio) p.push(`inicio=${inicio}`);
  if (fim)    p.push(`fim=${fim}`);
  return p.length ? '?' + p.join('&') : '';
}

function getRelDateRange(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return {};
  const inputs = section.querySelectorAll('input[type="date"]');
  return { inicio: inputs[0]?.value || null, fim: inputs[1]?.value || null };
}

// Preenche os campos de data com um range padrão (dias atrás até hoje)
// Só preenche se ainda estiverem vazios (não substitui escolha do usuário)
function preencherDatasRelatorio(sectionId, diasAtras) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  const inputs = section.querySelectorAll('input[type="date"]');
  if (!inputs[0] || !inputs[1]) return;
  if (inputs[0].value && inputs[1].value) return; // já preenchido

  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - diasAtras);

  const fmt = (d) => d.toISOString().slice(0, 10);
  inputs[0].value = fmt(inicio);
  inputs[1].value = fmt(hoje);
}

window.__clientes = [];
window.__funcionarios = [];
window.__fornecedores = [];
window.__produtos = [];

const _sectionLoaderNames = {
  clientes: 'carregarClientes',
  funcionarios: 'carregarFuncionarios',
  fornecedores: 'carregarFornecedores',
  cardapio: 'carregarProdutos',
  pedidos: 'carregarPedidos',
  mesas: 'carregarMesas',
  'config-usuarios': 'carregarUsuarios'
};

function setTableBody(sectionId, rows, errorMsg) {
  const tbody = document.querySelector(`#${sectionId} .data-table tbody`);
  if (!tbody) return;
  if (!rows || rows.length === 0) {
    const cols = tbody.closest('table').querySelectorAll('th').length;
    if (errorMsg) {
      const fn = _sectionLoaderNames[sectionId];
      const retryBtn = fn
        ? `<button onclick="${fn}()" style="margin-left:12px;padding:4px 12px;border:1px solid #dc2626;background:#fff;color:#dc2626;border-radius:6px;cursor:pointer;font-size:13px">Tentar novamente</button>`
        : '';
      tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;color:#dc2626;padding:20px">&#9888; ${errorMsg}${retryBtn}</td></tr>`;
    } else {
      tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;color:#94a3b8">Nenhum registro encontrado</td></tr>`;
    }
    return;
  }
  tbody.innerHTML = rows.join('');
}

function adicionarLinhaCliente(c) {
  const tbody = document.querySelector('#clientes .data-table tbody');
  if (!tbody) return;
  const placeholder = tbody.querySelector('td[colspan]');
  if (placeholder) tbody.innerHTML = '';
  tbody.insertAdjacentHTML('beforeend', buildLinhaCliente(c));
  applyToolbarFilters('clientes');
}

function buildLinhaCliente(c) {
  return `<tr>
    <td><input type="checkbox" /></td>
    <td><strong>${escapeHtml(displayCode(c, 'CLI'))}</strong></td>
    <td><strong>${escapeHtml(c.nome)}</strong></td>
    <td>${escapeHtml(c.email || '-')}</td>
    <td>${escapeHtml(c.telefone || '-')}</td>
    <td>-</td><td>-</td>
    <td><span class="badge badge-active">${c.ativo ? 'Ativo' : 'Inativo'}</span></td>
    <td>${formatDate(c.criadoEm)}</td>
    <td>
      <button class="btn-icon btn-icon-edit" title="Editar" data-crud-action="edit" onclick="editarCliente(${c.id})"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5l2 2L5 13l-2.5.5.5-2.5z"/></svg></button>
      <button class="btn-icon btn-icon-delete" title="Excluir" data-crud-action="delete" onclick="excluirCliente(${c.id})"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 4 14 4"/><path d="M5 4V2h6v2"/><path d="M13 4l-1 10H4L3 4"/><line x1="6" y1="7" x2="6" y2="11"/><line x1="10" y1="7" x2="10" y2="11"/></svg></button>
    </td>
  </tr>`;
}

function carregarClientes() {
  showTableSkeleton('clientes');
  getJson('/clientes')
    .then(list => {
      window.__clientes = list || [];
      setTableBody('clientes', window.__clientes.map(buildLinhaCliente));
      applyToolbarFilters('clientes');
    })
    .catch((err) => {
      const msg = err.message || 'Erro ao carregar clientes.';
      setTableBody('clientes', [], msg);
      console.error('[clientes]', err);
    });
}

function adicionarLinhaFuncionario(f) {
  const tbody = document.querySelector('#funcionarios .data-table tbody');
  if (!tbody) return;
  const placeholder = tbody.querySelector('td[colspan]');
  if (placeholder) tbody.innerHTML = '';
  tbody.insertAdjacentHTML('beforeend', buildLinhaFuncionario(f));
  applyToolbarFilters('funcionarios');
}

function buildLinhaFuncionario(f) {
  return `<tr>
    <td><strong>${escapeHtml(displayCode(f, 'FUN'))}</strong></td>
    <td><strong>${escapeHtml(f.nome)}</strong></td>
    <td><span class="badge badge-info">${escapeHtml(f.cargo)}</span></td>
    <td>${escapeHtml(f.telefone || '-')}</td>
    <td>${f.salario ? formatCurrency(f.salario) : '-'}</td>
    <td><span class="badge badge-active">${f.ativo ? 'Ativo' : 'Inativo'}</span></td>
    <td>${formatDate(f.criadoEm)}</td>
    <td>
      <button class="btn-icon btn-icon-edit" title="Editar" data-crud-action="edit" onclick="editarFuncionario(${f.id})"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5l2 2L5 13l-2.5.5.5-2.5z"/></svg></button>
      <button class="btn-icon btn-icon-delete" title="Excluir" data-crud-action="delete" onclick="excluirFuncionario(${f.id})"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 4 14 4"/><path d="M5 4V2h6v2"/><path d="M13 4l-1 10H4L3 4"/><line x1="6" y1="7" x2="6" y2="11"/><line x1="10" y1="7" x2="10" y2="11"/></svg></button>
    </td>
  </tr>`;
}

function carregarFuncionarios() {
  showTableSkeleton('funcionarios');
  getJson('/funcionarios')
    .then(list => {
      window.__funcionarios = list || [];
      setTableBody('funcionarios', window.__funcionarios.map(buildLinhaFuncionario));
      applyToolbarFilters('funcionarios');
    })
    .catch((err) => {
      const msg = err.message || 'Erro ao carregar funcionários.';
      setTableBody('funcionarios', [], msg);
      console.error('[funcionarios]', err);
    });
}

function adicionarLinhaFornecedor(f) {
  const tbody = document.querySelector('#fornecedores .data-table tbody');
  if (!tbody) return;
  const placeholder = tbody.querySelector('td[colspan]');
  if (placeholder) tbody.innerHTML = '';
  tbody.insertAdjacentHTML('beforeend', buildLinhaFornecedor(f));
  applyToolbarFilters('fornecedores');
}

function buildLinhaFornecedor(f) {
  return `<tr>
    <td><strong>${escapeHtml(displayCode(f, 'FOR'))}</strong></td>
    <td><strong>${escapeHtml(f.razaoSocial)}</strong></td>
    <td>${escapeHtml(f.telefone || '-')}</td>
    <td>${escapeHtml(f.email || '-')}</td>
    <td>-</td>
    <td><span class="badge badge-active">${f.ativo ? 'Ativo' : 'Inativo'}</span></td>
    <td>${formatDate(f.criadoEm)}</td>
    <td>
      <button class="btn-icon btn-icon-edit" title="Editar" data-crud-action="edit" onclick="editarFornecedor(${f.id})"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5l2 2L5 13l-2.5.5.5-2.5z"/></svg></button>
      <button class="btn-icon btn-icon-delete" title="Excluir" data-crud-action="delete" onclick="excluirFornecedor(${f.id})"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 4 14 4"/><path d="M5 4V2h6v2"/><path d="M13 4l-1 10H4L3 4"/><line x1="6" y1="7" x2="6" y2="11"/><line x1="10" y1="7" x2="10" y2="11"/></svg></button>
    </td>
  </tr>`;
}

function carregarFornecedores() {
  showTableSkeleton('fornecedores');
  getJson('/fornecedores')
    .then(list => {
      window.__fornecedores = list || [];
      setTableBody('fornecedores', window.__fornecedores.map(buildLinhaFornecedor));
      applyToolbarFilters('fornecedores');
    })
    .catch((err) => {
      const msg = err.message || 'Erro ao carregar fornecedores.';
      setTableBody('fornecedores', [], msg);
      console.error('[fornecedores]', err);
    });
}

function adicionarLinhaProduto(p) {
  const tbody = document.querySelector('#cardapio .data-table tbody');
  if (!tbody) return;
  const placeholder = tbody.querySelector('td[colspan]');
  if (placeholder) tbody.innerHTML = '';
  tbody.insertAdjacentHTML('beforeend', buildLinhaProduto(p));
  applyToolbarFilters('cardapio');
}

function buildLinhaProduto(p) {
  return `<tr>
    <td><strong>${escapeHtml(displayCode(p, 'PRO'))}</strong></td>
    <td><strong>${escapeHtml(p.nome)}</strong></td>
    <td>${escapeHtml(getCategoryLabel(p.idCategoria))}</td>
    <td>${formatCurrency(p.preco)}</td>
    <td>${p.tempoPreparo ? `${p.tempoPreparo} min` : '-'}</td>
    <td><span class="badge ${p.destaque ? 'badge-info' : 'badge-warning'}">${p.destaque ? 'Sim' : 'Não'}</span></td>
    <td><span class="badge badge-active">${p.ativo !== false ? 'Sim' : 'Não'}</span></td>
    <td>${formatDate(p.criadoEm)}</td>
    <td>
      <button class="btn-icon btn-icon-edit" title="Editar" data-crud-action="edit" onclick="editarProduto(${p.id})"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5l2 2L5 13l-2.5.5.5-2.5z"/></svg></button>
      <button class="btn-icon btn-icon-delete" title="Excluir" data-crud-action="delete" onclick="excluirProduto(${p.id})"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 4 14 4"/><path d="M5 4V2h6v2"/><path d="M13 4l-1 10H4L3 4"/><line x1="6" y1="7" x2="6" y2="11"/><line x1="10" y1="7" x2="10" y2="11"/></svg></button>
    </td>
  </tr>`;
}

function carregarProdutos() {
  showTableSkeleton('cardapio');
  getJson('/produtos')
    .then(list => {
      window.__produtos = list || [];
      setTableBody('cardapio', window.__produtos.map(buildLinhaProduto));
      applyToolbarFilters('cardapio');
    })
    .catch((err) => {
      const msg = err.message || 'Erro ao carregar produtos.';
      setTableBody('cardapio', [], msg);
      console.error('[cardapio]', err);
    });
}

window.editarCliente = function(id) {
  const cliente = (window.__clientes || []).find((item) => item.id === id);
  const form = document.getElementById('addClientForm');
  if (!cliente || !form) return;

  resetCrudForm(form, 'addClientModal');
  form.querySelector('[name="id"]').value = cliente.id;
  form.querySelector('[name="codigo"]').value = cliente.codigo || '';
  const isCnpj = onlyDigits(cliente.cpf).length === 14;
  form.querySelector('[name="tipoPessoa"]').value = isCnpj ? 'juridica' : 'fisica';
  configureClientPersonType(form);
  form.querySelector('[name="name"]').value = cliente.nome || '';
  form.querySelector('[name="email"]').value = cliente.email || '';
  form.querySelector('[name="cpf"], [name="cnpj"]').value = isCnpj ? formatCnpj(cliente.cpf) : formatCpf(cliente.cpf);
  const phones = splitPhone(cliente.telefone);
  form.querySelector('[name="phone"]').value = phones.phone;
  form.querySelector('[name="phone2"]').value = phones.phone2;
  form.querySelector('[name="address"]').value = cliente.endereco || '';
  setModalMode(form, 'addClientModal', true);
  window.openModal('addClientModal');
};

window.excluirCliente = async function(id) {
  const cliente = (window.__clientes || []).find((item) => item.id === id);
  if (!cliente) return;
  const ok = await showConfirmModal('Excluir cliente?', `Esta ação não pode ser desfeita.<br>Deseja excluir <strong>${cliente.nome}</strong>?`);
  if (!ok) return;
  deleteJson(`/clientes/${id}`)
    .then(() => { showToast('Cliente excluído com sucesso!', 'success'); carregarClientes(); })
    .catch((err) => showToast(err.message || 'Erro ao excluir cliente.'));
};

window.editarFuncionario = function(id) {
  const funcionario = (window.__funcionarios || []).find((item) => item.id === id);
  const form = document.getElementById('addFunctForm');
  if (!funcionario || !form) return;

  resetCrudForm(form, 'addFunctModal');
  form.querySelector('[name="id"]').value = funcionario.id;
  form.querySelector('[name="codigo"]').value = funcionario.codigo || '';
  form.querySelector('[name="name"]').value = funcionario.nome || '';
  form.querySelector('[name="cpf"]').value = formatCpf(funcionario.cpf || '');
  form.querySelector('[name="phone"]').value = funcionario.telefone || '';
  form.querySelector('[name="role"]').value = funcionario.cargo || 'Atendente';
  form.querySelector('[name="salary"]').value = funcionario.salario ? formatCurrencyInput(floatToInputDigits(funcionario.salario)) : '';
  setModalMode(form, 'addFunctModal', true);
  window.openModal('addFunctModal');
};

window.excluirFuncionario = async function(id) {
  const funcionario = (window.__funcionarios || []).find((item) => item.id === id);
  if (!funcionario) return;
  const ok = await showConfirmModal('Excluir funcionário?', `Esta ação não pode ser desfeita.<br>Deseja excluir <strong>${funcionario.nome}</strong>?`);
  if (!ok) return;
  deleteJson(`/funcionarios/${id}`)
    .then(() => { showToast('Funcionário excluído com sucesso!', 'success'); carregarFuncionarios(); })
    .catch((err) => showToast(err.message || 'Erro ao excluir funcionário.'));
};

window.editarFornecedor = function(id) {
  const fornecedor = (window.__fornecedores || []).find((item) => item.id === id);
  const form = document.getElementById('addSupplierForm');
  if (!fornecedor || !form) return;

  resetCrudForm(form, 'addSupplierModal');
  form.querySelector('[name="id"]').value = fornecedor.id;
  form.querySelector('[name="codigo"]').value = fornecedor.codigo || '';
  form.querySelector('[name="company"]').value = fornecedor.razaoSocial || '';
  form.querySelector('[name="cnpj"]').value = formatCnpj(fornecedor.cnpj || '');
  form.querySelector('[name="specialty"]').value = fornecedor.especialidade || '';
  form.querySelector('[name="email"]').value = fornecedor.email || '';
  const phones = splitPhone(fornecedor.telefone);
  form.querySelector('[name="phone"]').value = phones.phone;
  form.querySelector('[name="phone2"]').value = phones.phone2;
  setModalMode(form, 'addSupplierModal', true);
  window.openModal('addSupplierModal');
};

window.excluirFornecedor = async function(id) {
  const fornecedor = (window.__fornecedores || []).find((item) => item.id === id);
  if (!fornecedor) return;
  const ok = await showConfirmModal('Excluir fornecedor?', `Esta ação não pode ser desfeita.<br>Deseja excluir <strong>${fornecedor.razaoSocial}</strong>?`);
  if (!ok) return;
  deleteJson(`/fornecedores/${id}`)
    .then(() => { showToast('Fornecedor excluído com sucesso!', 'success'); carregarFornecedores(); })
    .catch((err) => showToast(err.message || 'Erro ao excluir fornecedor.'));
};

window.editarProduto = function(id) {
  const produto = (window.__produtos || []).find((item) => item.id === id);
  const form = document.getElementById('addDishForm');
  if (!produto || !form) return;

  resetCrudForm(form, 'addDishModal');
  form.querySelector('[name="id"]').value = produto.id;
  form.querySelector('[name="codigo"]').value = produto.codigo || '';
  form.querySelector('[name="name"]').value = produto.nome || '';
  form.querySelector('[name="category"]').value = String(produto.idCategoria || 1);
  form.querySelector('[name="price"]').value = produto.preco ? formatCurrencyInput(floatToInputDigits(produto.preco)) : '';
  form.querySelector('[name="prepTime"]').value = produto.tempoPreparo || '';
  form.querySelector('[name="description"]').value = produto.descricao || '';
  form.querySelector('[name="available"]').checked = produto.ativo !== false;
  form.querySelector('[name="featured"]').checked = produto.destaque === true;
  setModalMode(form, 'addDishModal', true);
  window.openModal('addDishModal');
  window.__produtoAtivoId = id;
  const secFT = document.getElementById('fichaTecnicaSection');
  if (secFT) secFT.style.display = 'block';
  const formFT = document.getElementById('fichaTecnicaForm');
  if (formFT) formFT.style.display = 'none';
  carregarFichaTecnica(id);
};

window.excluirProduto = async function(id) {
  const produto = (window.__produtos || []).find((item) => item.id === id);
  if (!produto) return;
  const ok = await showConfirmModal('Excluir item do cardápio?', `Esta ação não pode ser desfeita.<br>Deseja excluir <strong>${produto.nome}</strong>?`);
  if (!ok) return;
  deleteJson(`/produtos/${id}`)
    .then(() => { showToast('Item excluído com sucesso!', 'success'); carregarProdutos(); })
    .catch((err) => showToast(err.message || 'Erro ao excluir item.'));
};

// =============================================
// FICHA TÉCNICA (INSUMOS DO PRODUTO)
// =============================================

window.__produtoAtivoId = null;

function carregarFichaTecnica(produtoId) {
  const lista = document.getElementById('fichaTecnicaLista');
  if (!lista) return;
  lista.textContent = 'Carregando...';
  getJson(`/produtos/${produtoId}/insumos`)
    .then((vinculosList) => renderFichaTecnica(vinculosList || []))
    .catch(() => { lista.textContent = 'Erro ao carregar ficha técnica.'; });
}

function renderFichaTecnica(vinculosList) {
  const lista = document.getElementById('fichaTecnicaLista');
  if (!lista) return;
  if (!vinculosList.length) {
    lista.innerHTML = '<span style="color:#94a3b8">Nenhum insumo vinculado.</span>';
    return;
  }
  lista.innerHTML = vinculosList.map((v) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f1f5f9">
      <span>${escapeHtml(v.nomeInsumo)} <small style="color:#94a3b8">(${Number(v.quantidade).toFixed(3)} ${escapeHtml(v.unidade)})</small></span>
      <button type="button" class="btn-icon btn-icon-delete" title="Remover" onclick="removerVinculoInsumo(${v.insumoId}, '${escapeHtml(v.nomeInsumo)}')">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 4 14 4"/><path d="M5 4V2h6v2"/><path d="M13 4l-1 10H4L3 4"/></svg>
      </button>
    </div>
  `).join('');
}

window.abrirAdicionarInsumo = function() {
  const form = document.getElementById('fichaTecnicaForm');
  if (form) form.style.display = 'block';
  const select = document.getElementById('ftInsumoSelect');
  if (!select) return;

  const populate = (list) => {
    select.innerHTML = list.length
      ? list.map((i) => `<option value="${i.id}">${escapeHtml(i.nome)} (${escapeHtml(i.unidade)})</option>`).join('')
      : '<option value="">Nenhum insumo cadastrado</option>';
  };

  if (window.__insumos && window.__insumos.length) {
    populate(window.__insumos);
  } else {
    select.innerHTML = '<option value="">Carregando...</option>';
    getJson('/insumos')
      .then((list) => { window.__insumos = list || []; populate(window.__insumos); })
      .catch(() => { select.innerHTML = '<option value="">Erro ao carregar insumos</option>'; });
  }
};

window.salvarVinculoInsumo = async function() {
  const produtoId = window.__produtoAtivoId;
  if (!produtoId) return;
  const insumoId = Number(document.getElementById('ftInsumoSelect')?.value);
  const quantidade = Number(document.getElementById('ftQuantidade')?.value);
  if (!insumoId || !quantidade || quantidade < 0.001) {
    showToast('Selecione um insumo e informe a quantidade (mínimo 0.001).');
    return;
  }
  try {
    await postJson(`/produtos/${produtoId}/insumos`, { insumoId, quantidade });
    document.getElementById('fichaTecnicaForm').style.display = 'none';
    document.getElementById('ftQuantidade').value = '';
    carregarFichaTecnica(produtoId);
  } catch (err) {
    showToast(err.message || 'Erro ao adicionar insumo.');
  }
};

window.removerVinculoInsumo = async function(insumoId, nome) {
  const produtoId = window.__produtoAtivoId;
  if (!produtoId) return;
  const ok = await showConfirmModal('Remover insumo?', `Deseja remover <strong>${nome}</strong> desta ficha técnica?`);
  if (!ok) return;
  deleteJson(`/produtos/${produtoId}/insumos/${insumoId}`)
    .then(() => { showToast('Insumo removido.', 'success'); carregarFichaTecnica(produtoId); })
    .catch((err) => showToast(err.message || 'Erro ao remover insumo.'));
};

function carregarMesas() {
  getJson('/mesas')
    .then((mesas) => {
      saveTables((mesas || []).map(mesaApiToTable));
      renderTables();
    })
    .catch((err) => {
      console.error('[mesas]', err);
      showToast(err.message || 'Erro ao carregar mesas.');
      renderTables();
    });
}

function buildLinhaPedido(p) {
  const qtd = p.itens ? p.itens.reduce((s, i) => s + (i.quantidade || 0), 0) : '-';
  return `<tr>
    <td><strong>#${p.id}</strong></td>
    <td>${pedidoOrigemLabel(p)}</td>
    <td>${p.dataHora ? new Date(p.dataHora).toLocaleString('pt-BR') : '-'}</td>
    <td>${qtd} item(s)</td>
    <td>${formatCurrency(p.valorTotal)}</td>
    <td>${pedidoStatusBadge(p.status)}</td>
    <td>-</td>
    <td><button class="btn-small" type="button" onclick="abrirDetalhesPedido(${p.id})">Ver</button></td>
  </tr>`;
}

window.abrirDetalhesPedido = function(id) {
  openModal('orderDetailsModal');
  const content = document.getElementById('orderDetailsContent');
  content.innerHTML = '<div class="modal-description">Carregando pedido...</div>';

  getJson(`/pedidos/${id}`)
    .then(p => {
      const itens = (p.itens || []).map(i => `
        <tr>
          <td>${escapeHtml(i.nomeProduto || '-')}</td>
          <td style="text-align:center">${i.quantidade}</td>
          <td style="text-align:right">${formatCurrency(i.precoUnitario)}</td>
          <td style="text-align:right"><strong>${formatCurrency(i.subtotal)}</strong></td>
        </tr>`).join('');

      content.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin-bottom:16px;font-size:13px">
          <div><span style="color:#64748b;font-weight:600">ID</span><br/><strong>#${p.id}</strong></div>
          <div><span style="color:#64748b;font-weight:600">Origem</span><br/>${pedidoOrigemLabel(p)}</div>
          <div><span style="color:#64748b;font-weight:600">Status</span><br/>${pedidoStatusBadge(p.status)}</div>
          <div><span style="color:#64748b;font-weight:600">Data/Hora</span><br/>${p.dataHora ? new Date(p.dataHora).toLocaleString('pt-BR') : '-'}</div>
        </div>
        <table class="data-table" style="font-size:13px">
          <thead><tr><th>Item</th><th style="text-align:center">Qtd</th><th style="text-align:right">Unitário</th><th style="text-align:right">Subtotal</th></tr></thead>
          <tbody>${itens || '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Sem itens</td></tr>'}</tbody>
        </table>
        <div style="text-align:right;margin-top:12px;font-size:15px;font-weight:700">
          Total: ${formatCurrency(p.valorTotal)}
        </div>
        <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;flex-wrap:wrap">
          ${p.status === 'PRONTO' ? `<button class="btn-primary" type="button" onclick="alterarStatusPedido(${p.id},'ENTREGUE');closeModal('orderDetailsModal')">Confirmar Entrega</button>` : ''}
          ${!['CANCELADO','ENTREGUE'].includes(p.status) ? `<button class="btn-secondary" style="color:#f59e0b;border-color:#fde68a" type="button" onclick="marcarUrgente(${p.id})">Urgente</button>` : ''}
          ${!['CANCELADO','ENTREGUE'].includes(p.status) ? `<button class="btn-secondary" style="color:#dc2626;border-color:#fecaca" type="button" onclick="alterarStatusPedido(${p.id},'CANCELADO');closeModal('orderDetailsModal')">Cancelar Pedido</button>` : ''}
        </div>`;
    })
    .catch(err => {
      content.innerHTML = `<div class="modal-description" style="color:#dc2626">Erro ao carregar pedido: ${escapeHtml(err.message || 'tente novamente.')}</div>`;
    });
};

let _pedidosPage = 0;

function carregarPedidos(page = 0) {
  _pedidosPage = page;
  showTableSkeleton('pedidos');
  getJson(`/pedidos?page=${page}&size=50`)
    .then(data => {
      // suporta resposta paginada {content, totalPages} ou lista simples
      const list = Array.isArray(data) ? data : (data.content || []);
      const totalPages = data.totalPages ?? 1;
      setTableBody('pedidos', list.map(buildLinhaPedido));
      applyToolbarFilters('pedidos');
      renderPedidosPaginacao(page, totalPages);
    })
    .catch((err) => {
      const msg = err.message || 'Erro ao carregar pedidos.';
      setTableBody('pedidos', [], msg);
      console.error('[pedidos]', err);
    });
}

// ── Cancelamentos ─────────────────────────────────────────────────
let _todosCancelados = [];

function carregarCancelamentos() {
  const tbody = document.getElementById('cancelTbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:24px">Carregando...</td></tr>';

  // Limpa filtros de data
  const ini = document.getElementById('cancelDataInicio');
  const fim = document.getElementById('cancelDataFim');
  const busca = document.getElementById('cancelSearchInput');
  if (ini) ini.value = '';
  if (fim) fim.value = '';
  if (busca) busca.value = '';

  getJson('/pedidos?page=0&size=200')
    .then(raw => {
      const todos = Array.isArray(raw) ? raw : (raw.content || []);
      _todosCancelados = todos.filter(p => String(p.status).toUpperCase() === 'CANCELADO');
      renderTabelaCancelamentos(_todosCancelados);
    })
    .catch(err => {
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#dc2626;padding:24px">Erro: ${escapeHtml(err.message)}</td></tr>`;
    });
}
window.carregarCancelamentos = carregarCancelamentos;

window.filtrarCancelamentos = function() {
  const busca = (document.getElementById('cancelSearchInput')?.value || '').toLowerCase().trim();
  const ini   = document.getElementById('cancelDataInicio')?.value;
  const fim   = document.getElementById('cancelDataFim')?.value;

  const filtrado = _todosCancelados.filter(p => {
    if (busca) {
      const origem = pedidoOrigemLabel(p).toLowerCase();
      if (!String(p.id).includes(busca) && !origem.includes(busca)) return false;
    }
    if (ini && p.dataHora && new Date(p.dataHora) < new Date(ini)) return false;
    if (fim && p.dataHora && new Date(p.dataHora) > new Date(fim + 'T23:59:59')) return false;
    return true;
  });
  renderTabelaCancelamentos(filtrado);
};

function renderTabelaCancelamentos(lista) {
  const tbody = document.getElementById('cancelTbody');
  if (!tbody) return;

  const total30 = lista.filter(p => {
    if (!p.dataHora) return false;
    return (Date.now() - new Date(p.dataHora).getTime()) <= 30 * 24 * 60 * 60 * 1000;
  }).length;
  const valorTotal = lista.reduce((s, p) => s + Number(p.valorTotal || 0), 0);

  const el = id => document.getElementById(id);
  if (el('cancelTotalQtd'))   el('cancelTotalQtd').textContent   = String(lista.length);
  if (el('cancelTotalValor')) el('cancelTotalValor').textContent = formatCurrency(valorTotal);
  if (el('cancelUltimos30'))  el('cancelUltimos30').textContent  = String(total30);

  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:24px">Nenhum cancelamento encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = lista
    .sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora))
    .map(p => {
      const qtd = (p.itens || []).reduce((s, i) => s + (i.quantidade || 0), 0);
      const obs = escapeHtml(p.observacoes || '—');
      return `<tr>
        <td><strong>#${p.id}</strong></td>
        <td>${pedidoOrigemLabel(p)}</td>
        <td>${p.dataHora ? new Date(p.dataHora).toLocaleString('pt-BR') : '—'}</td>
        <td>${qtd} item(s)</td>
        <td>${formatCurrency(p.valorTotal)}</td>
        <td style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${obs}">${obs}</td>
        <td><button class="btn-small" type="button" onclick="abrirDetalhesPedido(${p.id})">Ver</button></td>
      </tr>`;
    }).join('');
}

function renderPedidosPaginacao(page, totalPages) {
  const section = document.getElementById('pedidos');
  if (!section || totalPages <= 1) {
    section?.querySelector('.pagination-bar')?.remove();
    return;
  }
  let bar = section.querySelector('.pagination-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'pagination-bar';
    bar.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:8px;padding:12px 0;font-size:13px';
    section.querySelector('.table-container')?.after(bar);
  }
  bar.innerHTML = `
    <button class="btn-secondary" style="padding:4px 10px" ${page === 0 ? 'disabled' : ''} onclick="carregarPedidos(${page - 1})"><- Anterior</button>
    <span style="color:#64748b">Página ${page + 1} de ${totalPages}</span>
    <button class="btn-secondary" style="padding:4px 10px" ${page >= totalPages - 1 ? 'disabled' : ''} onclick="carregarPedidos(${page + 1})">Próxima -></button>
  `;
}

function buildLinhaUsuarioResumo(u) {
  const roleLabel = { ADMIN: 'Administrador', FUNCIONARIO: 'Operacional' };
  const roleClass = u.role === 'ADMIN' ? 'badge-info' : 'badge-active';
  return `<tr>
    <td><strong>${u.nome}</strong></td>
    <td>${u.cpf || '-'}</td>
    <td><span class="badge ${roleClass}">${roleLabel[u.role] || u.role || '-'}</span></td>
    <td>${u.role === 'ADMIN' ? 'Todos' : 'Operações'}</td>
    <td><span class="badge badge-active">Ativo</span></td>
    <td>-</td>
    <td>
      <button class="btn-icon" title="Editar">&#9998;</button>
      <button class="btn-icon" title="Permissoes">Perm.</button>
      <button class="btn-icon" title="Resetar Senha">Senha</button>
    </td>
  </tr>`;
}

function carregarUsuariosResumo() {
  showTableSkeleton('config-usuarios');
  getJson('/usuarios')
    .then(list => setTableBody('config-usuarios', list.map(buildLinhaUsuarioResumo)))
    .catch((err) => {
      const msg = err.message || 'Erro ao carregar usuários.';
      setTableBody('config-usuarios', [], msg);
      console.error('[usuarios]', err);
    });
}

function carregarCozinha() {
  showCozinhaSkeleton();
  getJson('/pedidos/ativos').then(raw => {
  const pedidos = Array.isArray(raw) ? raw : (raw.content || []);
    const cols = {
      RECEBIDO:   document.getElementById('col-recebido'),
      EM_PREPARO: document.getElementById('col-em_preparo'),
      PRONTO:     document.getElementById('col-pronto')
    };

    Object.values(cols).forEach(col => {
      if (!col) return;
      Array.from(col.querySelectorAll('.kitchen-card, .skeleton-card, p')).forEach(c => c.remove());
      col.querySelector('.col-count').textContent = '0';
    });

    const ativos = pedidos.filter(p => ['RECEBIDO', 'EM_PREPARO', 'PRONTO'].includes(p.status));

    ativos.forEach(p => {
      const col = cols[p.status];
      if (!col) return;

      const itensTexto = p.itens && p.itens.length
        ? p.itens.map(i => `${i.quantidade}x ${i.nomeProduto}`).join(', ')
        : 'Sem itens';

      const proximoStatus = { RECEBIDO: 'EM_PREPARO', EM_PREPARO: 'PRONTO', PRONTO: 'ENTREGUE' }[p.status];
      const labelBotao   = { RECEBIDO: 'Iniciar Preparo', EM_PREPARO: 'Marcar Pronto', PRONTO: 'Entregar' }[p.status];

      const card = document.createElement('div');
      card.className = 'kitchen-card';
      card.innerHTML = `
        <div class="card-id">Pedido #${p.id} &bull; ${pedidoOrigemLabel(p)}</div>
        <div class="card-items">${itensTexto}</div>
        <div class="card-time">${p.dataHora ? new Date(p.dataHora).toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) : ''}</div>
        <button class="btn-small" onclick="alterarStatusPedido(${p.id}, '${proximoStatus}')">${labelBotao}</button>
      `;
      col.appendChild(card);
      col.querySelector('.col-count').textContent =
        String(col.querySelectorAll('.kitchen-card').length);
    });

    if (ativos.length === 0) {
      Object.values(cols).forEach(col => {
        if (col) col.insertAdjacentHTML('beforeend', '<p style="color:#94a3b8;font-size:14px">Nenhum pedido</p>');
      });
    }
  }).catch((err) => {
    ['col-recebido', 'col-em_preparo', 'col-pronto'].forEach(id => {
      const col = document.getElementById(id);
      if (!col) return;
      Array.from(col.querySelectorAll('.skeleton-card')).forEach(el => el.remove());
      col.insertAdjacentHTML('beforeend', '<p style="color:#94a3b8;font-size:14px">Erro ao carregar</p>');
    });
    showToast(err.message || 'Erro ao carregar cozinha.');
  });
}

// =============================================
// INSUMOS
// =============================================

window.__insumos = [];

function buildLinhaInsumo(i) {
  const qtd    = Number(i.quantidadeAtual || 0);
  const minima = Number(i.quantidadeMinima || 0);
  const status = qtd <= 0
    ? '<span class="badge badge-danger">Zerado</span>'
    : qtd <= minima
      ? '<span class="badge badge-warning">Estoque baixo</span>'
      : '<span class="badge badge-active">Normal</span>';

  return `<tr>
    <td><strong>${escapeHtml(i.nome)}</strong></td>
    <td>${escapeHtml(i.unidade)}</td>
    <td>${Number(i.quantidadeAtual).toFixed(3)}</td>
    <td>${Number(i.quantidadeMinima).toFixed(3)}</td>
    <td>${formatCurrency(i.custoUnitario)}</td>
    <td>${status}</td>
    <td>
      <button class="btn-icon btn-icon-edit" title="Editar" onclick="editarInsumo(${i.id})"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5l2 2L5 13l-2.5.5.5-2.5z"/></svg></button>
      <button class="btn-icon btn-icon-delete" title="Excluir" onclick="excluirInsumo(${i.id}, '${escapeHtml(i.nome)}')"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 4 14 4"/><path d="M5 4V2h6v2"/><path d="M13 4l-1 10H4L3 4"/><line x1="6" y1="7" x2="6" y2="11"/><line x1="10" y1="7" x2="10" y2="11"/></svg></button>
    </td>
  </tr>`;
}

function carregarInsumos() {
  showTableSkeleton('insumos');
  getJson('/insumos')
    .then((list) => {
      window.__insumos = list || [];
      setTableBody('insumos', window.__insumos.map(buildLinhaInsumo));
      applyToolbarFilters('insumos');
    })
    .catch((err) => {
      const msg = err.message || 'Erro ao carregar insumos.';
      setTableBody('insumos', [], msg);
      console.error('[insumos]', err);
    });
}

window.editarInsumo = function(id) {
  const insumo = (window.__insumos || []).find((item) => item.id === id);
  const form = document.getElementById('addInsumoForm');
  if (!insumo || !form) return;

  form.querySelector('[name="id"]').value = insumo.id;
  form.querySelector('[name="nome"]').value = insumo.nome || '';
  form.querySelector('[name="unidade"]').value = insumo.unidade || 'kg';
  form.querySelector('[name="quantidadeAtual"]').value = insumo.quantidadeAtual || '';
  form.querySelector('[name="quantidadeMinima"]').value = insumo.quantidadeMinima || '';
  form.querySelector('[name="custoUnitario"]').value = insumo.custoUnitario
    ? formatCurrencyInput(floatToInputDigits(insumo.custoUnitario)) : '';
  const header = document.querySelector('#addInsumoModal .modal-header');
  if (header) header.textContent = 'Editar Insumo';
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.textContent = 'Atualizar';
  window.openModal('addInsumoModal');
};

window.excluirInsumo = async function(id, nome) {
  const ok = await showConfirmModal('Excluir insumo?', `Deseja excluir <strong>${nome}</strong>?`);
  if (!ok) return;
  deleteJson(`/insumos/${id}`)
    .then(() => { showToast('Insumo excluído.', 'success'); carregarInsumos(); })
    .catch((err) => showToast(err.message || 'Erro ao excluir insumo.'));
};

(function initInsumoForm() {
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('addInsumoForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validateForm(form)) return;

      const fd = new FormData(form);
      const id = fd.get('id') ? Number(fd.get('id')) : null;
      const payload = {
        nome: fd.get('nome'),
        unidade: fd.get('unidade'),
        quantidadeAtual: Number(fd.get('quantidadeAtual')),
        quantidadeMinima: Number(fd.get('quantidadeMinima')),
        custoUnitario: parseCurrencyValue(fd.get('custoUnitario')) ?? Number(fd.get('custoUnitario'))
      };

      try {
        if (id) {
          await putJson(`/insumos/${id}`, payload);
          showToast('Insumo atualizado!', 'success');
        } else {
          await postJson('/insumos', payload);
          showToast('Insumo cadastrado!', 'success');
        }
        closeModal('addInsumoModal');
        form.reset();
        form.querySelector('[name="id"]').value = '';
        const header = document.querySelector('#addInsumoModal .modal-header');
        if (header) header.textContent = 'Novo Insumo';
        const submit = form.querySelector('button[type="submit"]');
        if (submit) submit.textContent = 'Cadastrar';
        carregarInsumos();
      } catch (err) {
        showToast(err.message || 'Erro ao salvar insumo.');
      }
    }, true);
  });
})();

// =============================================
// CHARTS - dados reais da API
// =============================================

const CHART_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#7c3aed'];

const chartBaseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
      labels: { font: { family: '"Inter", sans-serif', size: 12 }, color: '#64748b', padding: 20, usePointStyle: true }
    },
    tooltip: {
      backgroundColor: '#0f172a',
      padding: 10,
      titleFont: { family: '"Inter", sans-serif', size: 12, weight: '700' },
      bodyFont: { family: '"Inter", sans-serif', size: 12 },
      callbacks: {
        label: (context) => {
          const label = context.dataset.label ? `${context.dataset.label}: ` : '';
          return `${label}${context.formattedValue}`;
        }
      }
    }
  },
  scales: {
    x: { grid: { color: '#e2e8f0' }, ticks: { color: '#64748b', font: { size: 12 }, maxRotation: 0 } },
    y: { grid: { color: '#e2e8f0' }, ticks: { color: '#64748b', font: { size: 12 }, precision: 0 } }
  }
};

function currencyTooltipOptions() {
  return {
    ...chartBaseOptions,
    plugins: {
      ...chartBaseOptions.plugins,
      tooltip: {
        ...chartBaseOptions.plugins.tooltip,
        callbacks: {
          label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`
        }
      }
    }
  };
}

function horizontalBarOptions(unitLabel) {
  return {
    ...chartBaseOptions,
    indexAxis: 'y',
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: '#e2e8f0' },
        ticks: { color: '#64748b', font: { size: 12 }, precision: 0 }
      },
      y: {
        grid: { display: false },
        ticks: { color: '#334155', font: { size: 12, weight: '600' } }
      }
    },
    plugins: {
      ...chartBaseOptions.plugins,
      tooltip: {
        ...chartBaseOptions.plugins.tooltip,
        callbacks: {
          label: (context) => `${context.parsed.x} ${unitLabel}`
        }
      }
    }
  };
}

function hasChartLibrary() { return typeof Chart !== 'undefined'; }

// Instâncias dos charts (para destruir antes de recriar)
const _charts = {};

function destroyChart(id) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
}

function renderSalesChart(timeline, canvasId = 'salesChart') {
  if (!hasChartLibrary()) return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  destroyChart(canvasId);

  const labels = timeline.map((t) => t.label);
  const data   = timeline.map((t) => Number(t.valor || 0));

  _charts[canvasId] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Vendas (R$)',
        data,
        backgroundColor: '#2563eb',
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 26
      }]
    },
    options: currencyTooltipOptions()
  });
}

function renderTableOccupancyChart(mesas) {
  if (!hasChartLibrary()) return;
  const canvas = document.getElementById('tablesOccupancyChart');
  if (!canvas) return;
  destroyChart('tablesOccupancyChart');

  const counts = (mesas || []).reduce((acc, mesa) => {
    const status = apiStatusToUiStatus(mesa.status);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, { disponivel: 0, reservada: 0, ocupada: 0, manutencao: 0 });

  _charts['tablesOccupancyChart'] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Disponíveis', 'Reservadas', 'Ocupadas', 'Manutenção'],
      datasets: [{
        label: 'Mesas',
        data: [counts.disponivel, counts.reservada, counts.ocupada, counts.manutencao],
        backgroundColor: ['#10b981', '#f59e0b', '#2563eb', '#ef4444'],
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 28
      }]
    },
    options: horizontalBarOptions('mesas')
  });
}

function renderOrdersChart(statusData) {
  if (!hasChartLibrary()) return;
  const canvas = document.getElementById('ordersChart');
  if (!canvas) return;
  destroyChart('ordersChart');

  _charts['ordersChart'] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Entregues', 'Em andamento', 'Cancelados'],
      datasets: [{
        label: 'Pedidos',
        data: [Number(statusData.entregues || 0), Number(statusData.emPreparo || 0), Number(statusData.cancelados || 0)],
        backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 30
      }]
    },
    options: horizontalBarOptions('pedidos')
  });
}

function renderTopDishesChart(topProdutos) {
  if (!hasChartLibrary()) return;
  const canvas = document.getElementById('topDishesChart');
  if (!canvas) return;
  destroyChart('topDishesChart');

  const top5 = topProdutos.slice(0, 5);
  _charts['topDishesChart'] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: top5.map((p) => p.nome),
      datasets: [{
        label: 'Quantidade Vendida',
        data: top5.map((p) => Number(p.quantidadeVendida || 0)),
        backgroundColor: CHART_COLORS,
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 28
      }]
    },
    options: horizontalBarOptions('vendidos')
  });
}

function renderProfitChart(faturamento, custo) {
  if (!hasChartLibrary()) return;
  const canvas = document.getElementById('profitChart');
  if (!canvas) return;
  destroyChart('profitChart');

  const fat    = Number(faturamento || 0);
  const cst    = Number(custo || 0);
  const lucro  = Math.max(0, fat - cst);

  _charts['profitChart'] = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Lucro', 'Custo estimado'],
      datasets: [{
        data: cst > 0 ? [lucro, cst] : [fat, 0],
        backgroundColor: ['#10b981', '#f85b15'],
        borderColor: '#fff',
        borderWidth: 2
      }]
    },
    options: {
      ...chartBaseOptions,
      plugins: { ...chartBaseOptions.plugins, legend: { position: 'bottom', labels: { font: { family: '"Inter", sans-serif', size: 12 }, color: '#64748b', padding: 16, usePointStyle: true } } }
    }
  });
}

// Inicializa charts vazios - serão preenchidos pelas chamadas de API
window.addEventListener('load', () => {
  if (!hasChartLibrary()) return;
  // não renderiza placeholder; aguarda dados reais
});

// =============================================
// CONFIG INTEGRACAO - localStorage
// =============================================
const INTEGRACAO_KEY    = 'dataplate:integracao';
const NOTIFICACOES_KEY  = 'dataplate:notificacoes';

function carregarIntegracao() {
  const saved = JSON.parse(localStorage.getItem(INTEGRACAO_KEY) || '{}');
  const form  = document.getElementById('formIntegracao');
  if (!form) return;
  Object.entries(saved).forEach(([k, v]) => {
    const el = form.querySelector(`[name="${k}"]`);
    if (el) el.value = v;
  });
}

function carregarNotificacoes() {
  const saved = JSON.parse(localStorage.getItem(NOTIFICACOES_KEY) || '{}');
  const form  = document.getElementById('formNotificacoes');
  if (!form) return;
  form.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    if (cb.name in saved) cb.checked = saved[cb.name];
  });
}

(function initPreferencias() {
  document.addEventListener('DOMContentLoaded', () => {
    carregarIntegracao();
    carregarNotificacoes();

    document.getElementById('formIntegracao')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {};
      fd.forEach((v, k) => { if (v) data[k] = v; });
      localStorage.setItem(INTEGRACAO_KEY, JSON.stringify(data));
      showSuccessModal('Integrações salvas!', 'As configurações foram salvas localmente.');
    });

    document.getElementById('formNotificacoes')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = {};
      e.target.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        data[cb.name] = cb.checked;
      });
      localStorage.setItem(NOTIFICACOES_KEY, JSON.stringify(data));
      showSuccessModal('Preferências salvas!', 'Suas configurações de notificação foram atualizadas.');
    });
  });
})();

// Alerta de estoque baixo no dashboard
function verificarEstoqueBaixo() {
  const prefs = JSON.parse(localStorage.getItem(NOTIFICACOES_KEY) || '{}');
  if (prefs.alertaEstoqueBaixo === false) return;

  getJson('/insumos')
    .then((insumos) => {
      const criticos = (insumos || []).filter((i) => Number(i.quantidadeAtual) <= Number(i.quantidadeMinima));
      if (!criticos.length) return;
      showToast(`Estoque baixo: ${criticos.length} insumo(s) abaixo do mínimo. Verifique a tela de Insumos.`, 'error');
    })
    .catch(() => {});
}

// =============================================
// CONFIG RESTAURANTE
// =============================================

function carregarConfiguracaoRestaurante() {
  getJson('/restaurante')
    .then((data) => {
      const form = document.getElementById('formConfigRestaurante');
      if (!form) return;
      const set = (name, val) => { const el = form.querySelector(`[name="${name}"]`); if (el && val != null) el.value = val; };
      set('nomeRestaurante', data.nome);
      set('cnpjRestaurante', data.cnpj);
      set('telefoneRestaurante', data.telefone);
      set('enderecoRestaurante', data.endereco);
      set('emailRestaurante', data.email);
    })
    .catch((err) => console.error('[config-restaurante load]', err));
}

(function initConfigRestaurante() {
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('formConfigRestaurante');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = {
        nome: fd.get('nomeRestaurante') || '',
        cnpj: fd.get('cnpjRestaurante') || '',
        telefone: fd.get('telefoneRestaurante') || '',
        endereco: fd.get('enderecoRestaurante') || '',
        email: fd.get('emailRestaurante') || ''
      };
      try {
        await putJson('/restaurante', payload);
        showSuccessModal('Configurações salvas!', 'As informações do restaurante foram atualizadas com sucesso.');
      } catch (err) {
        showToast(err.message || 'Erro ao salvar configurações.', 'error');
      }
    });
  });
})();

// =============================================
// CONFIG USUARIOS - CRUD completo
// =============================================

function buildLinhaUsuario(u) {
  const roleLabel = { ADMIN: 'Administrador', FUNCIONARIO: 'Operacional', COZINHA: 'Cozinha' };
  const roleClass = { ADMIN: 'badge-info', FUNCIONARIO: 'badge-active', COZINHA: 'badge-warning' };
  return `<tr>
    <td><strong>${escapeHtml(u.nome)}</strong></td>
    <td>${escapeHtml(u.cpf || '-')}</td>
    <td><span class="badge ${roleClass[u.role] || 'badge-active'}">${roleLabel[u.role] || u.role || '-'}</span></td>
    <td>${u.role === 'ADMIN' ? 'Todos os módulos' : u.role === 'COZINHA' ? 'Cozinha' : 'Operações'}</td>
    <td><span class="badge badge-active">Ativo</span></td>
    <td>-</td>
    <td>
      <button class="btn-icon btn-icon-edit" title="Editar" onclick="editarUsuario(${u.id})"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5l2 2L5 13l-2.5.5.5-2.5z"/></svg></button>
      <button class="btn-icon btn-icon-delete" title="Excluir" onclick="excluirUsuario(${u.id}, '${escapeHtml(u.nome)}')"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 4 14 4"/><path d="M5 4V2h6v2"/><path d="M13 4l-1 10H4L3 4"/><line x1="6" y1="7" x2="6" y2="11"/><line x1="10" y1="7" x2="10" y2="11"/></svg></button>
    </td>
  </tr>`;
}

function carregarUsuarios() {
  showTableSkeleton('config-usuarios');
  getJson('/usuarios')
    .then((list) => setTableBody('config-usuarios', (list || []).map(buildLinhaUsuario)))
    .catch((err) => {
      const msg = err.message || 'Erro ao carregar usuários.';
      setTableBody('config-usuarios', [], msg);
      console.error('[usuarios]', err);
    });
}

window.__usuarioEditando = null;

window.editarUsuario = function(id) {
  getJson('/usuarios')
    .then((list) => {
      const u = (list || []).find((item) => item.id === id);
      if (!u) return;
      window.__usuarioEditando = u;
      const form = document.getElementById('addUserForm');
      if (!form) return;
      form.querySelector('[name="id"]')?.setAttribute('value', u.id);
      form.querySelector('[name="name"]').value = u.nome || '';
      form.querySelector('[name="cpf"]').value = u.cpf || '';
      const accessTypeMap = { ADMIN: 'Administrador', FUNCIONARIO: 'Operacional', COZINHA: 'Cozinha' };
      const sel = form.querySelector('[name="accessType"]');
      if (sel) sel.value = accessTypeMap[u.role] || 'Operacional';
      const pwField = form.querySelector('[name="temporaryPassword"]');
      if (pwField) { pwField.required = false; pwField.placeholder = 'Deixe em branco para manter'; }
      const header = document.querySelector('#addUserModal .modal-header');
      if (header) header.textContent = 'Editar Usuário';
      const submit = form.querySelector('button[type="submit"]');
      if (submit) submit.textContent = 'Atualizar';
      window.openModal('addUserModal');
    })
    .catch((err) => showToast(err.message || 'Erro ao carregar usuário.'));
};

window.excluirUsuario = async function(id, nome) {
  const ok = await showConfirmModal('Excluir usuário?', `Deseja excluir o usuário <strong>${nome}</strong>?`);
  if (!ok) return;
  deleteJson(`/usuarios/${id}`)
    .then(() => { showToast('Usuário excluído.', 'success'); carregarUsuarios(); })
    .catch((err) => showToast(err.message || 'Erro ao excluir usuário.'));
};

// Sobrescreve o submit do addUserForm para suportar edição
(function patchUserForm() {
  document.addEventListener('DOMContentLoaded', () => {
    const originalHandler = document.getElementById('addUserForm')?._submitHandler;
    const form = document.getElementById('addUserForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!validateForm(e.target)) return;

      const fd = new FormData(form);
      const idField = form.querySelector('[name="id"]');
      const editingId = idField?.value ? Number(idField.value) : null;
      const accessTypeMap = { 'Administrador': 'ADMIN', 'Gerente': 'ADMIN', 'Operacional': 'FUNCIONARIO', 'Cozinha': 'COZINHA', 'Visualização': 'FUNCIONARIO' };
      const role = accessTypeMap[fd.get('accessType')] || 'FUNCIONARIO';

      if (editingId) {
        // PUT - editar
        const payload = { nome: fd.get('name'), cpf: fd.get('cpf'), role };
        putJson(`/usuarios/${editingId}`, payload)
          .then(() => {
            showToast('Usuário atualizado!', 'success');
            closeModal('addUserModal');
            form.reset();
            if (idField) idField.value = '';
            window.__usuarioEditando = null;
            const pwField = form.querySelector('[name="temporaryPassword"]');
            if (pwField) { pwField.required = true; pwField.placeholder = 'Senha temporária'; }
            const header = document.querySelector('#addUserModal .modal-header');
            if (header) header.textContent = 'Novo Usuário';
            const submit = form.querySelector('button[type="submit"]');
            if (submit) submit.textContent = 'Cadastrar';
            carregarUsuarios();
          })
          .catch((err) => showToast(err.message || 'Erro ao atualizar usuário.'));
      } else {
        // POST - criar
        const payload = { nome: fd.get('name'), cpf: fd.get('cpf'), senha: fd.get('temporaryPassword'), role };
        postJson('/auth/register', payload)
          .then(() => {
            showToast('Usuário criado!', 'success');
            closeModal('addUserModal');
            form.reset();
            carregarUsuarios();
          })
          .catch((err) => showToast(err.message || 'Erro ao criar usuário.'));
      }
    }, true); // captura antes do handler original
  });
})();
