import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

const api = process.env.DATAPLATE_API_URL || 'http://localhost:8081/api';
const base = process.env.DATAPLATE_FRONTEND_URL || 'http://localhost:5500';
const output = path.join(os.tmpdir(), 'dataplate-pdv-controls');
await fs.mkdir(output, { recursive: true });
const response = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf: '00000000005', senha: 'admin123' }) });
assert.equal(response.status, 200);
const auth = await response.json();
const headers = { Authorization: `Bearer ${auth.token}` };
const products = await (await fetch(`${api}/produtos`)).json();
assert.equal(new Set(products.map(p => p.imagem)).size, products.length, 'Fotografia distinta por produto do catalogo local');
const tables = await (await fetch(`${api}/mesas`, { headers })).json();
const pending = tables.filter(t => t.status === 'aguardando_pagamento');
const active = await (await fetch(`${api}/pedidos/ativos`, { headers })).json();
const counter = active.filter(p => !p.numeroMesa && ['PRONTO', 'SERVIDO'].includes(p.status));
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(session => sessionStorage.setItem('dataplate:adminSession', JSON.stringify(session)), {
      token: auth.token, backendRole: auth.role, userKey: 'caixa', name: auth.nome
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/pages/pdv.html`);
    await page.locator('.produto-card').first().waitFor();
    // As fotos tem carregamento preguicoso: so as que estao na tela precisam ter carregado.
    await page.waitForFunction(() => [...document.querySelectorAll('.produto-img')]
      .filter(img => img.getBoundingClientRect().top < innerHeight)
      .every(img => img.complete && img.naturalWidth > 0));
    await page.locator('.produto-card .btn-add').first().click();
    if (width < 901) await page.locator('#pdvMobileOrder').click();
    await page.locator('#cartItems .cart-row').first().waitFor();
    const total = await page.locator('#cartTotal').textContent();
    for (const type of ['PIX', 'DEBITO', 'CREDITO', 'DINHEIRO']) {
      await page.locator(`#pagamentoVendaSection [data-pgto="${type}"]`).click();
      const selected = page.locator('#pagamentoVendaSection .is-selected');
      assert.equal(await selected.count(), 1);
      assert.equal(await selected.getAttribute('aria-pressed'), 'true');
      await expect(selected).toHaveCSS('background-color', 'rgb(234, 242, 255)');
    }
    await page.locator('[data-top="pendencias"]').click();
    await page.waitForFunction(count => document.getElementById('pendingCount').textContent === String(count), pending.length + counter.length);
    assert.equal(await page.locator('#vistaPdv').isVisible(), false);
    assert.equal(await page.locator('#pendentesGrid .pendente-card').count(), pending.length);
    assert.equal(await page.locator('#balcaoProntosGrid .pendente-card').count(), counter.length);
    for (const id of ['pendentesGrid', 'balcaoProntosGrid']) {
      assert.ok(await page.locator(`#${id}`).evaluate(el => el.scrollHeight <= el.clientHeight + 1), 'Listas de pendencias sem barras de rolagem internas');
    }
    if (pending.length) {
      await page.locator('#pendingSearch').fill(`Mesa ${pending[0].numero}`);
      assert.equal(await page.locator('#vistaPendencias .pendente-card:visible').count(), 1);
      await page.locator('#pendingSearch').fill('sem-correspondencia-xyz');
      assert.ok(await page.locator('#pendingSearchEmpty').isVisible());
      await page.locator('#pendingSearch').fill('');
      await page.locator('#pendentesGrid .pendente-btn').first().click();
      await page.locator('#pdvPgtoModal').waitFor({ state: 'visible' });
      assert.ok(await page.locator('#pdvPgtoConfirmar').isDisabled());
      for (const type of ['PIX', 'DEBITO', 'CREDITO', 'DINHEIRO']) {
        await page.locator(`#pdvPgtoModal [data-pgto="${type}"]`).click();
        assert.equal(await page.locator('#pdvPgtoModal .is-selected').count(), 1);
        assert.equal(await page.locator('#pdvPgtoModal .is-selected .pgto-opt-arrow').textContent(), '✓');
        await expect(page.locator('#pdvPgtoModal .is-selected')).toHaveCSS('background-color', 'rgb(234, 242, 255)');
        assert.ok(await page.locator('#pdvPgtoConfirmar').isEnabled());
      }
      await page.screenshot({ path: path.join(output, `pagamento-${width}.png`), fullPage: true });
      await page.locator('#pdvPgtoModal .pgto-cancel-btn').click();
    }
    await page.screenshot({ path: path.join(output, `pendencias-${width}.png`), fullPage: true });
    await page.locator('[data-top="historico"]').click();
    assert.ok(await page.locator('#vistaHistorico').isVisible());
    assert.equal(await page.locator('#vistaPendencias').isVisible(), false);
    await page.locator('[data-top="pdv"]').click();
    assert.equal(await page.locator('#cartTotal').textContent(), total, 'Carrinho preservado entre abas');
    await expect(page.locator('.pdv-top-tab.is-active')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await page.locator('#finalizarBtn').scrollIntoViewIfNeeded();
    const notes = await page.locator('#pedidoObs').boundingBox();
    const finish = await page.locator('#finalizarBtn').boundingBox();
    assert.ok(notes.y + notes.height <= finish.y, 'Botao de finalizar nao cobre as observacoes');
    await page.screenshot({ path: path.join(output, `venda-${width}.png`), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(`OK: selecao de pagamentos, abas, contadores, busca, carrinho preservado, fotos distintas e desktop/mobile. Capturas: ${output}. Nenhuma venda ou pagamento registrado.`);
} finally { await browser.close(); }
