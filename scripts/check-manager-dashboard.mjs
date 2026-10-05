import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const root = path.resolve('frontend');
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + pathname);
    if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const data = await fs.readFile(target);
    const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });

try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width <= 768 });
    let preparing = 3;
    const date = '2026-10-05';
    const makeOrder = (id, status, day = date) => ({
      id, status, dataHora: day + 'T12:00:00', origem: 'MESA', numeroMesa: 1, valorTotal: 25,
      itens: [{ nomeProduto: 'Água', quantidade: 1, precoUnitario: 25, subtotal: 25 }]
    });
    const todayOrders = ['RECEBIDO', 'RECEBIDO', 'EM_PREPARO', 'EM_PREPARO', 'EM_PREPARO', 'PRONTO',
      'ENTREGUE', 'ENTREGUE', 'ENTREGUE', 'ENTREGUE', 'CANCELADO'].map((status, index) => makeOrder(index + 1, status));
    const orders = [...todayOrders, makeOrder(12, 'PRONTO', '2026-10-04'),
      ...Array.from({ length: 51 }, (_, index) => makeOrder(index + 13, 'ENTREGUE', '2026-10-04'))];
    const requests = [];
    await context.addInitScript(() => {
      window.DATAPLATE_API_BASE_URL = 'http://dataplate-test.invalid/api';
      localStorage.setItem('dataplate:notificacoes', JSON.stringify({ alertaEstoqueBaixo: false }));
    });
    await context.route('http://dataplate-test.invalid/api/**', async route => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      requests.push(url);
      const fixtures = {
        '/api/auth/login': { token: 'test-token', nome: 'Gerente', cpf: '00000000191', role: 'ADMIN' },
        '/api/relatorios/resumo': { inicio: date, fim: date, faturamento: 250, ticketMedio: 25, pedidosRecebidos: 2, pedidosEmPreparo: preparing, pedidosProntos: 1, pedidosEntregues: 4, pedidosCancelados: 1, topProdutos: [] },
        '/api/relatorios/vendas': { faturamento: 250, ticketMedio: 25, totalPedidos: 11, timeline: [], porDia: [],
          historico: todayOrders.map(order => ({ ...order, itens: 1 })) },
        '/api/mesas': [ { id: 1, numero: 1, status: 'ocupada' }, { id: 2, numero: 2, status: 'livre' }, { id: 3, numero: 3, status: 'disponivel' } ],
        '/api/insumos': [
          { id: 1, nome: 'Arroz', unidade: 'kg', quantidadeAtual: 1, quantidadeMinima: 2, custoUnitario: 5 },
          { id: 2, nome: 'Feijão', unidade: 'kg', quantidadeAtual: 0, quantidadeMinima: 2, custoUnitario: 5 },
          { id: 3, nome: 'Sal', unidade: 'kg', quantidadeAtual: 5, quantidadeMinima: 2, custoUnitario: 5 }
        ],
        '/api/pedidos/ativos': orders.filter(order => ['RECEBIDO', 'EM_PREPARO', 'PRONTO'].includes(order.status)),
        '/api/pedidos/1': todayOrders[0]
      };
      if (pathname === '/api/pedidos') {
        const statuses = url.searchParams.getAll('status');
        const filtered = orders.filter(order => (!statuses.length || statuses.includes(order.status))
          && (!url.searchParams.get('data') || order.dataHora.startsWith(url.searchParams.get('data'))));
        const page = Number(url.searchParams.get('page') || 0);
        const size = Number(url.searchParams.get('size') || 50);
        fixtures[pathname] = { content: filtered.slice(page * size, (page + 1) * size),
          totalPages: Math.ceil(filtered.length / size), totalElements: filtered.length };
      }
      await route.fulfill({ status: 200, json: fixtures[pathname] || [], headers: {
        'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type'
      } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseUrl + '/pages/adm-login.html');
    await page.locator('#adminCpf').fill('00000000191');
    await page.locator('#adminPassword').fill('admin123');
    await Promise.all([page.waitForURL('**/adm.html'), page.locator('#adminLoginForm button[type=submit]').click()]);
    const stat = label => page.locator('#dashboard .stat-card').filter({ has: page.locator('.stat-label', { hasText: new RegExp(`^${label}$`) }) }).locator('.stat-value');
    await expect(page.locator('#home.active #dashboard')).toBeVisible();
    await expect(stat('Total de pedidos')).toHaveText('11');
    await expect(stat('Pedidos ativos')).toHaveText('6');
    await expect(stat('Mesas ocupadas')).toHaveText('1/3');
    await expect(stat('Mesas disponíveis')).toHaveText('2');
    await expect(stat('Cozinha em preparo')).toHaveText('3');
    await expect(page.locator('#homeMesasDetalhe')).toHaveText('2 disponíveis');
    await expect(page.locator('#headerBreadcrumb')).toHaveText('Início›Dashboard');
    assert.equal(await page.locator('script[src*="/adm.js"]').count(), 1);
    assert.equal(await page.locator('.content-section .content-section').count(), 0);
    const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.ok(metrics.scrollWidth <= metrics.width + 2, `Overflow horizontal em ${width}px`);
    if (width >= 1024) {
      await expect(page.locator('.home-shortcuts')).toBeVisible();
      const side = await page.locator('.home-shortcuts').boundingBox();
      const dashboard = await page.locator('#dashboard').boundingBox();
      assert.ok(side.x + side.width <= dashboard.x, 'Menu deve permanecer ao lado do dashboard');
    }
    if (width === 1440) {
      await expect(page.locator('.home-stats-panel')).toBeVisible();
      await page.locator('#dashUltimosPedidosTbody').scrollIntoViewIfNeeded();
      await expect(page.locator('#dashUltimosPedidosTbody')).toBeInViewport();
    }
    await page.evaluate(() => toggleShortcutGroup('cadastros'));
    await expect(page.locator('[data-group=cadastros]')).toHaveClass(/collapsed/);
    await page.reload();
    await expect(page.locator('[data-group=cadastros]')).toHaveClass(/collapsed/);
    await page.evaluate(() => toggleShortcutGroup('cadastros'));
    for (const section of ['pedidos', 'rel-financeiro', 'config-restaurante', 'clientes']) {
      await page.locator(`.home-shortcuts button[onclick="navigateTo('${section}')"]`).click();
      await expect(page.locator(`#${section}.active`)).toBeVisible();
      await page.locator('.logo-text').click();
      await expect(page.locator('#home.active #dashboard')).toBeVisible();
    }
    await page.locator('.home-shortcuts button[onclick="navigateTo(\'clientes\')"]').click();
    await page.reload();
    await expect(page.locator('#clientes.active')).toBeVisible();
    await page.locator('.logo-text').click();
    await expect(page.locator('#home.active #dashboard')).toBeVisible();
    await page.goto(baseUrl + '/pages/adm.html#dashboard');
    await page.reload();
    await expect(page.locator('#home.active #dashboard')).toBeVisible();
    await expect.poll(() => new URL(page.url()).hash).toBe('');
    const topCard = label => page.locator('#dashboard .stat-card')
      .filter({ has: page.locator('.stat-label', { hasText: new RegExp(`^${label}$`) }) });
    const cardCases = [
      { card: topCard('Faturamento de hoje'), section: 'rel-vendas' },
      { card: topCard('Total de pedidos'), section: 'pedidos', filter: '', rows: 11 },
      { card: topCard('Pedidos ativos'), section: 'pedidos', filter: 'ativos', rows: 6 },
      { card: topCard('Mesas ocupadas'), section: 'mesas', filter: 'status:ocupada', rows: 1 },
      { card: topCard('Mesas disponíveis'), section: 'mesas', filter: 'status:disponivel', rows: 2 },
      { card: topCard('Cozinha em preparo'), section: 'cozinha', filter: 'EM_PREPARO', rows: 3 },
      { card: topCard('Ticket médio'), section: 'rel-vendas' },
      { card: topCard('Estoque baixo'), section: 'insumos', filter: 'baixo', rows: 2 },
      { card: page.locator('.home-stat-item:has(#homeFaturamento)'), section: 'rel-vendas' },
      { card: page.locator('.home-stat-item:has(#homeTicketMedio)'), section: 'rel-vendas' },
      { card: page.locator('.home-stat-item:has(#homeEntregues)'), section: 'pedidos', filter: 'entregue', rows: 4 },
      { card: page.locator('.home-stat-item:has(#homeProntos)'), section: 'cozinha', filter: 'PRONTO', rows: 1 },
      { card: page.locator('.home-stat-item:has(#homePedidosAtivos)'), section: 'pedidos', filter: 'ativos', rows: 6 },
      { card: page.locator('.home-stat-item:has(#homeMesas)'), section: 'mesas', filter: 'status:ocupada', rows: 1 },
      { card: page.locator('.home-stat-item:has(#homeCancelamentos)'), section: 'pedidos', filter: 'cancelado', rows: 1 }
    ];
    assert.equal(await page.locator('#home .dashboard-card-action').count(), cardCases.length);
    for (const item of cardCases) {
      await expect(item.card).toHaveAttribute('type', 'button');
      // Exercita teclado e toque, além do clique de mouse.
      if (item.card === cardCases[0].card) {
        await item.card.focus();
        await item.card.press('Enter');
      } else if (item.card === cardCases[1].card) {
        await item.card.focus();
        await item.card.press('Space');
      } else if (width <= 768) {
        await item.card.tap();
      } else {
        await item.card.click();
      }
      await expect(page.locator(`#${item.section}.active`)).toBeVisible();
      await expect(page.locator(`#${item.section} h1`)).toBeFocused();
      if (item.section === 'rel-vendas') {
        await expect(page.locator('#relVendasInicio')).toHaveValue(date);
        await expect(page.locator('#relVendasFim')).toHaveValue(date);
        await expect(page.locator('#relVendasHistoricoTable tbody tr')).toHaveCount(11);
        assert.ok(requests.some(url => url.pathname === '/api/relatorios/vendas'
          && url.searchParams.get('inicio') === date && url.searchParams.get('fim') === date));
      } else if (item.section === 'cozinha') {
        await expect(page.locator('#filtroCozinha')).toHaveValue(item.filter);
        await expect(page.locator('#filtroCozinhaData')).toHaveValue(date);
        await expect(page.locator('#cozinha .kitchen-card')).toHaveCount(item.rows);
        await expect(page.locator('#cozinha')).not.toContainText('#12');
      } else if (item.section === 'mesas') {
        await expect(page.locator('#tableFilter')).toHaveValue(item.filter);
        await expect(page.locator('#tablesTableBody tr')).toHaveCount(item.rows);
      } else {
        await expect(page.locator(`#${item.section} [data-table-filter]`)).toHaveValue(item.filter);
        const rows = page.locator(`#${item.section} .data-table tbody tr:visible`);
        await expect(rows).toHaveCount(item.rows);
        if (item.section === 'pedidos') {
          await expect(page.locator('#pedidos [data-table-date]')).toHaveValue(date);
        } else {
          await expect(rows).toContainText(['Arroz', 'Feijão']);
          await page.locator('#insumos [data-table-filter]').selectOption('');
          await expect(page.locator('#insumos .data-table tbody tr:visible')).toHaveCount(3);
        }
      }
      await page.locator('.logo-text').click();
      await expect(page.locator('#home.active #dashboard')).toBeVisible();
    }
    await topCard('Total de pedidos').click();
    await page.locator('#pedidos [data-table-filter]').selectOption('entregue');
    await page.locator('#pedidos [data-table-date]').fill('2026-10-04');
    await expect(page.locator('#pedidos .data-table tbody tr:visible')).toHaveCount(50);
    await page.locator('#pedidos .pagination-bar button', { hasText: 'Próxima' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#pedidos .data-table tbody tr:visible')).toHaveCount(1);
    assert.ok(requests.some(url => url.pathname === '/api/pedidos' && url.searchParams.get('page') === '1'
      && url.searchParams.get('data') === '2026-10-04' && url.searchParams.get('status') === 'ENTREGUE'));
    await page.locator('.logo-text').click();
    await topCard('Total de pedidos').click();
    await expect(page.locator('#pedidos [data-table-filter]')).toHaveValue('');
    await expect(page.locator('#pedidos .data-table tbody tr:visible')).toHaveCount(11);
    await page.locator('#pedidos .data-table tbody tr').first().getByRole('button', { name: 'Ver', exact: true }).click();
    await expect(page.locator('#orderDetailsModal')).toBeVisible();
    await expect(page.locator('#orderDetailsContent')).toContainText('Água');
    await page.keyboard.press('Escape');
    await page.locator('.logo-text').click();
    preparing = 5;
    await page.evaluate(() => connectAdminWebSocket().dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'PEDIDO_ATUALIZADO' }) })));
    await expect(stat('Cozinha em preparo')).toHaveText('5');
    await expect(stat('Pedidos ativos')).toHaveText('8');
    await expect(page.locator('#homePedidosAtivos')).toHaveText('8');
    assert.deepEqual(errors, [], 'Erros JavaScript no painel');
    await context.close();
    console.log(`Dashboard, 15 cards, filtros, paginação, detalhes, teclado e atualização: OK (${width}px)`);
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
