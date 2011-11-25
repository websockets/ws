/*!
 * easy-websocket
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

var events = require('events')
  , util = require('util')
  , EventEmitter = events.EventEmitter;

/**
 * HyBi Sender implementation
 */

function Sender (socket) {
    this._socket = socket;
}

/**
 * Inherits from EventEmitter.
 */

util.inherits(Sender, events.EventEmitter);

Sender.prototype.close = function(code, data, options) {
    code = code || 1000;
    var dataBuffer = new Buffer(2 + Buffer.byteLength(data));
    dataBuffer.writeUInt16BE(code, 0);
    dataBuffer.write(data, 2);
    var buf = frameData(0x8, dataBuffer, true, true); // always masked
    this._socket.write(buf, 'binary');
}

Sender.prototype.ping = function(data, options) {
    var buf = frameData(0x9, data || '', true, options && options.mask);
    this._socket.write(buf, 'binary');
}

Sender.prototype.pong = function(data, options) {
    var buf = frameData(0xa, data || '', true, options && options.mask);
    this._socket.write(buf, 'binary');
}

Sender.prototype.send = function(data, options, cb) {
    var buf;
    var finalFragment = options && options.fin === false ? false : true;
    var mask = options && options.mask;
    if (options && options.binary) buf = frameData(0x2, data, finalFragment, mask);
    else buf = frameData(0x1, data, finalFragment, mask);
    this._socket.write(buf, 'binary', cb);
}

module.exports = Sender;

function frameData(opcode, data, finalFragment, maskData) {
    var dataBuffer = getBufferFromData(data)
      , dataLength = dataBuffer.length
      , dataOffset = maskData ? 6 : 2
      , secondByte = dataLength;
    if (dataLength >= 65536) {
        dataOffset += 8;
        secondByte = 127;
    }
    else if (dataLength > 125) {
        dataOffset += 2;
        secondByte = 126;
    }
    var outputBuffer = new Buffer(dataLength + dataOffset);
    if (finalFragment) opcode = opcode | 0x80;
    outputBuffer[0] = opcode;
    switch (secondByte) {
        case 126:
            outputBuffer.writeUInt16BE(dataLength, 2);
            break;
        case 127:
            outputBuffer.writeUInt32BE(0, 2);
            outputBuffer.writeUInt32BE(dataLength, 6);
    }
    if (maskData) {
        var mask = getRandomMask();
        mask.copy(outputBuffer, dataOffset - 4);
        applyMaskToBuffer(dataBuffer, mask);
        secondByte = secondByte | 0x80;
    }
    outputBuffer[1] = secondByte;
    dataBuffer.copy(outputBuffer, dataOffset);
    return outputBuffer;
}

function applyMaskToBuffer(buf, mask) {
    if (typeof buf == 'string') buf = new Buffer(buf);
    for (var i = 0, l = buf.length; i < l; ++i) buf[i] ^= mask[i % 4];
    return buf;
}

function getBufferFromData(data) {
    if (!data) return new Buffer(0);
    if (data instanceof Buffer) return data;
    return (data && typeof data.buffer !== 'undefined')
         ? getArrayBuffer(data.buffer)
         : new Buffer(data);
}

function getArrayBuffer(array) {
    var l = array.byteLength
      , buffer = new Buffer(l);
    for (var i = 0; i < l; ++i) {
        buffer[i] = array[i];
    }
    return buffer;
}

function getRandomMask() {
    return new Buffer([
        ~~(Math.random() * 255),
        ~~(Math.random() * 255),
        ~~(Math.random() * 255),
        ~~(Math.random() * 255)
    ]);
}
