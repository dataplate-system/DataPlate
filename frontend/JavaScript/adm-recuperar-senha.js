const adminAuth = window.DataPlateAdminAuth;

let selectedAdmin = null;
let codeVerified = false;

function setResetMessage(message, type = 'error') {
  const messageEl = document.getElementById('resetMessage');
  if (!messageEl) return;

  messageEl.textContent = message || '';
  messageEl.classList.toggle('is-success', type === 'success');
}

function setActiveStep(stepName) {
  document.querySelectorAll('[data-step-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.stepPanel !== stepName;
  });

  const stepOrder = ['identify', 'code', 'password'];
  const activeIndex = stepOrder.indexOf(stepName);

  document.querySelectorAll('.reset-steps [data-step]').forEach((step) => {
    const stepIndex = stepOrder.indexOf(step.dataset.step);
    step.classList.toggle('is-active', step.dataset.step === stepName);
    step.classList.toggle('is-complete', stepIndex >= 0 && stepIndex < activeIndex);
  });
}

function createSecurityChallenge() {
  if (!selectedAdmin) return;

  const challenge = adminAuth.createPasswordResetChallenge(selectedAdmin.userKey);
  const codePreview = document.getElementById('resetCodePreview');
  const codeHint = document.getElementById('resetCodeHint');

  if (codePreview) codePreview.textContent = challenge.code;
  if (codeHint) {
    codeHint.textContent = `Enviado para ${challenge.recoveryContact}. Expira em 10 minutos.`;
  }
}

function preparePasswordStep() {
  codeVerified = true;
  setActiveStep('password');
  setResetMessage('Codigo validado. Cadastre a nova senha.', 'success');
  document.getElementById('newAdminPassword')?.focus();
}

document.addEventListener('DOMContentLoaded', () => {
  const identifyForm = document.getElementById('identifyCpfForm');
  const codeForm = document.getElementById('securityCodeForm');
  const passwordForm = document.getElementById('newPasswordForm');
  const cpfInput = document.getElementById('recoveryCpf');
  const codeInput = document.getElementById('securityCode');
  const resendButton = document.getElementById('resendSecurityCode');

  cpfInput?.addEventListener('input', () => {
    cpfInput.value = adminAuth.formatCpf(cpfInput.value);
  });

  codeInput?.addEventListener('input', () => {
    codeInput.value = String(codeInput.value || '').replace(/\D/g, '').slice(0, 6);
  });

  identifyForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    setResetMessage('');

    if (!identifyForm.checkValidity()) {
      identifyForm.reportValidity();
      return;
    }

    selectedAdmin = adminAuth.findAdminByCpf(cpfInput.value);
    codeVerified = false;

    if (!selectedAdmin) {
      setResetMessage('Nao encontramos um acesso administrativo para este CPF.');
      return;
    }

    createSecurityChallenge();
    setActiveStep('code');
    setResetMessage('Codigo temporario gerado para verificacao.', 'success');
    codeInput?.focus();
  });

  codeForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    setResetMessage('');

    if (!codeForm.checkValidity()) {
      codeForm.reportValidity();
      return;
    }

    const result = adminAuth.verifyPasswordResetCode(selectedAdmin?.userKey, codeInput.value);
    if (!result.valid) {
      setResetMessage(result.message);
      codeInput?.select();
      return;
    }

    preparePasswordStep();
  });

  resendButton?.addEventListener('click', () => {
    if (!selectedAdmin) return;

    codeInput.value = '';
    createSecurityChallenge();
    setResetMessage('Novo codigo temporario gerado.', 'success');
    codeInput.focus();
  });

  passwordForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    setResetMessage('');

    const newPassword = passwordForm.querySelector('[name="newPassword"]');
    const confirmPassword = passwordForm.querySelector('[name="confirmPassword"]');

    newPassword.setCustomValidity('');
    confirmPassword.setCustomValidity('');

    if (!passwordForm.checkValidity()) {
      passwordForm.reportValidity();
      return;
    }

    if (!codeVerified) {
      setResetMessage('Valide o codigo de seguranca antes de alterar a senha.');
      setActiveStep('code');
      return;
    }

    const passwordValidation = adminAuth.validatePassword(newPassword.value);
    if (!passwordValidation.valid) {
      newPassword.setCustomValidity(passwordValidation.message);
      newPassword.reportValidity();
      return;
    }

    if (newPassword.value === adminAuth.getAdmin(selectedAdmin.userKey).password) {
      newPassword.setCustomValidity('A nova senha precisa ser diferente da senha atual.');
      newPassword.reportValidity();
      return;
    }

    if (newPassword.value !== confirmPassword.value) {
      confirmPassword.setCustomValidity('As senhas nao conferem.');
      confirmPassword.reportValidity();
      return;
    }

    adminAuth.updatePassword(selectedAdmin.userKey, newPassword.value);
    adminAuth.clearPasswordResetChallenge();

    setResetMessage('Senha atualizada. Redirecionando para o login...', 'success');
    passwordForm.querySelector('.login-button').disabled = true;

    window.setTimeout(() => {
      window.location.href = `adm-login.html?senhaAtualizada=1&user=${encodeURIComponent(selectedAdmin.userKey)}`;
    }, 1300);
  });
});
