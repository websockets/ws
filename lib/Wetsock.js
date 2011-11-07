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
        self._state = 'connected';
        socket.setTimeout(0);
        socket.setNoDelay(true);
        socket.on('close', function() {
            self._state = 'disconnected';
            self.emit('disconnected');
        });
        self.emit('connected');
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
    var buf = frame(0x81, data);
    try {
        this._socket.write(buf, 'binary');
    }
    catch (e) {
        this.emit('error', e);
        this.close();
        return;
    }
}

Wetsock.prototype.ping = function(data) {
    if (this._state != 'connected') throw 'not connected';
    var buf = frame(0x89, data || '');
    try {
        this._socket.write(buf, 'binary');
    }
    catch (e) {
        this.emit('error', e);
        this.close();
        return;
    }
}

module.exports = Wetsock;

function frame(opcode, str) {
    var dataBuffer = new Buffer(str)
      , dataLength = dataBuffer.length
      , startOffset = 2
      , secondByte = dataLength;
    if (dataLength > 65536) {
        startOffset = 10;
        secondByte = 127;
    }
    else if (dataLength > 125) {
        startOffset = 4;
        secondByte = 126;
    }
    var outputBuffer = new Buffer(dataLength + startOffset);
    outputBuffer[0] = opcode;
    outputBuffer[1] = secondByte;
    dataBuffer.copy(outputBuffer, startOffset);
    switch (secondByte) {
        case 126:
            outputBuffer[2] = dataLength >>> 8;
            outputBuffer[3] = dataLength % 256;
            break;
        case 127:
            var l = dataLength;
            for (var i = 1; i <= 8; ++i) {
                outputBuffer[startOffset - i] = l & 0xff;
                l >>>= 8;
            }
    }
    return outputBuffer;    
}