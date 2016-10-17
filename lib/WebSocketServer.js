/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

const util = require('util');
const EventEmitter = require('events');
const http = require('http');
const crypto = require('crypto');
const WebSocket = require('./WebSocket');
const Extensions = require('./Extensions');
const PerMessageDeflate = require('./PerMessageDeflate');
const url = require('url');

var isDefinedAndNonNull = function (options, key) {
  return options[key] !== undefined && options[key] !== null;
};

/**
 * WebSocket Server implementation
 */

function WebSocketServer (options, callback) {
  if (this instanceof WebSocketServer === false) {
    return new WebSocketServer(options, callback);
  }

  EventEmitter.call(this);

  options = Object.assign({
    host: '0.0.0.0',
    port: null,
    server: null,
    verifyClient: null,
    handleProtocols: null,
    path: null,
    noServer: false,
    disableHixie: false,
    clientTracking: true,
    perMessageDeflate: true,
    maxPayload: 100 * 1024 * 1024,
    backlog: null // use default (511 as implemented in net.js)
  }, options);

  if (!isDefinedAndNonNull(options, 'port') && !isDefinedAndNonNull(options, 'server') && !options.noServer) {
    throw new TypeError('`port` or a `server` must be provided');
  }

  if (isDefinedAndNonNull(options, 'port')) {
    this._server = http.createServer((req, res) => {
      var body = http.STATUS_CODES[426];
      res.writeHead(426, {
        'Content-Length': body.length,
        'Content-Type': 'text/plain'
      });
      res.end(body);
    });
    this._server.allowHalfOpen = false;
    // maybe use a generic server.listen(options[, callback]) variant here, instead of two overloaded variants?
    if (isDefinedAndNonNull(options, 'backlog')) {
      this._server.listen(options.port, options.host, options.backlog, callback);
    } else {
      this._server.listen(options.port, options.host, callback);
    }
    this._closeServer = () => this._server && this._server.close();
  } else if (options.server) {
    this._server = options.server;
    if (options.path) {
      // take note of the path, to avoid collisions when multiple websocket servers are
      // listening on the same http server
      if (this._server._webSocketPaths && options.server._webSocketPaths[options.path]) {
        throw new Error('two instances of WebSocketServer cannot listen on the same http server path');
      }
      if (typeof this._server._webSocketPaths !== 'object') {
        this._server._webSocketPaths = {};
      }
      this._server._webSocketPaths[options.path] = 1;
    }
  }

  if (this._server) {
    this._onceServerListening = () => this.emit('listening');
    this._server.once('listening', this._onceServerListening);
    this._onServerError = (error) => this.emit('error', error);
    this._server.on('error', this._onServerError);
    this._onServerUpgrade = (req, socket, upgradeHead) => {
      // copy upgradeHead to avoid retention of large slab buffers used in node core
      var head = new Buffer(upgradeHead.length);
      upgradeHead.copy(head);

      this.handleUpgrade(req, socket, head, (client) => {
        this.emit(`connection${req.url}`, client);
        this.emit('connection', client);
      });
    };
    this._server.on('upgrade', this._onServerUpgrade);
  }

  if (options.clientTracking) this.clients = new Set();
  this.options = options;
  this.path = options.path;
}

/**
 * Inherits from EventEmitter.
 */

util.inherits(WebSocketServer, EventEmitter);

/**
 * Immediately shuts down the connection.
 *
 * @api public
 */

WebSocketServer.prototype.close = function (callback) {
  // terminate all associated clients
  var error = null;

  if (this.clients) {
    for (const client of this.clients) {
      try {
        client.terminate();
      } catch (e) {
        error = e;
      }
    }
  }

  // remove path descriptor, if any
  if (this.path && this._server._webSocketPaths) {
    delete this._server._webSocketPaths[this.path];
    if (Object.keys(this._server._webSocketPaths).length === 0) {
      delete this._server._webSocketPaths;
    }
  }

  // close the http server if it was internally created
  try {
    if (typeof this._closeServer !== 'undefined') {
      this._closeServer();
    }
  } finally {
    if (this._server) {
      this._server.removeListener('listening', this._onceServerListening);
      this._server.removeListener('error', this._onServerError);
      this._server.removeListener('upgrade', this._onServerUpgrade);
    }
    delete this._server;
  }
  if (callback) {
    callback(error);
  } else if (error) {
    throw error;
  }
};

/**
 * Handle a HTTP Upgrade request.
 *
 * @api public
 */

WebSocketServer.prototype.handleUpgrade = function (req, socket, upgradeHead, cb) {
  // check for wrong path
  if (this.options.path) {
    var u = url.parse(req.url);
    if (u && u.pathname !== this.options.path) {
      abortConnection(socket, 400, 'Bad Request');
      return;
    }
  }

  if (typeof req.headers.upgrade === 'undefined' || req.headers.upgrade.toLowerCase() !== 'websocket') {
    abortConnection(socket, 400, 'Bad Request');
    return;
  }

  if (req.headers['sec-websocket-key1']) handleHixieUpgrade.apply(this, arguments);
  else handleHybiUpgrade.apply(this, arguments);
};

module.exports = WebSocketServer;

/**
 * Entirely private apis,
 * which may or may not be bound to a specific WebSocket instance.
 */

function handleHybiUpgrade (req, socket, upgradeHead, cb) {
  // handle premature socket errors
  var errorHandler = () => {
    try { socket.destroy(); } catch (e) {}
  };
  socket.on('error', errorHandler);

  // verify key presence
  if (!req.headers['sec-websocket-key']) {
    abortConnection(socket, 400, 'Bad Request');
    return;
  }

  // verify version
  var version = +req.headers['sec-websocket-version'];
  if (version !== 8 && version !== 13) {
    abortConnection(socket, 400, 'Bad Request');
    return;
  }

  // verify protocol
  var protocols = req.headers['sec-websocket-protocol'];

  // verify client
  var origin = version !== 13
    ? req.headers['sec-websocket-origin']
    : req.headers['origin'];

  // handle extensions offer
  var extensionsOffer = Extensions.parse(req.headers['sec-websocket-extensions']);

  // handler to call when the connection sequence completes
  var completeHybiUpgrade2 = (protocol) => {
    // calc key
    var key = crypto.createHash('sha1')
      .update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`, 'latin1')
      .digest('base64');

    var headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${key}`
    ];

    if (typeof protocol !== 'undefined') {
      headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
    }

    var extensions = {};
    try {
      extensions = acceptExtensions.call(this, extensionsOffer);
    } catch (err) {
      abortConnection(socket, 400, 'Bad Request');
      return;
    }

    if (Object.keys(extensions).length) {
      var serverExtensions = {};
      Object.keys(extensions).forEach((token) => {
        serverExtensions[token] = [extensions[token].params];
      });
      headers.push(`Sec-WebSocket-Extensions: ${Extensions.format(serverExtensions)}`);
    }

    // allows external modification/inspection of handshake headers
    this.emit('headers', headers);

    socket.setTimeout(0);
    socket.setNoDelay(true);
    try {
      socket.write(headers.concat('', '').join('\r\n'));
    } catch (e) {
      // if the upgrade write fails, shut the connection down hard
      try { socket.destroy(); } catch (e) {}
      return;
    }

    var client = new WebSocket([req, socket, upgradeHead], {
      protocolVersion: version,
      protocol: protocol,
      extensions: extensions,
      maxPayload: this.options.maxPayload
    });

    if (this.clients) {
      this.clients.add(client);
      client.on('close', () => this.clients.delete(client));
    }

    // signal upgrade complete
    socket.removeListener('error', errorHandler);
    cb(client);
  };

  // optionally call external protocol selection handler before
  // calling completeHybiUpgrade2
  var completeHybiUpgrade1 = () => {
    // choose from the sub-protocols
    if (typeof this.options.handleProtocols === 'function') {
      var protList = (protocols || '').split(/, */);
      var callbackCalled = false;
      this.options.handleProtocols(protList, (result, protocol) => {
        callbackCalled = true;
        if (!result) abortConnection(socket, 401, 'Unauthorized');
        else completeHybiUpgrade2(protocol);
      });
      if (!callbackCalled) {
        // the handleProtocols handler never called our callback
        abortConnection(socket, 501, 'Could not process protocols');
      }
      return;
    } else {
      if (typeof protocols !== 'undefined') {
        completeHybiUpgrade2(protocols.split(/, */)[0]);
      } else {
        completeHybiUpgrade2();
      }
    }
  };

  // optionally call external client verification handler
  if (typeof this.options.verifyClient === 'function') {
    var info = {
      origin: origin,
      secure: typeof req.connection.authorized !== 'undefined' || typeof req.connection.encrypted !== 'undefined',
      req: req
    };
    if (this.options.verifyClient.length === 2) {
      this.options.verifyClient(info, (result, code, name) => {
        if (typeof code === 'undefined') code = 401;
        if (typeof name === 'undefined') name = http.STATUS_CODES[code];

        if (!result) abortConnection(socket, code, name);
        else completeHybiUpgrade1();
      });
      return;
    } else if (!this.options.verifyClient(info)) {
      abortConnection(socket, 401, 'Unauthorized');
      return;
    }
  }

  completeHybiUpgrade1();
}

function handleHixieUpgrade (req, socket, upgradeHead, cb) {
  // handle premature socket errors
  var errorHandler = () => {
    try { socket.destroy(); } catch (e) {}
  };
  socket.on('error', errorHandler);

  // bail if options prevent hixie
  if (this.options.disableHixie) {
    abortConnection(socket, 401, 'Hixie support disabled');
    return;
  }

  // verify key presence
  if (!req.headers['sec-websocket-key2']) {
    abortConnection(socket, 400, 'Bad Request');
    return;
  }

  var origin = req.headers['origin'];

  // setup handshake completion to run after client has been verified
  var onClientVerified = () => {
    var wshost;
    if (!req.headers['x-forwarded-host']) {
      wshost = req.headers.host;
    } else {
      wshost = req.headers['x-forwarded-host'];
    }

    var proto = (req.headers['x-forwarded-proto'] === 'https' || socket.encrypted) ? 'wss' : 'ws';
    var location = proto + '://' + wshost + req.url;
    var protocol = req.headers['sec-websocket-protocol'];

    // build the response header and return a Buffer
    var buildResponseHeader = () => {
      var headers = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: WebSocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Location: ' + location
      ];
      if (typeof protocol !== 'undefined') headers.push('Sec-WebSocket-Protocol: ' + protocol);
      if (typeof origin !== 'undefined') headers.push('Sec-WebSocket-Origin: ' + origin);

      return new Buffer(headers.concat('', '').join('\r\n'));
    };

    // send handshake response before receiving the nonce
    var handshakeResponse = () => {
      socket.setTimeout(0);
      socket.setNoDelay(true);

      var headerBuffer = buildResponseHeader();

      try {
        socket.write(headerBuffer, 'binary', (err) => {
          // remove listener if there was an error
          if (err) socket.removeListener('data', handler);
          return;
        });
      } catch (e) {
        try { socket.destroy(); } catch (e) {}
        return;
      }
    };

    // handshake completion code to run once nonce has been successfully retrieved
    var completeHandshake = (nonce, rest, headerBuffer) => {
      // calculate key
      var k1 = req.headers['sec-websocket-key1'];
      var k2 = req.headers['sec-websocket-key2'];
      var md5 = crypto.createHash('md5');

      [k1, k2].forEach((k) => {
        var n = parseInt(k.replace(/[^\d]/g, ''));
        var spaces = k.replace(/[^ ]/g, '').length;
        if (spaces === 0 || n % spaces !== 0) {
          abortConnection(socket, 400, 'Bad Request');
          return;
        }
        n /= spaces;
        md5.update(String.fromCharCode(
          n >> 24 & 0xFF,
          n >> 16 & 0xFF,
          n >> 8 & 0xFF,
          n & 0xFF), 'binary');
      });
      md5.update(nonce.toString('binary'), 'binary');

      socket.setTimeout(0);
      socket.setNoDelay(true);

      try {
        var hashBuffer = new Buffer(md5.digest('binary'), 'binary');
        var handshakeBuffer = new Buffer(headerBuffer.length + hashBuffer.length);
        headerBuffer.copy(handshakeBuffer, 0);
        hashBuffer.copy(handshakeBuffer, headerBuffer.length);

        // do a single write, which - upon success - causes a new client websocket to be setup
        socket.write(handshakeBuffer, 'binary', (err) => {
          if (err) return; // do not create client if an error happens
          var client = new WebSocket([req, socket, rest], {
            protocolVersion: 'hixie-76',
            protocol: protocol
          });
          if (this.clients) {
            this.clients.add(client);
            client.on('close', () => this.clients.delete(client));
          }

          // signal upgrade complete
          socket.removeListener('error', errorHandler);
          cb(client);
        });
      } catch (e) {
        try { socket.destroy(); } catch (e) {}
        return;
      }
    };

    // retrieve nonce
    var nonceLength = 8;
    var nonce, rest;
    if (upgradeHead && upgradeHead.length >= nonceLength) {
      nonce = upgradeHead.slice(0, nonceLength);
      rest = upgradeHead.length > nonceLength ? upgradeHead.slice(nonceLength) : null;
      completeHandshake(nonce, rest, buildResponseHeader());
    } else {
      // nonce not present in upgradeHead
      nonce = new Buffer(nonceLength);
      upgradeHead.copy(nonce, 0);
      var received = upgradeHead.length;
      rest = null;
      var handler = (data) => {
        var toRead = Math.min(data.length, nonceLength - received);
        if (toRead === 0) return;
        data.copy(nonce, received, 0, toRead);
        received += toRead;
        if (received === nonceLength) {
          socket.removeListener('data', handler);
          if (toRead < data.length) rest = data.slice(toRead);

          // complete the handshake but send empty buffer for headers since they have already been sent
          completeHandshake(nonce, rest, new Buffer(0));
        }
      };

      // handle additional data as we receive it
      socket.on('data', handler);

      // send header response before we have the nonce to fix haproxy buffering
      handshakeResponse();
    }
  };

  // verify client
  if (typeof this.options.verifyClient === 'function') {
    var info = {
      origin: origin,
      secure: typeof req.connection.authorized !== 'undefined' || typeof req.connection.encrypted !== 'undefined',
      req: req
    };
    if (this.options.verifyClient.length === 2) {
      this.options.verifyClient(info, (result, code, name) => {
        if (typeof code === 'undefined') code = 401;
        if (typeof name === 'undefined') name = http.STATUS_CODES[code];

        if (!result) abortConnection(socket, code, name);
        else onClientVerified();
      });
      return;
    } else if (!this.options.verifyClient(info)) {
      abortConnection(socket, 401, 'Unauthorized');
      return;
    }
  }

  // no client verification required
  onClientVerified();
}

function acceptExtensions (offer) {
  var extensions = {};
  var options = this.options.perMessageDeflate;
  var maxPayload = this.options.maxPayload;
  if (options && offer[PerMessageDeflate.extensionName]) {
    var perMessageDeflate = new PerMessageDeflate(options !== true ? options : {}, true, maxPayload);
    perMessageDeflate.accept(offer[PerMessageDeflate.extensionName]);
    extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
  }
  return extensions;
}

function abortConnection (socket, code, name) {
  try {
    var response = `HTTP/1.1 ${code} ${name}\r\n` +
      `Content-type: text/html\r\n` +
      `\r\n\r\n`;
    socket.write(response);
  } catch (e) {
    // ignore errors - we've aborted this connection
  } finally {
    // ensure that an early aborted connection is shut down completely
    try { socket.destroy(); } catch (e) {}
  }
}
