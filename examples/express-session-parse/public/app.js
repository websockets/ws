/* global fetch, WebSocket, location */
(() => {
  const messages = document.querySelector('#messages');
  const wsButton = document.querySelector('#wsButton');
  const logout = document.querySelector('#logout');
  const login = document.querySelector('#login');

  const showMessage = (message) => {
    messages.textContent += `\n${message}`;
    messages.scrollTop = messages.scrollHeight;
  };

  const handleResponse = (response) => {
    return response.ok
      ? response.json().then((data) => JSON.stringify(data, null, 2))
      : Promise.reject(new Error('Unexpected response'));
  };

  login.onclick = () => {
    fetch('/login', { method: 'POST', credentials: 'same-origin' })
      .then(handleResponse)
      .then(showMessage)
      .catch((err) => showMessage(err.message));
  };

  logout.onclick = () => {
    fetch('/logout', { method: 'DELETE', credentials: 'same-origin' })
      .then(handleResponse)
      .then(showMessage)
      .catch((err) => showMessage(err.message));
  };

  let ws;

  wsButton.onclick = () => {
    if (ws) {
      ws.onerror = ws.onopen = ws.onclose = null;
      ws.close();
    }

    ws = new WebSocket(`ws://${location.host}`);
    ws.onerror = () => showMessage('WebSocket error');
    ws.onopen = () => showMessage('WebSocket connection established');
    ws.onclose = () => showMessage('WebSocket connection closed');
  };
})();
