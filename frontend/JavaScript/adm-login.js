const ADMIN_SESSION_KEY = 'dataplate:adminSession';
const DEFAULT_DEMO_ADMIN_KEY = 'gerente';

const demoAdmins = {
  gerente: {
    name: 'Gerente Principal',
    initials: 'GP',
    email: 'gerente@dataplate.com',
    password: 'admin123',
    role: 'Administrador',
    userKey: 'gerente'
  },
  atendente: {
    name: 'Atendente',
    initials: 'AT',
    email: 'atendente@dataplate.com',
    password: 'atendente123',
    role: 'Operacional',
    userKey: 'atendente'
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
    email: admin.email,
    role: admin.role,
    userKey: admin.userKey,
    remember: Boolean(remember),
    loggedAt: new Date().toISOString()
  };

  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  window.location.href = 'adm.html';
}

function findAdmin(email, password) {
  return Object.values(demoAdmins).find((admin) =>
    admin.email.toLowerCase() === String(email).trim().toLowerCase()
    && admin.password === password
  );
}

function setActiveDemoButton(selectedKey) {
  document.querySelectorAll('[data-demo-user]').forEach((button) => {
    const isSelected = button.dataset.demoUser === selectedKey;
    button.setAttribute('aria-pressed', String(isSelected));
  });
}

function fillDemoCredentials(adminKey, emailInput, passwordInput) {
  const admin = demoAdmins[adminKey];
  if (!admin || !emailInput || !passwordInput) return;

  emailInput.value = admin.email;
  passwordInput.value = admin.password;
  setActiveDemoButton(adminKey);
  setLoginError('');
}

function syncDemoButtonFromCredentials(emailInput, passwordInput) {
  const selectedKey = Object.keys(demoAdmins).find((key) => {
    const admin = demoAdmins[key];
    return admin.email.toLowerCase() === emailInput.value.trim().toLowerCase()
      && admin.password === passwordInput.value;
  });

  setActiveDemoButton(selectedKey || '');
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
  if (localStorage.getItem(ADMIN_SESSION_KEY)) {
    window.location.replace('adm.html');
    return;
  }

  const form = document.getElementById('adminLoginForm');
  const emailInput = document.getElementById('adminEmail');
  const passwordInput = document.getElementById('adminPassword');
  const togglePassword = document.getElementById('togglePassword');

  fillDemoCredentials(DEFAULT_DEMO_ADMIN_KEY, emailInput, passwordInput);
  startPrepCountdown();

  togglePassword?.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    togglePassword.textContent = isPassword ? 'Ocultar' : 'Mostrar';
    togglePassword.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
  });

  document.querySelectorAll('[data-demo-user]').forEach((button) => {
    button.addEventListener('click', () => {
      fillDemoCredentials(button.dataset.demoUser, emailInput, passwordInput);
    });
  });

  emailInput?.addEventListener('input', () => syncDemoButtonFromCredentials(emailInput, passwordInput));
  passwordInput?.addEventListener('input', () => syncDemoButtonFromCredentials(emailInput, passwordInput));

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    setLoginError('');

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const admin = findAdmin(formData.get('email'), formData.get('password'));

    if (!admin) {
      setLoginError('Email ou senha inválidos para o acesso administrativo.');
      return;
    }

    startSession(admin, formData.get('remember') === 'on');
  });
});
