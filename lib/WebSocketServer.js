/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

var util = require('util')
  , events = require('events')
  , http = require('http')
  , crypto = require('crypto')
  , Options = require('options')
  , WebSocket = require('./WebSocket')
  , Extensions = require('./Extensions')
  , PerMessageDeflate = require('./PerMessageDeflate')
  , tls = require('tls')
  , url = require('url');

/**
 * WebSocket Server implementation
 */

function WebSocketServer(options, callback) {
  if (this instanceof WebSocketServer === false) {
    return new WebSocketServer(options, callback);
  }

  events.EventEmitter.call(this);

  options = new Options({
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
    maxPayload: null
  },'_destroy').merge(options);

  if (!options.isDefinedAndNonNull('port') && !options.isDefinedAndNonNull('server') && !options.value.noServer) {
    throw new TypeError('`port` or a `server` must be provided');
  }

  this._closeServer = null;
  this._onceServerListening = null;
  this._onServerError = null;
  this._onServerUpgrade = null;

  if (options.isDefinedAndNonNull('port')) {
    this._server = http.createServer(function (req, res) {
      var body = http.STATUS_CODES[426];
      res.writeHead(426, {
        'Content-Length': body.length,
        'Content-Type': 'text/plain'
      });
      res.end(body);
    });
    this._server.allowHalfOpen = false;
    this._server.listen(options.value.port, options.value.host, callback);
    this._closeServer = doCloseServer.bind(this);
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
  if (this._server) {
    this._onceServerListening = doEmitListening.bind(this);
    this._server.once('listening', this._onceServerListening);
    this._onServerError = doEmitError.bind(this);
    this._server.on('error', this._onServerError);
    this._onServerUpgrade = doServerUpgrade.bind(this);
    this._server.on('upgrade', this._onServerUpgrade);
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

WebSocketServer.prototype.close = function(callback) {
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
      this._server._webSocketPaths = null;
    }
  }

  // close the http server if it was internally created
  try {
    if (typeof this._closeServer === 'function') {
      this._closeServer();
      this._closeServer = null;
    }
  }
  finally {
    if (this._server) {
      this._server.removeListener('listening', this._onceServerListening);
      this._server.removeListener('error', this._onServerError);
      this._server.removeListener('upgrade', this._onServerUpgrade);
    }
    if (this.options) {
      this.options._destroy();
      this.options =null;
    }
    this._onceServerListening = null;
    this._onServerError = null;
    this._onServerUpgrade = null;
    this._server = null;
  }
  if(callback)
    callback(error);
  else if(error)
    throw error;
};

function doCloseServer () {
  if (this._server) this._server.close();
}

function doEmitListening () {
  this.emit('listening');
}

function doEmitError (error) {
  this.emit('error', error);
}

function doServerUpgrade (req, socket, upgradeHead) {
  //copy upgradeHead to avoid retention of large slab buffers used in node core
  var head = new Buffer(upgradeHead.length);
  upgradeHead.copy(head);

  this.handleUpgrade(req, socket, head, doEmitConnectionWithReq.bind(this, req));
}

function doEmitConnectionWithReq (req, client) {
  this.emit('connection'+req.url, client);
  this.emit('connection', client);
}

function onClientVerifiedForHybiUpgrade (protocols, version, upgradeHead, extensionsOffer, errorHandler, cb, req, socket, result, code, name) {
  if (typeof code === 'undefined') code = 401;
  if (typeof name === 'undefined') name = http.STATUS_CODES[code];

  if (!result) abortConnection(socket, code, name);
  else doCompleteHybiUpgrade1.call(this, protocols, version, upgradeHead, extensionsOffer, errorHandler, cb, req, socket);
}

function doCompleteHybiUpgrade1 (protocols, version, upgradeHead, extensionsOffer, errorHandler, cb, req, socket) {
  // choose from the sub-protocols
  if (typeof this.options.handleProtocols == 'function') {
      var protList = (protocols || "").split(/, */), 
        callbackCalledObj = {callbackCalled: false};
      var res = this.options.handleProtocols(protList, protocolHandlerForHybiUpgrade.bind(this, callbackCalledObj, version, upgradeHead, extensionsOffer, errorHandler, cb, req, socket));
      if (!callbackCalledObj.callbackCalled) {
          // the handleProtocols handler never called our callback
          abortConnection(socket, 501, 'Could not process protocols');
      }
      return;
  } else {
      if (typeof protocols !== 'undefined') {
        doCompleteHybiUpgrade2.call(this, version, upgradeHead, extensionsOffer, errorHandler, cb, req, socket, protocols.split(/, */)[0]);
      }
      else {
        doCompleteHybiUpgrade2.call(this, version, upgradeHead, extensionsOffer, errorHandler, cb, req, socket);
      }
  }
}

function protocolHandlerForHybiUpgrade (callbackCalledObj, version, upgradeHead, extensionsOffer, errorHandler, cb, req, socket, result, protocol) {
    callbackCalledObj.callbackCalled = true;
    if (!result) abortConnection(socket, 401, 'Unauthorized');
    else doCompleteHybiUpgrade2.call(this, version, upgradeHead, extensionsOffer, errorHandler, cb, req, socket, protocol);
  }

function doCompleteHybiUpgrade2 (version, upgradeHead, extensionsOffer, errorHandler, cb, req, socket, protocol) {
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
    headers.push('Sec-WebSocket-Protocol: ' + protocol);
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
    Object.keys(extensions).forEach(function(token) {
      serverExtensions[token] = [extensions[token].params]
    });
    headers.push('Sec-WebSocket-Extensions: ' + Extensions.format(serverExtensions));
    serverExtensions = null;
  }

  // allows external modification/inspection of handshake headers
  this.emit('headers', headers);

  socket.setTimeout(0);
  socket.setNoDelay(true);
  try {
    socket.write(headers.concat('', '').join('\r\n'));
  }
  catch (e) {
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
  extensions = null;

  if (this.options.clientTracking) {
    this.clients.push(client);
    client.on('close', onClientClosedFromHybiUpgrade.bind(this, client));
  }

  // signal upgrade complete
  socket.removeListener('error', errorHandler);
  cb(client);
}

function onClientClosedFromHybiUpgrade (client) {
  var index = this.clients.indexOf(client);
  if (index != -1) {
    this.clients.splice(index, 1);
  }
  client = null;
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

function socketDestroyer (socket) {
  var _s = socket;
  return function () {
    try {
      _s.destroy();
      _s = null;
    } catch(e) {
      console.error(e.stack);
      console.error(e);
    }
  };
}

function handleHybiUpgrade(req, socket, upgradeHead, cb) {
  // handle premature socket errors
  var errorHandler = socketDestroyer(socket);
  socket.on('error', errorHandler);

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

  // verify protocol
  var protocols = req.headers['sec-websocket-protocol'];

  // verify client
  var origin = version < 13 ?
    req.headers['sec-websocket-origin'] :
    req.headers['origin'];

  // handle extensions offer
  var extensionsOffer = Extensions.parse(req.headers['sec-websocket-extensions']);

  // optionally call external client verification handler
  if (typeof this.options.verifyClient == 'function') {
    var info = {
      origin: origin,
      secure: typeof req.connection.authorized !== 'undefined' || typeof req.connection.encrypted !== 'undefined',
      req: req
    };
    if (this.options.verifyClient.length == 2) {
      this.options.verifyClient(info, onClientVerifiedForHybiUpgrade.bind(this, protocols, version, upgradeHead, extensionsOffer, errorHandler, cb, req, socket));
      return;
    }
    else if (!this.options.verifyClient(info)) {
      abortConnection(socket, 401, 'Unauthorized');
      return;
    }
  }

  doCompleteHybiUpgrade1.call(this, protocols, version, upgradeHead, extensionsOffer, errorHandler, cb, req, socket);
}

function onClientVerifiedForHixieUpgradeFromOptions (upgradeHead, errorHandler, cb, req, socket, result, code, name) {
  if (typeof code === 'undefined') code = 401;
  if (typeof name === 'undefined') name = http.STATUS_CODES[code];

  if (!result) abortConnection(socket, code, name);
  else onClientVerifiedForHixieUpgrade.call(this, upgradeHead, errorHandler, cb, req, socket);
}

// build the response header and return a Buffer
function buildResponseHeaderForHixieUpgrade (protocol, origin, location) {
  var headers = [
      'HTTP/1.1 101 Switching Protocols'
    , 'Upgrade: WebSocket'
    , 'Connection: Upgrade'
    , 'Sec-WebSocket-Location: ' + location
  ];
  if (typeof protocol != 'undefined') headers.push('Sec-WebSocket-Protocol: ' + protocol);
  if (typeof origin != 'undefined') headers.push('Sec-WebSocket-Origin: ' + origin);

  return new Buffer(headers.concat('', '').join('\r\n'));
}

// setup handshake completion to run after client has been verified
function onClientVerifiedForHixieUpgrade (upgradeHead, errorHandler, cb, req, socket) {
  var wshost;
  if (!req.headers['x-forwarded-host'])
      wshost = req.headers.host;
  else
      wshost = req.headers['x-forwarded-host'];
  var location = ((req.headers['x-forwarded-proto'] === 'https' || socket.encrypted) ? 'wss' : 'ws') + '://' + wshost + req.url
    , protocol = req.headers['sec-websocket-protocol'];

  // send handshake response before receiving the nonce
  var handshakeResponse = function() {

    socket.setTimeout(0);
    socket.setNoDelay(true);

    var headerBuffer = buildResponseHeaderForHixieUpgrade(protocol, req.headers['origin'], location);

    try {
      socket.write(headerBuffer, 'binary', function(err) {
        // remove listener if there was an error
        if (err) socket.removeListener('data', handler);
        return;
      });
    } catch (e) {
      try { socket.destroy(); } catch (e) {}
      return;
    };
  };

  // retrieve nonce
  var nonceLength = 8;
  if (upgradeHead && upgradeHead.length >= nonceLength) {
    var nonce = upgradeHead.slice(0, nonceLength);
    var rest = upgradeHead.length > nonceLength ? upgradeHead.slice(nonceLength) : null;

    handshakeCompleterForHixieUpgrade.call(this, protocol, req, socket, errorHandler, cb, nonce, rest, buildResponseHeaderForHixieUpgrade(protocol, req.headers['origin'], location));
  }
  else {
    // nonce not present in upgradeHead
    var nonce = new Buffer(nonceLength);
    upgradeHead.copy(nonce, 0);
    var handlerobj = {
      nonce: nonce,
      received: upgradeHead.length,
      handler: null
    };
    var handler = handshakeDataHandlerForHixieUpgrade.bind(this, nonceLength, handlerobj);
    handlerobj.handler = handler;

    // handle additional data as we receive it
    socket.on('data', handler);

    // send header response before we have the nonce to fix haproxy buffering
    handshakeResponse();
  }
}

function handshakeDataHandlerForHixieUpgrade (nonceLength, handlerobj, data) {
  var toRead = Math.min(data.length, nonceLength - handlerobj.received), rest;
  if (toRead === 0) return;
  data.copy(handlerobj.nonce, handlerobj.received, 0, toRead);
  handlerobj.received += toRead;
  if (received == nonceLength) {
    socket.removeListener('data', handler);
    if (toRead < data.length)
      rest = data.slice(toRead);
    else
      rest = null;

    // complete the handshake but send empty buffer for headers since they have already been sent
    handshakeCompleterForHixieUpgrade.call(this, protocol, req, socket, errorHandler, cb, handlerobj.nonce, rest, new Buffer(0));
    handlerobj.received = null;
    handlerobj.handler = null;
    handlerobj.nonce = null;
    handlerobj = null;
  }
}

function binaryHandshakeCompleterForHixieUpgrade (protocol, req, socket, errorHandler, rest, cb, err) {
  if (err) return; // do not create client if an error happens
  var client = new WebSocket([req, socket, rest], {
    protocolVersion: 'hixie-76',
    protocol: protocol
  });
  if (this.options.clientTracking) {
    this.clients.push(client);
    client.on('close', onClientClosedFromHixie.bind(this, client));
  }

  // signal upgrade complete
  socket.removeListener('error', errorHandler);
  cb(client);
  protocol = null;
  req = null;
  socket = null;
  errorHandler = null;
  rest = null;
  cb = null;
}

function onClientClosedFromHixie (client) {
  var index = this.clients.indexOf(client);
  if (index != -1) {
    this.clients.splice(index, 1);
  }
}

  // handshake completion code to run once nonce has been successfully retrieved
function handshakeCompleterForHixieUpgrade (protocol, req, socket, errorHandler, cb, nonce, rest, headerBuffer) {
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

  socket.setTimeout(0);
  socket.setNoDelay(true);

  try {
    var hashBuffer = new Buffer(md5.digest('binary'), 'binary');
    var handshakeBuffer = new Buffer(headerBuffer.length + hashBuffer.length);
    headerBuffer.copy(handshakeBuffer, 0);
    hashBuffer.copy(handshakeBuffer, headerBuffer.length);

    // do a single write, which - upon success - causes a new client websocket to be setup
    socket.write(handshakeBuffer, 'binary', binaryHandshakeCompleterForHixieUpgrade.bind(this, protocol, req, socket, errorHandler, rest, cb));
  }
  catch (e) {
    try { socket.destroy(); } catch (e) {}
    return;
  }
}

function handleHixieUpgrade(req, socket, upgradeHead, cb) {
  // handle premature socket errors
  var errorHandler = function() {
    try { socket.destroy(); } catch (e) {}
  }
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

  // verify client
  if (typeof this.options.verifyClient == 'function') {
    var info = {
      origin: req.headers['origin'],
      secure: typeof req.connection.authorized !== 'undefined' || typeof req.connection.encrypted !== 'undefined',
      req: req
    };
    if (this.options.verifyClient.length == 2) {
      this.options.verifyClient(info, onClientVerifiedForHixieUpgradeFromOptions.bind(this, upgradeHead, errorHandler, cb, req, socket));
      return;
    }
    else if (!this.options.verifyClient(info)) {
      abortConnection(socket, 401, 'Unauthorized');
      return;
    }
  }

  // no client verification required
  onClientVerifiedForHixieUpgrade.call(this, upgradeHead, errorHandler, cb, req, socket);
}

function acceptExtensions(offer) {
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

function abortConnection(socket, code, name) {
  try {
    var response = [
      'HTTP/1.1 ' + code + ' ' + name,
      'Content-type: text/html'
    ];
    socket.write(response.concat('', '').join('\r\n'));
  }
  catch (e) { /* ignore errors - we've aborted this connection */ }
  finally {
    // ensure that an early aborted connection is shut down completely
    try { socket.destroy(); } catch (e) {}
  }
}
