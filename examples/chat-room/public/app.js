(function () {
  const messages = document.getElementById('messages');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send');

  function show(msg) {
    const div = document.createElement('div');
    div.textContent = msg;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  const ws = new WebSocket(`ws://${location.host}`);

  ws.onopen = function () {
    show('[connected]');
  };

  ws.onmessage = function (evt) {
    show(evt.data);
  };

  ws.onclose = function () {
    show('[disconnected]');
  };

  ws.onerror = function () {
    show('[error]');
  };

  sendBtn.onclick = send;
  input.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') send();
  });

  function send() {
    const v = input.value.trim();
    if (!v) return;
    if (ws.readyState !== WebSocket.OPEN) {
      show('[no connection]');
      return;
    }
    ws.send(v);
    input.value = '';
  }
})();
