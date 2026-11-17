import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

const api = process.env.DATAPLATE_API_URL || 'http://localhost:8081/api';
const base = process.env.DATAPLATE_FRONTEND_URL || 'http://localhost:5500';
const login = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf: '00000000003', senha: 'admin123' }) });
assert.equal(login.status, 200);
const auth = await login.json();
const headers = { Authorization: `Bearer ${auth.token}` };
const mesas = await (await fetch(`${api}/mesas`, { headers })).json();
const pedidos = await (await fetch(`${api}/pedidos/ativos`, { headers })).json();
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(session => sessionStorage.setItem('dataplate:adminSession', JSON.stringify(session)), {
    token: auth.token, backendRole: auth.role, userKey: 'atendente', name: auth.nome
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/pages/atendente.html`);
  await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden' && document.querySelector('#mesaStatusSummary button'));
  assert.equal(await page.locator('.card-obs').filter({ hasText: 'Massa de teste 2026' }).count(), 0);
  const readyCounter = pedidos.filter(p => p.status === 'PRONTO' && !p.numeroMesa);
  assert.equal(await page.getByRole('button', { name: 'Confirmar retirada no balcão' }).count(), readyCounter.length);
  await page.locator('[data-tab="mesas"]').click();
  assert.equal(await page.locator('#mesasGrid .mesa-card').count(), mesas.length);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const status of ['livre', 'ocupada', 'reservada', 'aguardando_pagamento']) {
      await page.locator(`[data-mesa-filter="${status}"]`).click();
      const expected = mesas.filter(m => m.status === status || (status === 'livre' && m.status === 'disponivel')).length;
      assert.equal(await page.locator('#mesasGrid .mesa-card').count(), expected, `Filtro real ${status}`);
      if (status === 'aguardando_pagamento') {
        await page.screenshot({ path: path.join(os.tmpdir(), `dataplate-mesas-pagamento-${width}.png`), fullPage: true });
      }
      await page.locator(`[data-mesa-filter="${status}"]`).click();
      assert.equal(await page.locator('#mesasGrid .mesa-card').count(), mesas.length);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  assert.deepEqual(errors, []);
  console.log(`OK: banco real, ${mesas.length} mesas, ${readyCounter.length} pedido(s) pronto(s) de balcao com retirada; 4 filtros desktop/mobile; sem erros JS. Nenhum pedido foi alterado.`);
} finally { await browser.close(); }
