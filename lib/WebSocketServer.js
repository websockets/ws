/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

var util = require('util')
  , events = require('events')
  , http = require('http')
  , crypto = require('crypto')
  , url = require('url')
  , Options = require('options')
  , WebSocket = require('./WebSocket');

/**
 * WebSocket implementation
 */

function WebSocketServer(options, callback) {
  options = new Options({
    host: '127.0.0.1',
    port: null,
    server: null,
    verifyOrigin: null
  }).merge(options);
  if (!options.value.port && !options.value.server) {
    throw new TypeError('`port` or a `server` must be provided');
  }

  if (!options.value.server) {
    this._server = http.createServer(function (req, res) {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('okay');
    });
    this._server.listen(options.value.port, options.value.host || '127.0.0.1', callback);
  }
  else {
    this._server = options.value.server;
  }

  this._clients = [];
  var self = this;
  this._server.on('error', function(error) {
    self.emit('error', error)
  });
  
  this._server.on('upgrade', function(req, socket, upgradeHead) {
    if (typeof req.headers.upgrade === 'undefined' || req.headers.upgrade.toLowerCase() !== 'websocket') {
      abortConnection(socket, 400, 'Bad Request');
      return;
    }

    // verify key presence
    if (!req.headers['sec-websocket-key']) {
      abortConnection(socket, 400, 'Bad Request');
      return;
    }

    // verify version
    var version = parseInt(req.headers['sec-websocket-version']);
    if ([8, 13].indexOf(version) === -1) {
      abortConnection(socket, 400, 'Bad Request');
      return;
    }

    // verify origin
    var origin = version < 13 ? 
      req.headers['sec-websocket-origin'] :
      req.headers['origin'];
    if (typeof options.value.verifyOrigin == 'function') {
      if (!options.value.verifyOrigin(origin)) {
        abortConnection(socket, 401, 'Unauthorized');
        return;
      }
    }

    var protocol = req.headers['sec-websocket-protocol'];

    // calc key
    var key = req.headers['sec-websocket-key'];
    var shasum = crypto.createHash('sha1');
    shasum.update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
    key = shasum.digest('base64');

    var headers = [
        'HTTP/1.1 101 Switching Protocols'
      , 'Upgrade: websocket'
      , 'Connection: Upgrade'
      , 'Sec-WebSocket-Accept: ' + key
    ];
    if (typeof protocol != 'undefined') {
      headers['Sec-WebSocket-Protocol'] = protocol;
    }
    try {
      socket.write(headers.concat('', '').join('\r\n'));
    }
    catch (e) {
      try { socket.end(); } catch (_) {}
      return;
    }
    socket.setTimeout(0);
    socket.setNoDelay(true);
    var client = new WebSocket(Array.prototype.slice.call(arguments, 0), {
      protocolVersion: version,
      protocol: protocol
    });
    self._clients.push(client);
    client.on('open', function() {
      self.emit('connection', client);
    });
    client.on('close', function() {
      var index = self._clients.indexOf(client);
      if (index != -1) {
        self._clients.splice(index, 1);
      }
    });
  });
  this.__defineGetter__('clients', function() {
    return self._clients;
  });
}

/**
 * Inherits from EventEmitter.
 */

util.inherits(WebSocketServer, events.EventEmitter);

/**
 * Immediately shuts down the connection
 *
 * @api public
 */

WebSocketServer.prototype.close = function(code, data) {
  var error = null;
  try {
    for (var i = 0, l = this._clients.length; i < l; ++i) {
      this._clients[i].terminate();
    }
  }
  catch (e) {
    error = e;
  }
  try {
    this._server.close();
  }
  finally {
    this._server = null;
  }
  if (error) throw error;
}

module.exports = WebSocketServer;

/**
 * Entirely private apis,
 * which may or may not be bound to a sepcific WebSocket instance.
 */

function abortConnection(socket, code, name) {
  try {
    var response = [
      'HTTP/1.1 ' + code + ' ' + name,
      'Content-type: text/html'
    ]; 
    socket.write(response.concat('', '').join('\r\n'));
    socket.end();
  }
  catch (e) {}
}
