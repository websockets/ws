/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

const crypto = require('crypto');

const PerMessageDeflate = require('./PerMessageDeflate');
const bufferUtil = require('./BufferUtil').BufferUtil;
const ErrorCodes = require('./ErrorCodes');

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
    this.extensions = extensions || {};
    this.firstFragment = true;
    this.processing = false;
    this.compress = false;
    this._socket = socket;
    this.onerror = null;
    this.queue = [];
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

    const buf = Buffer.allocUnsafe(2 + (data ? Buffer.byteLength(data) : 0));

    buf.writeUInt16BE(code || 1000, 0, true);
    if (buf.length > 2) buf.write(data, 2);

    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.enqueue([this.doClose, [buf, mask, cb]]);
    } else {
      this.doClose(buf, mask, cb);
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
    this.frameAndSend(0x08, data, false, true, mask, false, cb);
    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.continue();
    }
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
    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.enqueue([this.doPing, [data, options.mask]]);
    } else {
      this.doPing(data, options.mask);
    }
  }

  /**
   * Frames and sends a ping message.
   *
   * @param {*} data The message to send
   * @param {Boolean} mask Specifies whether or not to mask `data`
   * @private
   */
  doPing (data, mask) {
    this.frameAndSend(0x09, data, true, true, mask, false);
    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.continue();
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
    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.enqueue([this.doPong, [data, options.mask]]);
    } else {
      this.doPong(data, options.mask);
    }
  }

  /**
   * Frames and sends a pong message.
   *
   * @param {*} data The message to send
   * @param {Boolean} mask Specifies whether or not to mask `data`
   * @private
   */
  doPong (data, mask) {
    this.frameAndSend(0x0a, data, true, true, mask, false);
    if (this.extensions[PerMessageDeflate.extensionName]) {
      this.continue();
    }
  }

  /**
   * Sends a data message to the other peer.
   *
   * @param {*} data The message to send
   * @param {Object} options Options object
   * @param {Boolean} options.compress Specifies whether or not to compress `data`
   * @param {Boolean} options.binary Specifies whether `data` is binary or text
   * @param {Boolean} options.fin Specifies whether the fragment is the last one
   * @param {Boolean} options.mask Specifies whether or not to mask `data`
   * @param {Function} cb Callback
   * @public
   */
  send (data, options, cb) {
    const pmd = this.extensions[PerMessageDeflate.extensionName];
    var opcode = options.binary ? 2 : 1;
    var rsv1 = options.compress;
    var readOnly = true;

    if (data && !Buffer.isBuffer(data)) {
      if (data instanceof ArrayBuffer) {
        data = Buffer.from(data);
      } else if (ArrayBuffer.isView(data)) {
        data = viewToBuffer(data);
      } else {
        data = Buffer.from(typeof data === 'number' ? data.toString() : data);
        readOnly = false;
      }
    }

    if (this.firstFragment) {
      this.firstFragment = false;
      if (rsv1 && data && pmd) rsv1 = data.length >= pmd.threshold;
      this.compress = rsv1;
    } else {
      rsv1 = false;
      opcode = 0;
    }

    if (options.fin) this.firstFragment = true;

    if (pmd) {
      const args = [opcode, data, readOnly, options.fin, options.mask, rsv1, cb];
      this.enqueue([this.sendCompressed, args]);
    } else {
      this.frameAndSend(opcode, data, readOnly, options.fin, options.mask, false, cb);
    }
  }

  /**
   * Compresses, frames and sends a data message.
   *
   * @param {Number} opcode The opcode
   * @param {*} data The message to send
   * @param {Boolean} readOnly Specifies whether `data` can be modified
   * @param {Boolean} fin Specifies whether or not to set the FIN bit
   * @param {Boolean} mask Specifies whether or not to mask `data`
   * @param {Boolean} rsv1 Specifies whether or not to set the RSV1 bit
   * @param {Function} cb Callback
   * @private
   */
  sendCompressed (opcode, data, readOnly, fin, mask, rsv1, cb) {
    if (!this.compress) {
      this.frameAndSend(opcode, data, readOnly, fin, mask, false, cb);
      this.continue();
      return;
    }

    this.extensions[PerMessageDeflate.extensionName].compress(data, fin, (err, buf) => {
      if (err) {
        if (cb) cb(err);
        else this.onerror(err);
        return;
      }

      this.frameAndSend(opcode, buf, false, fin, mask, rsv1, cb);
      this.continue();
    });
  }

  /**
   * Frames and sends a piece of data according to the HyBi WebSocket protocol.
   *
   * @param {Number} opcode The opcode
   * @param {*} data The data to send
   * @param {Boolean} readOnly Specifies whether `data` can be modified
   * @param {Boolean} fin Specifies whether or not to set the FIN bit
   * @param {Boolean} maskData Specifies whether or not to mask `data`
   * @param {Boolean} rsv1 Specifies whether or not to set the RSV1 bit
   * @param {Function} cb Callback
   * @private
   */
  frameAndSend (opcode, data, readOnly, fin, maskData, rsv1, cb) {
    if (!data) {
      const bytes = [opcode, 0];

      if (fin) bytes[0] |= 0x80;
      if (maskData) {
        bytes[1] |= 0x80;
        bytes.push(0, 0, 0, 0);
      }

      sendFramedData(this, Buffer.from(bytes), null, cb);
      return;
    }

    if (!Buffer.isBuffer(data)) {
      if (data instanceof ArrayBuffer) {
        data = Buffer.from(data);
      } else if (ArrayBuffer.isView(data)) {
        data = viewToBuffer(data);
      } else {
        data = Buffer.from(typeof data === 'number' ? data.toString() : data);
        readOnly = false;
      }
    }

    const mergeBuffers = data.length < 1024 || maskData && readOnly;
    var dataOffset = maskData ? 6 : 2;
    var payloadLength = data.length;

    if (data.length >= 65536) {
      dataOffset += 8;
      payloadLength = 127;
    } else if (data.length > 125) {
      dataOffset += 2;
      payloadLength = 126;
    }

    const outputBuffer = Buffer.allocUnsafe(
      mergeBuffers ? data.length + dataOffset : dataOffset
    );

    outputBuffer[0] = fin ? opcode | 0x80 : opcode;
    if (rsv1) outputBuffer[0] |= 0x40;

    if (payloadLength === 126) {
      outputBuffer.writeUInt16BE(data.length, 2, true);
    } else if (payloadLength === 127) {
      outputBuffer.writeUInt32BE(0, 2, true);
      outputBuffer.writeUInt32BE(data.length, 6, true);
    }

    if (maskData) {
      const mask = getRandomMask();

      outputBuffer[1] = payloadLength | 0x80;
      outputBuffer[dataOffset - 4] = mask[0];
      outputBuffer[dataOffset - 3] = mask[1];
      outputBuffer[dataOffset - 2] = mask[2];
      outputBuffer[dataOffset - 1] = mask[3];

      if (mergeBuffers) {
        bufferUtil.mask(data, mask, outputBuffer, dataOffset, data.length);
      } else {
        bufferUtil.mask(data, mask, data, 0, data.length);
      }
    } else {
      outputBuffer[1] = payloadLength;
      if (mergeBuffers) data.copy(outputBuffer, dataOffset);
    }

    sendFramedData(this, outputBuffer, mergeBuffers ? null : data, cb);
  }

  /**
   * Executes a queued send operation.
   *
   * @private
   */
  dequeue () {
    if (this.processing) return;

    const handler = this.queue.shift();
    if (!handler) return;

    this.processing = true;

    handler[0].apply(this, handler[1]);
  }

  /**
   * Signals the completion of a send operation.
   *
   * @private
   */
  continue () {
    process.nextTick(() => {
      this.processing = false;
      this.dequeue();
    });
  }

  /**
   * Enqueues a send operation.
   *
   * @param {Array} params Send operation parameters.
   * @private
   */
  enqueue (params) {
    this.queue.push(params);
    this.dequeue();
  }
}

module.exports = Sender;

/**
 * Converts an `ArrayBuffer` view into a buffer.
 *
 * @param {(DataView|TypedArray)} view The view to convert
 * @return {Buffer} Converted view
 * @private
 */
function viewToBuffer (view) {
  const buf = Buffer.from(view.buffer);

  if (view.byteLength !== view.buffer.byteLength) {
    return buf.slice(view.byteOffset, view.byteOffset + view.byteLength);
  }

  return buf;
}

/**
 * Generates a random mask.
 *
 * @return {Buffer} The mask
 * @private
 */
function getRandomMask () {
  return crypto.randomBytes(4);
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
