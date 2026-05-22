/**
 * ADMIN PANEL - Navigation and Modal Management
 */

const API_BASE_URL = window.DATAPLATE_API_BASE_URL
  || localStorage.getItem('DATAPLATE_API_BASE_URL')
  || (() => {
    const h = window.location.hostname;
    const isLocal = h === 'localhost' || h === '127.0.0.1';
    if (isLocal && window.location.port === '8080') return '/api';
    if (isLocal) return `http://${h}:8080/api`;
    return 'https://dataplate.onrender.com/api';
  })();

const ADMIN_SESSION_KEY = 'dataplate:adminSession';
const isAdminPanelPage = /adm\.html(?:$|[?#])/.test(window.location.href);
const ADMIN_PANEL_USERS = {
  gerente: {
    name: 'Gerente Principal',
    initials: 'GP',
    email: 'gerente@dataplate.com',
    role: 'Administrador'
  },
  atendente: {
    name: 'Atendente',
    initials: 'AT',
    email: 'atendente@dataplate.com',
    role: 'Operacional'
  },
  cozinha: {
    name: 'Cozinha',
    initials: 'CZ',
    email: 'cozinha@dataplate.com',
    role: 'Pedidos e preparo'
  }
};

if (isAdminPanelPage && !localStorage.getItem(ADMIN_SESSION_KEY)) {
  window.location.replace('adm-login.html');
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
  return fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: { ...(options.headers || {}) }
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

function readAdminSession() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY) || 'null');
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
  const headerName = document.querySelector('.user-button span');
  const headerAvatar = document.querySelector('.user-button .user-avatar-small');
  const profileName = document.querySelector('#profileModal input[name="name"]');
  const profileEmail = document.querySelector('#profileModal input[name="email"]');
  const profileRole = document.querySelector('#profileModal input[name="role"]');
  const profileSummaryName = document.querySelector('#profileModal .profile-summary strong');
  const profileSummaryEmail = document.querySelector('#profileModal .profile-summary span');
  const profileAvatar = document.querySelector('#profileModal .user-avatar-large');
  const switchUserOption = document.querySelector(`#switchUserForm input[name="user"][value="${userKey}"]`);

  if (headerName) headerName.textContent = normalizedSession.name || 'Gerente Principal';
  if (headerAvatar) headerAvatar.textContent = normalizedSession.initials || 'AD';
  if (profileName) profileName.value = normalizedSession.name || 'Administrador';
  if (profileEmail) profileEmail.value = normalizedSession.email || '';
  if (profileRole) profileRole.value = normalizedSession.role || 'Administrador';
  if (profileSummaryName) profileSummaryName.textContent = normalizedSession.name || 'Administrador';
  if (profileSummaryEmail) profileSummaryEmail.textContent = normalizedSession.email || '';
  if (profileAvatar) profileAvatar.textContent = normalizedSession.initials || 'AD';
  if (switchUserOption) switchUserOption.checked = true;
  if (isLegacyCashier || session.userKey !== userKey) {
    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(normalizedSession));
  }
}

window.logoutAdmin = function() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
  window.location.href = 'adm-login.html';
};

async function postJson(endpoint, payload) {
  const response = await apiFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await readResponseBody(response);
    throw new Error(extractErrorMessage(body, 'Nao foi possivel salvar os dados.'));
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
    throw new Error(extractErrorMessage(body, 'Nao foi possivel atualizar.'));
  }
  return readResponseBody(response);
}

async function getJson(endpoint) {
  const response = await apiFetch(endpoint);
  if (!response.ok) {
    const body = await readResponseBody(response);
    throw new Error(extractErrorMessage(body, 'Erro ao carregar dados.'));
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

  // Hide logo and intro text when navigating to a section
  const logoCenter = document.querySelector('.logocenter');
  const nomeCenter = document.querySelector('.nomecenter');
  const textCenter = document.getElementById('textcenter');
  const searchInput = document.querySelector('.pesquisa');
  
  if (selectedSection && sectionId !== 'dashboard') {
    if (logoCenter) logoCenter.style.display = 'none';
    if (nomeCenter) nomeCenter.style.display = 'none';
    if (textCenter) textCenter.style.display = 'none';
    if (searchInput) searchInput.style.display = 'none';
  } else {
    if (logoCenter) logoCenter.style.display = 'block';
    if (nomeCenter) nomeCenter.style.display = 'block';
    if (textCenter) textCenter.style.display = 'block';
    if (searchInput) searchInput.style.display = 'block';
  }

  // Update active nav buttons
  document.querySelectorAll('.nav-button').forEach(btn => {
    btn.classList.remove('active');
  });

  // Mark current button as active
  const activeBtn = document.querySelector(`[onclick*="${sectionId}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  // Persist section in URL hash so F5 restores it
  history.replaceState(null, '', sectionId && sectionId !== 'dashboard'
    ? '#' + sectionId
    : location.pathname
  );

  // Load data for the section being shown
  const sectionLoaders = {
    clientes:       carregarClientes,
    funcionarios:   carregarFuncionarios,
    fornecedores:   carregarFornecedores,
    cardapio:       carregarProdutos,
    pedidos:        carregarPedidos,
    mesas:          carregarMesas,
    cozinha:        carregarCozinha,
    'config-usuarios': carregarUsuarios
  };
  if (sectionLoaders[sectionId]) sectionLoaders[sectionId]();
}
window.navigateTo = navigateTo;

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

// Close modal when clicking outside
document.addEventListener('click', (e) => {
  const modalTrigger = e.target.closest('[data-open-modal]');
  if (modalTrigger) {
    e.preventDefault();
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
  const codeInput = e.target.querySelector('[name="codigo"]');
  const fd = new FormData(e.target);
  const telefones = [fd.get('phone'), fd.get('phone2')].filter(Boolean).join(' / ');
  const documento = fd.get('cpf') || fd.get('cnpj');
  const endereco = [
    fd.get('address'),
    fd.get('num') && `Nº ${fd.get('num')}`,
    fd.get('complemento'),
    fd.get('bairro') && `Bairro ${fd.get('bairro')}`,
    [fd.get('cidade'), fd.get('uf')].filter(Boolean).join(' - '),
    fd.get('cep') && `CEP ${fd.get('cep')}`
  ]
    .filter(Boolean)
    .join(', ');
  const payload = { codigo: codeInput?.value || null, nome: fd.get('name'), cpf: documento, email: fd.get('email'), telefone: telefones, endereco };
  postJson('/clientes', payload)
    .then((cliente) => {
      showToast(`Cliente adicionado com sucesso! Codigo: ${codeInput?.value || '-'}`, 'success');
      closeModal('addClientModal');
      e.target.reset();
      configureClientPersonType(e.target);
      adicionarLinhaCliente(cliente);
    })
    .catch((err) => showToast(err.message || 'Erro ao salvar cliente.'));
});

// Add Employee Modal
document.getElementById('addFunctForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm(e.target)) return;
  const codeInput = e.target.querySelector('[name="codigo"]');
  const fd = new FormData(e.target);
  const payload = { codigo: codeInput?.value || null, nome: fd.get('name'), cpf: fd.get('cpf'), telefone: fd.get('phone'), cargo: fd.get('role'), salario: Number(fd.get('salary')) || null };
  postJson('/funcionarios', payload)
    .then((func) => {
      showToast(`Funcionario adicionado com sucesso! Codigo: ${codeInput?.value || '-'}`, 'success');
      closeModal('addFunctModal');
      e.target.reset();
      adicionarLinhaFuncionario(func);
    })
    .catch((err) => showToast(err.message || 'Erro ao salvar funcionario.'));
});

// Add Supplier Modal
document.getElementById('addSupplierForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm(e.target)) return;
  const codeInput = e.target.querySelector('[name="codigo"]');
  const fd = new FormData(e.target);
  const telefones = [fd.get('phone'), fd.get('phone2')].filter(Boolean).join(' / ');
  const payload = { codigo: codeInput?.value || null, razaoSocial: fd.get('company'), cnpj: fd.get('cnpj'), especialidade: fd.get('specialty'), telefone: telefones, email: fd.get('email') };
  postJson('/fornecedores', payload)
    .then((forn) => {
      showToast(`Fornecedor adicionado com sucesso! Codigo: ${codeInput?.value || '-'}`, 'success');
      closeModal('addSupplierModal');
      e.target.reset();
      adicionarLinhaFornecedor(forn);
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
    alert('Essa categoria ja existe.');
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

document.querySelector('.category-remove-button')?.addEventListener('click', () => {
  const form = document.getElementById('addDishForm');
  const categorySelect = form?.querySelector('[name="category"]');
  const selectedOption = categorySelect?.selectedOptions[0];

  if (!categorySelect || !selectedOption) return;

  const categoryName = selectedOption.textContent.trim();
  const shouldRemove = confirm(`Remover a categoria "${categoryName}"?`);

  if (!shouldRemove) return;

  selectedOption.remove();

  if (categorySelect.options.length > 0) {
    categorySelect.selectedIndex = 0;
  }
});

document.getElementById('addDishForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm(e.target)) return;
  const formData = new FormData(e.target);

  const produto = {
    codigo: formData.get('codigo') || null,
    nome: formData.get('name'),
    idCategoria: Number(formData.get('category')),
    preco: Number(formData.get('price')),
    descricao: formData.get('description'),
    tempoPreparo: Number(formData.get('prepTime')) || null,
    ativo: formData.get('available') === 'on',
    destaque: formData.get('featured') === 'on'
  };

  postJson('/produtos', produto)
    .then((produtoSalvo) => {
      showToast('Prato adicionado com sucesso!', 'success');
      closeModal('addDishModal');
      e.target.reset();
      adicionarLinhaProduto(produtoSalvo);
    })
    .catch((error) => {
      console.error('Erro ao salvar prato:', error);
      showToast(error.message || 'Erro ao salvar prato.');
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
    email: fd.get('email'),
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
    .catch((err) => showToast(err.message || 'Erro ao criar usuario.'));
});

// Table Control
const TABLES_STORAGE_KEY = 'dataplate:adminTables';
let selectedTableId = null;

const tableStatusMeta = {
  disponivel: { label: 'Disponível', badge: 'badge-active', cardClass: 'status-disponivel' },
  reservada: { label: 'Reservada', badge: 'badge-warning', cardClass: 'status-reservada' },
  ocupada: { label: 'Ocupada', badge: 'badge-info', cardClass: 'status-ocupada' },
  manutencao: { label: 'Manutenção', badge: 'badge-danger', cardClass: 'status-manutencao' }
};

function toDateTimeLocal(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
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
    { id: 8, number: 8, seats: 4, area: 'Área externa', reference: 'Guarda-sol 2', status: 'disponivel', reservationName: '', reservationPhone: '', reservationDate: '', notes: 'Pet friendly' },
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
  const status = document.getElementById('tableStatusFilter')?.value || 'todos';
  const area = document.getElementById('tableAreaFilter')?.value || 'todas';

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
    const matchesStatus = status === 'todos' || table.status === status;
    const matchesArea = area === 'todas' || table.area === area;
    return matchesSearch && matchesStatus && matchesArea;
  });
}

function renderTableAreaFilter(tables) {
  const select = document.getElementById('tableAreaFilter');
  if (!select) return;

  const current = select.value || 'todas';
  const areas = Array.from(new Set(tables.map((table) => table.area).filter(Boolean))).sort();
  select.innerHTML = '<option value="todas">Todas as áreas</option>' + areas
    .map((area) => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`)
    .join('');
  select.value = areas.includes(current) ? current : 'todas';
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
    <button class="btn-icon" title="Excluir" onclick="deleteTable(${table.id})">🗑</button>
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
  return `
    <article class="table-card ${meta.cardClass} ${activeClass}" onclick="selectTable(${table.id})">
      <div class="table-card-header">
        <div class="table-card-number">Mesa ${escapeHtml(table.number)}</div>
        ${buildStatusBadge(table.status)}
      </div>
      <div class="table-card-meta">
        <span>${escapeHtml(table.seats)} lugares</span>
        <span>${escapeHtml(table.area || '-')}</span>
        <span>${escapeHtml(table.reference || 'Sem referência')}</span>
        <span>${table.status === 'reservada' ? escapeHtml(table.reservationName || 'Reserva sem nome') : '&nbsp;'}</span>
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
    </div>
  `;
}

function renderTables() {
  const tables = getTables().sort((a, b) => Number(a.number) - Number(b.number));
  renderTableAreaFilter(tables);
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
  updateTableReservationFields();
}

function validateTableForm(form) {
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
  if (!form.querySelector('[name="reservationDate"]').value) {
    form.querySelector('[name="reservationDate"]').value = nextReservationSlot();
  }
  updateTableReservationFields();
};

window.occupyTable = function(tableId) {
  const tables = getTables();
  const table = tables.find((item) => item.id === tableId);
  if (!table) return;
  table.status = 'ocupada';
  saveTables(tables);
  showToast(`Mesa ${table.number} marcada como ocupada.`, 'success');
  renderTables();
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
  showToast(`Mesa ${table.number} liberada.`, 'success');
  renderTables();
};

window.deleteTable = function(tableId) {
  const tables = getTables();
  const table = tables.find((item) => item.id === tableId);
  if (!table || !confirm(`Excluir a Mesa ${table.number}?`)) return;
  const nextTables = tables.filter((item) => item.id !== tableId);
  if (selectedTableId === tableId) selectedTableId = null;
  saveTables(nextTables);
  showToast(`Mesa ${table.number} excluída.`, 'success');
  renderTables();
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

  const tables = getTables();
  const index = tables.findIndex((item) => item.id === id);
  if (index >= 0) {
    tables[index] = table;
  } else {
    tables.push(table);
  }

  saveTables(tables);
  selectedTableId = id;
  closeModal('tableModal');
  showToast(`Mesa ${table.number} salva com sucesso!`, 'success');
  renderTables();
});

document.getElementById('tableForm')?.querySelector('[name="status"]')?.addEventListener('change', updateTableReservationFields);
document.getElementById('tableSearch')?.addEventListener('input', renderTables);
document.getElementById('tableStatusFilter')?.addEventListener('change', renderTables);
document.getElementById('tableAreaFilter')?.addEventListener('change', renderTables);
document.getElementById('clearTableFilters')?.addEventListener('click', () => {
  const search = document.getElementById('tableSearch');
  const status = document.getElementById('tableStatusFilter');
  const area = document.getElementById('tableAreaFilter');
  if (search) search.value = '';
  if (status) status.value = 'todos';
  if (area) area.value = 'todas';
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

  alert('Perfil atualizado com sucesso!');
  closeModal('profileModal');
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
  alert('Configurações de segurança atualizadas!');
  closeModal('securityModal');
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
    email: '',
    role: selectedOption?.querySelector('small')?.textContent || 'Administrador'
  };
  const currentSession = readAdminSession() || {};

  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
    ...currentSession,
    ...user,
    userKey,
    switchedAt: new Date().toISOString()
  }));

  applyAdminSession();

  closeModal('switchUserModal');
});

// =============================================
// KITCHEN BOARD STATUS UPDATES
// =============================================

window.alterarStatusPedido = function(pedidoId, novoStatus) {
  putJson(`/pedidos/${pedidoId}/status`, { status: novoStatus })
    .then(() => {
      showToast('Status atualizado com sucesso!', 'success');
      carregarCozinha();
    })
    .catch((err) => showToast(err.message || 'Erro ao atualizar status.'));
};

// =============================================
// SEARCH & FILTER FUNCTIONALITY
// =============================================

function searchTable(inputSelector, tableSelector) {
  const searchInput = document.querySelector(inputSelector);
  if (!searchInput) return;

  searchInput.addEventListener('keyup', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const table = document.querySelector(tableSelector);
    const rows = table.querySelectorAll('tbody tr');

    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
  });
}

// Initialize search for all tables
searchTable('#searchClientes', '#clientesTable');
searchTable('#searchFuncionarios', '#funcionariosTable');
searchTable('#searchFornecedores', '#fornecedoresTable');
searchTable('#searchCardapio', '#cardapioTable');
searchTable('#searchPedidos', '#pedidosTable');
searchTable('#searchEntregas', '#entregasTable');

// =============================================
// FILTER FUNCTIONALITY
// =============================================

function filterByStatus(selectSelector, tableSelector, columnIndex) {
  const selectElement = document.querySelector(selectSelector);
  if (!selectElement) return;

  selectElement.addEventListener('change', (e) => {
    const selectedStatus = e.target.value;
    const table = document.querySelector(tableSelector);
    const rows = table.querySelectorAll('tbody tr');

    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      const statusCell = cells[columnIndex];
      
      if (!statusCell) return;
      
      const status = statusCell.textContent.toLowerCase().trim();
      const shouldShow = selectedStatus === 'todos' || status.includes(selectedStatus);
      row.style.display = shouldShow ? '' : 'none';
    });
  });
}

// Initialize filters
filterByStatus('#statusFilterClientes', '#clientesTable', 7);
filterByStatus('#statusFilterPedidos', '#pedidosTable', 5);
filterByStatus('#statusFilterEntregas', '#entregasTable', 4);

// =============================================
// EXPORT FUNCTIONALITY
// =============================================

window.exportTable = function() {
  alert('Exportando dados...');
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

  if (/exportar|pdf|excel|relat/i.test(label)) {
    e.preventDefault();
    window.exportTable();
    return;
  }

  if (/salvar/i.test(label)) {
    const configForm = button.closest('.config-form');
    if (configForm) {
      e.preventDefault();
      if (!validateContainer(configForm)) return;
      alert('Alterações salvas com sucesso!');
      return;
    }
  }

  if (/editar|excluir|detalhes|imprimir|permiss|hist[oó]rico|contato|desativar|ajustar|configurar|reativar|senha|acelerar|atualizar|cancelar|ver pedidos|ver expediente/i.test(label)) {
    e.preventDefault();
    alert(`${label} selecionado.`);
  }
});

document.addEventListener('submit', (e) => {
  if (e.defaultPrevented) return;

  e.preventDefault();
  const form = e.target;
  if (!validateForm(form)) return;
  const modal = form.closest('.modal');

  if (modal) {
    alert('Cadastro salvo com sucesso!');
    window.closeModal(modal.id);
    form.reset();
    return;
  }

  alert('Alterações salvas com sucesso!');
});

function exportTableToCSV(buttonSelector, fileName) {
  const button = document.querySelector(buttonSelector);
  if (!button) return;

  button.addEventListener('click', (e) => {
    // TODO: Implement CSV export
    console.log('Export to CSV:', fileName);
    alert(`Exportando dados para ${fileName}...`);
  });
}

// Initialize exports
exportTableToCSV('#exportClientes', 'clientes.csv');
exportTableToCSV('#exportPedidos', 'pedidos.csv');

// =============================================
// WEBSOCKET
// =============================================

let adminSocket = null;
let websocketRetryTimer = null;
let websocketRetryDelay = 1000;

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

      if (payload?.type === 'PEDIDO_ATUALIZADO' || payload?.type === 'NOVO_PEDIDO') {
        carregarPedidos();
        carregarCozinha();
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
  // Restore last section from URL hash (F5 persistence)
  const initialSection = window.location.hash.slice(1);
  navigateTo(initialSection || 'dashboard');
  applyAdminSession();
  initClientForm();
  initCepAutocomplete();

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
}

function buildLinhaCliente(c) {
  return `<tr>
    <td><input type="checkbox" /></td>
    <td><strong>${displayCode(c, 'CLI')}</strong></td>
    <td><strong>${c.nome}</strong></td>
    <td>${c.email || '-'}</td>
    <td>${c.telefone || '-'}</td>
    <td>-</td><td>-</td>
    <td><span class="badge badge-active">${c.ativo ? 'Ativo' : 'Inativo'}</span></td>
    <td>${formatDate(c.criadoEm)}</td>
    <td><button class="btn-icon" title="Editar">✏️</button></td>
  </tr>`;
}

function carregarClientes() {
  showTableSkeleton('clientes');
  getJson('/clientes')
    .then(list => setTableBody('clientes', list.map(buildLinhaCliente)))
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
}

function buildLinhaFuncionario(f) {
  return `<tr>
    <td><strong>${displayCode(f, 'FUN')}</strong></td>
    <td><strong>${f.nome}</strong></td>
    <td><span class="badge badge-info">${f.cargo}</span></td>
    <td>${f.telefone || '-'}</td>
    <td>${f.salario ? formatCurrency(f.salario) : '-'}</td>
    <td><span class="badge badge-active">${f.ativo ? 'Ativo' : 'Inativo'}</span></td>
    <td>${formatDate(f.criadoEm)}</td>
    <td><button class="btn-icon" title="Editar">✏️</button></td>
  </tr>`;
}

function carregarFuncionarios() {
  showTableSkeleton('funcionarios');
  getJson('/funcionarios')
    .then(list => setTableBody('funcionarios', list.map(buildLinhaFuncionario)))
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
}

function buildLinhaFornecedor(f) {
  return `<tr>
    <td><strong>${displayCode(f, 'FOR')}</strong></td>
    <td><strong>${f.razaoSocial}</strong></td>
    <td>${f.telefone || '-'}</td>
    <td>${f.email || '-'}</td>
    <td>-</td>
    <td><span class="badge badge-active">${f.ativo ? 'Ativo' : 'Inativo'}</span></td>
    <td>${formatDate(f.criadoEm)}</td>
    <td><button class="btn-icon" title="Editar">✏️</button></td>
  </tr>`;
}

function carregarFornecedores() {
  showTableSkeleton('fornecedores');
  getJson('/fornecedores')
    .then(list => setTableBody('fornecedores', list.map(buildLinhaFornecedor)))
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
}

function buildLinhaProduto(p) {
  return `<tr>
    <td><strong>${displayCode(p, 'PRO')}</strong></td>
    <td><strong>${p.nome}</strong></td>
    <td>${p.idCategoria || '-'}</td>
    <td>${formatCurrency(p.preco)}</td>
    <td>${p.tempoPreparo ? `${p.tempoPreparo} min` : '-'}</td>
    <td><span class="badge ${p.destaque ? 'badge-info' : 'badge-warning'}">${p.destaque ? 'Sim' : 'Não'}</span></td>
    <td><span class="badge badge-active">${p.ativo !== false ? 'Sim' : 'Não'}</span></td>
    <td>${formatDate(p.criadoEm)}</td>
    <td><button class="btn-icon" title="Editar">✏️</button></td>
  </tr>`;
}

function carregarProdutos() {
  showTableSkeleton('cardapio');
  getJson('/produtos')
    .then(list => setTableBody('cardapio', list.map(buildLinhaProduto)))
    .catch((err) => {
      const msg = err.message || 'Erro ao carregar produtos.';
      setTableBody('cardapio', [], msg);
      console.error('[cardapio]', err);
    });
}

function carregarMesas() {
  renderTables();
}

function buildLinhaPedido(p) {
  const statusLabel = { RECEBIDO: 'Recebido', EM_PREPARO: 'Preparando', PRONTO: 'Pronto', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado' };
  const badgeClass = { RECEBIDO: 'badge-info', EM_PREPARO: 'badge-warning', PRONTO: 'badge-success', ENTREGUE: 'badge-active', CANCELADO: 'badge-danger' };
  const qtd = p.itens ? p.itens.reduce((s, i) => s + (i.quantidade || 0), 0) : '-';
  return `<tr>
    <td><strong>#${p.id}</strong></td>
    <td>Mesa ${p.numeroMesa || '-'}</td>
    <td>${p.dataHora ? new Date(p.dataHora).toLocaleString('pt-BR') : '-'}</td>
    <td>${qtd} item(s)</td>
    <td>${formatCurrency(p.valorTotal)}</td>
    <td><span class="badge ${badgeClass[p.status] || ''}">${statusLabel[p.status] || p.status}</span></td>
    <td>-</td>
    <td><button class="btn-icon" title="Detalhes">👁️</button></td>
  </tr>`;
}

function carregarPedidos() {
  showTableSkeleton('pedidos');
  getJson('/pedidos')
    .then(list => setTableBody('pedidos', list.map(buildLinhaPedido)))
    .catch((err) => {
      const msg = err.message || 'Erro ao carregar pedidos.';
      setTableBody('pedidos', [], msg);
      console.error('[pedidos]', err);
    });
}

function buildLinhaUsuario(u) {
  const roleLabel = { ADMIN: 'Administrador', FUNCIONARIO: 'Operacional' };
  const roleClass = u.role === 'ADMIN' ? 'badge-info' : 'badge-active';
  return `<tr>
    <td><strong>${u.nome}</strong></td>
    <td>${u.email || '-'}</td>
    <td><span class="badge ${roleClass}">${roleLabel[u.role] || u.role || '-'}</span></td>
    <td>${u.role === 'ADMIN' ? 'Todos' : 'Operações'}</td>
    <td><span class="badge badge-active">Ativo</span></td>
    <td>-</td>
    <td>
      <button class="btn-icon" title="Editar">✏️</button>
      <button class="btn-icon" title="Permissões">🔑</button>
      <button class="btn-icon" title="Resetar Senha">🔑</button>
    </td>
  </tr>`;
}

function carregarUsuarios() {
  showTableSkeleton('config-usuarios');
  getJson('/usuarios')
    .then(list => setTableBody('config-usuarios', list.map(buildLinhaUsuario)))
    .catch((err) => {
      const msg = err.message || 'Erro ao carregar usuários.';
      setTableBody('config-usuarios', [], msg);
      console.error('[usuarios]', err);
    });
}

function carregarCozinha() {
  showCozinhaSkeleton();
  getJson('/pedidos').then(pedidos => {
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
        <div class="card-id">Pedido #${p.id} — Mesa ${p.numeroMesa || '-'}</div>
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

    // Charts Configuration
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          labels: {
            font: { family: '"Inter", sans-serif', size: 12 },
            color: '#64748b',
            padding: 20,
            usePointStyle: true
          }
        }
      },
      scales: {
        x: {
          grid: { color: '#e2e8f0', drawBorder: false },
          ticks: { color: '#64748b', font: { size: 12 } }
        },
        y: {
          grid: { color: '#e2e8f0', drawBorder: false },
          ticks: { color: '#64748b', font: { size: 12 } }
        }
      }
    };

    // Sales Chart
    function hasChartLibrary() {
      return typeof Chart !== 'undefined';
    }

    function initSalesChart() {
      if (!hasChartLibrary()) return;
      const canvas = document.getElementById('salesChart');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['8:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'],
          datasets: [{
            label: 'Vendas (R$)',
            data: [120, 150, 280, 320, 240, 380, 410],
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#2563eb',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: chartOptions
      });
    }

    // Dishes Distribution Chart
    function initDishesChart() {
      if (!hasChartLibrary()) return;
      const canvas = document.getElementById('dishesChart');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Hambúrguer', 'Pasta', 'Salada', 'Outros'],
          datasets: [{
            data: [42, 38, 28, 18],
            backgroundColor: [
              '#2563eb',
              '#7c3aed',
              '#f85b15',
              '#06b6d4'
            ],
            borderColor: '#fff',
            borderWidth: 2
          }]
        },
        options: {
          ...chartOptions,
          plugins: {
            ...chartOptions.plugins,
            legend: {
              position: 'bottom',
              labels: {
                font: { family: '"Inter", sans-serif', size: 12 },
                color: '#64748b',
                padding: 20,
                usePointStyle: true
              }
            }
          }
        }
      });
    }

    // Orders Status Chart
    function initOrdersChart() {
      if (!hasChartLibrary()) return;
      const ctx = document.getElementById('ordersChart');
      if (!ctx) return;
      
      new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['Entregues', 'Em Preparo', 'Cancelados'],
          datasets: [{
            data: [24, 3, 1],
            backgroundColor: [
              '#10b981',
              '#f59e0b',
              '#ef4444'
            ],
            borderColor: '#fff',
            borderWidth: 2
          }]
        },
        options: {
          ...chartOptions,
          plugins: {
            ...chartOptions.plugins,
            legend: {
              position: 'bottom',
              labels: {
                font: { family: '"Inter", sans-serif', size: 12 },
                color: '#64748b',
                padding: 20,
                usePointStyle: true
              }
            }
          }
        }
      });
    }

    // Top Dishes Chart
    function initTopDishesChart() {
      if (!hasChartLibrary()) return;
      const ctx = document.getElementById('topDishesChart');
      if (!ctx) return;
      
      new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
          labels: ['Hambúrguer', 'Pasta', 'Salada', 'Salmão', 'Tiramisu'],
          datasets: [{
            label: 'Quantidade Vendida',
            data: [42, 38, 28, 25, 18],
            backgroundColor: '#2563eb',
            borderRadius: 8,
            borderSkipped: false
          }]
        },
        options: chartOptions
      });
    }

    // Profit Chart
    function initProfitChart() {
      if (!hasChartLibrary()) return;
      const ctx = document.getElementById('profitChart');
      if (!ctx) return;
      
      new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['Lucro', 'Custo'],
          datasets: [{
            data: [65, 35],
            backgroundColor: [
              '#10b981',
              '#f3f4f6'
            ],
            borderColor: '#fff',
            borderWidth: 2
          }]
        },
        options: {
          ...chartOptions,
          plugins: {
            ...chartOptions.plugins,
            legend: {
              position: 'bottom'
            }
          }
        }
      });
    }

    // Initialize charts on page load
    window.addEventListener('load', () => {
      initSalesChart();
      initDishesChart();
      initOrdersChart();
    });
