(function () {
  'use strict';

  const STORAGE_KEY = 'DATAPLATE_API_BASE_URL';
  const nativePlatform = Boolean(
    window.Capacitor
    && typeof window.Capacitor.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform()
  );

  function normalizeServerAddress(value) {
    let address = String(value || '').trim().replace(/\/+$/, '');
    if (!address) return '';

    if (!/^https?:\/\//i.test(address)) {
      address = `http://${address}`;
    }

    try {
      const parsed = new URL(address);
      if (!parsed.port) parsed.port = '8081';
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
      if (!parsed.pathname || parsed.pathname === '/') parsed.pathname = '/api';
      if (!parsed.pathname.endsWith('/api')) parsed.pathname += '/api';
      return parsed.toString().replace(/\/$/, '');
    } catch (_) {
      return '';
    }
  }

  const savedServer = normalizeServerAddress(localStorage.getItem(STORAGE_KEY));
  if (savedServer) {
    window.DATAPLATE_API_BASE_URL = savedServer;
  } else if (nativePlatform) {
    window.DATAPLATE_API_BASE_URL = 'http://10.0.2.2:8081/api';
  }

  function healthUrl(apiUrl) {
    return apiUrl.replace(/\/api\/?$/, '') + '/actuator/health';
  }

  function openServerDialog() {
    let dialog = document.getElementById('mobileServerDialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'mobileServerDialog';
      dialog.className = 'mobile-server-dialog';
      dialog.innerHTML = `
        <form method="dialog" class="mobile-server-card" id="mobileServerForm">
          <div class="mobile-server-heading">
            <div>
              <span>Conexao do aplicativo</span>
              <h2>Servidor DataPlate</h2>
            </div>
            <button class="mobile-server-close" type="button" aria-label="Fechar">&times;</button>
          </div>
          <p>Informe o IP do computador que esta executando o DataPlate. O celular e o computador devem estar na mesma rede Wi-Fi.</p>
          <label for="mobileServerInput">IP ou endereco do servidor</label>
          <input id="mobileServerInput" name="server" inputmode="url" autocomplete="url" placeholder="192.168.0.10" required />
          <small>Emulador Android: use 10.0.2.2. Celular fisico: use o IPv4 do computador.</small>
          <output id="mobileServerStatus" aria-live="polite"></output>
          <div class="mobile-server-actions">
            <button type="button" class="mobile-server-test">Testar conexao</button>
            <button type="submit" class="mobile-server-save">Salvar e conectar</button>
          </div>
        </form>`;
      document.body.appendChild(dialog);

      const form = dialog.querySelector('#mobileServerForm');
      const input = dialog.querySelector('#mobileServerInput');
      const status = dialog.querySelector('#mobileServerStatus');

      const testConnection = async () => {
        const normalized = normalizeServerAddress(input.value);
        if (!normalized) {
          status.value = 'Digite um endereco valido.';
          status.dataset.state = 'error';
          return false;
        }

        status.value = 'Testando conexao...';
        status.dataset.state = 'loading';
        try {
          const response = await fetch(healthUrl(normalized), { signal: AbortSignal.timeout(6000) });
          if (!response.ok) throw new Error('Servidor indisponivel');
          status.value = 'Conexao realizada com sucesso.';
          status.dataset.state = 'success';
          return true;
        } catch (_) {
          status.value = 'Nao foi possivel acessar esse servidor.';
          status.dataset.state = 'error';
          return false;
        }
      };

      dialog.querySelector('.mobile-server-test').addEventListener('click', testConnection);
      dialog.querySelector('.mobile-server-close').addEventListener('click', () => dialog.close());
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const normalized = normalizeServerAddress(input.value);
        if (!normalized) {
          status.value = 'Digite um endereco valido.';
          status.dataset.state = 'error';
          return;
        }
        localStorage.setItem(STORAGE_KEY, normalized);
        window.DATAPLATE_API_BASE_URL = normalized;
        status.value = 'Servidor salvo. Reconectando...';
        status.dataset.state = 'success';
        window.setTimeout(() => window.location.reload(), 350);
      });
    }

    const current = localStorage.getItem(STORAGE_KEY)
      || (nativePlatform ? '10.0.2.2' : window.location.hostname);
    dialog.querySelector('#mobileServerInput').value = current || '';
    dialog.querySelector('#mobileServerStatus').value = '';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function installMobileControls() {
    document.documentElement.classList.toggle('is-native-app', nativePlatform);
    document.documentElement.style.setProperty('--app-safe-top', 'env(safe-area-inset-top, 0px)');
    document.documentElement.style.setProperty('--app-safe-bottom', 'env(safe-area-inset-bottom, 0px)');

    if (nativePlatform || document.body.classList.contains('login-page')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mobile-server-trigger';
      button.textContent = 'Servidor';
      button.setAttribute('aria-label', 'Configurar servidor do DataPlate');
      button.addEventListener('click', openServerDialog);
      const loginCard = document.querySelector('.login-page .login-card');
      if (loginCard) {
        button.classList.add('is-login-action');
        loginCard.appendChild(button);
      } else {
        document.body.appendChild(button);
      }
    }

    if (nativePlatform && !localStorage.getItem(STORAGE_KEY)) {
      window.setTimeout(openServerDialog, 250);
    }

    if ('serviceWorker' in navigator && !nativePlatform && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('../sw.js').catch(() => {});
    }
  }

  window.DataPlateMobile = {
    isNative: nativePlatform,
    normalizeServerAddress,
    openServerDialog,
    getApiBaseUrl: () => window.DATAPLATE_API_BASE_URL || ''
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installMobileControls, { once: true });
  } else {
    installMobileControls();
  }
})();
