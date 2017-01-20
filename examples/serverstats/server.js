var WebSocketServer = require('../../').Server;
var express = require('express');
var path = require('path');
var app = express();
var server = require('http').createServer();

app.use(express.static(path.join(__dirname, '/public')));

var wss = new WebSocketServer({server: server});
  // A page will be served without calling the following control block (and with commenting out the previous code line), but it won't be populated by anything other than what's in the index.html file:
wss.on('connection', function (ws) {
  var id = setInterval(function () {
    ws.send(JSON.stringify(process.memoryUsage()), function () { /* ignore errors */ });
  }, 100);
    // For testing, to see in the terminal what that string above is; it's the same as you see in a client browser if you point a browser to localhost:8080 after running this script via 'node server.js'; observe that in index.html, the javascript overwrites values in the HTML document via document.getElementById('elementID').innerHTML = aStringVar; aStringVar being what it is handed here as JSON.stringify(process.memoryUsage().
    // var logStr = JSON.stringify(process.memoryUsage());
    // console.log(logStr);
  console.log('started client interval');
  ws.on('close', function () {
    console.log('stopping client interval');
    clearInterval(id);
  });
});

server.on('request', app);
server.listen(8080, function () {
  console.log('Listening on http://localhost:8080');
});
