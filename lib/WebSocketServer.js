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
  , WebSocket = require('./WebSocket')
  , tls = require('tls')
  , url = require('url');

/**
 * WebSocket implementation
 */

function WebSocketServer(options, callback) {
  options = new Options({
    host: '127.0.0.1',
    port: null,
    server: null,
    verifyClient: null,
    path: null,
    noServer: false,
    disableHixie: false,
    clientTracking: true
  }).merge(options);
  if (!options.value.port && !options.value.server && !options.value.noServer) {
    throw new TypeError('`port` or a `server` must be provided');
  }

  var self = this;

  if (options.value.port) {
    this._server = http.createServer(function (req, res) {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end('Not implemented');
    });
    this._server.listen(options.value.port, options.value.host || '127.0.0.1', callback);
    this._closeServer = function() { self._server.close(); };
  }
  else if (options.value.server) {
    this._server = options.value.server;
    if (options.value.path) {
      // take note of the path, to avoid collisions when multiple websocket servers are
      // listening on the same http server
      if (this._server._webSocketPaths && options.value.server._webSocketPaths[options.value.path]) {
        throw new Error('two instances of WebSocketServer cannot listen on the same http server path');
      }
      if (typeof this._server._webSocketPaths !== 'object') {
        this._server._webSocketPaths = {};
      }
      this._server._webSocketPaths[options.value.path] = 1;
    }
  }

  if (typeof this._server != 'undefined') {
    this._server.on('error', function(error) {
      self.emit('error', error)
    });
    this._server.on('upgrade', function(req, socket, upgradeHead) {
      self.handleUpgrade(req, socket, upgradeHead, function(client) {
        self.emit('connection', client);
      });
    });
  }

  this.options = options.value;
  this.path = options.value.path;
  this.clients = [];
}

/**
 * Inherits from EventEmitter.
 */

util.inherits(WebSocketServer, events.EventEmitter);

/**
 * Immediately shuts down the connection.
 *
 * @api public
 */

WebSocketServer.prototype.close = function(code, data) {
  // terminate all associated clients
  var error = null;
  try {
    for (var i = 0, l = this.clients.length; i < l; ++i) {
      this.clients[i].terminate();
    }
  }
  catch (e) {
    error = e;
  }

  // remove path descriptor, if any
  if (this.path && this._server._webSocketPaths) {
    delete this._server._webSocketPaths[this.path];
    if (Object.keys(this._server._webSocketPaths).length == 0) {
      delete this._server._webSocketPaths;
    }
  }

  // close the http server if it was internally created
  try {
    if (typeof this._closeServer !== 'undefined') {
      this._closeServer();
    }
  }
  finally {
    delete this._server;
  }
  if (error) throw error;
}

/**
 * Handle a HTTP Upgrade request.
 *
 * @api public
 */

WebSocketServer.prototype.handleUpgrade = function(req, socket, upgradeHead, cb) {
  // check for wrong path
  if (this.options.path) {
    var u = url.parse(req.url);
    if (u && u.pathname !== this.options.path) return;
  }

  if (typeof req.headers.upgrade === 'undefined' || req.headers.upgrade.toLowerCase() !== 'websocket') {
    abortConnection(socket, 400, 'Bad Request');
    return;
  }

  if (req.headers['sec-websocket-key1']) handleHixieUpgrade.apply(this, arguments);
  else handleHybiUpgrade.apply(this, arguments);
}

module.exports = WebSocketServer;

/**
 * Entirely private apis,
 * which may or may not be bound to a sepcific WebSocket instance.
 */

function handleHybiUpgrade(req, socket, upgradeHead, cb) {
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

  // verify client
  var origin = version < 13 ?
    req.headers['sec-websocket-origin'] :
    req.headers['origin'];

  var args = [req, socket, upgradeHead, version, cb];
  if (typeof this.options.verifyClient == 'function') {
    var info = {
      origin: origin,
      secure: typeof req.connection.encrypted !== 'undefined',
      req: req
    };
    if (this.options.verifyClient.length == 2) {
      var self = this;
      this.options.verifyClient(info, function(result) {
        if (!result) abortConnection(socket, 401, 'Unauthorized')
        else completeUpgrade.apply(self, args);
      });
      return;
    }
    else if (!this.options.verifyClient(info)) {
      abortConnection(socket, 401, 'Unauthorized');
      return;
    }
  }

  completeUpgrade.apply(this, args);
}

function completeUpgrade(req, socket, upgradeHead, version, cb) {
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
  var client = new WebSocket([req, socket, upgradeHead], {
    protocolVersion: version,
    protocol: protocol
  });

  if (this.options.clientTracking) {
    this.clients.push(client);
    var self = this;
    client.on('close', function() {
      var index = self.clients.indexOf(client);
      if (index != -1) {
        self.clients.splice(index, 1);
      }
    });
  }
  cb(client);
}

function handleHixieUpgrade(req, socket, upgradeHead, cb) {
  if (this.options.disableHixie) {
    abortConnection(socket, 401, 'Hixie support disabled');
    return;
  }

  // verify key presence
  if (!req.headers['sec-websocket-key2']) {
    abortConnection(socket, 400, 'Bad Request');
    return;
  }

  // setup handshake completion to run after client has been verified
    var self = this;
  var onClientVerified = function() {
    var protocol = req.headers['sec-websocket-protocol'];

    // handshake completion code to run once nonce has been successfully retrieved
    var completeHandshake = function(nonce, rest) {
      // calculate key
      var k1 = req.headers['sec-websocket-key1']
        , k2 = req.headers['sec-websocket-key2']
        , md5 = crypto.createHash('md5');
      [k1, k2].forEach(function (k) {
        var n = parseInt(k.replace(/[^\d]/g, ''))
          , spaces = k.replace(/[^ ]/g, '').length;
        if (spaces === 0 || n % spaces !== 0){
          abortConnection(socket, 400, 'Bad Request');
          return;
        }
        n /= spaces;
        md5.update(String.fromCharCode(
        n >> 24 & 0xFF,
        n >> 16 & 0xFF,
        n >> 8  & 0xFF,
        n       & 0xFF));
      });
      md5.update(nonce.toString('binary'));

      var headers = [
          'HTTP/1.1 101 Switching Protocols'
        , 'Upgrade: WebSocket'
        , 'Connection: Upgrade'
        , 'Sec-WebSocket-Location: ' + location
      ];
      if (typeof protocol != 'undefined') headers.push('Sec-WebSocket-Protocol: ' + protocol);
      if (typeof origin != 'undefined') headers.push('Sec-WebSocket-Origin: ' + origin);

      socket.setTimeout(0);
      socket.setNoDelay(true);
      try {
        socket.write(headers.concat('', '').join('\r\n'));
        socket.write(md5.digest('binary'), 'binary');
      }
      catch (e) {
        try { socket.end(); } catch (_) {}
        return;
      }

      var client = new WebSocket([req, socket, rest], {
        protocolVersion: 'hixie-76',
        protocol: protocol
      });
      if (this.options.clientTracking) {
        self.clients.push(client);
        client.on('close', function() {
          var index = self.clients.indexOf(client);
          if (index != -1) {
            self.clients.splice(index, 1);
          }
        });
      }
      cb(client);
    }

    // retrieve nonce
    var nonceLength = 8;
    if (upgradeHead && upgradeHead.length >= nonceLength) {
      var nonce = upgradeHead.slice(0, nonceLength);
      var rest = upgradeHead.length > nonceLength ? upgradeHead.slice(nonceLength) : null;
      completeHandshake.call(self, nonce, rest);
    }
    else {
      // nonce not present in upgradeHead, so we must wait for enough data
      // data to arrive before continuing
      var nonce = new Buffer(nonceLength);
      upgradeHead.copy(nonce, 0);
      var received = upgradeHead.length;
      var rest = null;
      var handler = function (data) {
        var toRead = Math.min(data.length, nonceLength - received);
        if (toRead === 0) return;
        data.copy(nonce, received, 0, toRead);
        received += toRead;
        if (received == nonceLength) {
          socket.removeListener('data', handler);
          if (toRead < data.length) rest = data.slice(toRead);
          completeHandshake.call(self, nonce, rest);
        }
      }
      socket.on('data', handler);
    }
  }

  // verify client
  var location = ((req.headers['x-forwarded-proto'] === 'https' || socket.encrypted) ? 'wss' : 'ws') + '://' + req.headers.host + req.url
    , origin = req.headers['origin'];
  if (typeof this.options.verifyClient == 'function') {
    var info = {
      origin: origin,
      secure: typeof req.connection.encrypted !== 'undefined',
      req: req
    };
    if (this.options.verifyClient.length == 2) {
      var self = this;
      this.options.verifyClient(info, function(result) {
        if (!result) abortConnection(socket, 401, 'Unauthorized')
        else onClientVerified.apply(self);
      });
      return;
    }
    else if (!this.options.verifyClient(info)) {
      abortConnection(socket, 401, 'Unauthorized');
      return;
    }
  }
  onClientVerified();
}

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
