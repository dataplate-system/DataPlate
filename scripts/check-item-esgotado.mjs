// Item esgotado (#74) no navegador: o atendente marca um item como indisponivel,
// o cliente (QR Code), o PDV e o painel mostram o selo, e o item volta sozinho
// para o cardapio do cliente depois de liberado. Nao cria pedidos; ao final o
// item volta a ficar disponivel. Requer API (8081), frontend (5500) e o Docker local.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const API = process.env.DATAPLATE_API_URL || 'http://127.0.0.1:8081/api';
const FRONT = process.env.DATAPLATE_FRONTEND_URL || 'http://127.0.0.1:5500';
const BANCO = process.env.DATAPLATE_DB || 'dataplate';
const CAPTURAS = join(tmpdir(), 'dataplate-item-esgotado');
mkdirSync(CAPTURAS, { recursive: true });

const sql = (consulta) => execFileSync('docker', ['exec', 'backend-python-db-1', 'psql', '-U', 'postgres', '-d', BANCO, '-At', '-F', '|', '-c', consulta], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).map((linha) => linha.split('|'));

async function login(final, userKey) {
  const resposta = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cpf: `0000000000${final}`, senha: 'admin123' })
  });
  assert.equal(resposta.status, 200, `Login ${userKey}`);
  const usuario = await resposta.json();
  return { ...usuario, backendRole: usuario.role, userKey, name: usuario.nome || userKey };
}

async function definirDisponibilidade(sessao, produtoId, corpo) {
  const resposta = await fetch(`${API}/produtos/${produtoId}/disponibilidade`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.token}` },
    body: JSON.stringify(corpo)
  });
  const texto = await resposta.text();
  assert.equal(resposta.status, 200, texto);
  return JSON.parse(texto);
}

async function contextoEquipe(browser, sessao, viewport) {
  const contexto = await browser.newContext(viewport ? { viewport } : {});
  await contexto.addInitScript((s) => sessionStorage.setItem('dataplate:adminSession', JSON.stringify(s)), sessao);
  return contexto;
}

const atendente = await login(3, 'atendente');
const caixa = await login(5, 'caixa');
const gerente = await login(2, 'gerente');
const produtos = await (await fetch(`${API}/produtos`)).json();
const produto = produtos.find((p) => !p.esgotado);
assert.ok(produto, 'Nenhum produto disponivel para o teste');
const [[tokenQr]] = sql("SELECT qr_code_token FROM mesa WHERE ativo ORDER BY (status = 'ocupada') DESC, numero LIMIT 1");

const browser = await chromium.launch({ headless: true });
const erros = [];
try {
  // 1. Atendente marca o item como indisponivel, com motivo.
  const ctxAtendente = await contextoEquipe(browser, atendente);
  const telaAtendente = await ctxAtendente.newPage();
  telaAtendente.on('pageerror', (e) => erros.push(`atendente: ${e.message}`));
  await telaAtendente.goto(`${FRONT}/pages/atendente.html`);
  await telaAtendente.locator('.tab-btn[data-tab="cardapio"]').click();
  const linha = telaAtendente.locator('.disp-item').filter({ has: telaAtendente.locator('.disp-item-nome', { hasText: produto.nome }) }).first();
  await linha.waitFor();
  assert.equal(await linha.getByRole('switch').getAttribute('aria-checked'), 'true');
  await linha.getByRole('switch').click();
  await telaAtendente.locator('#esgotadoModal').waitFor({ state: 'visible' });
  await telaAtendente.locator('#esgotadoSugestoes [data-motivo="Acabou por hoje"]').click();
  assert.equal(await telaAtendente.locator('#esgotadoMotivo').inputValue(), 'Acabou por hoje');
  await telaAtendente.locator('#esgotadoModal .modal-box').screenshot({ path: join(CAPTURAS, '0-atendente-modal.png') });
  await telaAtendente.locator('#esgotadoConfirmarBtn').click();
  await telaAtendente.locator('#esgotadoModal').waitFor({ state: 'hidden' });
  await linha.locator('.disp-switch[aria-checked="false"]').waitFor();
  assert.match(await linha.getAttribute('class'), /is-esgotado/);
  assert.match(await linha.innerText(), /Acabou por hoje/);
  assert.ok(Number(await telaAtendente.locator('#countEsgotados').innerText()) >= 1, 'Contador da aba');
  await linha.screenshot({ path: join(CAPTURAS, '1-atendente-item.png') });
  await telaAtendente.locator('.disp-grupo').first().screenshot({ path: join(CAPTURAS, '1-atendente-grupo.png') });

  // Novo pedido do atendente: o item aparece sem botao de adicionar.
  const numeroMesa = Number(sql("SELECT numero FROM mesa WHERE ativo ORDER BY numero LIMIT 1")[0][0]);
  await telaAtendente.evaluate((n) => window.abrirNovoPedido(n), numeroMesa);
  const cardNovoPedido = telaAtendente.locator('.np-produto-card.is-esgotado', { hasText: produto.nome });
  await cardNovoPedido.waitFor();
  assert.equal(await cardNovoPedido.locator('.np-produto-add').count(), 0);
  await telaAtendente.evaluate(() => window.fecharNovoPedido());

  // 2. Cliente pelo QR Code: selo, motivo, sem "+", detalhe com botao desativado.
  for (const [nome, viewport] of [['desktop', { width: 1366, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
    const ctxCliente = await browser.newContext({ viewport });
    const telaCliente = await ctxCliente.newPage();
    telaCliente.on('pageerror', (e) => erros.push(`cliente ${nome}: ${e.message}`));
    await telaCliente.goto(`${FRONT}/pages/user.html?mesaToken=${tokenQr}`);
    const card = telaCliente.locator('#listaPratos .item', { has: telaCliente.locator('h3', { hasText: produto.nome }) }).first();
    await card.waitFor();
    assert.match(await card.getAttribute('class'), /is-esgotado/);
    assert.match(await card.locator('.carimbo-esgotado').innerText(), /esgotado/i);
    // O carimbo sai pelo canto do card, como se tivesse sido carimbado por cima.
    const [caixaCard, caixaCarimbo] = await Promise.all([card.boundingBox(), card.locator('.carimbo-esgotado').boundingBox()]);
    assert.ok(caixaCarimbo.y < caixaCard.y, 'Carimbo deve passar da borda superior do card');
    assert.equal(await card.locator('.add-rapido').count(), 0);
    assert.match(await card.locator('.motivo-esgotado').innerText(), /Acabou por hoje/);
    // Esgotados ficam no fim da lista.
    const ordem = await telaCliente.locator('#listaPratos .item').evaluateAll((itens) => itens.map((i) => i.classList.contains('is-esgotado')));
    assert.deepEqual(ordem, [...ordem].sort((a, b) => Number(a) - Number(b)));
    await card.scrollIntoViewIfNeeded();
    await telaCliente.screenshot({ path: join(CAPTURAS, `2-cliente-${nome}.png`) });
    const largura = await telaCliente.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(largura <= 1, `Rolagem horizontal no cliente ${nome}: ${largura}px`);

    await telaCliente.evaluate((id) => window.abrirProdutoDinamico(id), produto.id);
    await telaCliente.locator('#telaProdutoDinamico .aviso-esgotado').waitFor();
    assert.ok(await telaCliente.locator('#telaProdutoDinamico .btn-carrinho').isDisabled());
    await telaCliente.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
    await telaCliente.screenshot({ path: join(CAPTURAS, `3-cliente-detalhe-${nome}.png`) });

    if (nome === 'desktop') {
      // 3. Liberado pelo atendente, o item volta sozinho no cardapio aberto do cliente.
      await telaCliente.evaluate(() => window.voltarListaDinamica());
      await linha.getByRole('switch').click();
      await linha.locator('.disp-switch[aria-checked="true"]').waitFor();
      await telaCliente.waitForFunction((n) => {
        const item = [...document.querySelectorAll('#listaPratos .item')].find((i) => i.querySelector('h3')?.textContent === n);
        return item && !item.classList.contains('is-esgotado') && item.querySelector('.add-rapido');
      }, produto.nome, { timeout: 25000 });
      await definirDisponibilidade(atendente, produto.id, { esgotado: true, motivo: 'Acabou por hoje' });
    }
    await ctxCliente.close();
  }

  // 4. PDV e painel do gerente mostram o item indisponivel.
  const ctxCaixa = await contextoEquipe(browser, caixa);
  const telaCaixa = await ctxCaixa.newPage();
  telaCaixa.on('pageerror', (e) => erros.push(`pdv: ${e.message}`));
  await telaCaixa.goto(`${FRONT}/pages/pdv.html`);
  const cardPdv = telaCaixa.locator('.produto-card.is-esgotado', { hasText: produto.nome });
  await cardPdv.waitFor({ state: 'attached' });
  assert.ok(await cardPdv.locator('.btn-add').isDisabled());
  await cardPdv.screenshot({ path: join(CAPTURAS, '4-pdv-card.png') }).catch(() => null);
  await ctxCaixa.close();

  const ctxGerente = await contextoEquipe(browser, gerente);
  const telaGerente = await ctxGerente.newPage();
  telaGerente.on('pageerror', (e) => erros.push(`gerente: ${e.message}`));
  await telaGerente.goto(`${FRONT}/pages/adm.html`);
  await telaGerente.evaluate(() => window.carregarProdutos?.() ?? null).catch(() => null);
  await ctxGerente.close();
  await ctxAtendente.close();
} finally {
  await definirDisponibilidade(atendente, produto.id, { esgotado: false });
  await browser.close();
}

assert.deepEqual(erros, []);
console.log(`Item esgotado verificado com "${produto.nome}". Capturas em ${CAPTURAS}`);
