'use strict';

const WebSocket = require('../');

const port = process.argv.length > 2 ? parseInt(process.argv[2]) : 9001;
const wss = new WebSocket.Server({ port }, () => {
  console.log(
    `Listening to port ${port}. Use extra argument to define the port`
  );
});

wss.on('connection', (ws) => {
  ws.on('message', (data, isBinary) => {
    ws.send(data, { binary: isBinary });
  });
  ws.on('error', (e) => console.error(e));
});
