import pg from 'pg';

const { Client } = pg;

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5433),
  database: process.env.DB_NAME || 'dataplate',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'dataplate_local',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const pedidosDemo = [
  { mesa: 0, status: 'RECEBIDO', itens: [[0, 2], [4, 2]], minutos: 5 },
  { mesa: 1, status: 'EM_PREPARO', itens: [[1, 1], [5, 2]], minutos: 14 },
  { mesa: 2, status: 'EM_PREPARO', itens: [[2, 1], [4, 1]], minutos: 21 },
  { mesa: 3, status: 'PRONTO', itens: [[0, 1], [3, 1], [5, 2]], minutos: 29 },
  { mesa: 4, status: 'ENTREGUE', itens: [[1, 2], [4, 2]], minutos: 52 },
  { mesa: 5, status: 'ENTREGUE', itens: [[2, 1], [3, 2], [5, 3]], minutos: 84 },
  { mesa: null, status: 'ENTREGUE', itens: [[0, 2], [5, 2]], minutos: 117 },
  { mesa: null, status: 'CANCELADO', itens: [[1, 1]], minutos: 43 },
];

async function garantirProdutos() {
  const categoria = await client.query('SELECT id_categoria FROM categoria ORDER BY id_categoria LIMIT 1');
  if (!categoria.rows.length) throw new Error('Nenhuma categoria encontrada. Inicialize o schema antes do seed.');

  const produtos = [
    ['DEMO-001', 'Burger da Casa', 34.9],
    ['DEMO-002', 'Massa Artesanal', 42.5],
    ['DEMO-003', 'Prato Executivo', 38.9],
    ['DEMO-004', 'Salada Especial', 27.5],
    ['DEMO-005', 'Suco Natural', 12.0],
    ['DEMO-006', 'Refrigerante', 8.5],
  ];

  for (const [codigo, nome, preco] of produtos) {
    await client.query(
      `INSERT INTO produto (codigo, id_categoria, nome, descricao, preco, ativo, tempo_preparo, destaque, criado_em)
       VALUES ($1, $2, $3, 'Produto para demonstracao do dashboard', $4, true, 15, false, now())
       ON CONFLICT (codigo) DO UPDATE SET nome = EXCLUDED.nome, preco = EXCLUDED.preco, ativo = true`,
      [codigo, categoria.rows[0].id_categoria, nome, preco],
    );
  }

  const resultado = await client.query(
    `SELECT id_produto, nome, preco FROM produto
     WHERE codigo LIKE 'DEMO-%' ORDER BY codigo LIMIT 6`,
  );
  return resultado.rows;
}

async function seed() {
  await client.connect();
  await client.query('BEGIN');

  try {
    const statusResult = await client.query('SELECT id_status, nome FROM status_pedido');
    const status = Object.fromEntries(statusResult.rows.map((item) => [item.nome, item.id_status]));
    const mesasResult = await client.query(
      'SELECT id_mesa, numero FROM mesa WHERE ativo = true ORDER BY numero LIMIT 10',
    );
    const mesas = mesasResult.rows;

    if (mesas.length < 6) throw new Error('O seed precisa de pelo menos 6 mesas ativas.');
    for (const nome of ['RECEBIDO', 'EM_PREPARO', 'PRONTO', 'ENTREGUE', 'CANCELADO']) {
      if (!status[nome]) throw new Error(`Status obrigatorio ausente: ${nome}`);
    }

    const produtos = await garantirProdutos();
    if (produtos.length < 6) throw new Error('Nao foi possivel preparar 6 produtos para o seed.');

    await client.query(`DELETE FROM pedido WHERE numero_pedido LIKE 'DASH-DEMO-%'`);
    await client.query(`UPDATE mesa SET status = 'livre' WHERE id_mesa = ANY($1::bigint[])`, [mesas.map((mesa) => mesa.id_mesa)]);
    await client.query(`UPDATE mesa SET status = 'ocupada' WHERE id_mesa = ANY($1::bigint[])`, [mesas.slice(0, 4).map((mesa) => mesa.id_mesa)]);
    await client.query(`UPDATE mesa SET status = 'reservada' WHERE id_mesa = $1`, [mesas[4].id_mesa]);

    for (let index = 0; index < pedidosDemo.length; index += 1) {
      const demo = pedidosDemo[index];
      const itens = demo.itens.map(([produtoIndex, quantidade]) => ({
        produto: produtos[produtoIndex],
        quantidade,
      }));
      const total = itens.reduce(
        (soma, item) => soma + Number(item.produto.preco) * item.quantidade,
        0,
      );
      const mesa = demo.mesa === null ? null : mesas[demo.mesa];
      const numero = `DASH-DEMO-${String(index + 1).padStart(2, '0')}`;

      const pedidoResult = await client.query(
        `INSERT INTO pedido (id_mesa, id_status, numero_pedido, data_hora, valor_total, atualizado_em)
         VALUES ($1, $2, $3, now() - ($4 * interval '1 minute'), $5, now())
         RETURNING id_pedido`,
        [mesa?.id_mesa ?? null, status[demo.status], numero, demo.minutos, total.toFixed(2)],
      );

      for (const item of itens) {
        await client.query(
          `INSERT INTO item_pedido (id_pedido, id_produto, quantidade, preco_unitario)
           VALUES ($1, $2, $3, $4)`,
          [pedidoResult.rows[0].id_pedido, item.produto.id_produto, item.quantidade, item.produto.preco],
        );
      }
    }

    await client.query('COMMIT');

    const resumo = await client.query(
      `SELECT COUNT(*) FILTER (WHERE id_status IN ($1, $2, $3))::int AS ativos,
              COUNT(*) FILTER (WHERE id_status = $4)::int AS entregues,
              COALESCE(SUM(valor_total) FILTER (WHERE id_status <> $5), 0)::numeric(10,2) AS faturamento,
              (COALESCE(SUM(valor_total) FILTER (WHERE id_status <> $5), 0) /
                NULLIF(COUNT(*) FILTER (WHERE id_status <> $5), 0))::numeric(10,2) AS ticket_medio
       FROM pedido
       WHERE numero_pedido LIKE 'DASH-DEMO-%'`,
      [status.RECEBIDO, status.EM_PREPARO, status.PRONTO, status.ENTREGUE, status.CANCELADO],
    );

    console.log('Seed do dashboard concluido.');
    console.table(resumo.rows);
    console.log('Mesas: 4 ocupadas, 1 reservada e as demais livres.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((error) => {
  console.error('Erro no seed:', error.message);
  process.exitCode = 1;
});
