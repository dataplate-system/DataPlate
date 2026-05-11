/**
 * ADMIN PANEL - Navigation and Modal Management
 */

const API_BASE_URL = 'http://localhost:8080/api';

async function postJson(endpoint, payload) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let message = 'Nao foi possivel salvar os dados.';
    try {
      const error = await response.json();
      message = error.message || error.mensagem || error.erro || message;
    } catch (_) {
      message = await response.text() || message;
    }

    throw new Error(message);
  }

  return response.json();
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
    addStockModal: 'Novo Insumo',
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
window.openAddStockModal = () => window.openModal('addStockModal');
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

  if (!['button', 'submit', 'reset', 'checkbox', 'radio', 'hidden'].includes(type)) {
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
// DROPDOWN MENU
// =============================================

document.querySelectorAll('.dropdown').forEach(dropdown => {
  const button = dropdown.querySelector('.nav-button');
  
  if (button) {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Close other dropdowns
      document.querySelectorAll('.dropdown-menu').forEach(menu => {
        if (menu !== dropdown.querySelector('.dropdown-menu')) {
          menu.style.display = 'none';
        }
      });

      // Toggle current dropdown
      const menu = dropdown.querySelector('.dropdown-menu');
      if (menu) {
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
      }
    });
  }
});

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
      menu.style.display = 'none';
    });
  }
});

// =============================================
// MODAL FORM SUBMISSIONS
// =============================================

// Add Client Modal
document.getElementById('addClientForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm(e.target)) return;
  const formData = new FormData(e.target);
  console.log('New client:', Object.fromEntries(formData));
  
  // TODO: Send to server
  alert('Cliente adicionado com sucesso!');
  closeModal('addClientModal');
  e.target.reset();
});

// Add Employee Modal
document.getElementById('addFunctForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm(e.target)) return;
  const formData = new FormData(e.target);
  console.log('New employee:', Object.fromEntries(formData));
  
  // TODO: Send to server
  alert('Funcionário adicionado com sucesso!');
  closeModal('addFunctModal');
  e.target.reset();
});

// Add Supplier Modal
document.getElementById('addSupplierForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm(e.target)) return;
  const formData = new FormData(e.target);
  console.log('New supplier:', Object.fromEntries(formData));
  
  // TODO: Send to server
  alert('Fornecedor adicionado com sucesso!');
  closeModal('addSupplierModal');
  e.target.reset();
});

// Add Dish Modal
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
      alert('Prato adicionado com sucesso!');
      closeModal('addDishModal');
      e.target.reset();
    })
    .catch((error) => {
      console.error('Erro ao salvar prato:', error);
      alert(error.message);
    });
});

// Add Stock Modal
document.getElementById('addStockForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm(e.target)) return;
  const formData = new FormData(e.target);
  console.log('New stock item:', Object.fromEntries(formData));
  
  // TODO: Send to server
  alert('Item de estoque adicionado com sucesso!');
  closeModal('addStockModal');
  e.target.reset();
});

// Add User Modal
document.getElementById('addUserForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateForm(e.target)) return;
  const formData = new FormData(e.target);
  console.log('New user:', Object.fromEntries(formData));
  
  // TODO: Send to server
  alert('Usuário adicionado com sucesso!');
  closeModal('addUserModal');
  e.target.reset();
});

// =============================================
// KITCHEN BOARD STATUS UPDATES
// =============================================

window.changeStatus = function(status) {
  console.log('Kitchen status changed:', status);
  alert('Status atualizado com sucesso!');
};

document.querySelectorAll('.btn-status-change').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const card = e.target.closest('.kitchen-card');
    const orderId = card.querySelector('.card-id').textContent;
    
    // TODO: Send status update to server
    console.log('Update order status:', orderId);
    alert(`Status do pedido ${orderId} atualizado!`);
  });
});

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
searchTable('#searchEstoque', '#estoqueTable');

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
filterByStatus('#statusFilterEstoque', '#estoqueTable', 4);

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
exportTableToCSV('#exportEstoque', 'estoque.csv');

// =============================================
// INITIALIZATION
// =============================================

document.addEventListener('DOMContentLoaded', () => {
  // Set default section to dashboard
  navigateTo('dashboard');

  // Initialize dropdown toggles
  const dropdowns = document.querySelectorAll('.dropdown');
  dropdowns.forEach(dropdown => {
    const button = dropdown.querySelector('button');
    if (button) {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close other dropdowns
        dropdowns.forEach(d => {
          if (d !== dropdown) {
            d.classList.remove('active');
          }
        });
        // Toggle current dropdown
        dropdown.classList.toggle('active');
      });
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    dropdowns.forEach(dropdown => {
      dropdown.classList.remove('active');
    });
  });

  // Close dropdown when clicking a link
  document.querySelectorAll('.dropdown-link').forEach(link => {
    link.addEventListener('click', () => {
      link.closest('.dropdown').classList.remove('active');
    });
  });

  document.querySelectorAll('.modal').forEach(modal => {
    modal.setAttribute('aria-hidden', modal.classList.contains('active') ? 'false' : 'true');
  });

  document
    .querySelectorAll('form input, form select, form textarea, .config-form input, .config-form select, .config-form textarea')
    .forEach(configureField);

  // TODO: Load data from server
  console.log('Admin panel loaded successfully');
});

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
