var WebSocketServer = require('../../').Server;
var express = require('express');
var path = require('path');
var app = express.createServer();

app.use(express.static(path.join(__dirname, '/public')));
app.listen(8080);

var wss = new WebSocketServer({server: app});
wss.on('connection', function (ws) {
  var id = setInterval(function () {
    ws.send(JSON.stringify(process.memoryUsage()), function () { /* ignore errors */ });
  }, 100);
  console.log('started client interval');
  ws.on('close', function () {
    console.log('stopping client interval');
    clearInterval(id);
  });
});
