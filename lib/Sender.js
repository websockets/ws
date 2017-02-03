/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

const crypto = require('crypto');

const PerMessageDeflate = require('./PerMessageDeflate');
const bufferUtil = require('./BufferUtil');
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
    this.perMessageDeflate = (extensions || {})[PerMessageDeflate.extensionName];
    this._socket = socket;

    this.firstFragment = true;
    this.compress = false;

    this.processing = false;
    this.bufferedBytes = 0;
    this.queue = [];

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

    const buf = Buffer.allocUnsafe(2 + (data ? Buffer.byteLength(data) : 0));

    buf.writeUInt16BE(code || 1000, 0, true);
    if (buf.length > 2) buf.write(data, 2);

    if (this.perMessageDeflate) {
      this.enqueue([this.doClose, buf, mask, cb]);
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
    this.frameAndSend(data, {
      readOnly: false,
      opcode: 0x08,
      rsv1: false,
      fin: true,
      mask
    }, cb);

    if (this.perMessageDeflate) this.continue();
  }

  /**
   * Sends a ping message to the other peer.
   *
   * @param {*} data The message to send
   * @param {Boolean} mask Specifies whether or not to mask `data`
   * @public
   */
  ping (data, mask) {
    var readOnly = true;

    if (data && !Buffer.isBuffer(data)) {
      if (data instanceof ArrayBuffer) {
        data = Buffer.from(data);
      } else if (ArrayBuffer.isView(data)) {
        data = viewToBuffer(data);
      } else {
        data = Buffer.from(data);
        readOnly = false;
      }
    }

    if (this.perMessageDeflate) {
      this.enqueue([this.doPing, data, mask, readOnly]);
    } else {
      this.doPing(data, mask, readOnly);
    }
  }

  /**
   * Frames and sends a ping message.
   *
   * @param {*} data The message to send
   * @param {Boolean} mask Specifies whether or not to mask `data`
   * @param {Boolean} readOnly Specifies whether `data` can be modified
   * @private
   */
  doPing (data, mask, readOnly) {
    this.frameAndSend(data, {
      opcode: 0x09,
      rsv1: false,
      fin: true,
      readOnly,
      mask
    });

    if (this.perMessageDeflate) this.continue();
  }

  /**
   * Sends a pong message to the other peer.
   *
   * @param {*} data The message to send
   * @param {Boolean} mask Specifies whether or not to mask `data`
   * @public
   */
  pong (data, mask) {
    var readOnly = true;

    if (data && !Buffer.isBuffer(data)) {
      if (data instanceof ArrayBuffer) {
        data = Buffer.from(data);
      } else if (ArrayBuffer.isView(data)) {
        data = viewToBuffer(data);
      } else {
        data = Buffer.from(data);
        readOnly = false;
      }
    }

    if (this.perMessageDeflate) {
      this.enqueue([this.doPong, data, mask, readOnly]);
    } else {
      this.doPong(data, mask, readOnly);
    }
  }

  /**
   * Frames and sends a pong message.
   *
   * @param {*} data The message to send
   * @param {Boolean} mask Specifies whether or not to mask `data`
   * @param {Boolean} readOnly Specifies whether `data` can be modified
   * @private
   */
  doPong (data, mask, readOnly) {
    this.frameAndSend(data, {
      opcode: 0x0a,
      rsv1: false,
      fin: true,
      readOnly,
      mask
    });

    if (this.perMessageDeflate) this.continue();
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
    var opcode = options.binary ? 2 : 1;
    var rsv1 = options.compress;
    var readOnly = true;

    if (data && !Buffer.isBuffer(data)) {
      if (data instanceof ArrayBuffer) {
        data = Buffer.from(data);
      } else if (ArrayBuffer.isView(data)) {
        data = viewToBuffer(data);
      } else {
        data = Buffer.from(data);
        readOnly = false;
      }
    }

    if (this.firstFragment) {
      this.firstFragment = false;
      if (rsv1 && data && this.perMessageDeflate) {
        rsv1 = data.length >= this.perMessageDeflate.threshold;
      }
      this.compress = rsv1;
    } else {
      rsv1 = false;
      opcode = 0;
    }

    if (options.fin) this.firstFragment = true;

    if (this.perMessageDeflate) {
      this.enqueue([this.dispatch, data, {
        compress: this.compress,
        mask: options.mask,
        fin: options.fin,
        readOnly,
        opcode,
        rsv1
      }, cb]);
    } else {
      this.frameAndSend(data, {
        mask: options.mask,
        fin: options.fin,
        rsv1: false,
        readOnly,
        opcode
      }, cb);
    }
  }

  /**
   * Dispatches a data message.
   *
   * @param {Buffer} data The message to send
   * @param {Object} options Options object
   * @param {Number} options.opcode The opcode
   * @param {Boolean} options.readOnly Specifies whether `data` can be modified
   * @param {Boolean} options.fin Specifies whether or not to set the FIN bit
   * @param {Boolean} options.compress Specifies whether or not to compress `data`
   * @param {Boolean} options.mask Specifies whether or not to mask `data`
   * @param {Boolean} options.rsv1 Specifies whether or not to set the RSV1 bit
   * @param {Function} cb Callback
   * @private
   */
  dispatch (data, options, cb) {
    if (!options.compress) {
      this.frameAndSend(data, options, cb);
      this.continue();
      return;
    }

    this.perMessageDeflate.compress(data, options.fin, (err, buf) => {
      if (err) {
        if (cb) cb(err);
        else this.onerror(err);
        return;
      }

      options.readOnly = false;
      this.frameAndSend(buf, options, cb);
      this.continue();
    });
  }

  /**
   * Frames and sends a piece of data according to the HyBi WebSocket protocol.
   *
   * @param {Buffer} data The data to send
   * @param {Object} options Options object
   * @param {Number} options.opcode The opcode
   * @param {Boolean} options.readOnly Specifies whether `data` can be modified
   * @param {Boolean} options.fin Specifies whether or not to set the FIN bit
   * @param {Boolean} options.mask Specifies whether or not to mask `data`
   * @param {Boolean} options.rsv1 Specifies whether or not to set the RSV1 bit
   * @param {Function} cb Callback
   * @private
   */
  frameAndSend (data, options, cb) {
    if (!data) {
      const bytes = [options.opcode, 0];

      if (options.fin) bytes[0] |= 0x80;
      if (options.mask) {
        bytes[1] |= 0x80;
        bytes.push(0, 0, 0, 0);
      }

      sendFramedData(this, Buffer.from(bytes), null, cb);
      return;
    }

    const mergeBuffers = data.length < 1024 || options.mask && options.readOnly;
    var dataOffset = options.mask ? 6 : 2;
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

    outputBuffer[0] = options.fin ? options.opcode | 0x80 : options.opcode;
    if (options.rsv1) outputBuffer[0] |= 0x40;

    if (payloadLength === 126) {
      outputBuffer.writeUInt16BE(data.length, 2, true);
    } else if (payloadLength === 127) {
      outputBuffer.writeUInt32BE(0, 2, true);
      outputBuffer.writeUInt32BE(data.length, 6, true);
    }

    if (options.mask) {
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

    const params = this.queue.shift();
    if (!params) return;

    if (params[1]) this.bufferedBytes -= params[1].length;
    this.processing = true;

    params[0].apply(this, params.slice(1));
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
    if (params[1]) this.bufferedBytes += params[1].length;
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
  if (data) {
    sender._socket.write(outputBuffer);
    sender._socket.write(data, cb);
  } else {
    sender._socket.write(outputBuffer, cb);
  }
}
