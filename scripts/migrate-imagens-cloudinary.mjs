// Migra imagens base64 da tabela `produto` para o Cloudinary, salvando só a URL.
//
// Uso:
//   DATABASE_URL="postgres://user:pass@host:5432/db?sslmode=disable" node scripts/migrate-imagens-cloudinary.mjs
//
// Fly Postgres (recomendado): em outro terminal rode `fly proxy 5432 -a dataplate-db`
// e use DATABASE_URL=postgres://postgres:SENHA@localhost:5432/postgres?sslmode=disable
//
// Flags:
//   --dry-run   apenas lista o que seria migrado, sem alterar nada.
//
// Requer Node 18+ (fetch e FormData globais). Idempotente: ignora linhas que já são URL.

import pg from 'pg';
import { writeFileSync } from 'node:fs';

const { Client } = pg;

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'dufufat0a';
const CLOUDINARY_UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || 'fotospadrao';
const DRY_RUN = process.argv.includes('--dry-run');

function buildClient() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const ssl = /sslmode=disable/i.test(url) ? false : { rejectUnauthorized: false };
    return new Client({ connectionString: url, ssl });
  }
  // Fallback: variáveis DB_* (compatível com o .env do projeto)
  const host = process.env.DB_HOST;
  if (!host) {
    console.error('Defina DATABASE_URL (ou as variáveis DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD).');
    process.exit(1);
  }
  return new Client({
    host,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'disable' ? false : { rejectUnauthorized: false }
  });
}

async function uploadParaCloudinary(dataUri) {
  const form = new FormData();
  form.append('file', dataUri);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  form.append('folder', 'produtos');

  const resp = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: form }
  );
  if (!resp.ok) {
    let msg = '';
    try { msg = (await resp.json())?.error?.message || ''; } catch (_) {}
    throw new Error(`Cloudinary ${resp.status}: ${msg}`);
  }
  return (await resp.json()).secure_url;
}

async function main() {
  const client = buildClient();
  await client.connect();
  console.log(`Conectado. Cloud: ${CLOUDINARY_CLOUD_NAME} / preset: ${CLOUDINARY_UPLOAD_PRESET}${DRY_RUN ? ' (DRY-RUN)' : ''}`);

  const { rows } = await client.query(
    `SELECT id_produto, nome, imagem FROM produto
     WHERE imagem LIKE 'data:%' ORDER BY id_produto`
  );
  console.log(`Produtos com imagem base64: ${rows.length}`);

  // Backup dos base64 antes de sobrescrever (seguro p/ rollback).
  if (!DRY_RUN && rows.length) {
    const arquivo = `backup-imagens-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    writeFileSync(arquivo, JSON.stringify(rows, null, 2));
    console.log(`Backup salvo em: ${arquivo}`);
  }

  let ok = 0, falhas = 0;
  for (const p of rows) {
    const kb = Math.round((p.imagem.length / 1024));
    try {
      if (DRY_RUN) {
        console.log(`  [dry] #${p.id_produto} ${p.nome} (~${kb}KB)`);
        continue;
      }
      const url = await uploadParaCloudinary(p.imagem);
      await client.query('UPDATE produto SET imagem = $1 WHERE id_produto = $2', [url, p.id_produto]);
      console.log(`  OK  #${p.id_produto} ${p.nome} (~${kb}KB) -> ${url}`);
      ok++;
    } catch (err) {
      console.error(`  ERRO #${p.id_produto} ${p.nome}: ${err.message}`);
      falhas++;
    }
  }

  console.log(`\nConcluído. Migradas: ${ok} | Falhas: ${falhas}${DRY_RUN ? ' | (nada alterado)' : ''}`);
  await client.end();
}

main().catch((err) => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
