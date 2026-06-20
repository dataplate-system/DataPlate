const ADMIN_SESSION_KEY = 'dataplate:adminSession';
const DEFAULT_DEMO_ADMIN_KEY = 'gerente';
const API_BASE_URL = window.DATAPLATE_API_BASE_URL
  || localStorage.getItem('DATAPLATE_API_BASE_URL')
  || (() => {
    const h = window.location.hostname;
    const isLocalFile = window.location.protocol === 'file:' || !h;
    const isLocal = isLocalFile || h === 'localhost' || h === '127.0.0.1';
    if (isLocal && window.location.port === '8080') return '/api';
    if (isLocalFile) return 'http://localhost:8080/api';
    if (isLocal) return `http://${h}:8080/api`;
    return 'https://dataplate.fly.dev/api';
  })();

const adminAuth = window.DataPlateAdminAuth;

const fallbackDemoAdmins = {
  gerente: {
    name: 'Gerente Principal',
    initials: 'GP',
    cpf: '000.000.000-00',
    password: 'admin123',
    role: 'Administrador',
    userKey: 'gerente'
  },
  atendente: {
    name: 'Atendente',
    initials: 'AT',
    cpf: '111.111.111-11',
    password: 'atendente123',
    role: 'Operacional',
    userKey: 'atendente'
  },
  cozinha: {
    name: 'Cozinha',
    initials: 'CZ',
    cpf: '222.222.222-22',
    password: 'cozinha123',
    role: 'Pedidos e preparo',
    userKey: 'cozinha'
  },
  caixa: {
    name: 'Caixa',
    initials: 'CX',
    cpf: '333.333.333-33',
    password: 'caixa123',
    role: 'PDV e vendas',
    userKey: 'caixa'
  }
};

function getDemoAdmins() {
  return adminAuth?.getAdmins ? adminAuth.getAdmins() : fallbackDemoAdmins;
}

function getDemoAdmin(adminKey) {
  return adminAuth?.getAdmin ? adminAuth.getAdmin(adminKey) : fallbackDemoAdmins[adminKey];
}

function setLoginError(message, type = 'error') {
  const error = document.getElementById('loginError');
  if (!error) return;

  error.textContent = message || '';
  error.classList.toggle('is-success', type === 'success');
}

function startSession(admin, remember, auth = {}) {
  const session = {
    name: admin.name,
    initials: admin.initials,
    cpf: admin.cpf,
    role: admin.role,
    userKey: admin.userKey,
    token: auth.token || auth.accessToken || null,
    refreshToken: auth.refreshToken || null,
    backendUserId: auth.id || null,
    backendRole: auth.role || null,
    remember: Boolean(remember),
    loggedAt: new Date().toISOString()
  };

  sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  const redirectMap = { cozinha: 'cozinha.html', atendente: 'atendente.html', caixa: 'pdv.html' };
  window.location.href = redirectMap[admin.userKey] || 'adm.html';
}

function findAdmin(cpf, password) {
  if (adminAuth?.findAdmin) return adminAuth.findAdmin(cpf, password);

  return Object.values(fallbackDemoAdmins).find((admin) =>
    admin.cpf === String(cpf).trim()
    && admin.password === password
  );
}

async function loginBackend(cpf, password) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cpf, senha: password })
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || body?.mensagem || 'CPF ou senha invalidos para o acesso administrativo.');
  }

  return body;
}

function userKeyFromRole(role) {
  if (role === 'COZINHA') return 'cozinha';
  if (role === 'FUNCIONARIO') return 'atendente';
  return 'gerente';
}

function adminFromAuth(auth) {
  const userKey = userKeyFromRole(auth.role);
  const fallback = getDemoAdmin(userKey) || fallbackDemoAdmins.gerente;
  return {
    ...fallback,
    name: auth.nome || fallback.name,
    cpf: auth.cpf || fallback.cpf,
    role: auth.role === 'COZINHA' ? 'Pedidos e preparo' : auth.role === 'FUNCIONARIO' ? 'Operacional' : 'Administrador',
    userKey
  };
}

function setActiveDemoButton(selectedKey) {
  document.querySelectorAll('[data-demo-user]').forEach((button) => {
    const isSelected = button.dataset.demoUser === selectedKey;
    button.setAttribute('aria-pressed', String(isSelected));
  });
}

function fillDemoCredentials(adminKey, cpfInput, passwordInput) {
  const admin = getDemoAdmin(adminKey);
  if (!admin || !cpfInput || !passwordInput) return;

  cpfInput.value = admin.cpf;
  passwordInput.value = admin.password;
  setActiveDemoButton(adminKey);
  setLoginError('');
}

function syncDemoButtonFromCredentials(cpfInput, passwordInput) {
  const selectedKey = Object.keys(getDemoAdmins()).find((key) => {
    const admin = getDemoAdmin(key);
    return admin.cpf === cpfInput.value.trim()
      && admin.password === passwordInput.value;
  });

  setActiveDemoButton(selectedKey || '');
}

function formatCpf(value) {
  if (adminAuth?.formatCpf) return adminAuth.formatCpf(value);

  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function applyPasswordResetFeedback(cpfInput, passwordInput) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('senhaAtualizada') !== '1') return;

  const adminKey = params.get('user') || DEFAULT_DEMO_ADMIN_KEY;
  const admin = getDemoAdmin(adminKey);

  if (admin && cpfInput && passwordInput) {
    cpfInput.value = admin.cpf;
    passwordInput.value = '';
    setActiveDemoButton(adminKey);
  }

  setLoginError('Senha atualizada com sucesso. Entre com a nova senha.', 'success');
  window.history.replaceState({}, document.title, window.location.pathname);
}

function formatPrepTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function startPrepCountdown() {
  const timer = document.getElementById('prepTimer');
  const progressFill = document.getElementById('prepProgressFill');
  const progressDot = document.getElementById('prepProgressDot');

  if (!timer) return;

  const defaultMinutes = Number(timer.dataset.defaultMinutes) || 16;
  const defaultSeconds = Math.max(60, Math.round(defaultMinutes * 60));
  let endsAt = Date.now() + defaultSeconds * 1000;

  const render = () => {
    let remainingSeconds = Math.ceil((endsAt - Date.now()) / 1000);
    let didReset = false;

    if (remainingSeconds <= 0) {
      endsAt = Date.now() + defaultSeconds * 1000;
      remainingSeconds = defaultSeconds;
      didReset = true;
    }

    const progress = Math.max(0, Math.min(1, remainingSeconds / defaultSeconds));
    const progressPercent = `${(progress * 100).toFixed(2)}%`;

    timer.textContent = formatPrepTime(remainingSeconds);
    if (progressFill) progressFill.style.width = progressPercent;
    if (progressDot) progressDot.style.left = progressPercent;

    if (didReset) {
      timer.classList.remove('prep-timer-reset');
      void timer.offsetWidth;
      timer.classList.add('prep-timer-reset');
    }
  };

  render();
  window.setInterval(render, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  const existingSession = sessionStorage.getItem(ADMIN_SESSION_KEY);
  if (existingSession) {
    try {
      const session = JSON.parse(existingSession);
      const redirectMap = { cozinha: 'cozinha.html', atendente: 'atendente.html', caixa: 'pdv.html' };
      window.location.replace(redirectMap[session?.userKey] || 'adm.html');
    } catch (_) {
      window.location.replace('adm.html');
    }
    return;
  }

  const form = document.getElementById('adminLoginForm');
  const cpfInput = document.getElementById('adminCpf');
  const passwordInput = document.getElementById('adminPassword');
  const togglePassword = document.getElementById('togglePassword');

  fillDemoCredentials(DEFAULT_DEMO_ADMIN_KEY, cpfInput, passwordInput);
  applyPasswordResetFeedback(cpfInput, passwordInput);
  startPrepCountdown();

  cpfInput?.addEventListener('input', () => {
    cpfInput.value = formatCpf(cpfInput.value);
    syncDemoButtonFromCredentials(cpfInput, passwordInput);
  });

  togglePassword?.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    togglePassword.textContent = isPassword ? 'Ocultar' : 'Mostrar';
    togglePassword.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
  });

  document.querySelectorAll('[data-demo-user]').forEach((button) => {
    button.addEventListener('click', () => {
      fillDemoCredentials(button.dataset.demoUser, cpfInput, passwordInput);
    });
  });

  passwordInput?.addEventListener('input', () => syncDemoButtonFromCredentials(cpfInput, passwordInput));

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setLoginError('');

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const cpf = formData.get('cpf');
    const password = formData.get('password');

    try {
      const auth = await loginBackend(cpf, password);
      startSession(adminFromAuth(auth), formData.get('remember') === 'on', auth);
      return;
    } catch (error) {
      console.warn('[adm-login] falha no login backend:', error);
    }

    const admin = findAdmin(cpf, password);

    if (!admin) {
      setLoginError('CPF ou senha invalidos para o acesso administrativo.');
      return;
    }

    startSession(admin, formData.get('remember') === 'on');
  });
});
