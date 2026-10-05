import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:320,height:800}});
const r=await page.request.post('http://localhost:8081/api/auth/login',{data:{cpf:process.env.DATAPLATE_TEST_CPF,senha:process.env.DATAPLATE_TEST_PASSWORD}});const a=await r.json();
await page.addInitScript(a=>sessionStorage.setItem('dataplate:adminSession',JSON.stringify({name:a.nome,userKey:'gerente',role:'Administrador',token:a.token,backendRole:a.role})),a);
await page.goto('http://localhost:5500/pages/adm.html');await page.waitForTimeout(700);
const sections=await page.locator('.content-section').evaluateAll(es=>es.map(e=>e.id));
for(const section of sections){await page.evaluate(s=>navigateTo(s),section);await page.waitForTimeout(120); const bad=await page.evaluate(()=>[...document.querySelectorAll('.content-section.active *')].filter(e=>{const r=e.getBoundingClientRect();return r.width && r.right>innerWidth+1 && !e.closest('.table-container,.table-shell,.table-responsive')}).slice(0,5).map(e=>`${e.tagName}.${e.className}`)); if(bad.length) { console.log(section,bad); process.exitCode=1; }}
await page.getByRole('button',{name:/^Opera/,exact:true}).click(); await page.locator('.dropdown-menu').getByText('Mesas',{exact:true}).click();
await page.waitForTimeout(350);
const colors=await page.locator('.table-card.status-reservada .badge, .table-card.status-ocupada .badge').evaluateAll(es=>[...new Set(es.map(e=>getComputedStyle(e).color))]); if(colors.length!==2) throw Error('Cores de reserva e ocupacao devem ser distintas');
await page.evaluate(()=>navigateTo('mesas'));await page.getByRole('button',{name:'+ Nova Mesa',exact:true}).click();if(await page.locator('.modal.active').count()!==1) throw Error('Modal nao abriu');
const modal=await page.locator('.modal.active .modal-content').boundingBox(); if(modal.x<0 || modal.x+modal.width>320) throw Error('Modal ultrapassa tela');
console.log('Areas administrativas, menu, cores e modal: OK');
await page.screenshot({path:'docs/apresentacao/depois/modal-mesa-320.png'});
await page.evaluate(()=>closeModal('addTableModal'));
await page.setViewportSize({width:390,height:900});
await page.goto('http://localhost:5500/pages/adm.html');await page.waitForTimeout(700);await page.evaluate(()=>navigateTo('mesas'));await page.waitForTimeout(400);
for(const phase of ['depois','antes']) {
 if(phase==='antes') await page.evaluate(()=>document.querySelector('link[href*="responsive.css"]').remove());
 await page.locator('.table-map-panel').evaluate(e=>e.scrollIntoView({block:'start'})); await page.screenshot({path:`docs/apresentacao/${phase}/mapa-mesas-390.png`});
}
await browser.close();
