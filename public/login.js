const messages = {
  denied: 'Dieses GitHub-Konto hat keinen Zugriff. Bitte melde dich mit deinem freigegebenen Konto an.',
  failed: 'Die Anmeldung hat nicht geklappt oder ist abgelaufen. Bitte versuche es erneut.',
  setup: 'Die GitHub-Anmeldung wird noch eingerichtet. Bitte schließe zuerst die Hosting- und OAuth-Einrichtung ab.',
};
const status = new URLSearchParams(location.search).get('auth');
if (messages[status]) {
  const error = document.querySelector('#auth-error');
  error.textContent = messages[status];
  error.hidden = false;
  history.replaceState(null, '', '/');
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
