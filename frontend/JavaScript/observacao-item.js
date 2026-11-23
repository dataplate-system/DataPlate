function campoObservacaoItem(valor, escapar, atributos, atalhos = false) {
  return `
    <div class="observacao-item">
      <label>Observação do item
        <input type="text" maxlength="140" value="${escapar(valor || '').replaceAll('"', '&quot;')}" ${atributos}>
      </label>
      ${atalhos ? ['Sem cebola', 'Sem gelo', 'Bem passado', 'Ponto da casa'].map(texto =>
        `<button type="button" data-observacao-atalho="${texto}">${texto}</button>`).join('') : ''}
    </div>`;
}

document.addEventListener('click', event => {
  const botao = event.target.closest('[data-observacao-atalho]');
  if (!botao) return;
  const campo = botao.closest('.observacao-item').querySelector('input');
  campo.value = botao.dataset.observacaoAtalho;
  campo.dispatchEvent(new Event('input', { bubbles: true }));
});

function agruparItensParaEdicao(itens) {
  const linhas = new Map();
  for (const { produtoId, quantidade, observacao } of itens) {
    const texto = observacao?.trim() || null;
    const chave = JSON.stringify([produtoId, texto]);
    const linha = linhas.get(chave);
    if (linha) linha.quantidade += quantidade;
    else linhas.set(chave, { produtoId, quantidade, observacao: texto });
  }
  return [...linhas.values()];
}
