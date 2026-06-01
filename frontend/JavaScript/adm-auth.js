(function () {
  const ADMIN_SESSION_KEY = 'dataplate:adminSession';
  const ADMIN_PASSWORDS_KEY = 'dataplate:adminPasswordOverrides';
  const PASSWORD_RESET_CHALLENGE_KEY = 'dataplate:passwordResetChallenge';
  const DEFAULT_DEMO_ADMIN_KEY = 'gerente';
  const PASSWORD_MIN_LENGTH = 8;

  const defaultAdmins = {
    gerente: {
      name: 'Gerente Principal',
      initials: 'GP',
      cpf: '000.000.000-00',
      password: 'admin123',
      role: 'Administrador',
      userKey: 'gerente',
      recoveryContact: 'e-mail g*****e@dataplate.local'
    },
    atendente: {
      name: 'Atendente',
      initials: 'AT',
      cpf: '111.111.111-11',
      password: 'atendente123',
      role: 'Operacional',
      userKey: 'atendente',
      recoveryContact: 'SMS final 1111'
    },
    cozinha: {
      name: 'Cozinha',
      initials: 'CZ',
      cpf: '222.222.222-22',
      password: 'cozinha123',
      role: 'Pedidos e preparo',
      userKey: 'cozinha',
      recoveryContact: 'SMS final 2222'
    }
  };

  function safelyParseJson(value, fallback) {
    try {
      return JSON.parse(value) || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function normalizeCpf(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 11);
  }

  function formatCpf(value) {
    return normalizeCpf(value)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  function readPasswordOverrides() {
    return safelyParseJson(localStorage.getItem(ADMIN_PASSWORDS_KEY), {});
  }

  function writePasswordOverrides(overrides) {
    localStorage.setItem(ADMIN_PASSWORDS_KEY, JSON.stringify(overrides));
  }

  function getAdmin(adminKey) {
    const admin = defaultAdmins[adminKey];
    if (!admin) return null;

    const overrides = readPasswordOverrides();
    return {
      ...admin,
      password: overrides[adminKey] || admin.password
    };
  }

  function getAdmins() {
    return Object.keys(defaultAdmins).reduce((admins, adminKey) => {
      admins[adminKey] = getAdmin(adminKey);
      return admins;
    }, {});
  }

  function findAdminByCpf(cpf) {
    const normalizedCpf = normalizeCpf(cpf);
    return Object.values(getAdmins()).find((admin) => normalizeCpf(admin.cpf) === normalizedCpf);
  }

  function findAdmin(cpf, password) {
    return Object.values(getAdmins()).find((admin) =>
      normalizeCpf(admin.cpf) === normalizeCpf(cpf)
      && admin.password === password
    );
  }

  function verifyPassword(adminKey, password) {
    const admin = getAdmin(adminKey);
    return Boolean(admin && admin.password === password);
  }

  function validatePassword(password) {
    const value = String(password || '');

    if (value.length < PASSWORD_MIN_LENGTH) {
      return {
        valid: false,
        message: `Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`
      };
    }

    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
      return {
        valid: false,
        message: 'Use letras e numeros na nova senha.'
      };
    }

    return { valid: true, message: '' };
  }

  function updatePassword(adminKey, newPassword) {
    if (!defaultAdmins[adminKey]) return false;

    const validation = validatePassword(newPassword);
    if (!validation.valid) return false;

    const overrides = readPasswordOverrides();
    overrides[adminKey] = String(newPassword);
    writePasswordOverrides(overrides);
    return true;
  }

  function generateSecurityCode() {
    if (window.crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return String(values[0] % 1000000).padStart(6, '0');
    }

    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function createPasswordResetChallenge(adminKey) {
    const admin = getAdmin(adminKey);
    if (!admin) return null;

    const challenge = {
      adminKey,
      code: generateSecurityCode(),
      attempts: 0,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000
    };

    sessionStorage.setItem(PASSWORD_RESET_CHALLENGE_KEY, JSON.stringify(challenge));

    return {
      code: challenge.code,
      expiresAt: challenge.expiresAt,
      recoveryContact: admin.recoveryContact
    };
  }

  function readPasswordResetChallenge() {
    return safelyParseJson(sessionStorage.getItem(PASSWORD_RESET_CHALLENGE_KEY), null);
  }

  function verifyPasswordResetCode(adminKey, code) {
    const challenge = readPasswordResetChallenge();

    if (!challenge || challenge.adminKey !== adminKey) {
      return { valid: false, message: 'Inicie uma nova verificacao de seguranca.' };
    }

    if (Date.now() > challenge.expiresAt) {
      sessionStorage.removeItem(PASSWORD_RESET_CHALLENGE_KEY);
      return { valid: false, message: 'O codigo expirou. Solicite um novo codigo.' };
    }

    if (challenge.attempts >= 3) {
      sessionStorage.removeItem(PASSWORD_RESET_CHALLENGE_KEY);
      return { valid: false, message: 'Limite de tentativas atingido. Solicite um novo codigo.' };
    }

    if (String(code || '').trim() !== challenge.code) {
      challenge.attempts += 1;
      sessionStorage.setItem(PASSWORD_RESET_CHALLENGE_KEY, JSON.stringify(challenge));
      return { valid: false, message: 'Codigo de seguranca invalido.' };
    }

    return { valid: true, message: '' };
  }

  function clearPasswordResetChallenge() {
    sessionStorage.removeItem(PASSWORD_RESET_CHALLENGE_KEY);
  }

  window.DataPlateAdminAuth = {
    ADMIN_SESSION_KEY,
    ADMIN_PASSWORDS_KEY,
    DEFAULT_DEMO_ADMIN_KEY,
    formatCpf,
    getAdmin,
    getAdmins,
    findAdmin,
    findAdminByCpf,
    verifyPassword,
    validatePassword,
    updatePassword,
    createPasswordResetChallenge,
    verifyPasswordResetCode,
    clearPasswordResetChallenge
  };
})();
