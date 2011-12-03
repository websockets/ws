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
  , fs = require('fs')
  , Sender = require('./Sender')
  , Receiver = require('./Receiver');

/**
 * Constants
 */

var protocolPrefix = "HyBi-";
var protocolVersion = 13;

/**
 * WebSocket implementation
 */

function WebSocket(address, options) {
  var serverUrl = url.parse(address);
  if (!serverUrl.host) throw new Error('invalid url');
  
  options = options || {};
  options.origin = options.origin || null;
  options.protocolVersion = options.protocolVersion || protocolVersion;
  if (options.protocolVersion != 8 && options.protocolVersion != 13) {
    throw new Error('unsupported protocol version');
  }

  var key = new Buffer(options.protocolVersion + '-' + Date.now()).toString('base64');
  var shasum = crypto.createHash('sha1');
  shasum.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
  var expectedServerKey = shasum.digest('base64');

  var requestOptions = {
    port: serverUrl.port || 80,
    host: serverUrl.hostname,
    path: serverUrl.path || '/',
    headers: {
      'Connection': 'Upgrade',
      'Upgrade': 'websocket',
      'Sec-WebSocket-Version': options.protocolVersion,
      'Sec-WebSocket-Key': key
    }
  };
  if (options.origin) {
    if (options.protocolVersion < 13) requestOptions.headers['Sec-WebSocket-Origin'] = options.origin;
    else requestOptions.headers['Origin'] = options.origin;
  }
  var req = http.request(requestOptions);
  req.end();
  this._socket = null;
  this._state = 'connecting';
  var self = this;
  req.on('upgrade', function(res, socket, upgradeHead) {
    if (self._state == 'disconnected') {
      // client disconnected before server accepted connection
      self.emit('close');
      socket.end();
      return;
    }
    var serverKey = res.headers['sec-websocket-accept'];
    if (typeof serverKey == 'undefined' || serverKey !== expectedServerKey) {
      self.emit('error', 'invalid server key');
      socket.end();
      return;
    }
    
    self._socket = socket;
    socket.setTimeout(0);
    socket.setNoDelay(true);
    socket.on('close', function() {
      if (self._state == 'disconnected') return;
      self._state = 'disconnected';
      self.emit('close', self._closeCode || 1000, self._closeMessage || '');
    });

    var receiver = new Receiver();
    socket.on('data', function (data) {
      receiver.add(data);
    });
    receiver.on('text', function (data, flags) {
      flags = flags || {};
      self.emit('message', data, flags);
    });
    receiver.on('binary', function (data, flags) {
      flags = flags || {};
      flags.binary = true;
      self.emit('message', data, flags);
    });
    receiver.on('ping', function(data, flags) {
      flags = flags || {};
      self.pong(data, {mask: true, binary: flags.binary === true});
      self.emit('ping', data, flags);
    });
    receiver.on('close', function(code, data, flags) {
      flags = flags || {};
      self.close(code, data, {mask: true});
    });
    receiver.on('error', function(reason, errorCode) {
      // close the connection when the receiver reports a HyBi error code
      if (typeof errorCode !== 'undefined') {
        self.close(errorCode, '', {mask: true});
      }
      self.emit('error', reason, errorCode);
    });

    self._sender = new Sender(socket);
    self._state = 'connected';
    self.emit('open');

    if (upgradeHead) receiver.add(upgradeHead);
  });
  var realEmit = this.emit;
  this.emit = function(event) {
    if (event == 'error') delete this._queue;
    realEmit.apply(this, arguments);
  }
}

/**
 * Inherits from EventEmitter.
 */

util.inherits(WebSocket, events.EventEmitter);

/**
 * Gracefully closes the connection, after sending a description message to the server 
 *
 * @param {Object} data to be sent to the server
 * @param {Object} Members - mask: boolean, binary: boolean
 * @api public
 */

WebSocket.prototype.close = function(code, data, options) {
  if (this._state != 'connected') throw new Error('not connected');
  try {
    this._state = 'closing';
    this._closeCode = code;
    this._closeMessage = data;
    this._sender.close(code, data, options);
    this.terminate();  
  }
  catch (e) {
    this.emit('error', e);
  }
}

/**
 * Sends a ping 
 *
 * @param {Object} data to be sent to the server
 * @param {Object} Members - mask: boolean, binary: boolean
 * @api public
 */

WebSocket.prototype.ping = function(data, options) {
  if (this._state != 'connected') throw new Error('not connected');
  try {
    this._sender.ping(data, options);
  }
  catch (e) {
    this.emit('error', e);
  }
}

/**
 * Sends a pong 
 *
 * @param {Object} data to be sent to the server
 * @param {Object} Members - mask: boolean, binary: boolean
 * @api public
 */

WebSocket.prototype.pong = function(data, options) {
  if (this._state != 'connected') throw new Error('not connected');
  try {
    this._sender.pong(data, options);
  }
  catch (e) {
    this.emit('error', e);
  }
}

/**
 * Sends a piece of data 
 *
 * @param {Object} data to be sent to the server
 * @param {Object} Members - mask: boolean, binary: boolean
 * @param {function} Optional callback which is executed after the send completes
 * @api public
 */

WebSocket.prototype.send = function(data, options, cb) {
  if (this._state != 'connected') throw new Error('not connected');
  if (!data) data = '';
  if (this._queue) {
    this._queue.push(this.send.bind(this, data, options, cb));
    return;
  }
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }
  options = options || {};
  options.fin = true;
  if (data instanceof fs.ReadStream) {
    startQueue(this);
    var self = this;
    sendStream(this, data, options, function(error) {
      if (typeof cb === 'function') {
        cb(error);
        return;
      }
      executeQueueSends(self);
    });
  }
  else {
    try {
      this._sender.send(data, options, cb);
    }
    catch (e) {
      this.emit('error', e);
    }    
  }
}

/**
 * Streams data through calls to a user supplied function 
 *
 * @param {Object} Members - mask: boolean, binary: boolean
 * @param {function} 'function (error, send)' which is executed on successive ticks,
 *           of which send is 'function (data, final)'.
 * @api public
 */

WebSocket.prototype.stream = function(options, cb) {
  if (this._state != 'connected') throw new Error('not connected');
  if (this._queue) {
    this._queue.push(this.stream.bind(this, options, cb));
    return;
  }
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }
  if (typeof cb != 'function') throw new Error('callback must be provided');
  startQueue(this);
  var self = this;
  var send = function(data, final) {
    try {
      if (self._state != 'connected') throw new Error('not connected');
      options.fin = final === true;
      self._sender.send(data, options);
      if (!final) process.nextTick(cb.bind(null, null, send));
      else executeQueueSends(self);
    }
    catch (e) {
      if (typeof cb == 'function') cb(e);
      else self.emit('error', e);
    }
  }
  process.nextTick(cb.bind(null, null, send));
}

/**
 * Immediately shuts down the connection
 * 
 * @api public
 */

WebSocket.prototype.terminate = function() {
  if (this._socket) {
    this._socket.end();
    this._socket = null;
  }
  else if (this._state == 'connecting') {
    this._state = 'disconnected';
  }
}

module.exports = WebSocket;

/**
 * Entirely private apis, 
 * which may or may not be bound to a sepcific WebSocket instance.
 */

function startQueue(instance) {
  instance._queue = instance._queue || [];
}

function executeQueueSends(instance) {
  try {
    var queue = instance._queue;
    if (typeof queue == 'undefined') return;
    delete instance._queue;
    queue.forEach(function(method) { method(); });    
  }
  catch (e) {
    instance.emit('error', e);
  }
}

function sendStream(self, stream, options, cb) {
  stream.on('data', function(data) {
    try {
      if (self._state != 'connected') throw new Error('not connected');
      options.fin = false;
      self._sender.send(data, options);
    }
    catch (e) {
      if (typeof cb == 'function') cb(e); 
      else self.emit('error', e);
    }
  });
  stream.on('end', function() {
    try {
      options.fin = true;
      self._sender.send(null, options);
      if (typeof cb === 'function') cb(null);
    }
    catch (e) {
      if (typeof cb == 'function') cb(e); 
      else self.emit('error', e);
    }      
  });
}