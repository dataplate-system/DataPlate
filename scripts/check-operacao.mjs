import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const base = process.env.DATAPLATE_FRONTEND_URL || 'http://localhost:5500';
const api = process.env.DATAPLATE_API_URL || 'http://localhost:8081/api';
const output = path.join(os.tmpdir(), 'dataplate-operacao-review');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const now = new Date().toISOString();
let order = { id: 99101, numeroMesa: 1, status: 'RECEBIDO', dataHora: now, atualizadoEm: now,
  valorTotal: 29.9, observacoes: 'Massa de teste 2026 | Sem cebola | Pagamento: PIX', itens: [{ produtoId: 1, nomeProduto: 'Hambúrguer Clássico', quantidade: 1, precoUnitario: 29.9, subtotal: 29.9 }] };
const servido = { ...order, id: 99102, status: 'SERVIDO', dataHora: '2026-09-01T12:00:00' };
let balcao = { ...order, id: 99103, numeroMesa: null, status: 'PRONTO', observacoes: 'Pagamento: PIX' };
const mesas = ['livre', 'ocupada', 'reservada', 'aguardando_pagamento'].map((status, i) => ({ id: i + 1, numero: i + 1, status, localizacao: 'Salão principal', capacidade: 4 }));

async function open(role, cpf, pageName) {
  const passwords = { atendente: 'Atendente123', cozinha: 'Cozinha123', caixa: 'Caixa123' };
  const response = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf, senha: passwords[role] }) });
  assert.equal(response.status, 200);
  const auth = await response.json();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(session => sessionStorage.setItem('dataplate:adminSession', JSON.stringify(session)), {
    token: auth.token, backendRole: auth.role, name: auth.nome, userKey: role, initials: 'QA', role
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${pageName}: ${error.message}`));
  await page.route('**/api/pedidos/ativos', route => route.fulfill({ json: [order, servido, ...(balcao.status === 'PRONTO' ? [balcao] : [])] }));
  await page.route('**/api/mesas', route => route.fulfill({ json: mesas }));
  await page.route(`**/api/pedidos/${order.id}`, route => route.fulfill({ json: order }));
  await page.goto(`${base}/pages/${pageName}.html`);
  return { page, context };
}

try {
  const { page: atendente, context: ac } = await open('atendente', '91000000354', 'atendente');
  await atendente.waitForFunction(() => document.getElementById('statRecebido')?.textContent === '1');
  assert.equal(await atendente.locator('#statTempo').innerText(), '0 min', 'Pedido servido antigo nao entra na media');
  assert.equal(await atendente.locator('#listRecebido .card-obs').innerText(), 'Observação: Sem cebola');
  let dispatched = false;
  await atendente.route('**/api/pedidos/99103/despacho', async route => {
    dispatched = true;
    balcao = { ...balcao, status: 'ENTREGUE' };
    await route.fulfill({ json: balcao });
  });
  await atendente.getByRole('button', { name: 'Confirmar retirada no balcão' }).click();
  await atendente.waitForFunction(() => document.getElementById('statPronto').textContent === '0');
  assert.ok(dispatched);
  await atendente.locator('[data-tab="mesas"]').click();
  await atendente.locator('.mesa-card').first().waitFor();
  for (const width of [1440, 768, 390]) {
    await atendente.setViewportSize({ width, height: 1000 });
    const badges = await atendente.locator('.mesa-top > .badge').evaluateAll(elements => elements.map(el => ({
      text: el.textContent, wordBreak: getComputedStyle(el).wordBreak,
      wrap: getComputedStyle(el).overflowWrap, width: el.clientWidth, scroll: el.scrollWidth
    })));
    assert.equal(badges.length, 4);
    assert.ok(badges.every(b => b.wordBreak === 'normal' && b.wrap === 'normal' && b.scroll <= b.width + 1), JSON.stringify(badges));
    await atendente.screenshot({ path: path.join(output, `atendente-${width}.png`), fullPage: true });
  }
  for (const status of ['livre', 'ocupada', 'reservada', 'aguardando_pagamento']) {
    await atendente.locator(`[data-mesa-filter="${status}"]`).click();
    assert.equal(await atendente.locator('#mesasGrid .mesa-card').count(), 1);
    assert.equal(await atendente.locator(`#mesasGrid .status-${status}`).count(), 1);
    await atendente.evaluate(() => loadData({ silent: true }));
    assert.equal(await atendente.locator(`#mesasGrid .status-${status}`).count(), 1);
    await atendente.locator('#clearMesaFilter').click();
    assert.equal(await atendente.locator('#mesasGrid .mesa-card').count(), 4);
  }
  assert.ok((await atendente.locator('#mesasGrid .mesa-card').first().getAttribute('class')).includes('aguardando_pagamento'));
  await atendente.route('**/api/pedidos/ativos', route => route.fulfill({ json: [servido] }));
  await atendente.evaluate(() => loadData({ silent: true }));
  assert.equal(await atendente.locator('#statTempo').innerText(), '--', 'Sem fila, sem tempo de espera');
  await ac.close();

  const { page: cozinha, context: kc } = await open('cozinha', '91000000435', 'cozinha');
  await cozinha.locator('[data-edit-order]').first().click();
  await cozinha.locator('#editOrderDialog').waitFor({ state: 'visible' });
  await cozinha.locator('[data-edit-quantity]').fill('2');
  await cozinha.locator('#editOrderReason').fill('Cliente solicitou outra unidade');
  let saved = false;
  await cozinha.route(`**/api/pedidos/${order.id}/itens`, async route => {
    const payload = route.request().postDataJSON();
    assert.equal(payload.itens[0].quantidade, 2);
    assert.equal(payload.atualizadoEm, now);
    order = { ...order, itens: [{ ...order.itens[0], quantidade: 2 }], valorTotal: 59.8 };
    saved = true;
    await route.fulfill({ json: order });
  });
  await cozinha.locator('#saveEditOrder').click();
  await cozinha.locator('#editOrderDialog').waitFor({ state: 'hidden' });
  assert.ok(saved);
  for (const width of [1440, 390]) {
    await cozinha.setViewportSize({ width, height: 1000 });
    assert.ok(await cozinha.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Cozinha sem overflow horizontal');
    await cozinha.screenshot({ path: path.join(output, `cozinha-${width}.png`), fullPage: true });
  }
  await kc.close();

  const { page: pdv, context: pc } = await open('caixa', '91000000516', 'pdv');
  await pdv.locator('.produto-card').first().waitFor();
  await pdv.waitForFunction(() => [...document.querySelectorAll('.produto-img')].every(img => img.complete && img.naturalWidth > 0));
  assert.equal(await pdv.locator('.produto-img-placeholder:visible').count(), 0, 'Catalogo demo com fotografias reais');
  const categories = await (await fetch(`${api}/categorias`)).json();
  const products = await (await fetch(`${api}/produtos`)).json();
  for (const category of categories) {
    await pdv.locator(`[data-cat="${category.id}"]`).click();
    const names = await pdv.locator('.produto-nome').allTextContents();
    const expected = products.filter(p => p.idCategoria === category.id && p.ativo !== false).map(p => p.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    assert.deepEqual(names, expected, `Filtro da categoria ${category.nome}`);
  }
  await pdv.locator('[data-cat="todos"]').click();
  for (const width of [1440, 390]) {
    await pdv.setViewportSize({ width, height: 1000 });
    const clipped = await pdv.locator('.produto-card').evaluateAll(cards => cards.filter(card => {
      const button = card.querySelector('.btn-add').getBoundingClientRect();
      return button.bottom > card.getBoundingClientRect().bottom + 1;
    }).length);
    assert.equal(clipped, 0, 'Botoes e precos cabem nos cards de produto');
    assert.ok(await pdv.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'PDV sem overflow horizontal');
    await pdv.screenshot({ path: path.join(output, `pdv-${width}.png`), fullPage: true });
  }
  await pc.close();
  assert.deepEqual(errors, []);
  console.log(`OK: mesas, tempo de espera, edicao da cozinha e fotos PDV; desktop/mobile. Capturas: ${output}`);
} finally { await browser.close(); }
