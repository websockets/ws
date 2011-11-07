var util = require('util');
var events = require('events');
var http = require('http');
var crypto = require('crypto');

function Wetsock(server, port, options) {
    var serverPort = 80;
    if (typeof port === 'number') serverPort = port;
    else if (typeof port === 'object') options = port;
    options = options || {};
    options.origin = options.origin || null;
    
    var key = 'dGhlIHNhbXBsZSBub25jZQ==';
    var shasum = crypto.createHash('sha1');  
    shasum.update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");  
    var expectedServerKey = shasum.digest('base64');
    
    var requestOptions = {
        port: serverPort, 
        host: server,
        headers: {
            'Connection': 'Upgrade', 
            'Upgrade': 'websocket',
            'Sec-WebSocket-Version': 13,
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
        self._state = 'connected';
        self.emit('connect');
    });
}
util.inherits(Wetsock, events.EventEmitter);

Wetsock.prototype.close = function() {
    if (this._socket) {
        this._socket.end();
        this._socket = null;
    }
    else if (this._state == 'connecting') {
        this._state = 'disconnected';
    }
}

Wetsock.prototype.send = function(data, options) {
    if (this._state != 'connected') throw 'not connected';
    
}

module.exports = Wetsock;