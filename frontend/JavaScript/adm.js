/**
 * ADMIN PANEL - Navigation and Modal Management
 */

const API_BASE_URL = window.location.port === '5500' ? 'http://localhost:8080/api' : '/api';
const WS_BASE_URL = (() => {
  const apiUrl = API_BASE_URL.startsWith('http')
    ? API_BASE_URL
    : `${window.location.origin}${API_BASE_URL}`;
  return apiUrl.replace(/^http/, 'ws').replace(/\/api$/, '/ws');
})();
const ACCESS_TOKEN_KEY = 'dataplate:accessToken';
const REFRESH_TOKEN_KEY = 'dataplate:refreshToken';

function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem('token');
}

function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY) || localStorage.getItem('refreshToken');
}

function persistAuthTokens(auth) {
  if (!auth) return;
  if (auth.token) localStorage.setItem(ACCESS_TOKEN_KEY, auth.token);
  if (auth.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, auth.refreshToken);
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });

  if (!response.ok) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    return null;
  }

  const auth = await readResponseBody(response);
  persistAuthTokens(auth);
  return auth?.token || null;
}

async function apiFetch(endpoint, options = {}, retry = true) {
  const headers = new Headers(options.headers || {});
  const token = getAccessToken();

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });

  if ((response.status === 401 || response.status === 403) && retry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      return fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
    }
  }

  return response;
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
  const body = await readResponseBody(response);
  if (endpoint.startsWith('/auth/')) persistAuthTokens(body);
  return body;
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

window.addEventListener('error', (event) => {
  console.error('Erro global capturado:', event.error || event.message);
  showToast('Ocorreu um erro inesperado. Tente novamente.');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Promessa rejeitada sem tratamento:', event.reason);
  showToast(event.reason?.message || 'Nao foi possivel concluir a operacao.');
});

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
  
  if (selectedSection && sectionId !== 'dashboard') {
    if (logoCenter) logoCenter.style.display = 'none';
    if (nomeCenter) nomeCenter.style.display = 'none';
    if (textCenter) textCenter.style.display = 'none';
  } else {
    if (logoCenter) logoCenter.style.display = 'block';
    if (nomeCenter) nomeCenter.style.display = 'block';
    if (textCenter) textCenter.style.display = 'block';
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
        const endereco = await getJson(`/cep/buscar/${cep}`);
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
  if (codeInput && !codeInput.value) codeInput.value = generateClientCode();
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
  const payload = { nome: fd.get('name'), cpf: documento, email: fd.get('email'), telefone: telefones, endereco };
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
  if (codeInput && !codeInput.value) codeInput.value = generateEmployeeCode();
  const fd = new FormData(e.target);
  const payload = { nome: fd.get('name'), cpf: fd.get('cpf'), telefone: fd.get('phone'), cargo: fd.get('role'), salario: Number(fd.get('salary')) || null };
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
  if (codeInput && !codeInput.value) codeInput.value = generateSupplierCode();
  const fd = new FormData(e.target);
  const telefones = [fd.get('phone'), fd.get('phone2')].filter(Boolean).join(' / ');
  const payload = { razaoSocial: fd.get('company'), cnpj: fd.get('cnpj'), especialidade: fd.get('specialty'), telefone: telefones, email: fd.get('email') };
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

const dishIngredients = [];

function renderDishIngredients() {
  const form = document.getElementById('addDishForm');
  const list = form?.querySelector('.ingredients-list');
  const ingredientsField = form?.querySelector('[name="ingredients"]');

  if (!list || !ingredientsField) return;

  list.innerHTML = '';
  ingredientsField.value = dishIngredients
    .map(ingredient => `${ingredient.name} (${ingredient.weight}${ingredient.unit})`)
    .join(', ');

  dishIngredients.forEach((ingredient, index) => {
    const item = document.createElement('span');
    item.className = 'ingredient-chip';
    item.textContent = `${ingredient.name} - ${ingredient.weight}${ingredient.unit}`;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'x';
    removeButton.setAttribute('aria-label', `Remover ${ingredient.name}`);
    removeButton.addEventListener('click', () => {
      dishIngredients.splice(index, 1);
      renderDishIngredients();
    });

    item.appendChild(removeButton);
    list.appendChild(item);
  });
}

document.querySelector('.ingredient-add-button')?.addEventListener('click', () => {
  const form = document.getElementById('addDishForm');
  const nameInput = form?.querySelector('[name="ingredientName"]');
  const weightInput = form?.querySelector('[name="ingredientWeight"]');
  const unitSelect = form?.querySelector('[name="ingredientWeightUnit"]');
  const name = nameInput?.value.trim();
  const weight = weightInput?.value.trim();
  const unit = unitSelect?.value;

  if (!name || !weight || !unit) {
    alert('Informe o ingrediente, o peso e a unidade antes de adicionar.');
    return;
  }

  dishIngredients.push({ name, weight, unit });
  nameInput.value = '';
  weightInput.value = '';
  unitSelect.value = 'g';
  renderDishIngredients();
});

document.getElementById('addDishForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm(e.target)) return;
  const formData = new FormData(e.target);

  const produto = {
    nome: formData.get('name'),
    idCategoria: Number(formData.get('category')),
    preco: Number(formData.get('price')),
    descricao: formData.get('description'),
    ativo: true,
    destaque: false
  };

  postJson('/produtos', produto)
    .then(() => {
      showToast('Prato adicionado com sucesso!', 'success');
      closeModal('addDishModal');
      e.target.reset();
      dishIngredients.length = 0;
      renderDishIngredients();
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

  if (/editar|excluir|detalhes|imprimir|permiss|hist[oó]rico|contato|ingredientes|desativar|ajustar|repor|configurar|reativar|senha|acelerar|atualizar|cancelar|ver pedidos|ver expediente/i.test(label)) {
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
  // Set default section to dashboard
  navigateTo('dashboard');
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

  carregarClientes();
  carregarFuncionarios();
  carregarFornecedores();
  carregarProdutos();
  carregarPedidos();
  carregarCozinha();
  carregarUsuarios();
  connectAdminWebSocket();

  console.log('Admin panel loaded successfully');
});

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

function setTableBody(sectionId, rows) {
  const tbody = document.querySelector(`#${sectionId} .data-table tbody`);
  if (!tbody) return;
  if (!rows || rows.length === 0) {
    const cols = tbody.closest('table').querySelectorAll('th').length;
    tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;color:#94a3b8">Nenhum registro encontrado</td></tr>`;
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
  getJson('/clientes')
    .then(list => setTableBody('clientes', list.map(buildLinhaCliente)))
    .catch((err) => showToast(err.message || 'Erro ao carregar clientes.'));
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
  getJson('/funcionarios')
    .then(list => setTableBody('funcionarios', list.map(buildLinhaFuncionario)))
    .catch((err) => showToast(err.message || 'Erro ao carregar funcionarios.'));
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
    <td><strong>${f.razaoSocial}</strong></td>
    <td>${f.especialidade || '-'}</td>
    <td>${f.telefone || '-'}</td>
    <td>${f.email || '-'}</td>
    <td>-</td>
    <td><span class="badge badge-active">${f.ativo ? 'Ativo' : 'Inativo'}</span></td>
    <td>${formatDate(f.criadoEm)}</td>
    <td><button class="btn-icon" title="Editar">✏️</button></td>
  </tr>`;
}

function carregarFornecedores() {
  getJson('/fornecedores')
    .then(list => setTableBody('fornecedores', list.map(buildLinhaFornecedor)))
    .catch((err) => showToast(err.message || 'Erro ao carregar fornecedores.'));
}

function buildLinhaProduto(p) {
  return `<tr>
    <td><strong>${p.nome}</strong></td>
    <td>${p.idCategoria || '-'}</td>
    <td>${formatCurrency(p.preco)}</td>
    <td>-</td><td>-</td>
    <td><span class="badge badge-active">${p.ativo !== false ? 'Sim' : 'Não'}</span></td>
    <td>-</td>
    <td><button class="btn-icon" title="Editar">✏️</button></td>
  </tr>`;
}

function carregarProdutos() {
  getJson('/produtos')
    .then(list => setTableBody('cardapio', list.map(buildLinhaProduto)))
    .catch((err) => showToast(err.message || 'Erro ao carregar produtos.'));
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
  getJson('/pedidos')
    .then(list => setTableBody('pedidos', list.map(buildLinhaPedido)))
    .catch((err) => showToast(err.message || 'Erro ao carregar pedidos.'));
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
  getJson('/usuarios')
    .then(list => setTableBody('config-usuarios', list.map(buildLinhaUsuario)))
    .catch((err) => showToast(err.message || 'Erro ao carregar usuarios.'));
}

function carregarCozinha() {
  getJson('/pedidos').then(pedidos => {
    const cols = {
      RECEBIDO:   document.getElementById('col-recebido'),
      EM_PREPARO: document.getElementById('col-em_preparo'),
      PRONTO:     document.getElementById('col-pronto')
    };

    Object.values(cols).forEach(col => {
      if (!col) return;
      Array.from(col.querySelectorAll('.kitchen-card')).forEach(c => c.remove());
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
  }).catch((err) => showToast(err.message || 'Erro ao carregar cozinha.'));
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
