const WebSocketServer = require('../../').Server;
const express = require('express');
const path = require('path');
const app = express();
const server = require('http').createServer();

app.use(express.static(path.join(__dirname, '/public')));

const wss = new WebSocketServer({ server: server });
wss.on('connection', function(ws) {
  const id = setInterval(function() {
    ws.send(JSON.stringify(process.memoryUsage()), function() {
      /* ignore errors */
    });
  }, 100);
  console.log('started client interval');
  ws.on('close', function() {
    console.log('stopping client interval');
    clearInterval(id);
  });
});

server.on('request', app);
server.listen(8080, function() {
  console.log('Listening on http://localhost:8080');
});
