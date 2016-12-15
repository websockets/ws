/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

const EventEmitter = require('events');
const crypto = require('crypto');
const Ultron = require('ultron');
const https = require('https');
const http = require('http');
const url = require('url');

const PerMessageDeflate = require('./PerMessageDeflate');
const EventTarget = require('./EventTarget');
const Extensions = require('./Extensions');
const Receiver = require('./Receiver');
const Sender = require('./Sender');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const closeTimeout = 30 * 1000; // Allow 30 seconds to terminate the connection cleanly.
const protocolVersion = 13;

/**
 * Class representing a WebSocket.
 *
 * @extends EventEmitter
 */
class WebSocket extends EventEmitter {
  /**
   * Create a new `WebSocket`.
   *
   * @param {String} address The URL to which to connect
   * @param {(String|String[])} protocols The subprotocols
   * @param {Object} options Connection options
   */
  constructor (address, protocols, options) {
    super();

    if (typeof protocols === 'object' && !Array.isArray(protocols)) {
      options = protocols;
      protocols = null;
    }

    if (typeof protocols === 'string') protocols = [protocols];
    if (!Array.isArray(protocols)) protocols = [];

    this.readyState = WebSocket.CONNECTING;
    this.bytesReceived = 0;
    this.extensions = {};
    this.protocol = '';

    this._finalize = this.finalize.bind(this);
    this._binaryType = 'nodebuffer';
    this._closeReceived = false;
    this._closeTimer = null;
    this._receiver = null;
    this._sender = null;
    this._socket = null;
    this._ultron = null;

    if (Array.isArray(address)) {
      initAsServerClient.call(this, address[0], address[1], address[2], options);
    } else {
      initAsClient.call(this, address, protocols, options);
    }
  }

  get CONNECTING () { return WebSocket.CONNECTING; }
  get CLOSING () { return WebSocket.CLOSING; }
  get CLOSED () { return WebSocket.CLOSED; }
  get OPEN () { return WebSocket.OPEN; }

  /**
   * @type {Number}
   */
  get bufferedAmount () {
    var amount = 0;

    if (this._socket) amount = this._socket.bufferSize || 0;
    return amount;
  }

  /**
   * This deviates from the WHATWG interface since ws doesn't support the required
   * default "blob" type (instead we define a custom "nodebuffer" type).
   *
   * @type {String}
   */
  get binaryType () {
    return this._binaryType;
  }

  set binaryType (type) {
    if (type === 'arraybuffer' || type === 'nodebuffer') {
      this._binaryType = type;
    } else {
      throw new SyntaxError('unsupported binaryType: must be either "nodebuffer" or "arraybuffer"');
    }
  }

  /**
   * Set up the socket and the internal resources.
   *
   * @param {net.Socket} socket The network socket between the server and client
   * @param {Buffer} head The first packet of the upgraded stream
   * @private
   */
  setSocket (socket, head) {
    socket.setTimeout(0);
    socket.setNoDelay();

    this._receiver = new Receiver(this.extensions, this.maxPayload);
    this._sender = new Sender(socket, this.extensions);
    this._ultron = new Ultron(socket);
    this._socket = socket;

    // socket cleanup handlers
    this._ultron.on('close', this._finalize);
    this._ultron.on('error', this._finalize);
    this._ultron.on('end', this._finalize);

    // ensure that the head is added to the receiver
    if (head && head.length > 0) {
      socket.unshift(head);
      head = null;
    }

    // subsequent packets are pushed to the receiver
    this._ultron.on('data', (data) => {
      this.bytesReceived += data.length;
      this._receiver.add(data);
    });

    // receiver event handlers
    this._receiver.ontext = (data, flags) => this.emit('message', data, flags);
    this._receiver.onbinary = (data, flags) => {
      flags.binary = true;
      this.emit('message', data, flags);
    };
    this._receiver.onping = (data, flags) => {
      this.pong(data, { mask: !this._isServer }, true);
      this.emit('ping', data, flags);
    };
    this._receiver.onpong = (data, flags) => this.emit('pong', data, flags);
    this._receiver.onclose = (code, data, flags) => {
      this._closeReceived = true;
      this.close(code, data);
    };
    this._receiver.onerror = (error, errorCode) => {
      // close the connection when the receiver reports a HyBi error code
      this.close(errorCode, '');
      this.emit('error', error);
    };

    // sender event handlers
    this._sender.onerror = (error) => {
      this.close(1002, '');
      this.emit('error', error);
    };

    this.readyState = WebSocket.OPEN;
    this.emit('open');
  }

  /**
   * Clean up and release internal resources and emit the `close` event.
   *
   * @param {(Boolean|Error)} Indicates whether or not an error occurred
   * @private
   */
  finalize (error) {
    if (this.readyState === WebSocket.CLOSED) return;

    this.readyState = WebSocket.CLOSED;

    clearTimeout(this._closeTimer);
    this._closeTimer = null;

    // If the connection was closed abnormally (with an error), or if
    // the close control frame was not received then the close code
    // must default to 1006.
    if (error || !this._closeReceived) {
      this._closeCode = 1006;
    }
    this.emit('close', this._closeCode || 1000, this._closeMessage || '');

    if (this._socket) {
      if (this._ultron) this._ultron.destroy();
      this._socket.on('error', function onerror () {
        try {
          this.destroy();
        } catch (e) {}
      });

      try {
        if (!error) this._socket.end();
        else this._socket.destroy();
      } catch (e) { /* Ignore termination errors */ }

      this._socket = null;
      this._ultron = null;
    }

    if (this._sender) {
      this._sender = this._sender.onerror = null;
    }

    if (this._receiver) {
      this._receiver.cleanup();
      this._receiver = null;
    }

    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.extensions[PerMessageDeflate.extensionName].cleanup();
    }

    this.extensions = null;

    this.removeAllListeners();
    this.on('error', function onerror () {}); // catch all errors after this
  }

  /**
   * Pause the socket stream.
   *
   * @public
   */
  pause () {
    if (this.readyState !== WebSocket.OPEN) throw new Error('not opened');

    this._socket.pause();
  }

  /**
   * Resume the socket stream
   *
   * @public
   */
  resume () {
    if (this.readyState !== WebSocket.OPEN) throw new Error('not opened');

    this._socket.resume();
  }

  /**
   * Start a closing handshake.
   *
   * @param {Number} code Status code explaining why the connection is closing
   * @param {String} data A string explaining why the connection is closing
   * @public
   */
  close (code, data) {
    if (this.readyState === WebSocket.CLOSED) return;

    if (this.readyState === WebSocket.CONNECTING) {
      this.readyState = WebSocket.CLOSED;
      return;
    }

    if (this.readyState === WebSocket.CLOSING) {
      if (this._closeReceived && this._isServer) {
        this.terminate();
      }
      return;
    }

    try {
      this.readyState = WebSocket.CLOSING;
      this._closeCode = code;
      this._closeMessage = data;
      var mask = !this._isServer;
      this._sender.close(code, data, mask, (err) => {
        if (err) this.emit('error', err);

        if (this._closeReceived && this._isServer) {
          this.terminate();
        } else {
          //
          // Ensure that the connection is cleaned up even when the closing
          // handshake fails.
          //
          clearTimeout(this._closeTimer);
          this._closeTimer = setTimeout(this._finalize, closeTimeout, true);
        }
      });
    } catch (e) {
      this.emit('error', e);
    }
  }

  /**
   * Send a ping message.
   *
   * @param {*} data The message to send
   * @param {Object} options Options object
   * @param {Boolean} options.mask Indicates whether or not to mask `data`
   * @param {Boolean} dontFailWhenClosed Indicates whether or not to throw an if the connection isn't open
   * @public
   */
  ping (data, options, dontFailWhenClosed) {
    if (this.readyState !== WebSocket.OPEN) {
      if (dontFailWhenClosed) return;
      throw new Error('not opened');
    }

    options = options || {};
    if (options.mask === undefined) options.mask = !this._isServer;

    this._sender.ping(data, options);
  }

  /**
   * Send a pong message.
   *
   * @param {*} data The message to send
   * @param {Object} options Options object
   * @param {Boolean} options.mask Indicates whether or not to mask `data`
   * @param {Boolean} dontFailWhenClosed Indicates whether or not to throw an if the connection isn't open
   * @public
   */
  pong (data, options, dontFailWhenClosed) {
    if (this.readyState !== WebSocket.OPEN) {
      if (dontFailWhenClosed) return;
      throw new Error('not opened');
    }

    options = options || {};
    if (options.mask === undefined) options.mask = !this._isServer;

    this._sender.pong(data, options);
  }

  /**
   * Send a data message.
   *
   * @param {*} data The message to send
   * @param {Object} options Options object
   * @param {Boolean} options.compress Specifies whether or not to compress `data`
   * @param {Boolean} options.binary Specifies whether `data` is binary or text
   * @param {Boolean} options.fin Specifies whether the fragment is the last one
   * @param {Boolean} options.mask Specifies whether or not to mask `data`
   * @param {Function} cb Callback which is executed when data is written out
   * @public
   */
  send (data, options, cb) {
    if (typeof options === 'function') {
      cb = options;
      options = {};
    }

    if (this.readyState !== WebSocket.OPEN) {
      if (cb) cb(new Error('not opened'));
      else throw new Error('not opened');
      return;
    }

    if (!data) data = '';

    options = options || {};
    if (options.fin !== false) options.fin = true;

    if (options.binary === undefined) {
      options.binary = data instanceof Buffer || data instanceof ArrayBuffer ||
        ArrayBuffer.isView(data);
    }

    if (options.mask === undefined) options.mask = !this._isServer;
    if (options.compress === undefined) options.compress = true;
    if (!this.extensions[PerMessageDeflate.extensionName]) {
      options.compress = false;
    }

    this._sender.send(data, options, cb);
  }

  /**
   * Half-close the socket sending a FIN packet.
   *
   * @public
   */
  terminate () {
    if (this.readyState === WebSocket.CLOSED) return;

    if (this._socket) {
      this.readyState = WebSocket.CLOSING;

      try {
        this._socket.end();
      } catch (e) {
        this.finalize(true);
        return;
      }

      //
      // Add a timeout to ensure that the connection is completely cleaned up
      // within 30 seconds, even if the other peer does not send a FIN packet.
      //
      if (this._closeTimer) clearTimeout(this._closeTimer);
      this._closeTimer = setTimeout(this._finalize, closeTimeout, true);
    } else if (this.readyState === WebSocket.CONNECTING) {
      this.finalize(true);
    }
  }
}

WebSocket.CONNECTING = 0;
WebSocket.OPEN = 1;
WebSocket.CLOSING = 2;
WebSocket.CLOSED = 3;

//
// Add the `onopen`, `onerror`, `onclose`, and `onmessage` attributes.
// See https://html.spec.whatwg.org/multipage/comms.html#the-websocket-interface
//
['open', 'error', 'close', 'message'].forEach((method) => {
  Object.defineProperty(WebSocket.prototype, `on${method}`, {
    /**
     * Return the listener of the event.
     *
     * @return {(Function|undefined)} The event listener or `undefined`
     * @public
     */
    get () {
      const listener = this.listeners(method)[0];
      return listener ? listener._listener ? listener._listener : listener : undefined;
    },
    /**
     * Add a listener for the event.
     *
     * @param {Function} listener The listener to add
     * @public
     */
    set (listener) {
      this.removeAllListeners(method);
      this.addEventListener(method, listener);
    }
  });
});

WebSocket.prototype.addEventListener = EventTarget.addEventListener;
WebSocket.prototype.removeEventListener = EventTarget.removeEventListener;

module.exports = WebSocket;

/**
 * Initialize a WebSocket server client.
 *
 * @param {http.IncomingMessage} req The request object
 * @param {net.Socket} socket The network socket between the server and client
 * @param {Buffer} head The first packet of the upgraded stream
 * @param {Object} options WebSocket attributes
 * @param {Number} options.protocolVersion The WebSocket protocol version
 * @param {Object} options.extensions The negotiated extensions
 * @param {Number} options.maxPayload The maximum allowed message size
 * @param {String} options.protocol The chosen subprotocol
 * @private
 */
function initAsServerClient (req, socket, head, options) {
  this.protocolVersion = options.protocolVersion;
  this.extensions = options.extensions;
  this.maxPayload = options.maxPayload;
  this.protocol = options.protocol;

  this.upgradeReq = req;
  this._isServer = true;

  this.setSocket(socket, head);
}

/**
 * Initialize a WebSocket client.
 *
 * @param {String} address The URL to which to connect
 * @param {String[]} protocols The list of subprotocols
 * @param {Object} options Connection options
 * @param {String} option.protocol Value of the `Sec-WebSocket-Protocol` header
 * @param {(Boolean|Object)} options.perMessageDeflate Enable/disable permessage-deflate
 * @param {String} options.localAddress Local interface to bind for network connections
 * @param {Number} options.protocolVersion Value of the `Sec-WebSocket-Version` header
 * @param {Object} options.headers An object containing request headers
 * @param {String} options.origin Value of the `Origin` or `Sec-WebSocket-Origin` header
 * @param {http.Agent} options.agent Use the specified Agent
 * @param {String} options.host Value of the `Host` header
 * @param {Function} options.checkServerIdentity A function to validate the server hostname
 * @param {Boolean} options.rejectUnauthorized Verify or not the server certificate
 * @param {String} options.passphrase The passphrase for the private key or pfx
 * @param {String} options.ciphers The ciphers to use or exclude
 * @param {(String|String[]|Buffer|Buffer[])} options.cert The certificate key
 * @param {(String|String[]|Buffer|Buffer[])} options.key The private key
 * @param {(String|Buffer)} options.pfx The private key, certificate, and CA certs
 * @param {(String|String[]|Buffer|Buffer[])} options.ca Trusted certificates
 * @private
 */
function initAsClient (address, protocols, options) {
  options = Object.assign({
    protocol: protocols.join(','),
    perMessageDeflate: true,
    localAddress: null,
    protocolVersion,
    headers: null,
    origin: null,
    agent: null,
    host: null,

    //
    // SSL options.
    //
    checkServerIdentity: null,
    rejectUnauthorized: null,
    passphrase: null,
    ciphers: null,
    cert: null,
    key: null,
    pfx: null,
    ca: null
  }, options);

  if (options.protocolVersion !== 8 && options.protocolVersion !== 13) {
    throw new Error('unsupported protocol version');
  }

  this.protocolVersion = options.protocolVersion;
  this._isServer = false;
  this.url = address;

  const serverUrl = url.parse(address);
  const isUnixSocket = serverUrl.protocol === 'ws+unix:';

  if (!serverUrl.host && !isUnixSocket) throw new Error('invalid url');

  const isSecure = serverUrl.protocol === 'wss:' || serverUrl.protocol === 'https:';
  const key = crypto.randomBytes(16).toString('base64');
  const httpObj = isSecure ? https : http;

  //
  // Prepare extensions.
  //
  const extensionsOffer = {};
  var perMessageDeflate;

  if (options.perMessageDeflate) {
    perMessageDeflate = new PerMessageDeflate(
      options.perMessageDeflate !== true ? options.perMessageDeflate : {},
      false
    );
    extensionsOffer[PerMessageDeflate.extensionName] = perMessageDeflate.offer();
  }

  const requestOptions = {
    host: serverUrl.hostname,
    port: serverUrl.port,
    path: '/',
    headers: {
      'Sec-WebSocket-Version': options.protocolVersion,
      'Sec-WebSocket-Key': key,
      'Connection': 'Upgrade',
      'Upgrade': 'websocket'
    }
  };

  if (options.headers) Object.assign(requestOptions.headers, options.headers);
  if (Object.keys(extensionsOffer).length) {
    requestOptions.headers['Sec-WebSocket-Extensions'] = Extensions.format(extensionsOffer);
  }
  if (options.protocol) {
    requestOptions.headers['Sec-WebSocket-Protocol'] = options.protocol;
  }
  if (options.origin) {
    if (options.protocolVersion < 13) {
      requestOptions.headers['Sec-WebSocket-Origin'] = options.origin;
    } else {
      requestOptions.headers.Origin = options.origin;
    }
  }
  if (options.host) requestOptions.headers.Host = options.host;

  if (options.localAddress) requestOptions.localAddress = options.localAddress;
  if (isUnixSocket) requestOptions.socketPath = serverUrl.pathname;
  if (serverUrl.auth) requestOptions.auth = serverUrl.auth;

  //
  // Make sure that path starts with `/`.
  //
  if (serverUrl.path) {
    if (serverUrl.path.charAt(0) !== '/') {
      requestOptions.path = `/${serverUrl.path}`;
    } else {
      requestOptions.path = serverUrl.path;
    }
  }

  var agent = options.agent;

  //
  // A custom agent is required for these options.
  //
  if (
    options.rejectUnauthorized != null ||
    options.checkServerIdentity ||
    options.passphrase ||
    options.ciphers ||
    options.cert ||
    options.key ||
    options.pfx ||
    options.ca
  ) {
    if (options.passphrase) requestOptions.passphrase = options.passphrase;
    if (options.ciphers) requestOptions.ciphers = options.ciphers;
    if (options.cert) requestOptions.cert = options.cert;
    if (options.key) requestOptions.key = options.key;
    if (options.pfx) requestOptions.pfx = options.pfx;
    if (options.ca) requestOptions.ca = options.ca;
    if (options.checkServerIdentity) {
      requestOptions.checkServerIdentity = options.checkServerIdentity;
    }
    if (options.rejectUnauthorized != null) {
      requestOptions.rejectUnauthorized = options.rejectUnauthorized;
    }

    if (!agent) agent = new httpObj.Agent(requestOptions);
  }

  if (agent) requestOptions.agent = agent;

  const req = httpObj.get(requestOptions);

  req.on('error', (error) => {
    this.emit('error', error);
    this.finalize(error);
  });

  req.on('response', (res) => {
    var error;

    if (!this.emit('unexpected-response', req, res)) {
      error = new Error(`unexpected server response (${res.statusCode})`);
      req.abort();
      this.emit('error', error);
    }

    this.finalize(error);
  });

  req.on('upgrade', (res, socket, head) => {
    if (this.readyState === WebSocket.CLOSED) {
      // client closed before server accepted connection
      this.emit('close');
      this.removeAllListeners();
      socket.end();
      return;
    }

    const digest = crypto.createHash('sha1')
      .update(key + GUID, 'binary')
      .digest('base64');

    if (res.headers['sec-websocket-accept'] !== digest) {
      this.emit('error', new Error('invalid server key'));
      this.removeAllListeners();
      socket.end();
      return;
    }

    const serverProt = res.headers['sec-websocket-protocol'];
    const protList = (options.protocol || '').split(/, */);
    var protError;

    if (!options.protocol && serverProt) {
      protError = 'server sent a subprotocol even though none requested';
    } else if (options.protocol && !serverProt) {
      protError = 'server sent no subprotocol even though requested';
    } else if (serverProt && protList.indexOf(serverProt) === -1) {
      protError = 'server responded with an invalid protocol';
    }

    if (protError) {
      this.emit('error', new Error(protError));
      this.removeAllListeners();
      socket.end();
      return;
    }

    if (serverProt) this.protocol = serverProt;

    const serverExtensions = Extensions.parse(res.headers['sec-websocket-extensions']);
    if (perMessageDeflate && serverExtensions[PerMessageDeflate.extensionName]) {
      try {
        perMessageDeflate.accept(serverExtensions[PerMessageDeflate.extensionName]);
      } catch (err) {
        this.emit('error', new Error('invalid extension parameter'));
        this.removeAllListeners();
        socket.end();
        return;
      }
      this.extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
    }

    this.setSocket(socket, head);

    req.removeAllListeners();
    agent = null;
  });
}
