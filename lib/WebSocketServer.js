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
  , WebSocket = require('./WebSocket');

/**
 * WebSocket implementation
 */

function WebSocketServer(options, callback) {
  if (typeof options !== 'object' || typeof options.port == 'undefined') {
    throw new Error('port must be provided');
  }
  this._server = http.createServer(function (req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('okay');
  });
  this._clients = [];
  var self = this;
  this._server.on('error', function(error) {
    self.emit('error', error)
  });
  this._server.on('upgrade', function(req, socket, upgradeHead) {
    if (typeof req.headers.upgrade === 'undefined' || req.headers.upgrade.toLowerCase() !== 'websocket') {
      socket.end();
      self.emit('error', 'client connection with invalid headers');
      return;
    }
    if (!req.headers['sec-websocket-key']) {
      socket.end();
      self.emit('error', 'websocket key is missing');
    }

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

    try {
      socket.write(headers.concat('', '').join('\r\n'));
    }
    catch (e) {
      try { socket.end(); } catch (_) {}
      self.emit('error', 'socket error: ' + e);
      return;
    }
    socket.setTimeout(0);
    socket.setNoDelay(true);
    self._socket = socket;

    var client = new WebSocket(Array.prototype.slice.call(arguments, 0));
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
  this._server.listen(options.port, '127.0.0.1', function() {
    if (typeof callback == 'function') callback();
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
    this._socket.end();
  }
  finally {
    this._server = null;
    this._socket = null;
  }
  if (error) throw error;
}

module.exports = WebSocketServer;
