// Fluxo real no navegador: QR Code bloqueado, abertura da mesa, pedido, WebSocket das
// quatro telas da equipe e baixa de estoque. Grava dados, entao roda contra uma API
// ligada a uma copia do banco: DATAPLATE_API_URL (padrao 8091) e DATAPLATE_DB.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const API = process.env.DATAPLATE_API_URL || 'http://localhost:8091/api';
const BANCO = process.env.DATAPLATE_DB || 'dataplate_depois';
const FRONT = process.env.DATAPLATE_FRONTEND_URL || 'http://localhost:5500';
if (BANCO === 'dataplate') throw new Error('Este teste grava dados: use uma copia do banco.');

const sql = (consulta) => execFileSync('docker', ['exec', 'backend-python-db-1', 'psql', '-U', 'postgres', '-d', BANCO, '-At', '-F', '|', '-c', consulta], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).map((linha) => linha.split('|'));

const [[numeroMesa, tokenQr]] = sql("SELECT numero, qr_code_token FROM mesa WHERE status = 'livre' AND ativo ORDER BY numero LIMIT 1");
const [[produtoId, consumo, insumoId]] = sql(`
  SELECT p.id_produto, pi.quantidade, pi.insumo_id FROM produto p
  JOIN produto_insumos pi ON pi.produto_id = p.id_produto
  JOIN insumos i ON i.id = pi.insumo_id AND i.ativo
  WHERE p.ativo AND COALESCE(p.tempo_preparo, 1) > 0
  ORDER BY p.id_produto LIMIT 1`);
const saldoDoInsumo = () => Number(sql(`SELECT quantidade_atual FROM insumos WHERE id = ${insumoId}`)[0][0]);

const navegador = await chromium.launch({ channel: 'chrome', headless: true });
const preparar = async (opcoes = {}) => {
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 1000 }, ...opcoes });
  await contexto.addInitScript((api) => {
    localStorage.setItem('DATAPLATE_API_BASE_URL', api);
    localStorage.setItem('dataplate:notificacoes', JSON.stringify({ alertaEstoqueBaixo: false }));
  }, API);
  return contexto;
};

// Entra pela tela de login e registra o que passa no WebSocket.
async function entrar(cpf, destino) {
  const pagina = await (await preparar()).newPage();
  const socket = { urls: [], recebidos: [], enviados: [] };
  pagina.on('websocket', (ws) => {
    socket.urls.push(ws.url());
    ws.on('framereceived', ({ payload }) => socket.recebidos.push(JSON.parse(payload)));
    ws.on('framesent', ({ payload }) => socket.enviados.push(JSON.parse(payload)));
  });
  await pagina.goto(`${FRONT}/pages/adm-login.html`);
  await pagina.locator('#adminCpf').fill(cpf);
  await pagina.locator('#adminPassword').fill('admin123');
  await pagina.locator('#adminLoginForm button[type="submit"]').click();
  await pagina.waitForURL(`**/${destino}`);
  await pagina.waitForFunction(() => document.documentElement.style.visibility !== 'hidden');
  return { pagina, socket };
}

const esperarEvento = async (socket, tipo, descricao) => {
  for (let i = 0; i < 40; i += 1) {
    if (socket.recebidos.some((evento) => evento.type === tipo)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail(`${descricao}: evento ${tipo} nao chegou. Recebidos: ${JSON.stringify(socket.recebidos.map((e) => e.type))}`);
};

try {
  // Equipe conectada: o token vai na primeira mensagem, nunca na URL.
  const telas = {
    atendente: await entrar('00000000003', 'atendente.html'),
    cozinha: await entrar('00000000004', 'cozinha.html'),
    caixa: await entrar('00000000005', 'pdv.html'),
    gerente: await entrar('00000000002', 'adm.html'),
  };
  for (const [nome, { socket }] of Object.entries(telas)) {
    await esperarEvento(socket, 'AUTENTICADO', nome);
    assert.ok(socket.urls.every((url) => !url.includes('token')), `${nome}: token na URL do WebSocket`);
    assert.equal(socket.enviados[0].type, 'AUTH', nome);
  }

  // Cliente em mesa fechada: ve o cardapio, mas nao avanca para o pagamento.
  const contextoCliente = await preparar({ viewport: { width: 390, height: 844 } });
  await contextoCliente.addInitScript((id) => {
    if (!localStorage.getItem('carrinho')) {
      localStorage.setItem('carrinho', JSON.stringify([{ produtoId: id, quantidade: 1, nome: 'Item', preco: 10 }]));
    }
  }, Number(produtoId));
  const cliente = await contextoCliente.newPage();
  await cliente.goto(`${FRONT}/pages/user.html?mesaToken=${tokenQr}`);
  const avisoMesa = cliente.locator('#avisoMesaFechada');
  await avisoMesa.waitFor({ state: 'visible' });
  await cliente.evaluate(() => confirmarPedido());
  await cliente.getByText('Mesa não aberta').first().waitFor();
  assert.equal(await cliente.locator('#telaPagamento').isVisible(), false, 'Mesa fechada nao chega ao pagamento');

  const bloqueado = await fetch(`${API}/pedidos`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mesaToken: tokenQr, itens: [{ produtoId: Number(produtoId), quantidade: 1 }] }),
  });
  assert.equal(bloqueado.status, 409, 'API recusa pedido em mesa fechada');

  // Atendente abre a mesa pela tela; o aviso do cliente some sozinho.
  await telas.atendente.pagina.evaluate((numero) => abrirMesa(numero), Number(numeroMesa));
  await telas.atendente.pagina.getByRole('button', { name: 'Abrir mesa' }).click();
  await telas.atendente.pagina.getByText('Mesa aberta').first().waitFor();
  await avisoMesa.waitFor({ state: 'hidden', timeout: 20000 });

  await cliente.evaluate(() => confirmarPedido());
  await cliente.locator('#telaPagamento').waitFor({ state: 'visible' });

  const saldoInicial = saldoDoInsumo();
  const criado = await fetch(`${API}/pedidos`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mesaToken: tokenQr, itens: [{ produtoId: Number(produtoId), quantidade: 2 }] }),
  });
  assert.equal(criado.status, 201, 'Pedido aceito com a mesa aberta');
  const pedido = await criado.json();

  // O novo pedido chega em tempo real a todas as telas da equipe.
  for (const [nome, { socket }] of Object.entries(telas)) await esperarEvento(socket, 'NOVO_PEDIDO', nome);
  assert.equal(saldoDoInsumo(), saldoInicial, 'Pedido na fila ainda nao baixa o estoque');

  // Cozinha inicia o preparo; a baixa aparece para o Gerente.
  const login = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf: '00000000004', senha: 'admin123' }),
  })).json();
  const preparo = await fetch(`${API}/pedidos/${pedido.id}/status`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` }, body: JSON.stringify({ status: 'EM_PREPARO' }),
  });
  assert.equal(preparo.status, 200, 'Cozinha inicia o preparo');
  await esperarEvento(telas.gerente.socket, 'PEDIDO_ATUALIZADO', 'gerente');
  assert.ok(Math.abs(saldoDoInsumo() - (saldoInicial - 2 * Number(consumo))) < 1e-6, 'Baixa pela ficha tecnica');

  await telas.gerente.pagina.evaluate(() => navigateTo('insumos'));
  await telas.gerente.pagina.locator('#movimentosEstoqueTable tbody').getByText(`Pedido #${pedido.id}`).first().waitFor();

  await telas.gerente.pagina.evaluate(() => navigateTo('rel-bcg'));
  await telas.gerente.pagina.locator('#bcgMatriz .bcg-quadrante').first().waitFor();
  assert.equal(await telas.gerente.pagina.locator('#bcgMatriz .bcg-quadrante').count(), 4, 'Quatro quadrantes');

  console.log(`OK: mesa ${numeroMesa} bloqueada e aberta pela equipe; WebSocket autenticado nas 4 telas sem token na URL; baixa de estoque visivel ao Gerente; Matriz BCG exibida.`);
} finally {
  await navegador.close();
}
