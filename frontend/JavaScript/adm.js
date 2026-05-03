/**
 * ADMIN PANEL - Navigation and Modal Management
 */

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

// =============================================
// MODAL MANAGEMENT
// =============================================

window.openModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
};

window.closeModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
  }
};

// Close modal when clicking outside
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) {
    e.target.classList.remove('active');
    document.body.style.overflow = 'auto';
  }
});

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.active').forEach(modal => {
      modal.classList.remove('active');
    });
    document.body.style.overflow = 'auto';
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
  const formData = new FormData(e.target);
  console.log('New dish:', Object.fromEntries(formData));
  
  // TODO: Send to server
  alert('Prato adicionado com sucesso!');
  closeModal('addDishModal');
  e.target.reset();
});

// Add Stock Modal
document.getElementById('addStockForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
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

  // Modal trigger buttons
  document.querySelectorAll('[data-open-modal]').forEach(button => {
    button.addEventListener('click', () => {
      const modalId = button.getAttribute('data-open-modal');
      if (modalId) {
        window.openModal(modalId);
      }
    });
  });

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
    function initSalesChart() {
      const ctx = document.getElementById('salesChart').getContext('2d');
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
      const ctx = document.getElementById('dishesChart').getContext('2d');
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