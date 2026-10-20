import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const phase=process.argv[2] || 'antes';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext();
const page=await context.newPage();
if(phase==='antes') await page.route('**/responsive.css*',route=>route.abort());
const login=await context.request.post('http://localhost:8081/api/auth/login',{data:{cpf:process.env.DATAPLATE_TEST_CPF,senha:process.env.DATAPLATE_TEST_PASSWORD}});
const auth=await login.json();
if(!login.ok() || !auth.token) throw Error('Login falhou');
await context.addInitScript(auth=>{if(location.pathname.endsWith('adm-login.html')) return;sessionStorage.setItem('dataplate:adminSession',JSON.stringify({name:auth.nome,cpf:auth.cpf,role:'Administrador',userKey:'gerente',token:auth.token,refreshToken:auth.refreshToken,backendRole:auth.role,backendUserId:auth.id}));},auth);
await fs.mkdir(`docs/apresentacao/${phase}`,{recursive:true});
const results=[];
for(const width of [390,320,768,1440]) {
 await page.setViewportSize({width,height:900});
 for(const [name,url,section] of [['login','adm-login.html'],['admin','adm.html'],['mesas','adm.html','mesas'],['clientes','adm.html','clientes'],['cozinha','cozinha.html'],['atendente','atendente.html'],['pdv','pdv.html'],['cardapio','user.html?mesa=1']]) {
  if(name==='login') { await page.goto('http://localhost:5500/pages/adm.html'); await page.evaluate(()=>sessionStorage.clear()); }
  await page.goto(`http://localhost:5500/pages/${url}`);
  if(name==='login') await page.evaluate(auth=>sessionStorage.setItem('dataplate:adminSession',JSON.stringify({name:auth.nome,cpf:auth.cpf,role:'Administrador',userKey:'gerente',token:auth.token,refreshToken:auth.refreshToken,backendRole:auth.role,backendUserId:auth.id})),auth);
  await page.waitForTimeout(650);
  if(section) {await page.evaluate(s=>navigateTo(s),section);await page.waitForTimeout(350);}
  const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width && r.right>innerWidth+1 && getComputedStyle(e).position!=='fixed' && !e.closest('.table-container,.table-shell,.table-responsive,.module-nav,.categorias-bar,.menu-categorias');}).slice(0,10).map(e=>`${e.tagName}.${e.className}`)}));
  results.push({name,width,...metrics});
  if([390,1440].includes(width)) { await page.screenshot({path:`docs/apresentacao/${phase}/${name}-${width}.png`,fullPage:true}); await page.screenshot({path:`docs/apresentacao/${phase}/${name}-${width}-tela.png`}); if(section) { await page.locator(`#${section}`).scrollIntoViewIfNeeded(); await page.screenshot({path:`docs/apresentacao/${phase}/${name}-${width}-conteudo.png`}); } }
 }
}
await fs.writeFile(`docs/apresentacao/${phase}/verificacao.json`,JSON.stringify(results,null,2));
console.log(JSON.stringify(results.filter(r=>r.scroll>r.width || r.overflow.length),null,2));
if(phase==='depois' && results.some(r=>r.scroll>r.width || r.overflow.length)) process.exitCode=1;
await browser.close();
