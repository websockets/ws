/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

const Validation = require('./Validation').Validation;
const ErrorCodes = require('./ErrorCodes');
const bufferUtil = require('./BufferUtil').BufferUtil;
const PerMessageDeflate = require('./PerMessageDeflate');

const noop = () => {};

/**
 * HyBi Receiver implementation.
 */
class Receiver {
  constructor (extensions, maxPayload) {
    this.extensions = extensions || {};
    this.maxPayload = maxPayload | 0;
    this.state = {
      activeFragmentedOperation: null,
      fragmentedOperation: false,
      lastFragment: false,
      masked: false,
      opcode: 0
    };
    this.expectBytes = 0;
    this.expectHandler = null;
    this.currentMessage = [];
    this.currentMessageLength = 0;
    this.currentPayloadLength = 0;
    this.expectData(2, this.processPacket);
    this.dead = false;

    this.onerror = noop;
    this.ontext = noop;
    this.onbinary = noop;
    this.onclose = noop;
    this.onping = noop;
    this.onpong = noop;

    this.buffers = [];
    this.bufferedBytes = 0;
  }

  /**
   * Add new data to the parser.
   *
   * @api public
   */
  add (data) {
    if (this.dead) return;

    this.buffers.push(data);
    this.bufferedBytes += data.length;

    this.process();
  }

  /**
   * Check buffer for data.
   *
   * @api private
   */
  process () {
    if (this.expectBytes && this.expectBytes <= this.bufferedBytes) {
      var bufferForHandler = this.readBuffer(this.expectBytes);
      this.expectBytes = 0;
      this.expectHandler(bufferForHandler);
    }
  }

  /**
   * Consume bytes from the available buffered data.
   *
   * @api private
   */
  readBuffer (bytes) {
    var dst;
    var l;
    var bufoff = 0;

    if (bytes === this.buffers[0].length) {
      this.bufferedBytes -= bytes;
      return this.buffers.shift();
    }

    if (bytes < this.buffers[0].length) {
      dst = this.buffers[0].slice(0, bytes);
      this.buffers[0] = this.buffers[0].slice(bytes);
      this.bufferedBytes -= bytes;
      return dst;
    }

    dst = new Buffer(bytes);

    while (bytes > 0) {
      l = this.buffers[0].length;

      if (bytes > l) {
        this.buffers[0].copy(dst, bufoff);
        bufoff += l;
        this.buffers.shift();
        this.bufferedBytes -= l;
      } else {
        this.buffers[0].copy(dst, bufoff, 0, bytes);
        this.buffers[0] = this.buffers[0].slice(bytes);
        this.bufferedBytes -= bytes;
      }

      bytes -= l;
    }

    return dst;
  }

  /**
   * Releases all resources used by the receiver.
   *
   * @api public
   */
  cleanup () {
    this.dead = true;
    this.expectBytes = 0;
    this.expectHandler = null;
    this.buffers = [];
    this.bufferedBytes = 0;
    this.state = null;
    this.currentMessage = null;
    this.onerror = null;
    this.ontext = null;
    this.onbinary = null;
    this.onclose = null;
    this.onping = null;
    this.onpong = null;
  }

  /**
   * Waits for a certain amount of data bytes to be available, then fires a callback.
   *
   * @api private
   */
  expectData (length, handler) {
    if (length === 0) {
      handler(null);
      return;
    }
    this.expectBytes = length;
    this.expectHandler = handler;

    this.process();
  }

  /**
   * Start processing a new packet.
   *
   * @api private
   */
  processPacket (data) {
    if (this.extensions[PerMessageDeflate.extensionName]) {
      if ((data[0] & 0x30) !== 0) {
        this.error(new Error('reserved fields (2, 3) must be empty'), 1002);
        return;
      }
    } else {
      if ((data[0] & 0x70) !== 0) {
        this.error(new Error('reserved fields must be empty'), 1002);
        return;
      }
    }
    this.state.lastFragment = (data[0] & 0x80) === 0x80;
    this.state.masked = (data[1] & 0x80) === 0x80;
    const compressed = (data[0] & 0x40) === 0x40;
    const opcode = data[0] & 0xf;
    if (opcode === 0) {
      if (compressed) {
        this.error(new Error('continuation frame cannot have the Per-message Compressed bits'), 1002);
        return;
      }
      // continuation frame
      this.state.fragmentedOperation = true;
      this.state.opcode = this.state.activeFragmentedOperation;
      if (!(this.state.opcode === 1 || this.state.opcode === 2)) {
        this.error(new Error('continuation frame cannot follow current opcode'), 1002);
        return;
      }
    } else {
      if (opcode < 3 && this.state.activeFragmentedOperation != null) {
        this.error(new Error('data frames after the initial data frame must have opcode 0'), 1002);
        return;
      }
      if (opcode >= 8 && compressed) {
        this.error(new Error('control frames cannot have the Per-message Compressed bits'), 1002);
        return;
      }
      this.state.compressed = compressed;
      this.state.opcode = opcode;
      if (this.state.lastFragment === false) {
        this.state.fragmentedOperation = true;
        this.state.activeFragmentedOperation = opcode;
      } else {
        this.state.fragmentedOperation = false;
      }
    }
    const handler = opcodes[this.state.opcode];
    if (typeof handler === 'undefined') {
      this.error(new Error(`no handler for opcode ${this.state.opcode}`), 1002);
    } else {
      handler.start(this, data);
    }
  }

  /**
   * Endprocessing a packet.
   *
   * @api private
   */
  endPacket () {
    if (this.dead) return;
    this.expectBytes = 0;
    this.expectHandler = null;
    if (this.state.lastFragment && this.state.opcode === this.state.activeFragmentedOperation) {
      // end current fragmented operation
      this.state.activeFragmentedOperation = null;
    }
    if (this.state.activeFragmentedOperation !== null) {
      this.state.opcode = this.state.activeFragmentedOperation;
    } else {
      this.currentPayloadLength = this.state.opcode = 0;
    }
    this.state.lastFragment = false;
    this.state.masked = false;
    this.expectData(2, this.processPacket);
  }

  /**
   * Reset the parser state.
   *
   * @api private
   */
  reset () {
    if (this.dead) return;
    this.state = {
      activeFragmentedOperation: null,
      lastFragment: false,
      masked: false,
      opcode: 0,
      fragmentedOperation: false
    };
    this.expectBytes = 0;
    this.expectHandler = null;
    this.buffers = [];
    this.bufferedBytes = 0;
    this.currentMessage = [];
    this.currentMessageLength = 0;
    this.currentPayloadLength = 0;
  }

  /**
   * Unmask received data.
   *
   * @api private
   */
  unmask (mask, buf) {
    if (mask != null && buf != null) bufferUtil.unmask(buf, mask);
    return buf;
  }

  /**
   * Handles an error.
   *
   * @api private
   */
  error (err, protocolErrorCode) {
    this.reset();
    this.onerror(err, protocolErrorCode);
    return this;
  }

  /**
   * Checks payload size, disconnects socket when it exceeds `maxPayload`.
   *
   * @api private
   */
  maxPayloadExceeded (length) {
    if (this.maxPayload < 1) return false;

    const fullLength = this.currentPayloadLength + length;
    if (fullLength <= this.maxPayload) {
      this.currentPayloadLength = fullLength;
      return false;
    }
    this.error(new Error(`payload cannot exceed ${this.maxPayload} bytes`), 1009);
    this.cleanup();

    return true;
  }

  /**
   * Handles compressed data.
   *
   * @api private
   */
  handleDataCompressed (packet) {
    const extension = this.extensions[PerMessageDeflate.extensionName];
    extension.decompress(packet, this.state.lastFragment, (err, buffer) => {
      if (this.dead) return;
      if (err) {
        this.error(err, err.closeCode === 1009 ? 1009 : 1007);
        return;
      }

      this.handleData(buffer);
      this.endPacket();
    });
  }

  /**
   * Handles uncompressed data.
   *
   * @api private
   */
  handleData (buffer) {
    if (buffer != null) {
      if (this.maxPayload < 1 || this.currentMessageLength + buffer.length <= this.maxPayload) {
        this.currentMessageLength += buffer.length;
        this.currentMessage.push(buffer);
      } else {
        this.error(new Error(`payload cannot exceed ${this.maxPayload} bytes`), 1009);
        return;
      }
    }
    if (this.state.lastFragment) {
      const messageBuffer = this.currentMessage.length === 1
        ? this.currentMessage[0]
        : Buffer.concat(this.currentMessage, this.currentMessageLength);
      this.currentMessage = [];
      this.currentMessageLength = 0;

      if (this.state.opcode === 2) {
        this.onbinary(messageBuffer, { masked: this.state.masked });
      } else {
        if (!Validation.isValidUTF8(messageBuffer)) {
          this.error(new Error('invalid utf8 sequence'), 1007);
          return;
        }
        this.ontext(messageBuffer.toString(), { masked: this.state.masked });
      }
    }
  }
}

module.exports = Receiver;

//
// Opcode handlers.
//
const opcodes = {
  // text
  '1': {
    start: (receiver, data) => {
      // decode length
      const firstLength = data[1] & 0x7f;
      if (firstLength < 126) {
        if (receiver.maxPayloadExceeded(firstLength)) return;
        opcodes['1'].getData(receiver, firstLength);
      } else if (firstLength === 126) {
        receiver.expectData(2, (data) => {
          const length = data.readUInt16BE(0, true);
          if (receiver.maxPayloadExceeded(length)) return;
          opcodes['1'].getData(receiver, length);
        });
      } else if (firstLength === 127) {
        receiver.expectData(8, (data) => {
          if (data.readUInt32BE(0, true) !== 0) {
            receiver.error(new Error('packets with length spanning more than 32 bit is currently not supported'), 1008);
            return;
          }
          const length = data.readUInt32BE(4, true);
          if (receiver.maxPayloadExceeded(length)) return;
          opcodes['1'].getData(receiver, length);
        });
      }
    },
    getData: (receiver, length) => {
      if (receiver.state.masked) {
        receiver.expectData(4, (mask) => {
          receiver.expectData(length, (data) => opcodes['1'].finish(receiver, mask, data));
        });
      } else {
        receiver.expectData(length, (data) => opcodes['1'].finish(receiver, null, data));
      }
    },
    finish: (receiver, mask, data) => {
      const packet = receiver.unmask(mask, data) || new Buffer(0);
      if (receiver.state.compressed) {
        receiver.handleDataCompressed(packet);
      } else {
        receiver.handleData(packet);
        receiver.endPacket();
      }
    }
  },
  // binary
  '2': {
    start: (receiver, data) => {
      // decode length
      const firstLength = data[1] & 0x7f;
      if (firstLength < 126) {
        if (receiver.maxPayloadExceeded(firstLength)) return;
        opcodes['2'].getData(receiver, firstLength);
      } else if (firstLength === 126) {
        receiver.expectData(2, (data) => {
          const length = data.readUInt16BE(0, true);
          if (receiver.maxPayloadExceeded(length)) return;
          opcodes['2'].getData(receiver, length);
        });
      } else if (firstLength === 127) {
        receiver.expectData(8, (data) => {
          if (data.readUInt32BE(0, true) !== 0) {
            receiver.error(new Error('packets with length spanning more than 32 bit is currently not supported'), 1008);
            return;
          }
          const length = data.readUInt32BE(4, true);
          if (receiver.maxPayloadExceeded(length)) return;
          opcodes['2'].getData(receiver, length);
        });
      }
    },
    getData: (receiver, length) => {
      if (receiver.state.masked) {
        receiver.expectData(4, (mask) => {
          receiver.expectData(length, (data) => opcodes['2'].finish(receiver, mask, data));
        });
      } else {
        receiver.expectData(length, (data) => opcodes['2'].finish(receiver, null, data));
      }
    },
    finish: (receiver, mask, data) => {
      const packet = receiver.unmask(mask, data) || new Buffer(0);
      if (receiver.state.compressed) {
        receiver.handleDataCompressed(packet);
      } else {
        receiver.handleData(packet);
        receiver.endPacket();
      }
    }
  },
  // close
  '8': {
    start: (receiver, data) => {
      if (receiver.state.lastFragment === false) {
        receiver.error('fragmented close is not supported', 1002);
        return;
      }

      // decode length
      const firstLength = data[1] & 0x7f;
      if (firstLength < 126) {
        opcodes['8'].getData(receiver, firstLength);
      } else {
        receiver.error('control frames cannot have more than 125 bytes of data', 1002);
      }
    },
    getData: (receiver, length) => {
      if (receiver.state.masked) {
        receiver.expectData(4, (mask) => {
          receiver.expectData(length, (data) => opcodes['8'].finish(receiver, mask, data));
        });
      } else {
        receiver.expectData(length, (data) => opcodes['8'].finish(receiver, null, data));
      }
    },
    finish: (receiver, mask, data) => {
      const packet = receiver.unmask(mask, data);
      if (packet && packet.length === 1) {
        receiver.error('close packets with data must be at least two bytes long', 1002);
        return;
      }
      const code = packet && packet.length > 1 ? packet.readUInt16BE(0, true) : 1000;
      if (!ErrorCodes.isValidErrorCode(code)) {
        receiver.error('invalid error code', 1002);
        return;
      }
      var message = '';
      if (packet && packet.length > 2) {
        const messageBuffer = packet.slice(2);
        if (!Validation.isValidUTF8(messageBuffer)) {
          receiver.error('invalid utf8 sequence', 1007);
          return;
        }
        message = messageBuffer.toString();
      }
      receiver.onclose(code, message, { masked: receiver.state.masked });
      receiver.reset();
    }
  },
  // ping
  '9': {
    start: (receiver, data) => {
      if (receiver.state.lastFragment === false) {
        receiver.error('fragmented ping is not supported', 1002);
        return;
      }

      // decode length
      const firstLength = data[1] & 0x7f;
      if (firstLength < 126) {
        opcodes['9'].getData(receiver, firstLength);
      } else {
        receiver.error('control frames cannot have more than 125 bytes of data', 1002);
      }
    },
    getData: (receiver, length) => {
      if (receiver.state.masked) {
        receiver.expectData(4, (mask) => {
          receiver.expectData(length, (data) => opcodes['9'].finish(receiver, mask, data));
        });
      } else {
        receiver.expectData(length, (data) => opcodes['9'].finish(receiver, null, data));
      }
    },
    finish: (receiver, mask, data) => {
      const packet = receiver.unmask(mask, data);
      const flags = { masked: receiver.state.masked, binary: true };
      receiver.onping(packet, flags);
      receiver.endPacket();
    }
  },
  // pong
  '10': {
    start: (receiver, data) => {
      if (receiver.state.lastFragment === false) {
        receiver.error('fragmented pong is not supported', 1002);
        return;
      }

      // decode length
      const firstLength = data[1] & 0x7f;
      if (firstLength < 126) {
        opcodes['10'].getData(receiver, firstLength);
      } else {
        receiver.error('control frames cannot have more than 125 bytes of data', 1002);
      }
    },
    getData: (receiver, length) => {
      if (receiver.state.masked) {
        receiver.expectData(4, (mask) => {
          receiver.expectData(length, (data) => opcodes['10'].finish(receiver, mask, data));
        });
      } else {
        receiver.expectData(length, (data) => opcodes['10'].finish(receiver, null, data));
      }
    },
    finish: (receiver, mask, data) => {
      const packet = receiver.unmask(mask, data);
      const flags = { masked: receiver.state.masked, binary: true };
      receiver.onpong(packet, flags);
      receiver.endPacket();
    }
  }
};
