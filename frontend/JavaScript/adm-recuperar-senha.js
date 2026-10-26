const adminAuth = window.DataPlateAdminAuth;
const API_BASE_URL = window.DATAPLATE_API_BASE_URL || localStorage.getItem('DATAPLATE_API_BASE_URL') || `http://${location.hostname || 'localhost'}:8081/api`;
let resetToken = null;
let verifiedCode = '';

function message(value, success = false) {
  const el = document.getElementById('resetMessage');
  el.textContent = value || '';
  el.classList.toggle('is-success', success);
}

function setStep(name) {
  const order = ['identify', 'code', 'password'];
  document.querySelectorAll('[data-step-panel]').forEach((el) => { el.hidden = el.dataset.stepPanel !== name; });
  document.querySelectorAll('.reset-steps [data-step]').forEach((el) => {
    const index = order.indexOf(el.dataset.step);
    el.classList.toggle('is-active', el.dataset.step === name);
    el.classList.toggle('is-complete', index < order.indexOf(name));
  });
}

async function request(path, body) {
  const response = await fetch(`${API_BASE_URL}/auth${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const detail = result?.mensagem || result?.detail;
    throw new Error(typeof detail === 'string' ? detail : 'Não foi possível concluir a solicitação. Tente novamente.');
  }
  return result;
}

document.addEventListener('DOMContentLoaded', () => {
  const identify = document.getElementById('identifyCpfForm');
  const codeForm = document.getElementById('securityCodeForm');
  const password = document.getElementById('newPasswordForm');
  const cpf = document.getElementById('recoveryCpf');
  const code = document.getElementById('securityCode');
  const preview = document.getElementById('resetCodePreview');
  const hint = document.getElementById('resetCodeHint');
  cpf.addEventListener('input', () => { cpf.value = adminAuth.formatCpf(cpf.value); });
  code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, 6); });

  async function sendCode() {
    const result = await request('/password-reset/request', { cpf: cpf.value });
    resetToken = result.resetToken || null;
    verifiedCode = '';
    preview.hidden = !result.debugCode;
    preview.textContent = result.debugCode || '';
    hint.textContent = result.debugCode ? 'Código de desenvolvimento.' : `Código enviado para ${result.recoveryEmail || 'o e-mail cadastrado'}.`;
    document.getElementById('resendSecurityCode').textContent = 'Reenviar código';
    message('Código enviado. Verifique seu e-mail.', true);
    code.focus();
  }

  identify.addEventListener('submit', async (event) => {
    event.preventDefault(); message('');
    if (!identify.checkValidity()) return identify.reportValidity();
    try {
      const result = await request('/password-reset/identify', { cpf: cpf.value });
      if (!result.recoveryEmail) return message('Não foi possível confirmar um e-mail de recuperação para este CPF.');
      hint.textContent = `Confirma o envio para ${result.recoveryEmail}?`;
      document.getElementById('resendSecurityCode').textContent = 'Enviar código';
      setStep('code');
    } catch (_) { message('Não foi possível iniciar a recuperação. Tente novamente.'); }
  });
  document.getElementById('resendSecurityCode').addEventListener('click', async () => {
    try { await sendCode(); code.value = ''; } catch (error) { message(error.message || 'Não foi possível enviar o código.'); }
  });
  codeForm.addEventListener('submit', async (event) => {
    event.preventDefault(); message('');
    if (!codeForm.checkValidity()) return codeForm.reportValidity();
    if (!resetToken) return message('Código inválido, expirado ou com limite de tentativas atingido.');
    try { await request('/password-reset/verify', { resetToken, codigo: code.value }); verifiedCode = code.value; setStep('password'); message('Código validado. Cadastre a nova senha.', true); } catch (error) { message(error.message); code.select(); }
  });
  password.addEventListener('submit', async (event) => {
    event.preventDefault(); message('');
    const newPassword = document.getElementById('newAdminPassword');
    const confirm = document.getElementById('confirmAdminPassword');
    newPassword.setCustomValidity(''); confirm.setCustomValidity('');
    if (!password.checkValidity()) return password.reportValidity();
    if (!resetToken || !verifiedCode) return message('Valide o código antes de alterar a senha.');
    if (!adminAuth.validatePassword(newPassword.value).valid) { newPassword.setCustomValidity('Use pelo menos 8 caracteres, com letras e números.'); return newPassword.reportValidity(); }
    if (newPassword.value !== confirm.value) { confirm.setCustomValidity('As senhas não conferem.'); return confirm.reportValidity(); }
    try { await request('/reset-password', { resetToken, codigo: verifiedCode, novaSenha: newPassword.value }); message('Senha atualizada. Redirecionando para o login...', true); password.querySelector('.login-button').disabled = true; setTimeout(() => { location.href = 'adm-login.html?senhaAtualizada=1'; }, 1300); } catch (error) { message(error.message); }
  });
});
