/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

var events = require('events')
  , util = require('util')
  , EventEmitter = events.EventEmitter
  , ErrorCodes = require('./ErrorCodes')
  , bufferUtil = new require('./BufferUtil').BufferUtil;

/**
 * Node version 0.4 and 0.6 compatibility
 */
var isNodeV4 = /^v0\.4/.test(process.version);
var writeUInt16BE = !isNodeV4
  ? Buffer.prototype.writeUInt16BE
  : function(value, offset) {
    this[offset] = value >>> 8;
    this[offset + 1] = value % 256;
  };
var writeUInt32BE = !isNodeV4
  ? Buffer.prototype.writeUInt32BE
  : function(value, offset) {
    for (var i = offset + 3; i >= offset; --i) {
      this[i] = value & 0xff;
      value >>>= 8;
    }
  };

/**
 * HyBi Sender implementation
 */

function Sender (socket) {
  this._socket = socket;
  this.firstFragment = true;
}

/**
 * Inherits from EventEmitter.
 */

util.inherits(Sender, events.EventEmitter);

/**
 * Sends a close instruction to the remote party.
 *
 * @api public
 */

Sender.prototype.close = function(code, data, mask) {
  if (typeof code !== 'undefined') {
    if (typeof code !== 'number' ||
      !ErrorCodes.isValidErrorCode(code)) throw new Error('first argument must be a valid error code number');
  }
  code = code || 1000;
  var dataBuffer = new Buffer(2 + (data ? Buffer.byteLength(data) : 0));
  writeUInt16BE.call(dataBuffer, code, 0);
  if (dataBuffer.length > 2) dataBuffer.write(data, 2);
  var buf = this.frameData(0x8, dataBuffer, true, mask);
  try {
    this._socket.write(buf, 'binary');
  }
  catch (e) {
    this.emit('error', e);
  }
}

/**
 * Sends a ping message to the remote party.
 *
 * @api public
 */

Sender.prototype.ping = function(data, options) {
  var mask = options && options.mask;
  var buf = this.frameData(0x9, data || '', true, mask);
  try {
    this._socket.write(buf, 'binary');
  }
  catch (e) {
    this.emit('error', e);
  }
}

/**
 * Sends a pong message to the remote party.
 *
 * @api public
 */

Sender.prototype.pong = function(data, options) {
  var mask = options && options.mask;
  var buf = this.frameData(0xa, data || '', true, mask);
  try {
    this._socket.write(buf, 'binary');
  }
  catch (e) {
    this.emit('error', e);
  }
}

/**
 * Sends text or binary data to the remote party.
 *
 * @api public
 */

Sender.prototype.send = function(data, options, cb) {
  var buf;
  var finalFragment = options && options.fin === false ? false : true;
  var mask = options && options.mask;
  var opcode = options && options.binary ? 2 : 1;
  if (this.firstFragment === false) opcode = 0;
  else this.firstFragment = false;
  buf = this.frameData(opcode, data, finalFragment, mask);
  if (finalFragment) this.firstFragment = true
  try {
    this._socket.write(buf, 'binary', cb);
  }
  catch (e) {
    if (typeof cb == 'function') cb(e);
    else this.emit('error', e);
  }
}

/**
 * Frames a piece of data according to the HyBi WebSocket protocol.
 *
 * @api private
 */

Sender.prototype.frameData = function(opcode, data, finalFragment, maskData) {
  if (!data) return new Buffer([opcode | (finalFragment ? 0x80 : 0), 0]);
  else if (!(data instanceof Buffer)) {
    data = (data && typeof data.buffer !== 'undefined')
      ? getArrayBuffer(data.buffer) : new Buffer(data);
  }
  var dataLength = data.length
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
      writeUInt16BE.call(outputBuffer, dataLength, 2);
      break;
    case 127:
      writeUInt32BE.call(outputBuffer, 0, 2);
      writeUInt32BE.call(outputBuffer, dataLength, 6);
  }
  if (maskData) {
    var mask = this._randomMask || (this._randomMask = getRandomMask());
    mask.copy(outputBuffer, dataOffset - 4);
    bufferUtil.mask(data, mask, outputBuffer, dataOffset);
    secondByte = secondByte | 0x80;
  }
  else data.copy(outputBuffer, dataOffset);    
  outputBuffer[1] = secondByte;
  return outputBuffer;
}

module.exports = Sender;

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
