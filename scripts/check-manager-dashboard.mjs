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
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    let preparing = 3;
    await context.addInitScript(() => { window.DATAPLATE_API_BASE_URL = 'http://dataplate-test.invalid/api'; });
    await context.route('http://dataplate-test.invalid/api/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      const fixtures = {
        '/api/auth/login': { token: 'test-token', nome: 'Gerente', cpf: '00000000191', role: 'ADMIN' },
        '/api/relatorios/resumo': { faturamento: 250, ticketMedio: 25, pedidosRecebidos: 2, pedidosEmPreparo: preparing, pedidosProntos: 1, pedidosEntregues: 4, pedidosCancelados: 1, topProdutos: [] },
        '/api/relatorios/vendas': { timeline: [] },
        '/api/mesas': [ { id: 1, numero: 1, status: 'ocupada' }, { id: 2, numero: 2, status: 'livre' }, { id: 3, numero: 3, status: 'disponivel' } ],
        '/api/insumos': [],
        '/api/pedidos': []
      };
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
    preparing = 5;
    await page.evaluate(() => connectAdminWebSocket().dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'PEDIDO_ATUALIZADO' }) })));
    await expect(stat('Cozinha em preparo')).toHaveText('5');
    await expect(stat('Pedidos ativos')).toHaveText('8');
    await expect(page.locator('#homePedidosAtivos')).toHaveText('8');
    assert.deepEqual(errors, [], 'Erros JavaScript no painel');
    await context.close();
    console.log(`Dashboard inicial, indicadores, menus, retorno, F5 e evento de pedido: OK (${width}px)`);
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
