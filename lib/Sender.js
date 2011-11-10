/*!
 * WebSocket
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

Sender.prototype.close = function(data, options) {
    var buf = frameData(0x8, data || '', true, options && options.mask);
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

Sender.prototype.send = function(data, options) {
    var buf;
    if (options && options.binary) buf = frameData(0x2, data, true, options && options.mask);
    else buf = frameData(0x1, data, true, options && options.mask);
    this._socket.write(buf, 'binary');
}

module.exports = Sender;

function frameData(opcode, data, finalFragment, maskData) {
    var dataBuffer = getBufferFromData(data)
      , dataLength = dataBuffer.length
      , dataOffset = maskData ? 6 : 2
      , secondByte = dataLength;
    if (dataLength > 65536) {
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
    if (maskData) {
        var mask = getRandomMask();
        mask.copy(outputBuffer, dataOffset - 4);
        applyMaskToBuffer(dataBuffer, mask);
        secondByte = secondByte | 0x80;
    }
    outputBuffer[1] = secondByte;
    dataBuffer.copy(outputBuffer, dataOffset);
    switch (secondByte) {
        case 126:
            outputBuffer[2] = dataLength >>> 8;
            outputBuffer[3] = dataLength % 256;
            break;
        case 127:
            var l = dataLength;
            var lengthEndOffset = dataOffset - (maskData ? 4 : 0);
            for (var i = 1; i <= 8; ++i) {
                outputBuffer[lengthEndOffset - i] = l & 0xff;
                l >>>= 8;
            }
    }
    return outputBuffer;
}

function applyMaskToBuffer(buf, mask) {
    if (typeof buf == 'string') buf = new Buffer(buf);
    for (var i = 0, l = buf.length; i < l; ++i) buf[i] ^= mask[i % 4];
    return buf;
}

function getBufferFromData(data) {
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
