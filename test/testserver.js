'use strict';

const EventEmitter = require('events');
const crypto = require('crypto');
const http = require('http');

const Receiver = require('../lib/Receiver');
const Sender = require('../lib/Sender');

module.exports = {
  handlers: {
    closeAfterConnect: closeAfterConnectHandler,
    invalidKey: invalidRequestHandler,
    return401: return401,
    valid: validServer
  },
  createServer: (port, handler, cb) => {
    if (handler && !cb) {
      cb = handler;
      handler = null;
    }

    const webServer = http.createServer();
    const srv = new Server(webServer);

    webServer.on('upgrade', (req, socket) => {
      webServer._socket = socket;
      (handler || validServer)(srv, req, socket);
    });

    webServer.listen(port, '127.0.0.1', () => cb(srv));
  }
};

function validServer (server, req, socket) {
  if (!req.headers.upgrade || req.headers.upgrade !== 'websocket') {
    throw new Error('invalid headers');
  }

  if (!req.headers['sec-websocket-key']) {
    throw new Error('websocket key is missing');
  }

  // calc key
  const key = crypto.createHash('sha1')
    .update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`, 'binary')
    .digest('base64');

  socket.setTimeout(0);
  socket.setNoDelay(true);

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept:${key}\r\n` +
    '\r\n'
  );

  const sender = new Sender(socket);
  const receiver = new Receiver();

  receiver.onping = (message, flags) => server.emit('ping', message, flags);
  receiver.onpong = (message, flags) => server.emit('pong', message, flags);
  receiver.ontext = (message, flags) => {
    server.emit('message', message, flags);
    sender.send(message, { fin: true });
  };
  receiver.onbinary = (message, flags) => {
    flags.binary = true;
    server.emit('message', message, flags);
    sender.send(message, { binary: true, fin: true });
  };
  receiver.onclose = (code, message, flags) => {
    sender.close(code, message, false, () => {
      server.emit('close', code, message, flags);
      socket.end();
    });
  };

  socket.on('data', (data) => receiver.add(data));
  socket.on('end', () => socket.end());
}

function invalidRequestHandler (server, req, socket) {
  if (!req.headers.upgrade || req.headers.upgrade !== 'websocket') {
    throw new Error('invalid headers');
  }

  if (!req.headers['sec-websocket-key']) {
    throw new Error('websocket key is missing');
  }

  // calc key
  const key = crypto.createHash('sha1')
    .update(`${req.headers['sec-websocket-key']}bogus`, 'latin1')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept:${key}\r\n` +
    '\r\n'
  );
  socket.end();
}

function closeAfterConnectHandler (server, req, socket) {
  if (!req.headers.upgrade || req.headers.upgrade !== 'websocket') {
    throw new Error('invalid headers');
  }

  if (!req.headers['sec-websocket-key']) {
    throw new Error('websocket key is missing');
  }

  // calc key
  const key = crypto.createHash('sha1')
    .update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`, 'latin1')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept:${key}\r\n` +
    '\r\n'
  );
  socket.end();
}

function return401 (server, req, socket) {
  socket.write(
    `HTTP/1.1 401 ${http.STATUS_CODES[401]}\r\n` +
    'Connection: close\r\n' +
    'Content-type: text/html\r\n' +
    'Content-Length: 12\r\n' +
    '\r\n' +
    'Not allowed!'
  );
  socket.end();
}

/**
 * Server object, which will do the actual emitting
 */
class Server extends EventEmitter {
  constructor (webServer) {
    super();
    this.webServer = webServer;
  }

  close (cb) {
    this.webServer.close(cb);
    if (this._socket) this._socket.end();
  }
}
