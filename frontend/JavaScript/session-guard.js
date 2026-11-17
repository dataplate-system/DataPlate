// A tela so aparece depois de o servidor confirmar identidade e perfil.
(() => {
  const key = 'dataplate:adminSession';
  const homes = { ADMIN: 'adm.html', GERENTE: 'adm.html', FUNCIONARIO: 'atendente.html', COZINHA: 'cozinha.html', CAIXA: 'pdv.html' };
  const keys = { ADMIN: 'admin', GERENTE: 'gerente', FUNCIONARIO: 'atendente', COZINHA: 'cozinha', CAIXA: 'caixa' };
  const allowed = { 'adm.html': ['ADMIN', 'GERENTE'], 'atendente.html': ['FUNCIONARIO', 'GERENTE'], 'cozinha.html': ['COZINHA', 'GERENTE'], 'pdv.html': ['CAIXA', 'GERENTE'] };
  const page = location.pathname.split('/').pop();
  document.documentElement.style.visibility = 'hidden';
  const deny = () => { sessionStorage.removeItem(key); location.replace('adm-login.html'); };
  let session;
  try { session = JSON.parse(sessionStorage.getItem(key)); } catch (_) {}
  if (!session?.token || !allowed[page]) { deny(); return; }
  const host = location.hostname || 'localhost';
  const base = window.DATAPLATE_API_BASE_URL || localStorage.getItem('DATAPLATE_API_BASE_URL')
    || (location.port === '8081' ? '/api' : `http://${host}:8081/api`);
  window.DATAPLATE_SESSION_READY = fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${session.token}` }, signal: AbortSignal.timeout(10000) })
    .then(async response => {
      if (!response.ok) throw new Error('Sessao invalida');
      const user = await response.json();
      if (!homes[user.role]) throw new Error('Perfil invalido');
      if (!allowed[page].includes(user.role) || session.backendRole !== user.role) {
        sessionStorage.setItem(key, JSON.stringify({ ...session, backendRole: user.role, userKey: keys[user.role], name: user.nome }));
        location.replace(homes[user.role]);
        return;
      }
      document.documentElement.style.visibility = '';
    }).catch(deny);
})();
