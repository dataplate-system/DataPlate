// Gera as capturas e evidencias do comparativo antes/depois.
//   node scripts/captura-melhorias.mjs antes|depois
// Telas: somente leitura na API local (8081). Cenarios que gravam dados rodam em
// outra API (8091) ligada a uma copia do banco, para nao alterar a massa local.
// DATAPLATE_CAPTURA_FRONT e DATAPLATE_CAPTURA_API apontam as telas para outra versao.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const fase = process.argv[2];
if (!['antes', 'depois'].includes(fase)) throw new Error('Use: antes ou depois');

const FRONT = process.env.DATAPLATE_CAPTURA_FRONT || 'http://localhost:5500';
const API_TELAS = process.env.DATAPLATE_CAPTURA_API || null;
const API = 'http://localhost:8081/api';
const API_COPIA = 'http://localhost:8091/api';
const WS_COPIA = 'ws://localhost:8091/ws';
const BANCO = 'dataplate';
const BANCO_COPIA = `dataplate_${fase}`;
const CONTAINER_DB = 'backend-python-db-1';
const CONTAINER_COPIA = `dataplate-api-${fase}`;
const IMAGEM_COPIA = `dataplate-api-${fase}:local`;
const INICIO_MES = '2026-11-01';
const pasta = `docs/apresentacao/melhorias/${fase}`;
mkdirSync(pasta, { recursive: true });

const sql = (banco, consulta) => execFileSync('docker', ['exec', CONTAINER_DB, 'psql', '-U', 'postgres', '-d', banco, '-At', '-F', '|', '-c', consulta], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).map((linha) => linha.split('|'));
const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

async function chamar(metodo, url, corpo, token) {
  const resposta = await fetch(url, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  let dados = null;
  try { dados = JSON.parse(texto); } catch { dados = texto; }
  return { status: resposta.status, dados };
}

const entrar = async (api, cpf) => (await chamar('POST', `${api}/auth/login`, { cpf, senha: 'admin123' })).dados;
const decodificarJwt = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

const logsDoContainer = (nome) => {
  const { stdout, stderr } = spawnSync('docker', ['logs', nome], { encoding: 'utf8', maxBuffer: 2 ** 26 });
  return `${stdout}\n${stderr}`;
};

// Conexao da equipe no WebSocket e o que fica registrado no log da API.
async function evidenciaWebsocket(token) {
  const socket = fase === 'antes' ? new WebSocket(`${WS_COPIA}?token=${encodeURIComponent(token)}`) : new WebSocket(WS_COPIA);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', () => { if (fase === 'depois') socket.send(JSON.stringify({ type: 'AUTH', token })); resolve(); }, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  await espera(700);
  socket.close();
  await espera(300);
  const linhaLog = logsDoContainer(CONTAINER_COPIA).split('\n').filter((linha) => linha.includes('"WebSocket /ws')).pop() || '';
  const tokenNoLog = linhaLog.match(/token=([^ "&]+)/)?.[1];
  return {
    linhaDeLog: linhaLog.replace(/token=[^ "&]+/, (trecho) => `${trecho.slice(0, 18)}...`).replace(/^.*?"WebSocket/, '"WebSocket').trim(),
    tokenNoLog: Boolean(tokenNoLog),
    subDoTokenNoLog: tokenNoLog ? decodificarJwt(decodeURIComponent(tokenNoLog)).sub : null,
  };
}

async function evidencias() {
  const saida = {};
  const gerente = await entrar(API_COPIA, '00000000002');

  // Pedido anonimo em mesa que ninguem abriu: equivale a usar uma foto antiga do QR Code.
  const [[numero, tokenQr]] = sql(BANCO_COPIA, "SELECT numero, qr_code_token FROM mesa WHERE status = 'livre' AND ativo ORDER BY numero DESC LIMIT 1");
  const [[produtoId, nomeProduto]] = sql(BANCO_COPIA, `
    SELECT p.id_produto, p.nome FROM produto p
    WHERE p.ativo AND COALESCE(p.tempo_preparo, 1) > 0
      AND EXISTS (SELECT 1 FROM produto_insumos pi JOIN insumos i ON i.id = pi.insumo_id WHERE pi.produto_id = p.id_produto AND i.ativo)
    ORDER BY p.id_produto LIMIT 1`);
  const pedidoQr = await chamar('POST', `${API_COPIA}/pedidos`, { mesaToken: tokenQr, itens: [{ produtoId: Number(produtoId), quantidade: 1 }] });
  const [[statusMesa]] = sql(BANCO_COPIA, `SELECT status FROM mesa WHERE numero = ${numero}`);
  saida.qrCode = { mesa: Number(numero), statusRecebido: pedidoQr.status, mensagem: pedidoQr.dados?.mensagem || null, pedidoCriado: pedidoQr.status === 201, statusMesaDepois: statusMesa };
  if (fase === 'depois') {
    // Com a mesa aberta pela equipe, o mesmo QR Code volta a aceitar pedidos.
    const [[mesaId]] = sql(BANCO_COPIA, `SELECT id_mesa FROM mesa WHERE numero = ${numero}`);
    await chamar('PATCH', `${API_COPIA}/mesas/${mesaId}/status`, { status: 'ocupada' }, gerente.token);
    const aberta = await chamar('POST', `${API_COPIA}/pedidos`, { mesaToken: tokenQr, itens: [{ produtoId: Number(produtoId), quantidade: 1 }] });
    saida.qrCode.statusComMesaAberta = aberta.status;
  }

  // Venda de 2 unidades: o estoque so muda se o pedido der baixa ao entrar em preparo.
  const ficha = sql(BANCO_COPIA, `
    SELECT i.id, i.nome, pi.quantidade, i.unidade FROM produto_insumos pi JOIN insumos i ON i.id = pi.insumo_id
    WHERE pi.produto_id = ${produtoId} AND i.ativo ORDER BY i.id`);
  const estoque = async () => Object.fromEntries((await chamar('GET', `${API_COPIA}/insumos`, undefined, gerente.token)).dados.map((i) => [i.id, i.quantidadeAtual]));
  const antesVenda = await estoque();
  const venda = await chamar('POST', `${API_COPIA}/pedidos`, { vendaCaixa: true, formaPagamento: 'PIX', itens: [{ produtoId: Number(produtoId), quantidade: 2 }] }, gerente.token);
  const preparo = await chamar('PUT', `${API_COPIA}/pedidos/${venda.dados.id}/status`, { status: 'EM_PREPARO' }, gerente.token);
  const depoisVenda = await estoque();
  saida.estoque = {
    produto: nomeProduto,
    unidadesVendidas: 2,
    statusVenda: venda.status,
    statusPreparo: preparo.status,
    insumos: ficha.map(([id, nome, quantidade, unidade]) => ({ nome, unidade, consumoPorUnidade: Number(quantidade), antes: antesVenda[id], depois: depoisVenda[id] })),
  };

  // Tentativas erradas no mesmo CPF.
  const tentativas = [];
  for (let i = 0; i < 8; i += 1) tentativas.push((await chamar('POST', `${API_COPIA}/auth/login`, { cpf: '00000000003', senha: 'senha-errada' })).status);
  saida.login = { tentativasErradas: tentativas };

  // O que um token deixa legivel para quem o intercepta.
  saida.jwt = { sub: decodificarJwt(gerente.token).sub };

  saida.websocket = await evidenciaWebsocket(gerente.token);

  // Recuperacao de senha: CPF cadastrado x CPF que nao existe.
  const reset = async (rota, cpf) => {
    const r = await chamar('POST', `${API_COPIA}/auth/password-reset/${rota}`, { cpf });
    return { status: r.status, recebeuToken: Boolean(r.dados?.resetToken), emailMascarado: r.dados?.recoveryEmail || null, mensagem: r.dados?.mensagem || null };
  };
  saida.recuperacaoSenha = {
    cpfExistente: await reset('request', '00000000002'),
    cpfInexistente: await reset('request', '52998224725'),
    identifyCpfExistente: await reset('identify', '00000000002'),
  };

  // Configuracao padrao fora do ambiente local: a API nao deve subir.
  execFileSync('docker', ['rm', '-f', 'dataplate-api-padrao'], { stdio: 'ignore' });
  execFileSync('docker', ['run', '-d', '--name', 'dataplate-api-padrao', '--network', 'backend-python_default', '-e', 'DB_HOST=db', '-e', 'DB_NAME=' + BANCO_COPIA, '-e', 'DB_PASSWORD=dataplate_local', IMAGEM_COPIA], { stdio: 'ignore' });
  await espera(5000);
  const rodando = execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', 'dataplate-api-padrao'], { encoding: 'utf8' }).trim() === 'true';
  const motivo = logsDoContainer('dataplate-api-padrao');
  execFileSync('docker', ['rm', '-f', 'dataplate-api-padrao'], { stdio: 'ignore' });
  saida.configuracaoPadrao = { apiSubiu: rodando, motivo: rodando ? null : (motivo.split('\n').find((l) => l.includes('Configuracao insegura')) || motivo.trim().split('\n').pop()) };

  // Numeros dos relatorios (banco principal, somente leitura).
  const gerentePrincipal = await entrar(API, '00000000002');
  const vendas = (await chamar('GET', `${API}/relatorios/vendas?inicio=${INICIO_MES}&fim=${hoje}`, undefined, gerentePrincipal.token)).dados;
  saida.relatorioVendas = {
    periodo: `${INICIO_MES} a ${hoje}`,
    faturamento: vendas.faturamento,
    faturamentoRecebido: vendas.faturamentoRecebido ?? null,
    faturamentoEmAberto: vendas.faturamentoEmAberto ?? null,
    valorCancelado: vendas.valorCancelado ?? null,
  };
  const semFicha = sql(BANCO, 'SELECT id_produto FROM produto p WHERE NOT EXISTS (SELECT 1 FROM produto_insumos pi WHERE pi.produto_id = p.id_produto)').flat().map(Number);
  const cardapio = (await chamar('GET', `${API}/relatorios/cardapio`, undefined, gerentePrincipal.token)).dados;
  const exemplo = cardapio.topProdutos.find((p) => semFicha.includes(p.produtoId));
  saida.relatorioCardapio = exemplo ? { produtoSemFicha: exemplo.nome, faturamento: exemplo.faturamento, custoTotal: exemplo.custoTotal, lucro: exemplo.lucro } : null;
  return saida;
}

async function telas() {
  const navegador = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    // Altura grande: tabelas longas nao ficam cortadas nas capturas por elemento.
    const contexto = await navegador.newContext({ viewport: { width: 1440, height: 3400 } });
    // O alerta de estoque e seus dois avisos cobririam as telas capturadas.
    await contexto.addInitScript((api) => {
      localStorage.setItem('dataplate:notificacoes', JSON.stringify({ alertaEstoqueBaixo: false }));
      if (api) localStorage.setItem('DATAPLATE_API_BASE_URL', api);
    }, API_TELAS);
    const pagina = await contexto.newPage();
    await pagina.goto(`${FRONT}/pages/adm-login.html`);
    await pagina.locator('#adminCpf').fill('00000000002');
    await pagina.locator('#adminPassword').fill('admin123');
    await pagina.locator('#adminLoginForm button[type="submit"]').click();
    await pagina.waitForURL('**/adm.html');
    await pagina.waitForTimeout(1500);

    const abrir = async (secao, preparar) => {
      if (preparar) await pagina.evaluate(preparar, { inicio: INICIO_MES, fim: hoje });
      await pagina.evaluate((s) => navigateTo(s), secao);
      await pagina.waitForTimeout(1800);
    };

    await abrir('rel-financeiro', ({ inicio, fim }) => {
      document.getElementById('relFinanceiroInicio').value = inicio;
      document.getElementById('relFinanceiroFim').value = fim;
    });
    await pagina.locator('#rel-financeiro').screenshot({ path: `${pasta}/financeiro.png` });

    await abrir('rel-vendas', ({ inicio, fim }) => {
      document.getElementById('relVendasInicio').value = inicio;
      document.getElementById('relVendasFim').value = fim;
    });
    await pagina.locator('#rel-vendas .stats-grid').first().screenshot({ path: `${pasta}/vendas-indicadores.png` });

    await abrir('rel-cardapio');
    await pagina.locator('#rel-cardapio').screenshot({ path: `${pasta}/cardapio.png` });

    await abrir('insumos');
    await pagina.locator('#insumos').screenshot({ path: `${pasta}/insumos.png` });

    if (fase === 'depois') {
      await abrir('rel-bcg');
      await pagina.locator('#rel-bcg').screenshot({ path: `${pasta}/matriz-bcg.png` });
      await pagina.locator('#rel-bcg .bcg-grafico').screenshot({ path: `${pasta}/matriz-bcg-quadrantes.png` });
    }
    await contexto.close();

    if (fase === 'depois') {
      // A baixa e o bloqueio de login foram exercitados na copia do banco.
      const copia = await navegador.newContext({ viewport: { width: 1440, height: 1500 } });
      await copia.addInitScript((api) => {
        localStorage.setItem('dataplate:notificacoes', JSON.stringify({ alertaEstoqueBaixo: false }));
        localStorage.setItem('DATAPLATE_API_BASE_URL', api);
      }, API_COPIA);
      const telaCopia = await copia.newPage();
      for (let i = 0; i < 5; i += 1) await chamar('POST', `${API_COPIA}/auth/login`, { cpf: '00000000003', senha: 'senha-errada' });
      await telaCopia.goto(`${FRONT}/pages/adm-login.html`);
      await telaCopia.locator('#adminCpf').fill('00000000003');
      await telaCopia.locator('#adminPassword').fill('senha-errada');
      await telaCopia.locator('#adminLoginForm button[type="submit"]').click();
      await telaCopia.getByText('Muitas tentativas').waitFor();
      await telaCopia.locator('#adminLoginForm').screenshot({ path: `${pasta}/login-bloqueado.png` });

      await telaCopia.locator('#adminCpf').fill('00000000002');
      await telaCopia.locator('#adminPassword').fill('admin123');
      await telaCopia.locator('#adminLoginForm button[type="submit"]').click();
      await telaCopia.waitForURL('**/adm.html');
      await telaCopia.waitForTimeout(1500);
      await telaCopia.evaluate(() => navigateTo('insumos'));
      await telaCopia.waitForTimeout(1800);
      await telaCopia.locator('#movimentosEstoqueTable').scrollIntoViewIfNeeded();
      await telaCopia.locator('#insumos .report-section').screenshot({ path: `${pasta}/estoque-movimentacoes.png` });
      await copia.close();
    }

    const [[token]] = sql(BANCO, "SELECT qr_code_token FROM mesa WHERE status = 'livre' AND ativo ORDER BY numero DESC LIMIT 1");
    const celular = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    if (API_TELAS) await celular.addInitScript((api) => localStorage.setItem('DATAPLATE_API_BASE_URL', api), API_TELAS);
    const telaCliente = await celular.newPage();
    await telaCliente.goto(`${FRONT}/pages/user.html?mesaToken=${token}`);
    await telaCliente.waitForTimeout(1800);
    await telaCliente.screenshot({ path: `${pasta}/cliente-mesa-livre.png` });
    await celular.close();
  } finally {
    await navegador.close();
  }
}

// Sem terceiro argumento gera tudo; "telas" ou "websocket" repete apenas essa parte.
const parte = process.argv[3];
const arquivo = `${pasta}/evidencias.json`;
if (parte === 'websocket') {
  const atual = JSON.parse(readFileSync(arquivo, 'utf8'));
  atual.websocket = await evidenciaWebsocket((await entrar(API_COPIA, '00000000002')).token);
  writeFileSync(arquivo, `${JSON.stringify(atual, null, 2)}\n`);
  console.log(atual.websocket);
} else {
  if (!parte) writeFileSync(arquivo, `${JSON.stringify(await evidencias(), null, 2)}\n`);
  await telas();
}
