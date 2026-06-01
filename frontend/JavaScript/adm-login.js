const ADMIN_SESSION_KEY = 'dataplate:adminSession';
const DEFAULT_DEMO_ADMIN_KEY = 'gerente';

const demoAdmins = {
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
  }
};

function setLoginError(message) {
  const error = document.getElementById('loginError');
  if (error) error.textContent = message || '';
}

function startSession(admin, remember) {
  const session = {
    name: admin.name,
    initials: admin.initials,
    cpf: admin.cpf,
    role: admin.role,
    userKey: admin.userKey,
    remember: Boolean(remember),
    loggedAt: new Date().toISOString()
  };

  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  window.location.href = admin.userKey === 'cozinha' ? 'cozinha.html' : 'adm.html';
}

function findAdmin(cpf, password) {
  return Object.values(demoAdmins).find((admin) =>
    admin.cpf === String(cpf).trim()
    && admin.password === password
  );
}

function setActiveDemoButton(selectedKey) {
  document.querySelectorAll('[data-demo-user]').forEach((button) => {
    const isSelected = button.dataset.demoUser === selectedKey;
    button.setAttribute('aria-pressed', String(isSelected));
  });
}

function fillDemoCredentials(adminKey, cpfInput, passwordInput) {
  const admin = demoAdmins[adminKey];
  if (!admin || !cpfInput || !passwordInput) return;

  cpfInput.value = admin.cpf;
  passwordInput.value = admin.password;
  setActiveDemoButton(adminKey);
  setLoginError('');
}

function syncDemoButtonFromCredentials(cpfInput, passwordInput) {
  const selectedKey = Object.keys(demoAdmins).find((key) => {
    const admin = demoAdmins[key];
    return admin.cpf === cpfInput.value.trim()
      && admin.password === passwordInput.value;
  });

  setActiveDemoButton(selectedKey || '');
}

function formatCpf(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
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
  const existingSession = localStorage.getItem(ADMIN_SESSION_KEY);
  if (existingSession) {
    try {
      const session = JSON.parse(existingSession);
      window.location.replace(session?.userKey === 'cozinha' ? 'cozinha.html' : 'adm.html');
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

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    setLoginError('');

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const admin = findAdmin(formData.get('cpf'), formData.get('password'));

    if (!admin) {
      setLoginError('CPF ou senha invalidos para o acesso administrativo.');
      return;
    }

    startSession(admin, formData.get('remember') === 'on');
  });
});
