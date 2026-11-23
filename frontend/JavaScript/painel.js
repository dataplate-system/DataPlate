const api = window.DATAPLATE_API_BASE_URL || (location.port === '5500'
  ? `${location.protocol}//${location.hostname}:8081/api`
  : '/api');
const listaPreparo = document.getElementById('preparo');
const listaRetirada = document.getElementById('retirada');
const mensagem = document.getElementById('mensagemPainel');
const botaoSom = document.getElementById('som');
const botaoTela = document.getElementById('telaCheia');
let prontosAnteriores = null;
let audio;

async function consultar(rota) {
  const response = await fetch(`${api}${rota}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function renderizarLista(lista, pedidos, novos = new Set()) {
  const numeros = pedidos.length ? pedidos.map(pedido => pedido.numeroPedido) : [null];
  lista.replaceChildren(...numeros.map(numero => {
    const linha = document.createElement('li');
    linha.textContent = numero === null ? 'Nenhum pedido' : `#${numero}`;
    if (numero === null) linha.className = 'vazio';
    if (novos.has(numero)) linha.className = 'recem-pronto';
    return linha;
  }));
}

function tocarAviso() {
  if (audio?.state !== 'running' || botaoSom.getAttribute('aria-pressed') !== 'true') return;
  const inicio = audio.currentTime;
  [660, 880].forEach((frequencia, indice) => {
    const quando = inicio + indice * .18;
    const tom = audio.createOscillator();
    const volume = audio.createGain();
    tom.frequency.value = frequencia;
    volume.gain.setValueAtTime(.12, quando);
    volume.gain.exponentialRampToValueAtTime(.001, quando + .25);
    tom.connect(volume).connect(audio.destination);
    tom.start(quando);
    tom.stop(quando + .25);
  });
}

async function atualizarPainel() {
  try {
    const pedidos = await consultar('/pedidos/painel');
    const prontos = pedidos.filter(pedido => pedido.status === 'PRONTO');
    const numerosProntos = new Set(prontos.map(pedido => pedido.numeroPedido));
    const novos = new Set(prontosAnteriores
      ? [...numerosProntos].filter(numero => !prontosAnteriores.has(numero))
      : []);
    renderizarLista(listaPreparo, pedidos.filter(pedido => pedido.status !== 'PRONTO'));
    renderizarLista(listaRetirada, prontos, novos);
    prontosAnteriores = numerosProntos;
    mensagem.textContent = '';
    if (novos.size) tocarAviso();
  } catch {
    mensagem.textContent = 'Conexão indisponível. Tentando atualizar…';
  } finally {
    setTimeout(atualizarPainel, 3000);
  }
}

botaoSom.addEventListener('click', async () => {
  const ativar = botaoSom.getAttribute('aria-pressed') !== 'true';
  try {
    if (ativar) {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      await audio.resume();
    }
    botaoSom.setAttribute('aria-pressed', String(ativar));
    botaoSom.textContent = ativar ? 'Silenciar' : 'Ativar som';
  } catch {
    botaoSom.textContent = 'Som indisponível';
  }
});

botaoTela.hidden = !document.fullscreenEnabled;
botaoTela.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    botaoTela.textContent = 'Tela cheia indisponível';
  }
});
document.addEventListener('fullscreenchange', () => {
  botaoTela.textContent = document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia';
});

consultar('/restaurante').then(restaurante => {
  if (restaurante.nome) document.getElementById('restaurante').textContent = restaurante.nome;
}).catch(() => {});
atualizarPainel();
