'use strict';

const WebSocket = require('../');

const wss = new WebSocket.Server({port: 8181});
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    ws.send(data);
  });
  ws.on('error', (e) => console.error(e));
});
