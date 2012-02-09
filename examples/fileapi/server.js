var WebSocketServer = require('../../').Server
  , express = require('express')
  , fs = require('fs')
  , path = require('path')
  , app = express.createServer();

app.use(express.static(__dirname + '/public'));

function makePathForFile(filePath, prefix, cb) {
  if (typeof cb !== 'function') throw new Error('callback is required');
  filePath = path.dirname(path.normalize(filePath));
  filePath = filePath.replace(/^(\/|\\)+/, '');
  var pieces = filePath.split('/');
  var incrementalPath = prefix;
  function step(error) {
    if (error) return cb(error);
    if (pieces.length == 0) return cb(null, incrementalPath);
    var piece = pieces.shift();
    incrementalPath += '/' + piece;
    path.exists(incrementalPath, function(exists) {
      if (!exists) fs.mkdir(incrementalPath, step);
      else process.nextTick(step);
    });
  }
  step();
}

var wss = new WebSocketServer({server: app});
wss.on('connection', function(ws) {
  ws.on('message', function(data, flags) {
    if (flags.binary) {
      makePathForFile(ws.currentFile.path, __dirname + '/uploaded', function(error, path) {
        if (error) {
          console.log(error);
          ws.send(JSON.stringify({event: 'error', path: ws.currentFile.path, message: error.message}));
          return;
        }
        fs.writeFile(path + '/' + ws.currentFile.name, data, function(error) {
          console.log('received %d bytes long file, %s', data.length, ws.currentFile.path);
          ws.send(JSON.stringify({event: 'complete', path: ws.currentFile.path}));
        });
      });
    }
    else {
      ws.currentFile = JSON.parse(data);
    }
  });
  ws.on('close', function() {
    console.log('closed', arguments);
  });
  ws.on('error', function(e) {
    console.log('error', e);
  });
});

fs.mkdir(__dirname + '/uploaded', function(error) {
  // ignore errors, most likely means directory exists
  console.log('Uploaded files will be saved to %s/uploaded.', __dirname);
  console.log('Remember to wipe this directory if you upload lots and lots.');
  app.listen(8080);
  console.log('Listening on http://localhost:8080');
});
