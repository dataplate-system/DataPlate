const ADMIN_SESSION_KEY = 'dataplate:adminSession';
const DEFAULT_DEMO_ADMIN_KEY = 'gerente';
const API_BASE_URL = window.DATAPLATE_API_BASE_URL
  || localStorage.getItem('DATAPLATE_API_BASE_URL')
  || (() => {
    const h = window.location.hostname;
    const isLocalFile = window.location.protocol === 'file:' || !h;
    const isLocal = isLocalFile || h === 'localhost' || h === '127.0.0.1';
    if (isLocal && window.location.port === '8081') return '/api';
    if (isLocalFile) return 'http://localhost:8081/api';
    if (isLocal) return `http://${h}:8081/api`;
    return `http://${h}:8081/api`;
  })();

const DEMO_MODE = false; // Login sempre validado pelo backend.

const adminAuth = window.DataPlateAdminAuth;

const ROLE_TO_USER_KEY = {
  ADMIN: 'admin',
  GERENTE: 'gerente',
  FUNCIONARIO: 'atendente',
  CAIXA: 'caixa',
  COZINHA: 'cozinha'
};

const USER_KEY_HOME = {
  admin: 'adm.html',
  gerente: 'adm.html',
  atendente: 'atendente.html',
  caixa: 'pdv.html',
  cozinha: 'cozinha.html'
};

const UNKNOWN_PROFILE_MESSAGE = 'Perfil sem acesso';

const fallbackDemoAdmins = {
  admin: {
    name: 'Administrador',
    initials: 'AD',
    cpf: '000.000.000-01',
    password: 'admin123',
    role: 'Administrador',
    userKey: 'admin'
  },
  gerente: {
    name: 'Gerente Principal',
    initials: 'GP',
    cpf: '000.000.000-02',
    password: 'admin123',
    role: 'Gerente',
    userKey: 'gerente'
  },
  atendente: {
    name: 'Atendente',
    initials: 'AT',
    cpf: '000.000.000-03',
    password: 'admin123',
    role: 'Operacional',
    userKey: 'atendente'
  },
  cozinha: {
    name: 'Cozinha',
    initials: 'CZ',
    cpf: '000.000.000-04',
    password: 'admin123',
    role: 'Pedidos e preparo',
    userKey: 'cozinha'
  },
  caixa: {
    name: 'Caixa',
    initials: 'CX',
    cpf: '000.000.000-05',
    password: 'admin123',
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

// Tela inicial do perfil; null para perfil desconhecido (sem fallback)
function redirectForUserKey(userKey) {
  return USER_KEY_HOME[userKey] || null;
}

function startSession(admin, remember, auth = {}) {
  const target = redirectForUserKey(admin?.userKey);
  if (!target) throw new Error(UNKNOWN_PROFILE_MESSAGE);

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
  window.location.href = target;
}

function findAdmin(cpf, password) {
  if (adminAuth?.findAdmin) return adminAuth.findAdmin(cpf, password);

  return Object.values(fallbackDemoAdmins).find((admin) =>
    admin.cpf === String(cpf).trim()
    && admin.password === password
  );
}

// Le a mensagem de erro do backend (FastAPI usa "detail"; o handler de banco usa "mensagem")
function readErrorMessage(body) {
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (typeof body.detail === 'string') return body.detail;
  if (Array.isArray(body.detail)) {
    return body.detail
      .map((item) => String(item?.msg || '').replace(/^Value error,\s*/i, ''))
      .filter(Boolean)
      .join('; ');
  }
  return body.mensagem || body.message || '';
}

async function loginBackend(cpf, password) {
  let response;

  const url = `${API_BASE_URL}/auth/login`;

  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cpf: String(cpf || '').replace(/\D/g, ''),
        senha: password
      })
    });
  } catch (error) {
    console.error('[adm-login] FETCH FALHOU:', error);
    console.error('[adm-login] URL utilizada:', url);

    throw new Error('Nao foi possivel conectar ao servidor. Verifique se a API esta ligada e confira o endereco no botao Servidor.');
  }

  const body = await response.json().catch(error => {
    console.error('[adm-login] erro lendo JSON:', error);
    return null;
  });

  if (!response.ok) {
    throw new Error(
      readErrorMessage(body) ||
      'CPF ou senha invalidos para o acesso administrativo.'
    );
  }

  if (!body?.token) {
    throw new Error(
      'Resposta de login invalida: token nao recebido.'
    );
  }

  return body;
}   

function userKeyFromRole(role) {
  if (adminAuth?.userKeyFromRole) return adminAuth.userKeyFromRole(role);
  return ROLE_TO_USER_KEY[String(role || '').toUpperCase()] || null;
}

function initialsFromName(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function adminFromAuth(auth) {
  const userKey = userKeyFromRole(auth.role);
  if (!userKey) {
    const error = new Error(UNKNOWN_PROFILE_MESSAGE);
    error.unknownProfile = true;
    throw error;
  }
  const fallback = getDemoAdmin(userKey) || fallbackDemoAdmins[userKey];
  return {
    ...fallback,
    name: auth.nome || fallback.name,
    initials: initialsFromName(auth.nome) || fallback.initials,
    cpf: auth.cpf ? formatCpf(auth.cpf) : fallback.cpf,
    role: fallback.role,
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

  if (DEMO_MODE) {
    const adminKey = params.get('user') || DEFAULT_DEMO_ADMIN_KEY;
    const admin = getDemoAdmin(adminKey);

    if (admin && cpfInput && passwordInput) {
      cpfInput.value = admin.cpf;
      passwordInput.value = '';
      setActiveDemoButton(adminKey);
    }
  }

  setLoginError('Senha atualizada com sucesso. Entre com a nova senha.', 'success');
  window.history.replaceState({}, document.title, window.location.pathname);
}

// Fora do modo demo, os botoes de "Tipo de login" nao preenchem credenciais falsas.
// O perfil passa a ser definido pelo role do usuario no backend, entao os botoes sao escondidos.
function hideDemoProfileButtons(form) {
  const buttons = Array.from(document.querySelectorAll('[data-demo-user]'));
  if (!buttons.length) return;

  const group = buttons[0].parentElement;
  const sharesParent = buttons.every((button) => button.parentElement === group);

  if (sharesParent && group && !group.contains(form)) {
    group.style.display = 'none';
    // Esconde tambem o rotulo "Tipo de login", se estiver logo acima dos botoes
    const label = group.previousElementSibling;
    if (label && /tipo de login/i.test(label.textContent || '')) {
      label.style.display = 'none';
    }
  } else {
    buttons.forEach((button) => { button.style.display = 'none'; });
  }
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
      // Sessao sem token so vale no modo demo; caso contrario e uma sessao antiga/falsa
      const sessionUserKey = session?.token
        ? userKeyFromRole(session.backendRole)
        : session?.userKey;
      const target = redirectForUserKey(sessionUserKey);
      if ((session?.token || DEMO_MODE) && target) {
        window.location.replace(target);
        return;
      }
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
    } catch (_) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
    }
  }

  const form = document.getElementById('adminLoginForm');
  const cpfInput = document.getElementById('adminCpf');
  const passwordInput = document.getElementById('adminPassword');
  const togglePassword = document.getElementById('togglePassword');
  const submitButton = form?.querySelector('button[type="submit"]');

  if (DEMO_MODE) {
    fillDemoCredentials(DEFAULT_DEMO_ADMIN_KEY, cpfInput, passwordInput);
  } else {
    if (cpfInput) cpfInput.value = '';
    if (passwordInput) passwordInput.value = '';
    hideDemoProfileButtons(form);
    cpfInput?.focus();
  }
  applyPasswordResetFeedback(cpfInput, passwordInput);
  startPrepCountdown();

  cpfInput?.addEventListener('input', () => {
    cpfInput.value = formatCpf(cpfInput.value);
    if (DEMO_MODE) syncDemoButtonFromCredentials(cpfInput, passwordInput);
  });

  togglePassword?.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    togglePassword.textContent = isPassword ? 'Ocultar' : 'Mostrar';
    togglePassword.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
  });

  document.querySelectorAll('[data-demo-user]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!DEMO_MODE) return;
      fillDemoCredentials(button.dataset.demoUser, cpfInput, passwordInput);
    });
  });

  passwordInput?.addEventListener('input', () => {
    if (DEMO_MODE) syncDemoButtonFromCredentials(cpfInput, passwordInput);
  });

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
    const remember = formData.get('remember') === 'on';

    if (submitButton) submitButton.disabled = true;

    try {
      const auth = await loginBackend(cpf, password);
      startSession(adminFromAuth(auth), remember, auth);
      return;
    } catch (error) {
      console.warn('[adm-login] falha no login backend:', error);

      setLoginError(error.message || 'Nao foi possivel entrar. Tente novamente.');
      if (submitButton) submitButton.disabled = false;
    }
  });
});
