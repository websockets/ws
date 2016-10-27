'use strict';

const crypto = require('crypto');
const events = require('events');
const http = require('http');
const util = require('util');

const Receiver = require('../lib/Receiver');
const Sender = require('../lib/Sender');

module.exports = {
  handlers: {
    valid: validServer,
    invalidKey: invalidRequestHandler,
    closeAfterConnect: closeAfterConnectHandler,
    return401: return401
  },
  createServer: function (port, handler, cb) {
    if (handler && !cb) {
      cb = handler;
      handler = null;
    }
    const webServer = http.createServer(function (req, res) {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('okay');
    });
    const srv = new Server(webServer);
    webServer.on('upgrade', function (req, socket) {
      webServer._socket = socket;
      (handler || validServer)(srv, req, socket);
    });
    webServer.listen(port, '127.0.0.1', function () { cb(srv); });
  }
};

/**
 * Test strategies
 */

function validServer (server, req, socket) {
  if (typeof req.headers.upgrade === 'undefined' ||
    req.headers.upgrade.toLowerCase() !== 'websocket') {
    throw new Error('invalid headers');
  }

  if (!req.headers['sec-websocket-key']) {
    socket.end();
    throw new Error('websocket key is missing');
  }

  // calc key
  let key = req.headers['sec-websocket-key'];
  const shasum = crypto.createHash('sha1');
  shasum.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', 'binary');
  key = shasum.digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Accept: ' + key
  ];

  socket.write(headers.concat('', '').join('\r\n'));
  socket.setTimeout(0);
  socket.setNoDelay(true);

  const sender = new Sender(socket);
  const receiver = new Receiver();
  receiver.ontext = function (message, flags) {
    server.emit('message', message, flags);
    sender.send(message);
  };
  receiver.onbinary = function (message, flags) {
    flags = flags || {};
    flags.binary = true;
    server.emit('message', message, flags);
    sender.send(message, {binary: true});
  };
  receiver.onping = function (message, flags) {
    flags = flags || {};
    server.emit('ping', message, flags);
  };
  receiver.onpong = function (message, flags) {
    flags = flags || {};
    server.emit('pong', message, flags);
  };
  receiver.onclose = function (code, message, flags) {
    flags = flags || {};
    sender.close(code, message, false, function () {
      server.emit('close', code, message, flags);
      socket.end();
    });
  };
  socket.on('data', function (data) {
    receiver.add(data);
  });
  socket.on('end', function () {
    socket.end();
  });
}

function invalidRequestHandler (server, req, socket) {
  if (typeof req.headers.upgrade === 'undefined' ||
    req.headers.upgrade.toLowerCase() !== 'websocket') {
    throw new Error('invalid headers');
  }

  if (!req.headers['sec-websocket-key']) {
    socket.end();
    throw new Error('websocket key is missing');
  }

  // calc key
  let key = req.headers['sec-websocket-key'];
  const shasum = crypto.createHash('sha1');
  shasum.update(key + 'bogus', 'binary');
  key = shasum.digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Accept: ' + key
  ];

  socket.write(headers.concat('', '').join('\r\n'));
  socket.end();
}

function closeAfterConnectHandler (server, req, socket) {
  if (typeof req.headers.upgrade === 'undefined' ||
    req.headers.upgrade.toLowerCase() !== 'websocket') {
    throw new Error('invalid headers');
  }

  if (!req.headers['sec-websocket-key']) {
    socket.end();
    throw new Error('websocket key is missing');
  }

  // calc key
  let key = req.headers['sec-websocket-key'];
  const shasum = crypto.createHash('sha1');
  shasum.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', 'binary');
  key = shasum.digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Accept: ' + key
  ];

  socket.write(headers.concat('', '').join('\r\n'));
  socket.end();
}

function return401 (server, req, socket) {
  const headers = [
    'HTTP/1.1 401 Unauthorized',
    'Content-type: text/html'
  ];

  socket.write(headers.concat('', '').join('\r\n'));
  socket.write('Not allowed!');
  socket.end();
}

/**
 * Server object, which will do the actual emitting
 */

function Server (webServer) {
  this.webServer = webServer;
}

util.inherits(Server, events.EventEmitter);

Server.prototype.close = function () {
  this.webServer.close();
  if (this._socket) this._socket.end();
};
