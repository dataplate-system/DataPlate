import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch();
const errors = [];
async function session(final) {
 const r = await fetch('http://127.0.0.1:8081/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cpf:`0000000000${final}`,senha:'admin123'})});
 assert.equal(r.status,200); const user=await r.json(); const ctx=await browser.newContext();
 await ctx.addInitScript(s=>sessionStorage.setItem('dataplate:adminSession',JSON.stringify(s)),{...user,backendRole:user.role,userKey:final===2?'gerente':final===3?'atendente':'cozinha'});
 const page=await ctx.newPage(); await page.addLocatorHandler(page.locator('#lowStockAlert[open]'),async()=>{await page.locator('#lowStockAlertConfirm').click();await page.locator('#lowStockAcknowledgementClose').click();}); page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message)); return {page,ctx,user};
}
try {
 const at=await session(3); await at.page.goto('http://localhost:5500/pages/atendente.html');
 const r=await fetch('http://127.0.0.1:8081/api/pedidos/ativos',{headers:{Authorization:`Bearer ${at.user.token || at.user.accessToken}`}}); const orders=await r.json();
 assert.ok(Array.isArray(orders),JSON.stringify(orders)); const order=orders.find(o=>o.numeroMesa && ['RECEBIDO','EM_PREPARO','PRONTO'].includes(o.status)); assert.ok(order);
 await at.page.evaluate(n=>abrirMesa(n),order.numeroMesa); await at.page.locator('[data-pgto="PIX"]').waitFor();
 for (const tipo of ['PIX','CREDITO','DEBITO','DINHEIRO']) {
  await at.page.locator(`[data-pgto="${tipo}"]`).click();
  assert.equal(await at.page.locator('.at-pgto-opt[aria-pressed="true"]').count(),1);
  assert.equal(await at.page.locator('.at-pgto-radio:checked').inputValue(),tipo);
  await at.page.waitForFunction(tipo=>getComputedStyle(document.querySelector(`[data-pgto="${tipo}"]`)).backgroundColor==='rgb(239, 246, 255)',tipo,{timeout:3000});
  assert.equal(await at.page.locator(`[data-pgto="${tipo}"] .at-pgto-arrow`).textContent(),'\u2713 Selecionado');
  assert.ok((await at.page.locator('#pgtoSelecionado').textContent()).includes('Forma selecionada:'));
 }
 await at.page.locator('#mesaModalTitle').click();
 assert.equal(await at.page.locator('.at-pgto-confirmation').textContent(),'\u2713 Selecionado');
 await at.page.evaluate(()=>_refreshModalAtual());
 assert.equal(await at.page.locator('[data-pgto="DINHEIRO"]').getAttribute('aria-pressed'),'true');
 await at.page.setViewportSize({width:390,height:844});
 await at.page.locator('[data-pgto="PIX"]').click();
 assert.equal(await at.page.locator('.at-pgto-confirmation').textContent(),'\u2713 Selecionado');
 await at.page.screenshot({path:process.env.TEMP+'/dataplate-pagamento.png'});
 console.log('Pagamento: quatro opcoes com selecao unica, check e resumo visiveis.');
 const ger=await session(2), kit=await session(4);
 await ger.page.goto('http://localhost:5500/pages/adm.html'); await kit.page.goto('http://localhost:5500/pages/cozinha.html');
 await kit.page.locator(`article[data-order-id="${order.id}"]`).waitFor();
 await ger.page.evaluate(id=>abrirDetalhesPedido(id),order.id);
 await ger.page.getByRole('button',{name:order.urgente?'Remover urg\u00eancia':'Marcar urgente',exact:true}).waitFor();
 const desired=true;
 try {
  await ger.page.getByRole('button',{name:order.urgente?'Remover urg\u00eancia':'Marcar urgente',exact:true}).click();
  if(order.urgente) { await ger.page.getByRole('button',{name:'Marcar urgente',exact:true}).click(); }
  await ger.page.getByRole('button',{name:desired?'Remover urg\u00eancia':'Marcar urgente',exact:true}).waitFor();
  await kit.page.waitForFunction(({id,desired})=>{const card=document.querySelector(`article[data-order-id="${id}"]`);return card && card.classList.contains('is-urgent')===desired;},{id:order.id,desired});
  await kit.page.reload();
  await kit.page.waitForFunction(({id,desired})=>{const card=document.querySelector(`article[data-order-id="${id}"]`);return card && card.classList.contains('is-urgent')===desired;},{id:order.id,desired});
  const card=kit.page.locator(`article[data-order-id="${order.id}"]`);
  assert.equal(await card.locator('.urgent-ribbon').count(),1);
  assert.ok(!(await card.textContent()).includes('\u26a1'));
  assert.ok((await card.locator('.urgent-ribbon').textContent()).includes('Priorizar'));
  assert.equal(await card.evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(194, 65, 12)');
  assert.equal(await card.locator('.urgent-ribbon').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(194, 65, 12)');
  const row=kit.page.locator('tr.urgent-row').filter({hasText:`#${order.id}`});
  assert.equal(await row.locator('.urgent-priority').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(194, 65, 12)');
  assert.equal(await row.locator('.urgent-priority').evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
  await card.screenshot({path:process.env.TEMP+'/dataplate-urgente.png'});
  console.log('Urgente: gerente altera, cozinha recebe em sessao separada e preserva apos recarregar.');
 } finally {
  const restore=await fetch(`http://127.0.0.1:8081/api/pedidos/${order.id}/urgente`,{method:'PUT',headers:{Authorization:`Bearer ${ger.user.token || ger.user.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({urgente:!!order.urgente})}); assert.equal(restore.status,200);
 }
 assert.deepEqual(errors,[]); console.log('Sem erros JavaScript.');
} finally { await browser.close(); }
