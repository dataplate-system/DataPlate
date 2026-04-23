   // Tab Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const tabName = link.getAttribute('data-tab');
        
        // Remove active class from all tabs and contents
        document.querySelectorAll('.tab-content').forEach(tab => {
          tab.style.display = 'none';
        });
        document.querySelectorAll('.nav-link').forEach(l => {
          l.classList.remove('active');
        });
        
        // Add active class to selected tab and content
        link.classList.add('active');
        document.getElementById(tabName).style.display = 'block';
        
        // Initialize charts when analytics tab is opened
        if (tabName === 'analytics') {
          setTimeout(() => {
            initTopDishesChart();
            initProfitChart();
          }, 100);
        }
      });
    });

    // Modal Functions
    function openAddDishModal() {
      document.getElementById('addDishModal').classList.add('active');
    }

    function openAddStockModal() {
      document.getElementById('addStockModal').classList.add('active');
    }

    function closeModal(modalId) {
      document.getElementById(modalId).classList.remove('active');
    }

    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
      }
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
    });