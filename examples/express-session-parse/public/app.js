/* global fetch, WebSocket */
var resultDiv = document.querySelector('div#result');

function showMessage (message) {
  resultDiv.innerHTML += '<br/>' + message;
  resultDiv.scrollTop = resultDiv.scrollHeight;
}

function handleResponseAsync (response) {
  return Promise.resolve()
    .then(function () {
      if (response.ok) {
        response.json()
          .then(function (json) {
            showMessage(JSON.stringify(json, null, 2));
          });
      } else {
        showMessage('Network error');
      }
    });
}
function openSession () {
  fetch('/session', {credentials: 'same-origin'})
    .then(function (response) {
      handleResponseAsync(response);
    });
}
function closeSession () {
  fetch('/session', {method: 'DELETE', credentials: 'same-origin'})
    .then(function (response) {
      handleResponseAsync(response);
    });
}
function connectToWs () {
  var hostname = window.location.hostname;
  var port = window.location.port;
  var Socket = new WebSocket('ws://' + hostname + ':' + port);
  Socket.onerror = function () {
    showMessage('Error in web socket');
  };
  Socket.onopen = function () {
    showMessage('Web socket is opened');
  };
  Socket.onclose = function () {
    showMessage('Web socket is closed');
  };
}

window.onload = function () {
  document.querySelector('button#openBtn').onclick = openSession;
  document.querySelector('button#closeBtn').onclick = closeSession;
  document.querySelector('button#connectWs').onclick = connectToWs;
};
