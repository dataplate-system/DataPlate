import pg from 'pg';

const { Client } = pg;

const client = new Client({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5433),
  database: process.env.DB_NAME || 'dataplate',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'dataplate_local'
});

async function seed() {
  await client.connect();
  console.log('Conectado ao PostgreSQL local.');

  try {
    await client.query('BEGIN');

    const statusMap = {};
    const { rows: statuses } = await client.query('SELECT id_status, nome FROM status_pedido');
    statuses.forEach((status) => { statusMap[status.nome] = status.id_status; });

    const { rows: mesas } = await client.query(
      'SELECT id_mesa, numero FROM mesa WHERE ativo = true ORDER BY numero LIMIT 10'
    );
    const { rows: produtos } = await client.query(
      'SELECT id_produto, nome, preco FROM produto WHERE ativo = true ORDER BY id_produto LIMIT 10'
    );

    if (mesas.length < 6) throw new Error('Sao necessarias pelo menos 6 mesas ativas para o seed.');
    if (produtos.length < 4) throw new Error('Sao necessarios pelo menos 4 produtos ativos para o seed.');

    await client.query("DELETE FROM pedido WHERE numero_pedido LIKE 'DEMO-%' OR numero_pedido LIKE 'SEED-%'");

    const pedidos = [
      { mesa: 0, status: 'RECEBIDO', itens: [0, 6], hora: 10 },
      { mesa: 1, status: 'EM_PREPARO', itens: [2, 7], hora: 11 },
      { mesa: 2, status: 'EM_PREPARO', itens: [3, 6], hora: 12 },
      { mesa: 3, status: 'PRONTO', itens: [4, 7], hora: 13 },
      { mesa: 0, status: 'ENTREGUE', itens: [2, 2, 6], hora: 14 },
      { mesa: 1, status: 'ENTREGUE', itens: [3, 5, 7], hora: 15 },
      { mesa: 2, status: 'ENTREGUE', itens: [4, 6], hora: 16 },
      { mesa: 3, status: 'CANCELADO', itens: [5], hora: 17 }
    ];

    for (let index = 0; index < pedidos.length; index += 1) {
      const demo = pedidos[index];
      const itens = demo.itens.map((produtoIndex) => produtos[produtoIndex % produtos.length]);
      const total = itens.reduce((soma, produto) => soma + Number(produto.preco), 0).toFixed(2);
      const numero = `DEMO-${String(index + 1).padStart(3, '0')}`;

      const { rows: [pedido] } = await client.query(
        `INSERT INTO pedido
           (id_mesa, id_status, numero_pedido, data_hora, valor_total, atualizado_em)
         VALUES ($1, $2, $3, CURRENT_DATE + make_interval(hours => $4), $5, now())
         RETURNING id_pedido`,
        [mesas[demo.mesa].id_mesa, statusMap[demo.status], numero, demo.hora, total]
      );

      for (const produto of itens) {
        await client.query(
          `INSERT INTO item_pedido (id_pedido, id_produto, quantidade, preco_unitario)
           VALUES ($1, $2, 1, $3)`,
          [pedido.id_pedido, produto.id_produto, produto.preco]
        );
      }
    }

    await client.query(
      `UPDATE mesa
       SET status = 'ocupada', reserva_nome = NULL, reserva_telefone = NULL, reserva_data_hora = NULL
       WHERE id_mesa = ANY($1::int[])`,
      [mesas.slice(0, 4).map((mesa) => mesa.id_mesa)]
    );
    await client.query(
      `UPDATE mesa
       SET status = 'reservada', reserva_nome = $1, reserva_telefone = $2,
           reserva_data_hora = CURRENT_DATE + INTERVAL '1 day 19 hours'
       WHERE id_mesa = $3`,
      ['Mariana Souza', '(11) 98888-1200', mesas[4].id_mesa]
    );
    await client.query(
      `UPDATE mesa
       SET status = 'reservada', reserva_nome = $1, reserva_telefone = $2,
           reserva_data_hora = CURRENT_DATE + INTERVAL '2 days 20 hours 30 minutes'
       WHERE id_mesa = $3`,
      ['Carlos Oliveira', '(11) 97777-3400', mesas[5].id_mesa]
    );

    await client.query('COMMIT');
    console.log(`Seed concluido: ${pedidos.length} pedidos, 4 mesas ocupadas e 2 reservas futuras.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((error) => {
  console.error('Erro no seed:', error.message);
  process.exit(1);
});
