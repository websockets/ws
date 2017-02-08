/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

const PerMessageDeflate = require('./PerMessageDeflate');
const isValidUTF8 = require('./Validation');
const bufferUtil = require('./BufferUtil');
const ErrorCodes = require('./ErrorCodes');

const EMPTY_BUFFER = Buffer.alloc(0);

const GET_INFO = 0;
const GET_PAYLOAD_LENGTH_16 = 1;
const GET_PAYLOAD_LENGTH_64 = 2;
const HAVE_LENGTH = 3;
const GET_MASK = 4;
const GET_DATA = 5;
const HANDLE_DATA = 6;
const INFLATING = 7;

/**
 * HyBi Receiver implementation.
 */
class Receiver {
  /**
   * Creates a Receiver instance.
   *
   * @param {Object} extensions An object containing the negotiated extensions
   * @param {Number} maxPayload The maximum allowed message length
   */
  constructor (extensions, maxPayload) {
    this.extensions = extensions || {};
    this.maxPayload = maxPayload | 0;

    this.bufferedBytes = 0;
    this.buffers = [];

    this.compressed = false;
    this.payloadLength = 0;
    this.fragmented = 0;
    this.masked = false;
    this.fin = false;
    this.mask = null;
    this.opcode = 0;

    this.totalPayloadLength = 0;
    this.messageLength = 0;
    this.fragments = [];

    this.cleanupCallback = null;
    this.hadError = false;
    this.dead = false;

    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.onping = null;
    this.onpong = null;

    this.state = GET_INFO;
  }

  /**
   * Consumes bytes from the available buffered data.
   *
   * @param {Number} bytes The number of bytes to consume
   * @return {Buffer} Consumed bytes
   * @private
   */
  readBuffer (bytes) {
    var offset = 0;
    var dst;
    var l;

    this.bufferedBytes -= bytes;

    if (bytes === this.buffers[0].length) return this.buffers.shift();

    if (bytes < this.buffers[0].length) {
      dst = this.buffers[0].slice(0, bytes);
      this.buffers[0] = this.buffers[0].slice(bytes);
      return dst;
    }

    dst = new Buffer(bytes);

    while (bytes > 0) {
      l = this.buffers[0].length;

      if (bytes >= l) {
        this.buffers[0].copy(dst, offset);
        offset += l;
        this.buffers.shift();
      } else {
        this.buffers[0].copy(dst, offset, 0, bytes);
        this.buffers[0] = this.buffers[0].slice(bytes);
      }

      bytes -= l;
    }

    return dst;
  }

  /**
   * Checks if the number of buffered bytes is bigger or equal than `n` and
   * calls `cleanup` if necessary.
   *
   * @param {Number} n The number of bytes to check against
   * @return {Boolean} `true` if `bufferedBytes >= n`, else `false`
   * @private
   */
  hasBufferedBytes (n) {
    if (this.bufferedBytes >= n) return true;

    if (this.dead) this.cleanup(this.cleanupCallback);
    return false;
  }

  /**
   * Adds new data to the parser.
   *
   * @public
   */
  add (data) {
    if (this.dead) return;

    this.bufferedBytes += data.length;
    this.buffers.push(data);
    this.startLoop();
  }

  /**
   * Starts the parsing loop.
   *
   * @private
   */
  startLoop () {
    while (true) {
      if (this.state === GET_INFO) {
        if (!this.getInfo()) break;
      } else if (this.state === GET_PAYLOAD_LENGTH_16) {
        if (!this.getPayloadLength16()) break;
      } else if (this.state === GET_PAYLOAD_LENGTH_64) {
        if (!this.getPayloadLength64()) break;
      } else if (this.state === HAVE_LENGTH) {
        if (!this.haveLength()) break;
      } else if (this.state === GET_MASK) {
        if (!this.getMask()) break;
      } else if (this.state === GET_DATA) {
        if (!this.getData()) break;
      } else { // `HANDLE_DATA` or `INFLATING`
        break;
      }
    }
  }

  /**
   * Reads the first two bytes of a frame.
   *
   * @return {Boolean} `true` if the operation is successful, else `false`
   * @private
   */
  getInfo () {
    if (!this.hasBufferedBytes(2)) return false;

    const buf = this.readBuffer(2);

    if ((buf[0] & 0x30) !== 0x00) {
      this.error(new Error('RSV2 and RSV3 must be clear'), 1002);
      return false;
    }

    const compressed = (buf[0] & 0x40) === 0x40;

    if (compressed && !this.extensions[PerMessageDeflate.extensionName]) {
      this.error(new Error('RSV1 must be clear'), 1002);
      return false;
    }

    this.fin = (buf[0] & 0x80) === 0x80;
    this.opcode = buf[0] & 0x0f;
    this.payloadLength = buf[1] & 0x7f;

    if (this.opcode === 0x00) {
      if (compressed) {
        this.error(new Error('RSV1 must be clear'), 1002);
        return false;
      }

      if (!this.fragmented) {
        this.error(new Error(`invalid opcode: ${this.opcode}`), 1002);
        return false;
      } else {
        this.opcode = this.fragmented;
      }
    } else if (this.opcode === 0x01 || this.opcode === 0x02) {
      if (this.fragmented) {
        this.error(new Error(`invalid opcode: ${this.opcode}`), 1002);
        return false;
      }

      this.compressed = compressed;
    } else if (this.opcode > 0x07 && this.opcode < 0x0b) {
      if (!this.fin) {
        this.error(new Error('FIN must be set'), 1002);
        return false;
      }

      if (compressed) {
        this.error(new Error('RSV1 must be clear'), 1002);
        return false;
      }

      if (this.payloadLength > 0x7d) {
        this.error(new Error('invalid payload length'), 1002);
        return false;
      }
    } else {
      this.error(new Error(`invalid opcode: ${this.opcode}`), 1002);
      return false;
    }

    if (!this.fin && !this.fragmented) this.fragmented = this.opcode;

    this.masked = (buf[1] & 0x80) === 0x80;

    if (this.payloadLength === 126) this.state = GET_PAYLOAD_LENGTH_16;
    else if (this.payloadLength === 127) this.state = GET_PAYLOAD_LENGTH_64;
    else this.state = HAVE_LENGTH;

    return true;
  }

  /**
   * Gets extended payload length (7+16).
   *
   * @return {Boolean} `true` if payload length has been read, else `false`
   * @private
   */
  getPayloadLength16 () {
    if (!this.hasBufferedBytes(2)) return false;

    this.payloadLength = this.readBuffer(2).readUInt16BE(0, true);
    this.state = HAVE_LENGTH;
    return true;
  }

  /**
   * Gets extended payload length (7+64).
   *
   * @return {Boolean} `true` if payload length has been read, else `false`
   * @private
   */
  getPayloadLength64 () {
    if (!this.hasBufferedBytes(8)) return false;

    const buf = this.readBuffer(8);
    const num = buf.readUInt32BE(0, true);

    //
    // The maximum safe integer in JavaScript is 2^53 - 1. An error is returned
    // if payload length is greater than this number.
    //
    if (num > Math.pow(2, 53 - 32) - 1) {
      this.error(new Error('max payload size exceeded'), 1009);
      return false;
    }

    this.payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4, true);
    this.state = HAVE_LENGTH;
    return true;
  }

  /**
   * Payload length has been read.
   *
   * @return {Boolean} `false` if payload length exceeds `maxPayload`, else `true`
   * @private
   */
  haveLength () {
    if (this.opcode < 0x08 && this.maxPayloadExceeded(this.payloadLength)) {
      return false;
    }

    if (this.masked) this.state = GET_MASK;
    else this.state = GET_DATA;
    return true;
  }

  /**
   * Reads mask bytes.
   *
   * @return {Boolean} `true` if the mask has been read, else `false`
   * @private
   */
  getMask () {
    if (!this.hasBufferedBytes(4)) return false;

    this.mask = this.readBuffer(4);
    this.state = GET_DATA;
    return true;
  }

  /**
   * Reads data bytes.
   *
   * @return {Boolean} `true` if the data bytes have been read, else `false`
   * @private
   */
  getData () {
    var data = EMPTY_BUFFER;

    if (this.payloadLength) {
      if (!this.hasBufferedBytes(this.payloadLength)) return false;

      data = this.readBuffer(this.payloadLength);
      if (this.masked) bufferUtil.unmask(data, this.mask);
    }

    this.state = HANDLE_DATA;

    if (this.opcode > 0x07) {
      this.controlMessage(data);
    } else if (this.compressed) {
      this.state = INFLATING;
      this.decompress(data);
    } else if (this.pushFragment(data)) {
      this.dataMessage();
    }

    return true;
  }

  /**
   * Decompresses data.
   *
   * @param {Buffer} data Compressed data
   * @private
   */
  decompress (data) {
    const extension = this.extensions[PerMessageDeflate.extensionName];

    extension.decompress(data, this.fin, (err, buf) => {
      if (err) {
        this.error(err, err.closeCode === 1009 ? 1009 : 1007);
        return;
      }

      if (this.pushFragment(buf)) this.dataMessage();
      if (this.state === GET_INFO) this.startLoop();
    });
  }

  /**
   * Handles a data message.
   *
   * @private
   */
  dataMessage () {
    if (this.fin) {
      const buf = this.fragments.length > 1
        ? Buffer.concat(this.fragments, this.messageLength)
        : this.fragments.length === 1
          ? this.fragments[0]
          : EMPTY_BUFFER;

      this.totalPayloadLength = 0;
      this.fragments.length = 0;
      this.messageLength = 0;
      this.fragmented = 0;

      if (this.opcode === 2) {
        this.onmessage(buf, { masked: this.masked, binary: true });
      } else {
        if (!isValidUTF8(buf)) {
          this.error(new Error('invalid utf8 sequence'), 1007);
          return;
        }

        this.onmessage(buf.toString(), { masked: this.masked });
      }
    }

    this.state = GET_INFO;
  }

  /**
   * Handles a control message.
   *
   * @param {Buffer} data Data to handle
   * @private
   */
  controlMessage (data) {
    if (this.opcode === 0x08) {
      if (data.length === 0) {
        this.onclose(1000, '', { masked: this.masked });
        this.cleanup(this.cleanupCallback);
      } else if (data.length === 1) {
        this.error(new Error('invalid payload length'), 1002);
      } else {
        const code = data.readUInt16BE(0, true);

        if (!ErrorCodes.isValidErrorCode(code)) {
          this.error(new Error(`invalid status code: ${code}`), 1002);
          return;
        }

        const buf = data.slice(2);

        if (!isValidUTF8(buf)) {
          this.error(new Error('invalid utf8 sequence'), 1007);
          return;
        }

        this.onclose(code, buf.toString(), { masked: this.masked });
        this.cleanup(this.cleanupCallback);
      }

      return;
    }

    const flags = { masked: this.masked, binary: true };

    if (this.opcode === 0x09) this.onping(data, flags);
    else this.onpong(data, flags);

    this.state = GET_INFO;
  }

  /**
   * Handles an error.
   *
   * @param {Error} err The error
   * @param {Number} code Close code
   * @private
   */
  error (err, code) {
    this.onerror(err, code);
    this.hadError = true;
    this.cleanup(this.cleanupCallback);
  }

  /**
   * Checks payload size, disconnects socket when it exceeds `maxPayload`.
   *
   * @param {Number} length Payload length
   * @private
   */
  maxPayloadExceeded (length) {
    if (length === 0 || this.maxPayload < 1) return false;

    const fullLength = this.totalPayloadLength + length;

    if (fullLength <= this.maxPayload) {
      this.totalPayloadLength = fullLength;
      return false;
    }

    this.error(new Error('max payload size exceeded'), 1009);
    return true;
  }

  /**
   * Appends a fragment in the fragments array after checking that the sum of
   * fragment lengths does not exceed `maxPayload`.
   *
   * @param {Buffer} fragment The fragment to add
   * @return {Boolean} `true` if `maxPayload` is not exceeded, else `false`
   * @private
   */
  pushFragment (fragment) {
    if (fragment.length === 0) return true;

    const totalLength = this.messageLength + fragment.length;

    if (this.maxPayload < 1 || totalLength <= this.maxPayload) {
      this.messageLength = totalLength;
      this.fragments.push(fragment);
      return true;
    }

    this.error(new Error('max payload size exceeded'), 1009);
    return false;
  }

  /**
   * Releases resources used by the receiver.
   *
   * @param {Function} cb Callback
   * @public
   */
  cleanup (cb) {
    this.dead = true;

    if (!this.hadError && this.state === INFLATING) {
      this.cleanupCallback = cb;
    } else {
      this.extensions = null;
      this.fragments = null;
      this.buffers = null;
      this.mask = null;

      this.cleanupCallback = null;
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;
      this.onping = null;
      this.onpong = null;

      if (cb) cb();
    }
  }
}

module.exports = Receiver;
