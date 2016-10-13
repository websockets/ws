/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

const EventEmitter = require('events');
const ErrorCodes = require('./ErrorCodes');
const bufferUtil = require('./BufferUtil').BufferUtil;
const PerMessageDeflate = require('./PerMessageDeflate');

/**
 * HyBi Sender implementation, Inherits from EventEmitter.
 */
class Sender extends EventEmitter {
  constructor (socket, extensions) {
    super();

    this._socket = socket;
    this.extensions = extensions || {};
    this.firstFragment = true;
    this.compress = false;
    this.messageHandlers = [];
    this.processing = false;
  }

  /**
   * Sends a close instruction to the remote party.
   *
   * @api public
   */
  close (code, data, mask, cb) {
    if (typeof code !== 'undefined') {
      if (typeof code !== 'number' ||
        !ErrorCodes.isValidErrorCode(code)) throw new Error('first argument must be a valid error code number');
    }
    code = code || 1000;
    var dataBuffer = new Buffer(2 + (data ? Buffer.byteLength(data) : 0));
    dataBuffer.writeUInt16BE(code, 0);
    if (dataBuffer.length > 2) dataBuffer.write(data, 2);

    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.enqueue([this.doClose, [dataBuffer, mask, cb]]);
    } else {
      this.doClose(dataBuffer, mask, cb);
    }
  }

  doClose (data, mask, cb) {
    this.frameAndSend(0x8, data, true, mask);
    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.messageHandlerCallback();
    }
    if (cb) cb();
  }

  /**
   * Sends a ping message to the remote party.
   *
   * @api public
   */
  ping (data, options) {
    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.enqueue([this.doPing, [data, options]]);
    } else {
      this.doPing(data, options);
    }
  }

  doPing (data, options) {
    var mask = options && options.mask;
    this.frameAndSend(0x9, data || '', true, mask);
    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.messageHandlerCallback();
    }
  }

  /**
   * Sends a pong message to the remote party.
   *
   * @api public
   */
  pong (data, options) {
    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.enqueue([this.doPong, [data, options]]);
    } else {
      this.doPong(data, options);
    }
  }

  doPong (data, options) {
    var mask = options && options.mask;
    this.frameAndSend(0xa, data || '', true, mask);
    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.messageHandlerCallback();
    }
  }

  /**
   * Sends text or binary data to the remote party.
   *
   * @api public
   */
  send (data, options, cb) {
    var finalFragment = !options || options.fin !== false;
    var mask = options && options.mask;
    var compress = options && options.compress;
    var opcode = options && options.binary ? 2 : 1;
    if (this.firstFragment === false) {
      opcode = 0;
      compress = false;
    } else {
      this.firstFragment = false;
      this.compress = compress;
    }
    if (finalFragment) this.firstFragment = true;

    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.enqueue([this.sendCompressed, [opcode, data, finalFragment, mask, compress, cb]]);
    } else {
      this.frameAndSend(opcode, data, finalFragment, mask, false, cb);
    }
  }

  sendCompressed (opcode, data, finalFragment, mask, compress, cb) {
    this.applyExtensions(data, finalFragment, this.compress, (err, data) => {
      if (err) {
        if (cb) cb(err);
        else this.emit('error', err);
        return;
      }
      this.frameAndSend(opcode, data, finalFragment, mask, compress, cb);
      this.messageHandlerCallback();
    });
  }

  /**
   * Frames and sends a piece of data according to the HyBi WebSocket protocol.
   *
   * @api private
   */
  frameAndSend (opcode, data, finalFragment, maskData, compressed, cb) {
    var canModifyData = false;

    if (!data) {
      var buff = [opcode | (finalFragment ? 0x80 : 0), 0 | (maskData ? 0x80 : 0)]
        .concat(maskData ? [0, 0, 0, 0] : []);
      sendFramedData.call(this, new Buffer(buff), null, cb);
      return;
    }

    if (!Buffer.isBuffer(data)) {
      if ((data.buffer || data) instanceof ArrayBuffer) {
        data = getBufferFromNative(data);
      } else {
        canModifyData = true;
        //
        // If people want to send a number, this would allocate the number in
        // bytes as memory size instead of storing the number as buffer value. So
        // we need to transform it to string in order to prevent possible
        // vulnerabilities / memory attacks.
        //
        if (typeof data === 'number') data = data.toString();

        data = new Buffer(data);
      }
    }

    var dataLength = data.length;
    var dataOffset = maskData ? 6 : 2;
    var secondByte = dataLength;

    if (dataLength >= 65536) {
      dataOffset += 8;
      secondByte = 127;
    } else if (dataLength > 125) {
      dataOffset += 2;
      secondByte = 126;
    }

    var mergeBuffers = dataLength < 32768 || (maskData && !canModifyData);
    var totalLength = mergeBuffers ? dataLength + dataOffset : dataOffset;
    var outputBuffer = new Buffer(totalLength);
    outputBuffer[0] = finalFragment ? opcode | 0x80 : opcode;
    if (compressed) outputBuffer[0] |= 0x40;

    switch (secondByte) {
      case 126:
        outputBuffer.writeUInt16BE(dataLength, 2);
        break;
      case 127:
        outputBuffer.writeUInt32BE(0, 2);
        outputBuffer.writeUInt32BE(dataLength, 6);
    }

    if (maskData) {
      outputBuffer[1] = secondByte | 0x80;
      var mask = getRandomMask();
      outputBuffer[dataOffset - 4] = mask[0];
      outputBuffer[dataOffset - 3] = mask[1];
      outputBuffer[dataOffset - 2] = mask[2];
      outputBuffer[dataOffset - 1] = mask[3];
      if (mergeBuffers) {
        bufferUtil.mask(data, mask, outputBuffer, dataOffset, dataLength);
      } else {
        bufferUtil.mask(data, mask, data, 0, dataLength);
      }
    } else {
      outputBuffer[1] = secondByte;
      if (mergeBuffers) {
        data.copy(outputBuffer, dataOffset);
      }
    }
    sendFramedData.call(this, outputBuffer, mergeBuffers ? null : data, cb);
  }

  /**
   * Execute message handler buffers
   *
   * @api private
   */
  flush () {
    if (this.processing) return;

    var handler = this.messageHandlers.shift();
    if (!handler) return;

    this.processing = true;

    handler[0].apply(this, handler[1]);
  }

  messageHandlerCallback () {
    this.processing = false;
    process.nextTick(() => this.flush());
  }

  enqueue (params) {
    this.messageHandlers.push(params);
    this.flush();
  }

  /**
   * Apply extensions to message
   *
   * @api private
   */
  applyExtensions (data, fin, compress, callback) {
    if (compress && data) {
      if ((data.buffer || data) instanceof ArrayBuffer) {
        data = getBufferFromNative(data);
      }
      this.extensions[PerMessageDeflate.extensionName].compress(data, fin, callback);
    } else {
      callback(null, data);
    }
  }
}

module.exports = Sender;

function getBufferFromNative (data) {
  // data is either an ArrayBuffer or ArrayBufferView.
  return !data.buffer
    ? new Buffer(data)
    : new Buffer(data.buffer).slice(data.byteOffset, data.byteOffset + data.byteLength);
}

function getRandomMask () {
  return new Buffer([
    ~~(Math.random() * 255),
    ~~(Math.random() * 255),
    ~~(Math.random() * 255),
    ~~(Math.random() * 255)
  ]);
}

function sendFramedData (outputBuffer, data, cb) {
  try {
    if (data) {
      this._socket.write(outputBuffer, 'binary');
      this._socket.write(data, 'binary', cb);
    } else {
      this._socket.write(outputBuffer, 'binary', cb);
    }
  } catch (e) {
    if (cb) cb(e);
    else this.emit('error', e);
  }
}
