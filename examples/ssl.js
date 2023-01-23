'use strict';

const https = require('https');
const fs = require('fs');

const { WebSocket, WebSocketServer } = require('..');

const server = https.createServer({
  cert: fs.readFileSync('../test/fixtures/certificate.pem'),
  key: fs.readFileSync('../test/fixtures/key.pem')
});

const wss = new WebSocketServer({ server });

wss.on('connection', function connection(ws) {
  ws.on('error', console.error);

  ws.on('message', function message(msg) {
    console.log(msg.toString());
  });
});

server.listen(function listening() {
  //
  // If the `rejectUnauthorized` option is not `false`, the server certificate
  // is verified against a list of well-known CAs. An 'error' event is emitted
  // if verification fails.
  //
  // The certificate used in this example is self-signed so `rejectUnauthorized`
  // is set to `false`.
  //
  const ws = new WebSocket(`wss://localhost:${server.address().port}`, {
    rejectUnauthorized: false
  });

  ws.on('error', console.error);

  ws.on('open', function open() {
    ws.send('All glory to WebSockets!');
  });
});
