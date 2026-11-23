(() => {
  const SESSION_KEY = 'dataplate:adminSession';
  const ROLE_LABEL = {
    ADMIN: 'Administrador',
    GERENTE: 'Gerente',
    FUNCIONARIO: 'Atendente',
    CAIXA: 'Caixa',
    COZINHA: 'Cozinha'
  };
  const HOME_BY_ROLE = {
    ADMIN: 'adm.html',
    GERENTE: 'adm.html',
    FUNCIONARIO: 'atendente.html',
    CAIXA: 'pdv.html',
    COZINHA: 'cozinha.html'
  };
  const apiBase = window.DATAPLATE_API_BASE_URL
    || localStorage.getItem('DATAPLATE_API_BASE_URL')
    || `http://${location.hostname || 'localhost'}:8081/api`;

  function mostrarMensagem(elemento, texto, sucesso = false) {
    elemento.textContent = texto;
    elemento.classList.toggle('account-message--success', sucesso);
  }

  function mensagemDeErro(body, fallback) {
    if (Array.isArray(body?.detail)) {
      const mensagens = body.detail
        .map((item) => String(item?.msg || '').replace(/^Value error,\s*/i, ''))
        .filter(Boolean);
      if (mensagens.length) return mensagens.join('; ');
    }
    if (typeof body?.detail === 'string' && body.detail) return body.detail;
    return body?.message || body?.mensagem || fallback;
  }

  async function requisicaoAutenticada(path, options = {}) {
    let session;
    try {
      session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    } catch (_) {
      session = null;
    }

    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${session?.token || ''}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      }
    });

    if (response.status === 401) {
      sessionStorage.removeItem(SESSION_KEY);
      location.replace('adm-login.html');
      throw new Error('Sua sessão expirou. Entre novamente.');
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(mensagemDeErro(body, `Não foi possível concluir a operação (${response.status}).`));
    }

    return response;
  }

  function formatarCpf(cpf) {
    const digitos = String(cpf || '').replace(/\D/g, '');
    if (digitos.length !== 11) return 'CPF indisponível';
    return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.***-**`;
  }

  function avaliarForcaSenha(senha) {
    if (!senha) return { nivel: 0, rotulo: 'Digite uma nova senha', ajuda: '' };
    const validacao = window.DataPlateAdminAuth.validatePassword(senha);
    if (!validacao.valid) return { nivel: 1, rotulo: 'Fraca', ajuda: validacao.message };

    const forte = senha.length >= 12
      && /[a-z]/.test(senha)
      && /[A-Z]/.test(senha)
      && /\d/.test(senha)
      && /[^A-Za-z0-9]/.test(senha);
    return forte
      ? { nivel: 3, rotulo: 'Forte', ajuda: 'Sua senha atende aos requisitos.' }
      : { nivel: 2, rotulo: 'Média', ajuda: 'Sua senha atende aos requisitos.' };
  }

  function atualizarMedidorSenha() {
    const entrada = document.getElementById('newPassword');
    const medidor = document.querySelector('.password-strength-meter');
    const container = document.getElementById('passwordStrength');
    const rotulo = document.getElementById('passwordStrengthLabel');
    const ajuda = document.getElementById('passwordStrengthHelp');
    const resultado = avaliarForcaSenha(entrada.value);
    container.dataset.strength = String(resultado.nivel);
    medidor.setAttribute('aria-valuenow', String(resultado.nivel));
    medidor.setAttribute('aria-valuetext', resultado.rotulo);
    rotulo.textContent = resultado.rotulo;
    ajuda.textContent = resultado.ajuda || 'Use pelo menos 8 caracteres, com letras e números.';
  }

  async function inicializar() {
    await window.DATAPLATE_SESSION_READY;
    const usuario = window.DATAPLATE_CURRENT_USER;
    if (!usuario) return;

    document.getElementById('accountName').textContent = usuario.nome || '—';
    document.getElementById('accountCpf').textContent = formatarCpf(usuario.cpf);
    document.getElementById('accountRole').textContent = ROLE_LABEL[usuario.role] || '—';
    document.getElementById('accountEmail').textContent = usuario.email || 'Não informado';
    const home = HOME_BY_ROLE[usuario.role] || 'adm.html';
    document.getElementById('accountBackLink').href = home;
    document.querySelector('.account-page-brand').href = home;

    const senhaForm = document.getElementById('accountPasswordForm');
    const senhaMensagem = document.getElementById('passwordMessage');
    const senhaInput = document.getElementById('newPassword');
    const confirmarSenha = document.getElementById('confirmPassword');
    senhaInput.addEventListener('input', () => {
      atualizarMedidorSenha();
      mostrarMensagem(senhaMensagem, '');
    });
    confirmarSenha.addEventListener('input', () => mostrarMensagem(senhaMensagem, ''));

    senhaForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      mostrarMensagem(senhaMensagem, '');
      const formData = new FormData(senhaForm);
      const senhaAtual = String(formData.get('senhaAtual') || '');
      const novaSenha = String(formData.get('novaSenha') || '');
      const confirmacao = String(formData.get('confirmarSenha') || '');
      const forca = window.DataPlateAdminAuth.validatePassword(novaSenha);

      if (!forca.valid) {
        mostrarMensagem(senhaMensagem, 'A nova senha deve ter pelo menos 8 caracteres, com letras e números.');
        return;
      }
      if (novaSenha !== confirmacao) {
        mostrarMensagem(senhaMensagem, 'As senhas não conferem.');
        confirmarSenha.focus();
        return;
      }

      const botao = senhaForm.querySelector('button[type="submit"]');
      botao.disabled = true;
      try {
        await requisicaoAutenticada('/auth/me/password', {
          method: 'PUT',
          body: JSON.stringify({ senhaAtual, novaSenha })
        });
        senhaForm.reset();
        atualizarMedidorSenha();
        mostrarMensagem(senhaMensagem, 'Senha alterada com sucesso.', true);
      } catch (error) {
        mostrarMensagem(senhaMensagem, error.message);
      } finally {
        botao.disabled = false;
      }
    });

    const emailForm = document.getElementById('accountEmailForm');
    const emailMensagem = document.getElementById('emailMessage');
    const confirmacaoEmail = document.getElementById('emailConfirmation');
    const formularioConfirmacaoEmail = document.getElementById('emailConfirmationForm');
    const mensagemConfirmacao = document.getElementById('emailConfirmationMessage');
    let emailPendente = '';

    emailForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      mostrarMensagem(emailMensagem, '');
      if (!emailForm.reportValidity()) return;

      const dados = new FormData(emailForm);
      emailPendente = String(dados.get('email') || '').trim().toLowerCase();
      const botao = emailForm.querySelector('button[type="submit"]');
      botao.disabled = true;
      try {
        await requisicaoAutenticada('/auth/me/email-change', {
          method: 'PUT',
          body: JSON.stringify({
            senhaAtual: String(dados.get('senhaAtual') || ''),
            email: emailPendente
          })
        });
        document.getElementById('emailConfirmationText').textContent =
          `Enviamos um código para ${emailPendente}. O e-mail atual continua ativo até a confirmação.`;
        emailForm.hidden = true;
        confirmacaoEmail.hidden = false;
        document.getElementById('emailConfirmationCode').focus();
      } catch (error) {
        mostrarMensagem(emailMensagem, error.message);
      } finally {
        botao.disabled = false;
      }
    });

    formularioConfirmacaoEmail.addEventListener('submit', async (event) => {
      event.preventDefault();
      mostrarMensagem(mensagemConfirmacao, '');
      if (!formularioConfirmacaoEmail.reportValidity()) return;

      const dados = new FormData(formularioConfirmacaoEmail);
      const botao = formularioConfirmacaoEmail.querySelector('button[type="submit"]');
      botao.disabled = true;
      try {
        await requisicaoAutenticada('/auth/me/email-change/confirm', {
          method: 'POST',
          body: JSON.stringify({ codigo: String(dados.get('codigo') || '') })
        });
        document.getElementById('accountEmail').textContent = emailPendente;
        usuario.email = emailPendente;
        emailForm.reset();
        formularioConfirmacaoEmail.reset();
        confirmacaoEmail.hidden = true;
        emailForm.hidden = false;
        mostrarMensagem(emailMensagem, 'E-mail de recuperação atualizado.', true);
        emailPendente = '';
      } catch (error) {
        mostrarMensagem(mensagemConfirmacao, error.message);
      } finally {
        botao.disabled = false;
      }
    });

    document.getElementById('changePendingEmail').addEventListener('click', () => {
      formularioConfirmacaoEmail.reset();
      mostrarMensagem(mensagemConfirmacao, '');
      confirmacaoEmail.hidden = true;
      emailForm.hidden = false;
      emailPendente = '';
      document.getElementById('newEmail').focus();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    inicializar().catch((error) => {
      console.error('[minha-conta]', error);
    });
  });
})();
