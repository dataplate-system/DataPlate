import pg from 'pg';

const client = new pg.Client({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5433),
  database: process.env.DB_NAME || 'dataplate',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'dataplate_local'
});

async function seed() {
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(20261005)');
    const { rows: [clock] } = await client.query(
      "SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS dia, " +
      "EXTRACT(HOUR FROM now() AT TIME ZONE 'America/Sao_Paulo')::int * 60 + " +
      "EXTRACT(MINUTE FROM now() AT TIME ZONE 'America/Sao_Paulo')::int AS minutos"
    );
    const { rows: [restaurant] } = await client.query(
      'SELECT id_restaurante FROM restaurante WHERE ativo = true ORDER BY id_restaurante LIMIT 1'
    );
    if (!restaurant) throw new Error('Cadastre um restaurante ativo antes de popular os dados.');
    const { rows: products } = await client.query(
      "SELECT id_produto, preco FROM produto WHERE ativo = true " +
      "ORDER BY CASE WHEN codigo LIKE 'DEMO-%' THEN 0 ELSE 1 END, id_produto LIMIT 6"
    );
    if (products.length < 2) throw new Error('Cadastre pelo menos dois produtos ativos antes de popular os dados.');
    const { rows: statuses } = await client.query('SELECT id_status, nome FROM status_pedido');
    const statusMap = Object.fromEntries(statuses.map(status => [status.nome, status.id_status]));
    for (const status of ['RECEBIDO', 'EM_PREPARO', 'PRONTO', 'ENTREGUE', 'CANCELADO']) {
      if (!statusMap[status]) throw new Error('Status ausente: ' + status);
    }

    // Acrescenta mesas identificadas como demonstração, sem alterar mesas existentes.
    const tables = [];
    let addedTables = 0;
    const tableStatuses = ['ocupada', 'ocupada', 'ocupada', 'disponivel', 'disponivel', 'reservada'];
    for (let index = 0; index < tableStatuses.length; index++) {
      const tag = 'DEMO-CARDS-MESA-' + (index + 1);
      const { rows: [existing] } = await client.query(
        'SELECT id_mesa FROM mesa WHERE id_restaurante = $1 AND observacoes = $2 LIMIT 1',
        [restaurant.id_restaurante, tag]
      );
      if (existing) { tables.push(existing); continue; }
      const { rows: [table] } = await client.query(
        `INSERT INTO mesa (id_restaurante, numero, capacidade, status, localizacao, observacoes)
         SELECT $1, COALESCE(MAX(numero), 0) + 1, $2, $3, 'Área de demonstração', $4
         FROM mesa WHERE id_restaurante = $1 RETURNING id_mesa`,
        [restaurant.id_restaurante, index % 2 ? 4 : 2, tableStatuses[index], tag]
      );
      tables.push(table);
      addedTables++;
      if (tableStatuses[index] === 'reservada') {
        await client.query(
          `UPDATE mesa SET reserva_nome = 'Cliente de demonstração',
           reserva_telefone = '(11) 99999-0000', reserva_data_hora = $1::date + INTERVAL '1 day 19 hours'
           WHERE id_mesa = $2`, [clock.dia, table.id_mesa]
        );
      }
    }

    let addedStock = 0;
    for (const stock of [
      ['DEMO Cards - Arroz', 'kg', 0.5, 2, 6.5],
      ['DEMO Cards - Óleo', 'l', 0, 1, 9],
      ['DEMO Cards - Sal', 'kg', 5, 1, 3]
    ]) {
      const result = await client.query(
        `INSERT INTO insumos (nome, unidade, quantidade_atual, quantidade_minima, custo_unitario)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (nome) DO NOTHING`, stock
      );
      addedStock += result.rowCount;
    }

    const todayStatuses = [
      'RECEBIDO', 'RECEBIDO', 'RECEBIDO', 'EM_PREPARO', 'EM_PREPARO', 'EM_PREPARO', 'EM_PREPARO',
      'PRONTO', 'PRONTO', 'PRONTO', 'ENTREGUE', 'ENTREGUE', 'ENTREGUE', 'ENTREGUE', 'ENTREGUE', 'CANCELADO'
    ];
    const endMinute = Math.max(0, clock.minutos - 30);
    const startMinute = Math.max(0, endMinute - 300);
    let addedOrders = 0;
    for (let daysAgo = 0; daysAgo <= 7; daysAgo++) {
      const day = new Date(clock.dia + 'T12:00:00Z');
      day.setUTCDate(day.getUTCDate() - daysAgo);
      const date = day.toISOString().slice(0, 10);
      const orderStatuses = daysAgo === 0 ? todayStatuses : ['ENTREGUE', 'ENTREGUE', 'ENTREGUE', 'ENTREGUE', 'CANCELADO'];
      for (let index = 0; index < orderStatuses.length; index++) {
        const status = orderStatuses[index];
        const number = 'CARD-' + date.replaceAll('-', '') + '-' + String(index + 1).padStart(2, '0');
        const minute = daysAgo === 0
          ? Math.floor(startMinute + (endMinute - startMinute) * index / (orderStatuses.length - 1))
          : 10 * 60 + index * 90;
        const timestamp = date + 'T' + String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0') + ':00';
        const isCashier = status === 'ENTREGUE' && index % 2 === 0;
        const items = [
          { product: products[index % products.length], quantity: 1 + index % 2 },
          { product: products[(index + 1) % products.length], quantity: 1 }
        ];
        const total = items.reduce((sum, item) => sum + Number(item.product.preco) * item.quantity, 0).toFixed(2);
        const payment = ['PIX', 'CREDITO', 'DEBITO', 'DINHEIRO'][index % 4];
        const observation = 'DEMO Cards - dados de demonstração' +
          (status === 'ENTREGUE' ? '; Pagamento: ' + payment : '') +
          (status === 'CANCELADO' ? '; Cancelado a pedido do cliente de demonstração' : '');
        const { rows: [order] } = await client.query(
          `INSERT INTO pedido (id_mesa, id_status, numero_pedido, data_hora, valor_total, observacoes, atualizado_em)
           VALUES ($1, $2, $3, $4::timestamp, $5, $6, $4::timestamp)
           ON CONFLICT (numero_pedido) DO NOTHING RETURNING id_pedido`,
          [isCashier ? null : tables[index % 3].id_mesa, statusMap[status], number, timestamp, total, observation]
        );
        if (!order) continue;
        addedOrders++;
        for (const item of items) {
          await client.query(
            `INSERT INTO item_pedido (id_pedido, id_produto, quantidade, preco_unitario)
             VALUES ($1, $2, $3, $4)`,
            [order.id_pedido, item.product.id_produto, item.quantity, item.product.preco]
          );
        }
        const history = status === 'RECEBIDO' ? [['RECEBIDO', 0]]
          : status === 'CANCELADO' ? [['RECEBIDO', 0], ['CANCELADO', 5]]
          : [['RECEBIDO', 0], ['EM_PREPARO', 2],
            ...(['PRONTO', 'ENTREGUE'].includes(status) ? [['PRONTO', 12]] : []),
            ...(status === 'ENTREGUE' ? [['ENTREGUE', 15]] : [])];
        for (const [historyStatus, minutes] of history) {
          await client.query(
            `INSERT INTO pedido_status_historico (id_pedido, status, registrado_em)
             VALUES ($1, $2, $3::timestamp + make_interval(mins => $4))`,
            [order.id_pedido, historyStatus, timestamp, minutes]
          );
        }
      }
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({
      dia: clock.dia, pedidosAdicionados: addedOrders, mesasAdicionadas: addedTables,
      insumosAdicionados: addedStock, pedidosDemoHoje: todayStatuses.length,
      historicoDias: 7, dadosExistentesPreservados: true
    }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch(error => {
  console.error('Erro ao popular demonstração:', error.message);
  process.exitCode = 1;
});
