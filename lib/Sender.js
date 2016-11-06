/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

const ErrorCodes = require('./ErrorCodes');
const bufferUtil = require('./BufferUtil').BufferUtil;
const PerMessageDeflate = require('./PerMessageDeflate');

/**
 * HyBi Sender implementation.
 */
class Sender {
  /**
   * Creates a Sender instance.
   *
   * @param {net.Socket} socket The connection socket
   * @param {Object} extensions An object containing the negotiated extensions
   */
  constructor (socket, extensions) {
    this._socket = socket;
    this.extensions = extensions || {};
    this.firstFragment = true;
    this.compress = false;
    this.messageHandlers = [];
    this.processing = false;
    this.onerror = null;
  }

  /**
   * Sends a close message to the other peer.
   *
   * @param {(Number|undefined)} code The status code component of the body
   * @param {String} data The message component of the body
   * @param {Boolean} mask Specifies whether or not to mask the message
   * @param {Function} cb Callback
   * @public
   */
  close (code, data, mask, cb) {
    if (code !== undefined && (typeof code !== 'number' || !ErrorCodes.isValidErrorCode(code))) {
      throw new Error('first argument must be a valid error code number');
    }
    code = code || 1000;
    var dataBuffer = new Buffer(2 + (data ? Buffer.byteLength(data) : 0));
    dataBuffer.writeUInt16BE(code, 0, true);
    if (dataBuffer.length > 2) dataBuffer.write(data, 2);

    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.enqueue([this.doClose, [dataBuffer, mask, cb]]);
    } else {
      this.doClose(dataBuffer, mask, cb);
    }
  }

  /**
   * Frames and sends a close message.
   *
   * @param {Buffer} data The message to send
   * @param {Boolean} mask Specifies whether or not to mask `data`
   * @param {Function} cb Callback
   * @private
   */
  doClose (data, mask, cb) {
    this.frameAndSend(0x8, data, true, mask);
    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.messageHandlerCallback();
    }
    if (cb) cb();
  }

  /**
   * Sends a ping message to the other peer.
   *
   * @param {*} data The message to send
   * @param {Object} options Options object
   * @param {Boolean} options.mask Specifies whether or not to mask `data`
   * @public
   */
  ping (data, options) {
    if (data) data = toBuffer(data);
    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.enqueue([this.doPing, [data, options]]);
    } else {
      this.doPing(data, options);
    }
  }

  /**
   * Frames and sends a ping message.
   *
   * @param {Buffer} data The message to send
   * @param {Object} options Options object
   * @param {Boolean} options.mask Specifies whether or not to mask `data`
   * @private
   */
  doPing (data, options) {
    this.frameAndSend(0x9, data, true, options.mask);
    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.messageHandlerCallback();
    }
  }

  /**
   * Sends a pong message to the other peer.
   *
   * @param {*} data The message to send
   * @param {Object} options Options object
   * @param {Boolean} options.mask Specifies whether or not to mask `data`
   * @public
   */
  pong (data, options) {
    if (data) data = toBuffer(data);
    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.enqueue([this.doPong, [data, options]]);
    } else {
      this.doPong(data, options);
    }
  }

  /**
   * Frames and sends a pong message.
   *
   * @param {Buffer} data The message to send
   * @param {Object} options Options object
   * @param {Boolean} options.mask Specifies whether or not to mask `data`
   * @private
   */
  doPong (data, options) {
    this.frameAndSend(0xa, data, true, options.mask);
    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.messageHandlerCallback();
    }
  }

  /**
   * Sends a data message to the other peer.
   *
   * @param {*} data The message to send
   * @param {Object} options Options object
   * @param {Boolean} options.binary Specifies whether `data` is binary or text
   * @param {Boolean} options.compress Specifies whether or not to compress `data`
   * @param {Boolean} options.mask Specifies whether or not to mask `data`
   * @param {Boolean} options.fin Specifies whether the fragment is the last one
   * @param {Function} cb Callback
   * @public
   */
  send (data, options, cb) {
    const pmd = this.extensions[PerMessageDeflate.extensionName];
    var opcode = options.binary ? 2 : 1;
    var compress = options.compress;

    if (data) data = toBuffer(data);

    if (this.firstFragment) {
      this.firstFragment = false;
      if (compress && data && pmd) compress = data.length >= pmd.threshold;
      this.compress = compress;
    } else {
      compress = false;
      opcode = 0;
    }

    if (options.fin) this.firstFragment = true;

    if (pmd) {
      const args = [opcode, data, options.fin, options.mask, compress, cb];
      this.enqueue([this.sendCompressed, args]);
    } else {
      this.frameAndSend(opcode, data, options.fin, options.mask, false, cb);
    }
  }

  /**
   * Compresses, frames and sends a data message.
   *
   * @param {Number} opcode The opcode
   * @param {Buffer} data The message to send
   * @param {Boolean} finalFragment Specifies whether or not to set the FIN bit
   * @param {Boolean} mask Specifies whether or not to mask `data`
   * @param {Boolean} compress Specifies whether or not to set the RSV1 bit
   * @param {Function} cb Callback
   * @private
   */
  sendCompressed (opcode, data, finalFragment, mask, compress, cb) {
    if (!this.compress) {
      this.frameAndSend(opcode, data, finalFragment, mask, false, cb);
      this.messageHandlerCallback();
      return;
    }
    this.extensions[PerMessageDeflate.extensionName].compress(data, finalFragment, (err, data) => {
      if (err) {
        if (cb) cb(err);
        else this.onerror(err);
        return;
      }
      this.frameAndSend(opcode, data, finalFragment, mask, compress, cb);
      this.messageHandlerCallback();
    });
  }

  /**
   * Frames and sends a piece of data according to the HyBi WebSocket protocol.
   *
   * @param {Number} opcode The opcode
   * @param {Buffer} data The data to send
   * @param {Boolean} finalFragment Specifies whether or not to set the FIN bit
   * @param {Boolean} maskData Specifies whether or not to mask `data`
   * @param {Boolean} compressed Specifies whether or not to set the RSV1 bit
   * @param {Function} cb Callback
   * @private
   */
  frameAndSend (opcode, data, finalFragment, maskData, compressed, cb) {
    if (!data) {
      var buff = [opcode | (finalFragment ? 0x80 : 0), 0 | (maskData ? 0x80 : 0)]
        .concat(maskData ? [0, 0, 0, 0] : []);
      sendFramedData(this, new Buffer(buff), null, cb);
      return;
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

    var canModifyData = compressed;
    var mergeBuffers = dataLength < 32768 || (maskData && !canModifyData);
    var totalLength = mergeBuffers ? dataLength + dataOffset : dataOffset;
    var outputBuffer = new Buffer(totalLength);
    outputBuffer[0] = finalFragment ? opcode | 0x80 : opcode;
    if (compressed) outputBuffer[0] |= 0x40;

    switch (secondByte) {
      case 126:
        outputBuffer.writeUInt16BE(dataLength, 2, true);
        break;
      case 127:
        outputBuffer.writeUInt32BE(0, 2, true);
        outputBuffer.writeUInt32BE(dataLength, 6, true);
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
    sendFramedData(this, outputBuffer, mergeBuffers ? null : data, cb);
  }

  /**
   * Executes a queued send operation.
   *
   * @private
   */
  flush () {
    if (this.processing) return;

    var handler = this.messageHandlers.shift();
    if (!handler) return;

    this.processing = true;

    handler[0].apply(this, handler[1]);
  }

  /**
   * Signals the completion of a send operation.
   *
   * @private
   */
  messageHandlerCallback () {
    process.nextTick(() => {
      this.processing = false;
      this.flush();
    });
  }

  /**
   * Enqueues a send operation.
   *
   * @private
   */
  enqueue (params) {
    this.messageHandlers.push(params);
    this.flush();
  }
}

module.exports = Sender;

/**
 * Converts `data` into a buffer.
 *
 * @param {*} data Data to convert
 * @return {Buffer} Converted data
 * @private
 */
function toBuffer (data) {
  if (Buffer.isBuffer(data)) return data;

  if (data instanceof ArrayBuffer) return Buffer.from(data);

  if (ArrayBuffer.isView(data)) {
    const buf = Buffer.from(data.buffer);

    if (data.byteLength !== data.buffer.byteLength) {
      return buf.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }

    return buf;
  }

  return Buffer.from(typeof data === 'number' ? data.toString() : data);
}

/**
 * Generates a random mask.
 *
 * @return {Buffer} The mask
 * @private
 */
function getRandomMask () {
  return new Buffer([
    ~~(Math.random() * 255),
    ~~(Math.random() * 255),
    ~~(Math.random() * 255),
    ~~(Math.random() * 255)
  ]);
}

/**
 * Sends a frame.
 *
 * @param {Sender} sender Sender instance
 * @param {Buffer} outputBuffer The data to send
 * @param {Buffer} data Additional data to send if frame is split into two buffers
 * @param {Function} cb Callback
 * @private
 */
function sendFramedData (sender, outputBuffer, data, cb) {
  try {
    if (data) {
      sender._socket.write(outputBuffer);
      sender._socket.write(data, cb);
    } else {
      sender._socket.write(outputBuffer, cb);
    }
  } catch (e) {
    if (cb) cb(e);
    else sender.onerror(e);
  }
}
