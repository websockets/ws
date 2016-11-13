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

  // close the http server if it was internally created
  try {
    if (this._closeServer !== undefined) {
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
 * See if a given request should be handled by this server instance.
 *
 * @param {http.IncomingMessage} req Request object to inspect
 * @return {Boolean} `true` if the request is valid, else `false`
 * @public
 */
WebSocketServer.prototype.shouldHandle = function (req) {
  if (this.options.path && url.parse(req.url).pathname !== this.options.path) {
    return false;
  }

  return true;
};

/**
 * Handle a HTTP Upgrade request.
 *
 * @param {http.IncomingMessage} req The request object
 * @param {net.Socket} socket The network socket between the server and client
 * @param {Buffer} head The first packet of the upgraded stream
 * @param {Function} cb Callback
 * @public
 */
WebSocketServer.prototype.handleUpgrade = function (req, socket, head, cb) {
  if (
    !this.shouldHandle(req) ||
    !req.headers.upgrade ||
    req.headers.upgrade.toLowerCase() !== 'websocket' ||
    !req.headers['sec-websocket-key']
  ) {
    return abortConnection(socket, 400);
  }

  socket.on('error', socketError);
  upgrade.apply(this, arguments);
};

module.exports = WebSocketServer;

/**
 * Handle premature socket errors.
 *
 * @private
 */
function socketError () {
  this.destroy();
}

/**
 * Upgrade the connection to WebSocket.
 *
 * @param {http.IncomingMessage} req The request object
 * @param {net.Socket} socket The network socket between the server and client
 * @param {Buffer} head The first packet of the upgraded stream
 * @param {Function} cb Callback
 * @private
 */
function upgrade (req, socket, head, cb) {
  const version = +req.headers['sec-websocket-version'];

  if (version !== 8 && version !== 13) return abortConnection(socket, 400);

  var protocol = (req.headers['sec-websocket-protocol'] || '').split(/, */);

  // handler to call when the connection sequence completes
  const completeUpgrade = () => {
    // calc key
    const key = crypto.createHash('sha1')
      .update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`, 'binary')
      .digest('base64');

    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${key}`
    ];

    if (protocol) {
      headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
    }

    const offer = Extensions.parse(req.headers['sec-websocket-extensions']);
    var extensions;

    try {
      extensions = acceptExtensions.call(this, offer);
    } catch (err) {
      return abortConnection(socket, 400);
    }

    if (Object.keys(extensions).length) {
      const serverExtensions = Object.keys(extensions).reduce((obj, key) => {
        obj[key] = [extensions[key].params];
        return obj;
      }, {});

      headers.push(`Sec-WebSocket-Extensions: ${Extensions.format(serverExtensions)}`);
    }

    // allows external modification/inspection of handshake headers
    this.emit('headers', headers);

    if (socket.writable) {
      socket.write(headers.concat('', '').join('\r\n'));
    } else {
      socket.destroy();
      return;
    }

    const client = new WebSocket([req, socket, head], {
      maxPayload: this.options.maxPayload,
      protocolVersion: version,
      extensions,
      protocol
    });

    if (this.clients) {
      this.clients.add(client);
      client.on('close', () => this.clients.delete(client));
    }

    // signal upgrade complete
    socket.removeListener('error', socketError);
    cb(client);
  };

  // optionally call external protocol selection handler
  if (this.options.handleProtocols) {
    protocol = this.options.handleProtocols(protocol);
    if (protocol === false) return abortConnection(socket, 401);
  } else {
    protocol = protocol[0];
  }

  // optionally call external client verification handler
  if (this.options.verifyClient) {
    const info = {
      origin: req.headers[`${version === 8 ? 'sec-websocket-origin' : 'origin'}`],
      secure: !!(req.connection.authorized || req.connection.encrypted),
      req
    };

    if (this.options.verifyClient.length === 2) {
      this.options.verifyClient(info, (verified, code, message) => {
        if (!verified) return abortConnection(socket, code || 401, message);

        completeUpgrade();
      });
      return;
    } else if (!this.options.verifyClient(info)) {
      return abortConnection(socket, 401);
    }
  }

  completeUpgrade();
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

/**
 * Close the connection when preconditions are not fulfilled.
 *
 * @param {net.Socket} socket The socket of the upgrade request
 * @param {Number} code The HTTP response status code
 * @param {String} [message] The HTTP response body
 * @api private
 */
function abortConnection (socket, code, message) {
  if (socket.writable) {
    message = message || http.STATUS_CODES[code];
    socket.write(
      `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r\n` +
      'Connection: close\r\n' +
      'Content-type: text/html\r\n' +
      `Content-Length: ${Buffer.byteLength(message)}\r\n` +
      '\r\n' +
      message
    );
  }
  socket.destroy();
}
