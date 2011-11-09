/*!
 * WebSocket
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

var util = require('util')
  , events = require('events')
  , http = require('http')
  , crypto = require('crypto')
  , url = require('url')
  , Sender = require('Sender')
  , Receiver = require('Receiver');

/**
 * Constants
 */

var protocol = "HyBi-17";
var protocolVersion = 13;

/**
 * WebSocket implementation
 */

function WebSocket(address, options) {
    var serverUrl = url.parse(address);
    if (!serverUrl.host) throw 'invalid url';
    
    options = options || {};
    options.origin = options.origin || null;

    var key = new Buffer(protocol).toString('base64');
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
            'Sec-WebSocket-Version': protocolVersion,
            'Sec-WebSocket-Key': key
        }
    };
    if (options.origin) requestOptions.headers.origin = options.origin;

    var req = http.request(requestOptions);
    req.end();
    this._socket = null;
    this._state = 'connecting';
    var self = this;
    req.on('upgrade', function(res, socket, upgradeHead) {
        if (self._state == 'disconnected') {
            // client disconnected before server accepted connection
            self.emit('disconnected');
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
            self._state = 'disconnected';
            self.emit('disconnected');
        });
        self._receiver = new Receiver();
        self._sender = new Sender(socket);
        self._state = 'connected';
        self.emit('connected');
    });
}

/**
 * Inherits from EventEmitter.
 */

util.inherits(WebSocket, events.EventEmitter);

WebSocket.prototype.close = function(data, options) {
    if (this._state != 'connected') throw 'not connected';
    try {
        this._sender.close(data, options);
        this.terminate();    
    }
    catch (e) {
        this.emit('error', e);
    }
}

WebSocket.prototype.ping = function(data, options) {
    if (this._state != 'connected') throw 'not connected';
    try {
        this._sender.ping(data, options);
    }
    catch (e) {
        this.emit('error', e);
    }
}

WebSocket.prototype.pong = function(data, options) {
    if (this._state != 'connected') throw 'not connected';
    try {
        this._sender.pong(data, options);
    }
    catch (e) {
        this.emit('error', e);
    }
}

WebSocket.prototype.send = function(data, options) {
    if (!data) throw 'cannot send empty data';
    if (this._state != 'connected') throw 'not connected';
    try {
        this._sender.send(data, options);
    }
    catch (e) {
        this.emit('error', e);
    }
}

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

