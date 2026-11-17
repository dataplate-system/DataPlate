import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

const base = process.env.DATAPLATE_FRONTEND_URL || 'http://127.0.0.1:5500';
const artifacts = path.join(os.tmpdir(), 'dataplate-pedidos-ui');
await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
async function session(perfil, final, viewport = { width: 1440, height: 1000 }) {
  const response = await fetch('http://127.0.0.1:8081/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cpf: `0000000000${final}`, senha: 'admin123' })
  });
  assert.equal(response.status, 200);
  const user = await response.json();
  const context = await browser.newContext({ viewport });
  await context.addInitScript(session => sessionStorage.setItem('dataplate:adminSession', JSON.stringify(session)),
    { ...user, backendRole: user.role, userKey: perfil });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addLocatorHandler(page.locator('#lowStockAlert[open]'), async () => {
    await page.locator('#lowStockAlertConfirm').click();
    await page.locator('#lowStockAcknowledgementClose').click();
  });
  return { context, page };
}
try {
  const { context, page } = await session('gerente', 2);
  await page.goto(`${base}/pages/adm.html`);
  await page.evaluate(() => navigateTo('pedidos'));
  async function filter(action, expected) {
    const result = page.waitForResponse(r => {
      const url = new URL(r.url());
      return r.request().method() === 'GET' && url.pathname.endsWith('/api/pedidos') && expected(url.searchParams);
    });
    await action();
    const response = await result;
    assert.equal(response.status(), 200);
    const data = await response.json();
    await page.waitForFunction(count => document.getElementById('pedidosResultado').textContent.startsWith(`${count} pedido`), data.totalElements);
    assert.equal(await page.locator('#pedidos tbody tr:visible:not(:has(td[colspan]))').count(), data.content.length);
    return data;
  }
  for (const status of ['cancelado', 'entregue']) {
    const data = await filter(() => page.locator('#pedidosStatus').selectOption(status), p => p.get('status') === status.toUpperCase());
    assert.ok(data.totalElements > 0, `Há pedidos ${status} no banco local`);
    assert.ok(data.content.every(order => order.status === status.toUpperCase()));
    if (status === 'cancelado') {
      const horarios = data.content.map(order => new Date(order.canceladoEm || order.atualizadoEm || order.dataHora).getTime());
      assert.deepEqual(horarios, [...horarios].sort((a, b) => b - a), 'Recentes usa o horário do cancelamento');
      assert.ok(data.content.every(order => ['Atendente', 'Cozinha'].includes(order.origemCancelamento)));
      assert.ok(data.content.every(order => order.motivoCancelamento && !/teste/i.test(order.motivoCancelamento)));
    }
    const first = await page.locator('#pedidos tbody tr').first().innerText();
    assert.ok(first.includes(`#${data.content[0].id}`));
    console.log(`${status}: ${data.totalElements} resultados, ${data.totalPages} páginas coerentes`);
  }
  for (const ordem of ['antigos', 'recentes']) {
    const data = await filter(() => page.locator('#pedidosOrdem').selectOption(ordem), p => p.get('ordem') === ordem);
    assert.ok((await page.locator('#pedidos tbody tr').first().innerText()).includes(`#${data.content[0].id}`));
  }
  const cancelados = await filter(() => page.locator('#pedidosStatus').selectOption('cancelado'), p => p.get('status') === 'CANCELADO');
  const sample = cancelados.content.find(order => order.clienteNome && order.numeroMesa);
  assert.ok(sample);
  await filter(() => page.locator('#pedidosMesa').fill(String(sample.numeroMesa)), p => p.get('mesa') === String(sample.numeroMesa));
  await filter(() => page.locator('#pedidosCliente').fill(sample.clienteNome), p => p.get('cliente') === sample.clienteNome);
  const exact = await filter(() => page.locator('#pedidosNumero').fill(`#${sample.id}`), p => p.get('numero') === `#${sample.id}`);
  assert.equal(exact.totalElements, 1);
  await page.locator('#pedidos tbody button').first().click();
  await page.locator('#orderDetailsContent .order-cancellation-details').waitFor();
  const details = await page.locator('#orderDetailsContent').innerText();
  assert.match(details, /Pedido realizado em/);
  assert.match(details, /Cancelado em/);
  if (sample.canceladoEm) assert.ok(!details.includes('Horário não registrado'));
  const close = page.locator('#orderDetailsModal .modal-close');
  await close.hover();
  await page.waitForTimeout(200);
  assert.equal(await close.evaluate(el => getComputedStyle(el).color), 'rgb(220, 38, 38)');
  await page.screenshot({ path: path.join(artifacts, 'gerente-detalhes.png') });
  await close.click();
  const vazio = await filter(() => page.locator('#pedidosNumero').fill('NAO-EXISTE-999999'), p => p.get('numero') === 'NAO-EXISTE-999999');
  assert.equal(vazio.totalElements, 0);
  assert.equal(await page.locator('#pedidos .pagination-bar').count(), 0);
  await page.locator('#pedidos').getByText('Nenhum registro encontrado', { exact: true }).waitFor();
  await filter(() => page.locator('#limparPedidosFiltros').click(), p => !p.has('numero') && !p.has('status') && !p.has('cliente') && !p.has('mesa'));
  await page.screenshot({ path: path.join(artifacts, 'gerente-filtros.png'), fullPage: true });
  console.log('Filtros combinados, ordenação, estado vazio, horário e botão fechar aprovados.');
  await context.close();

  for (const [perfil, final] of [['atendente', 3], ['cozinha', 4]]) {
    for (const width of [1440, 390]) {
      const { context, page } = await session(perfil, final, { width, height: 1000 });
      await page.goto(`${base}/pages/${perfil}.html`);
      const edit = page.getByRole('button', { name: 'Alterar pedido', exact: true }).first();
      await edit.waitFor();
      assert.ok(await edit.evaluate(el => el.getBoundingClientRect().height <= 44));
      await edit.click();
      await page.locator('#editOrderDialog').waitFor({ state: 'visible' });
      assert.equal((await page.locator('#addEditItem').innerText()).trim(), '');
      await page.locator('#addEditItem').hover();
      await page.waitForTimeout(200);
      assert.equal(await page.locator('#addEditItem').evaluate(el => getComputedStyle(el).color), 'rgb(21, 128, 61)');
      assert.ok(await page.locator('#editOrderDialog').evaluate(el => el.scrollWidth <= el.clientWidth));
      await page.screenshot({ path: path.join(artifacts, `${perfil}-editar-${width}.png`) });
      await page.locator('#closeEditOrder').click();
      const cancel = page.getByRole('button', { name: perfil === 'atendente' ? 'Cancelar' : 'Cancelar pedido', exact: true }).first();
      await cancel.click();
      const dialog = page.locator(perfil === 'atendente' ? '#cancelarModal' : '#cancelOrderDialog');
      await dialog.waitFor({ state: 'visible' });
      const text = await dialog.innerText();
      assert.ok(!text.includes('gerente receberá') && !text.includes('Atencao:') && !text.includes('Atenção:'));
      await page.screenshot({ path: path.join(artifacts, `${perfil}-cancelar-${width}.png`) });
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log(`Layout desktop/celular aprovado. Capturas: ${artifacts}`);
} finally { await browser.close(); }
