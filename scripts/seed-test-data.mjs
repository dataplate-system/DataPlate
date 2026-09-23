import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: 'aws-1-sa-east-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.zcdjzwnzapzvisllnivh',
  password: 'Dataplate@123',
  ssl: { rejectUnauthorized: false }
});

async function seed() {
  await client.connect();
  console.log('Conectado ao banco.');

  // IDs fixos do schema
  const statusMap = {};
  const { rows: statuses } = await client.query('SELECT id_status, nome FROM status_pedido');
  statuses.forEach(s => statusMap[s.nome] = s.id_status);
  console.log('Status:', statusMap);

  const { rows: mesas } = await client.query(
    'SELECT id_mesa, numero FROM mesa ORDER BY numero LIMIT 10'
  );
  console.log('Mesas disponíveis:', mesas.map(m => `${m.numero}(id:${m.id_mesa})`).join(', '));

  const { rows: produtos } = await client.query(
    'SELECT id_produto, nome, preco FROM produto WHERE ativo = true LIMIT 10'
  );
  if (!produtos.length) {
    console.error('Nenhum produto encontrado. Cadastre produtos no admin antes de rodar o seed.');
    await client.end();
    return;
  }
  console.log('Produtos:', produtos.map(p => `${p.nome}(R$${p.preco})`).join(', '));

  // Atualizar 4 mesas para 'ocupada'
  const mesasOcupadas = mesas.slice(0, 4);
  for (const m of mesasOcupadas) {
    await client.query('UPDATE mesa SET status = $1 WHERE id_mesa = $2', ['ocupada', m.id_mesa]);
  }
  console.log(`\nMesas ${mesasOcupadas.map(m=>m.numero).join(', ')} marcadas como ocupadas.`);

  // Pedidos de teste
  const pedidosSeed = [
    { mesa: mesas[0], statusNome: 'RECEBIDO',   itens: [0, 1],    minutosAtras: 5  },
    { mesa: mesas[1], statusNome: 'EM_PREPARO', itens: [2, 0],    minutosAtras: 15 },
    { mesa: mesas[2], statusNome: 'EM_PREPARO', itens: [1, 2, 3], minutosAtras: 22 },
    { mesa: mesas[3], statusNome: 'PRONTO',     itens: [0, 3],    minutosAtras: 30 },
  ];

  // Limpar pedidos de seed anteriores para não duplicar
  await client.query(`DELETE FROM pedido WHERE numero_pedido LIKE 'SEED-%'`);
  console.log('Pedidos de seed anteriores removidos.');

  for (let i = 0; i < pedidosSeed.length; i++) {
    const s = pedidosSeed[i];
    if (!s.mesa) continue;

    const dataHora = new Date(Date.now() - s.minutosAtras * 60000).toISOString();
    const itensPedido = s.itens
      .map(idx => produtos[idx])
      .filter(Boolean);

    const total = itensPedido.reduce((sum, p) => sum + Number(p.preco), 0).toFixed(2);
    const numeroPedido = `SEED-${String(i + 1).padStart(3, '0')}-${Date.now()}`.slice(0, 20);

    const { rows: [pedido] } = await client.query(
      `INSERT INTO pedido (id_mesa, id_status, numero_pedido, data_hora, valor_total, atualizado_em)
       VALUES ($1, $2, $3, $4, $5, now()) RETURNING id_pedido`,
      [s.mesa.id_mesa, statusMap[s.statusNome], numeroPedido, dataHora, total]
    );

    for (const prod of itensPedido) {
      await client.query(
        `INSERT INTO item_pedido (id_pedido, id_produto, quantidade, preco_unitario)
         VALUES ($1, $2, 1, $3)`,
        [pedido.id_pedido, prod.id_produto, prod.preco]
      );
    }

    console.log(`  Pedido #${pedido.id_pedido} criado — Mesa ${s.mesa.numero} — ${s.statusNome} — R$ ${total}`);
  }

  console.log('\nSeed concluído! Abra o painel da cozinha e o admin para ver os pedidos.');
  await client.end();
}

seed().catch(err => {
  console.error('Erro no seed:', err.message);
  client.end();
  process.exit(1);
});
