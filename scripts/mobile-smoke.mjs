import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

const baseUrl = process.env.DATAPLATE_FRONTEND_URL || 'http://127.0.0.1:5500';
const outputDir = path.join(os.tmpdir(), 'dataplate-mobile-smoke');
await fs.mkdir(outputDir, { recursive: true });

const sessions = {
  gerente: { name: 'Gerente Principal', initials: 'GP', role: 'Administrador', userKey: 'gerente' },
  atendente: { name: 'Atendente', initials: 'AT', role: 'Operacional', userKey: 'atendente' },
  cozinha: { name: 'Cozinha', initials: 'CZ', role: 'Pedidos e preparo', userKey: 'cozinha' },
  caixa: { name: 'Caixa', initials: 'CX', role: 'PDV e vendas', userKey: 'caixa' }
};

// Os paineis exigem uma sessao real, inclusive nos testes responsivos.
for (const [key, cpf, senha] of [
  ['gerente', '91000000273', 'Gerente123'],
  ['atendente', '91000000354', 'Atendente123'],
  ['cozinha', '91000000435', 'Cozinha123'],
  ['caixa', '91000000516', 'Caixa123']
]) {
  const response = await fetch(`${process.env.DATAPLATE_API_URL || 'http://localhost:8081/api'}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cpf, senha })
  });
  if (!response.ok) throw new Error(`Login de teste falhou: ${key}`);
  const user = await response.json();
  Object.assign(sessions[key], { token: user.token, backendRole: user.role });
}

const routes = [
  { name: 'site', path: '/pages/index.html' },
  { name: 'login', path: '/pages/adm-login.html' },
  { name: 'recuperar-senha', path: '/pages/adm-recuperar-senha.html' },
  { name: 'server-config', path: '/pages/adm-login.html', native: true },
  { name: 'cardapio', path: '/pages/user.html' },
  { name: 'admin', path: '/pages/adm.html', session: sessions.gerente },
  {
    name: 'admin-menu',
    path: '/pages/adm.html',
    session: sessions.gerente,
    click: '#mobileAdminCadastros',
    expectVisible: '#mobileAdminCadastros + .dropdown-menu'
  },
  { name: 'atendente', path: '/pages/atendente.html', session: sessions.atendente },
  { name: 'atendente-mesas', path: '/pages/atendente.html', session: sessions.atendente, click: '[data-tab="mesas"]' },
  { name: 'cozinha', path: '/pages/cozinha.html', session: sessions.cozinha },
  { name: 'pdv-products', path: '/pages/pdv.html', session: sessions.caixa },
  { name: 'pdv-order', path: '/pages/pdv.html', session: sessions.caixa, click: '#pdvMobileOrder' }
];

const viewports = [
  { label: 'small', width: 360, height: 800 },
  { label: 'large', width: 412, height: 915 }
];

const browser = await chromium.launch({ headless: true });
let failed = false;

for (const viewport of viewports) {
  for (const route of routes) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    if (route.native) {
      await page.addInitScript(() => {
        window.Capacitor = { isNativePlatform: () => true };
      });
    }
    if (route.session) {
      await page.addInitScript((session) => {
        sessionStorage.setItem('dataplate:adminSession', JSON.stringify(session));
      }, route.session);
    }

    await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    if (route.click && await page.locator('#lowStockAlert').isVisible()) {
      await page.locator('#lowStockAlertConfirm').click();
      await page.locator('#lowStockAcknowledgementClose').click();
    }
    if (route.click) {
      await page.locator(route.click).click();
      await page.waitForTimeout(250);
    }
    const expectedElementVisible = route.expectVisible
      ? await page.locator(route.expectVisible).isVisible()
      : true;

    const metrics = await page.evaluate(() => {
      const overflowing = [...document.querySelectorAll('body *')]
        .filter((element) => {
          const style = getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'absolute') return false;
          const rect = element.getBoundingClientRect();
          return rect.width > 2 && (rect.right > innerWidth + 2 || rect.left < -2);
        })
        .slice(0, 8)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          id: element.id,
          className: String(element.className).slice(0, 90),
          rect: element.getBoundingClientRect().toJSON()
        }));

      return {
        url: location.pathname,
        title: document.title,
        viewportWidth: innerWidth,
        bodyWidth: document.body.scrollWidth,
        documentWidth: document.documentElement.scrollWidth,
        overflowing
      };
    });

    const screenshotPath = path.join(outputDir, `${route.name}-${viewport.label}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const hasPageOverflow = metrics.bodyWidth > viewport.width + 2 || metrics.documentWidth > viewport.width + 2;
    failed ||= hasPageOverflow || !expectedElementVisible;
    console.log(JSON.stringify({
      route: route.name,
      viewport: viewport.label,
      hasPageOverflow,
      expectedElementVisible,
      screenshotPath,
      ...metrics
    }));
    await context.close();
  }
}

await browser.close();
if (failed) process.exitCode = 1;
