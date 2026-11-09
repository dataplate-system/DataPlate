import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// UI uses isolated orders; API integration tests cover persistence in rolled-back transactions.
const api = 'http://127.0.0.1:8081/api';
const base = process.env.DATAPLATE_FRONTEND_URL || 'http://127.0.0.1:5500';
const sessions = {};
for (const [perfil, final] of [['admin', 1], ['gerente', 2], ['atendente', 3], ['cozinha', 4], ['caixa', 5]]) {
  const response = await fetch(`${api}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cpf: `0000000000${final}`, senha: 'admin123' })
  });
  assert.equal(response.status, 200, `Login ${perfil}`);
  const user = await response.json();
  sessions[perfil] = { ...user, backendRole: user.role, userKey: perfil };
}
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  for (const perfil of ['atendente', 'cozinha']) {
    const context = await browser.newContext();
    await context.addInitScript(session => sessionStorage.setItem('dataplate:adminSession', JSON.stringify(session)), sessions[perfil]);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${perfil}: ${error.message}`));
    let order, lastEdit, lastCancel;
    await page.route('**/api/pedidos**', async route => {
      const request = route.request();
      if (request.method() === 'PUT') {
        const body = request.postDataJSON();
        if (request.url().endsWith('/itens')) {
          lastEdit = body;
          order.itens[0].quantidade = body.itens[0].quantidade;
          order.valorTotal = order.itens[0].quantidade * 10;
          if (order.status === 'PRONTO') order.status = 'EM_PREPARO';
        } else {
          lastCancel = body;
          order.status = 'CANCELADO';
          order.motivoCancelamento = body.motivo;
          order.origemCancelamento = body.origemCancelamento;
        }
        return route.fulfill({ json: order });
      }
      return route.fulfill({ json: /\/pedidos\/987654(?:\?|$)/.test(request.url()) ? order : [order] });
    });
    for (const status of ['RECEBIDO', 'EM_PREPARO', 'PRONTO']) {
      order = { id: 987654, numeroMesa: 101, status, dataHora: new Date().toISOString(), atualizadoEm: new Date().toISOString(),
        valorTotal: 10, origem: 'MESA', observacoes: 'Sem cebola',
        itens: [{ produtoId: 1, nomeProduto: 'Prato da casa', quantidade: 1, precoUnitario: 10, subtotal: 10, tempoPreparo: 10 }] };
      await page.goto(`${base}/pages/${perfil}.html`);
      const card = page.locator('article').filter({ hasText: '987654' }).first();
      await card.getByRole('button', { name: 'Alterar pedido' }).click();
      await page.locator('#editOrderDialog').waitFor({ state: 'visible' });
      await page.locator('[data-edit-quantity]').fill('2');
      await page.locator('#editOrderReason').fill('Cliente pediu mais');
      assert.match(await page.locator('#editOrderTotal').innerText(), /20,00/);
      await page.locator('#saveEditOrder').click();
      await page.locator('#editOrderDialog').waitFor({ state: 'hidden' });
      assert.equal(lastEdit.itens[0].quantidade, 2);
      if (perfil === 'atendente') {
        await card.getByRole('button', { name: 'Cancelar', exact: true }).click();
        await page.locator('#cancelarObs').fill('Cliente desistiu');
        await page.locator('#cancelarConfirmarBtn').click();
        await page.locator('#cancelarModal').waitFor({ state: 'hidden' });
      } else {
        await card.getByRole('button', { name: 'Cancelar pedido', exact: true }).click();
        await page.locator('#cancelOrderReason').fill('Cliente desistiu');
        await page.locator('#confirmCancelOrder').click();
        await page.locator('#cancelOrderDialog').waitFor({ state: 'hidden' });
      }
      assert.equal(lastCancel.origemCancelamento, perfil === 'cozinha' ? 'Cozinha' : 'Atendente');
      assert.equal(lastCancel.motivo, 'Cliente desistiu');
      console.log(`${perfil}: edição e cancelamento em ${status} OK`);
    }
    await context.close();
  }
  const context = await browser.newContext();
  await context.addInitScript(session => sessionStorage.setItem('dataplate:adminSession', JSON.stringify(session)), sessions.gerente);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`gerente: ${error.message}`));
  const cancelados = ['Cozinha', 'Atendente'].map((origem, index) => ({
    id: 987650 + index, numeroMesa: 101, origem: 'MESA', status: 'CANCELADO',
    dataHora: new Date().toISOString(), valorTotal: 10, itens: [], observacoes: 'Sem cebola',
    motivoCancelamento: `Solicitado pelo cliente da ${origem}`, origemCancelamento: origem
  }));
  await page.route('**/api/pedidos?**', route => route.fulfill({ json: { content: cancelados, totalPages: 1 } }));
  await page.goto(`${base}/pages/adm.html`);
  await page.evaluate(() => navigateTo('cancelamentos'));
  await page.locator('#cancelTbody').getByText('Origem: Cozinha', { exact: false }).waitFor();
  const text = await page.locator('#cancelTbody').innerText();
  assert.match(text, /Origem: Atendente/);
  assert.match(text, /Solicitado pelo cliente da Cozinha/);
  console.log('gerente: origem e motivo dos dois setores visíveis OK');
  assert.deepEqual(errors, [], 'Erros JavaScript no navegador');
  console.log('Cinco logins locais e fluxos das três telas aprovados.');
  await context.close();
} finally { await browser.close(); }
