import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const api = process.env.DATAPLATE_API_URL || 'http://localhost:8081/api';
const base = process.env.DATAPLATE_FRONTEND_URL || 'http://localhost:5500';
const accounts = [
  ['ADMIN', '00000000001', 'admin123', 'adm.html'],
  ['GERENTE', '00000000002', 'admin123', 'adm.html'],
  ['FUNCIONARIO', '00000000003', 'admin123', 'atendente.html'],
  ['COZINHA', '00000000004', 'admin123', 'cozinha.html'],
  ['CAIXA', '00000000005', 'admin123', 'pdv.html'],
];
const tokens = {};
async function login(cpf, senha) {
  return fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf, senha }) });
}
for (const [role, cpf, password] of accounts) {
  const response = await login(cpf, password);
  assert.equal(response.status, 200, role);
  const body = await response.json();
  assert.equal(body.role, role);
  tokens[role] = body.token;
  // Duas tentativas: a partir da quinta falha seguida a API responde 429.
  for (const wrong of ['senha-errada', 'outra-senha-errada']) {
    assert.equal((await login(cpf, wrong)).status, 401, `${role} rejeita outra senha`);
  }
  const me = await fetch(`${api}/auth/me`, { headers: { Authorization: `Bearer ${body.token}` } });
  assert.equal(me.status, 200);
  const user = await me.json();
  assert.equal(user.role, role);
  assert.ok(!('senha' in user) && !('senha_hash' in user));
}
assert.equal((await fetch(`${api}/auth/me`)).status, 401);
assert.equal((await fetch(`${api}/auth/me`, { headers: { Authorization: 'Bearer inventado' } })).status, 401);
for (const role of ['COZINHA', 'CAIXA', 'FUNCIONARIO']) {
  assert.equal((await fetch(`${api}/usuarios`, { headers: { Authorization: `Bearer ${tokens[role]}` } })).status, 403);
}
const browser = await chromium.launch({ headless: true });
try {
  for (const [role, cpf, password, home] of accounts) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${base}/pages/adm-login.html`);
    await page.locator('#adminCpf').fill(cpf);
    await page.locator('#adminPassword').fill(password);
    await page.locator('#adminLoginForm button[type="submit"]').click();
    await page.waitForURL(`**/${home}`);
    await page.waitForFunction(() => document.documentElement.style.visibility !== 'hidden');
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('dataplate:adminSession')).backendRole), role);
    await context.close();
  }
  for (const pageName of ['adm', 'atendente', 'cozinha', 'pdv']) {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      localStorage.setItem('DATAPLATE_DEMO_MODE', 'true');
      sessionStorage.setItem('dataplate:adminSession', JSON.stringify({ backendRole: 'GERENTE', userKey: 'gerente' }));
    });
    const page = await context.newPage();
    await page.goto(`${base}/pages/${pageName}.html`);
    await page.waitForURL('**/adm-login.html');
    await context.close();
  }
  const context = await browser.newContext();
  await context.addInitScript(() => {
    if (location.pathname.endsWith('/adm.html')) sessionStorage.setItem('dataplate:adminSession', JSON.stringify({ token: 'token-inventado', backendRole: 'GERENTE', userKey: 'gerente' }));
  });
  const page = await context.newPage();
  await page.goto(`${base}/pages/adm.html`);
  await page.waitForURL('**/adm-login.html');
  await context.close();
  console.log('OK: 5 logins reais; senhas erradas e cruzadas rejeitadas; permissoes e /me; modo demo e sessoes falsas bloqueados.');
} finally { await browser.close(); }
