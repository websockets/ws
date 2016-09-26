/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

const Validation = require('./Validation').Validation;
const ErrorCodes = require('./ErrorCodes');
const BufferPool = require('./BufferPool');
const bufferUtil = require('./BufferUtil').BufferUtil;
const PerMessageDeflate = require('./PerMessageDeflate');

/**
 * HyBi Receiver implementation
 */

class Receiver {
  constructor(extensions, maxPayload) {
    if (typeof extensions === 'number'){
      maxPayload = extensions;
      extensions = {};
    }

    // memory pool for fragmented messages
    var fragmentedPoolPrevUsed = -1;
    this.fragmentedBufferPool = new BufferPool(1024, function(db, length) {
      return db.used + length;
    }, function(db) {
      return fragmentedPoolPrevUsed = fragmentedPoolPrevUsed >= 0 ?
        Math.ceil((fragmentedPoolPrevUsed + db.used) / 2) :
        db.used;
    });

    // memory pool for unfragmented messages
    var unfragmentedPoolPrevUsed = -1;
    this.unfragmentedBufferPool = new BufferPool(1024, function(db, length) {
      return db.used + length;
    }, function(db) {
      return unfragmentedPoolPrevUsed = unfragmentedPoolPrevUsed >= 0 ?
        Math.ceil((unfragmentedPoolPrevUsed + db.used) / 2) :
        db.used;
    });
    this.extensions = extensions || {};
    this.maxPayload = maxPayload || 0;
    this.currentPayloadLength = 0;
    this.state = {
      activeFragmentedOperation: null,
      lastFragment: false,
      masked: false,
      opcode: 0,
      fragmentedOperation: false
    };
    this.overflow = [];
    this.headerBuffer = new Buffer(10);
    this.expectOffset = 0;
    this.expectBuffer = null;
    this.expectHandler = null;
    this.currentMessage = [];
    this.currentMessageLength = 0;
    this.messageHandlers = [];
    this.expectHeader(2, this.processPacket);
    this.dead = false;
    this.processing = false;

    this.onerror = function() {};
    this.ontext = function() {};
    this.onbinary = function() {};
    this.onclose = function() {};
    this.onping = function() {};
    this.onpong = function() {};
  }

  /**
   * Add new data to the parser.
   *
   * @api public
   */

  add(data) {
    if (this.dead) return;
    const dataLength = data.length;
    if (dataLength == 0) return;
    if (this.expectBuffer == null) {
      this.overflow.push(data);
      return;
    }
    const toRead = Math.min(dataLength, this.expectBuffer.length - this.expectOffset);
    fastCopy(toRead, data, this.expectBuffer, this.expectOffset);
    this.expectOffset += toRead;
    if (toRead < dataLength) {
      this.overflow.push(data.slice(toRead));
    }
    while (this.expectBuffer && this.expectOffset == this.expectBuffer.length) {
      const bufferForHandler = this.expectBuffer;
      this.expectBuffer = null;
      this.expectOffset = 0;
      this.expectHandler(bufferForHandler);
    }
  }

  /**
   * Releases all resources used by the receiver.
   *
   * @api public
   */

  cleanup() {
    this.dead = true;
    this.overflow = null;
    this.headerBuffer = null;
    this.expectBuffer = null;
    this.expectHandler = null;
    this.unfragmentedBufferPool = null;
    this.fragmentedBufferPool = null;
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
   * Waits for a certain amount of header bytes to be available, then fires a callback.
   *
   * @api private
   */

  expectHeader(length, handler) {
    this.expectBuffer = this.headerBuffer.slice(this.expectOffset, this.expectOffset + length);
    this.expectHandler = handler;
    var toRead = length;
    while (toRead > 0 && this.overflow.length > 0) {
      var fromOverflow = this.overflow.pop();
      var read = Math.min(fromOverflow.length, toRead);
      if (toRead < fromOverflow.length) this.overflow.push(fromOverflow.slice(toRead));
      fastCopy(read, fromOverflow, this.expectBuffer, this.expectOffset);
      this.expectOffset += read;
      toRead -= read;
    }
  }

  /**
   * Waits for a certain amount of data bytes to be available, then fires a callback.
   *
   * @api private
   */

  expectData(length, handler) {
    if (length == 0) {
      handler(null);
      return;
    }
    this.expectBuffer = this.allocateFromPool(length, this.state.fragmentedOperation);
    this.expectHandler = handler;
    var toRead = length;
    while (toRead > 0 && this.overflow.length > 0) {
      var fromOverflow = this.overflow.pop();
      var read = Math.min(fromOverflow.length, toRead);
      if (toRead < fromOverflow.length) this.overflow.push(fromOverflow.slice(toRead));
      fastCopy(read, fromOverflow, this.expectBuffer, this.expectOffset);
      this.expectOffset += read;
      toRead -= read;
    }
  }

  /**
   * Allocates memory from the buffer pool.
   *
   * @api private
   */

  allocateFromPool(length, isFragmented) {
    return (isFragmented ? this.fragmentedBufferPool : this.unfragmentedBufferPool).get(length);
  }

  /**
   * Start processing a new packet.
   *
   * @api private
   */

  processPacket(data) {
    if (this.extensions[PerMessageDeflate.extensionName]) {
      if ((data[0] & 0x30) != 0) {
        this.error(new Error('reserved fields (2, 3) must be empty'), 1002);
        return;
      }
    } else {
      if ((data[0] & 0x70) != 0) {
        this.error(new Error('reserved fields must be empty'), 1002);
        return;
      }
    }
    this.state.lastFragment = (data[0] & 0x80) == 0x80;
    this.state.masked = (data[1] & 0x80) == 0x80;
    const compressed = (data[0] & 0x40) == 0x40;
    const opcode = data[0] & 0xf;
    if (opcode === 0) {
      if (compressed) {
        this.error(new Error('continuation frame cannot have the Per-message Compressed bits'), 1002);
        return;
      }
      // continuation frame
      this.state.fragmentedOperation = true;
      this.state.opcode = this.state.activeFragmentedOperation;
      if (!(this.state.opcode == 1 || this.state.opcode == 2)) {
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
    if (typeof handler == 'undefined') {
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

  endPacket() {
    if (this.dead) return;
    if (!this.state.fragmentedOperation) this.unfragmentedBufferPool.reset(true);
    else if (this.state.lastFragment) this.fragmentedBufferPool.reset(true);
    this.expectOffset = 0;
    this.expectBuffer = null;
    this.expectHandler = null;
    if (this.state.lastFragment && this.state.opcode === this.state.activeFragmentedOperation) {
      // end current fragmented operation
      this.state.activeFragmentedOperation = null;
    }
    this.currentPayloadLength = 0;
    this.state.lastFragment = false;
    this.state.opcode = this.state.activeFragmentedOperation != null ? this.state.activeFragmentedOperation : 0;
    this.state.masked = false;
    this.expectHeader(2, this.processPacket);
  }

  /**
   * Reset the parser state.
   *
   * @api private
   */

  reset() {
    if (this.dead) return;
    this.state = {
      activeFragmentedOperation: null,
      lastFragment: false,
      masked: false,
      opcode: 0,
      fragmentedOperation: false
    };
    this.fragmentedBufferPool.reset(true);
    this.unfragmentedBufferPool.reset(true);
    this.expectOffset = 0;
    this.expectBuffer = null;
    this.expectHandler = null;
    this.overflow = [];
    this.currentMessage = [];
    this.currentMessageLength = 0;
    this.messageHandlers = [];
    this.currentPayloadLength = 0;
  }

  /**
   * Unmask received data.
   *
   * @api private
   */

  unmask(mask, buf) {
    if (mask != null && buf != null) bufferUtil.unmask(buf, mask);
    return buf;
  }

  /**
   * Handles an error
   *
   * @api private
   */

  error(err, protocolErrorCode) {
    this.reset();
    this.onerror(err, protocolErrorCode);
    return this;
  }

  /**
   * Execute message handler buffers
   *
   * @api private
   */

  flush() {
    if (this.processing || this.dead) return;

    var handler = this.messageHandlers.shift();
    if (!handler) return;

    this.processing = true;

    handler(() => {
      this.processing = false;
      this.flush();
    });
  }

  /**
   * Apply extensions to message
   *
   * @api private
   */

  applyExtensions(messageBuffer, fin, compressed, callback) {
    if (compressed) {
      const extension = this.extensions[PerMessageDeflate.extensionName];
      extension.decompress(messageBuffer, fin, (err, buffer) => {
        if (this.dead) return;
        if (err) {
          callback(err.closeCode === 1009 ? err : new Error('invalid compressed data'));
          return;
        }
        callback(null, buffer);
      });
    } else {
      callback(null, messageBuffer);
    }
  }

  /**
   * Checks payload size, disconnects socket when it exceeds maxPayload
   *
   * @api private
   */

  maxPayloadExceeded(length) {
    if (this.maxPayload === undefined || this.maxPayload === null || this.maxPayload < 1) {
      return false;
    }
    const fullLength = this.currentPayloadLength + length;
    if (fullLength < this.maxPayload) {
      this.currentPayloadLength = fullLength;
      return false;
    }
    this.error(new Error(`payload cannot exceed ${this.maxPayload} bytes`), 1009);
    this.cleanup();

    return true;
  }
}

module.exports = Receiver;

/**
 * Buffer utilities
 */

function fastCopy(length, srcBuffer, dstBuffer, dstOffset) {
  /* eslint-disable no-fallthrough */
  switch (length) {
  default: srcBuffer.copy(dstBuffer, dstOffset, 0, length); break;
  case 16: dstBuffer[dstOffset + 15] = srcBuffer[15];
  case 15: dstBuffer[dstOffset + 14] = srcBuffer[14];
  case 14: dstBuffer[dstOffset + 13] = srcBuffer[13];
  case 13: dstBuffer[dstOffset + 12] = srcBuffer[12];
  case 12: dstBuffer[dstOffset + 11] = srcBuffer[11];
  case 11: dstBuffer[dstOffset + 10] = srcBuffer[10];
  case 10: dstBuffer[dstOffset + 9] = srcBuffer[9];
  case 9: dstBuffer[dstOffset + 8] = srcBuffer[8];
  case 8: dstBuffer[dstOffset + 7] = srcBuffer[7];
  case 7: dstBuffer[dstOffset + 6] = srcBuffer[6];
  case 6: dstBuffer[dstOffset + 5] = srcBuffer[5];
  case 5: dstBuffer[dstOffset + 4] = srcBuffer[4];
  case 4: dstBuffer[dstOffset + 3] = srcBuffer[3];
  case 3: dstBuffer[dstOffset + 2] = srcBuffer[2];
  case 2: dstBuffer[dstOffset + 1] = srcBuffer[1];
  case 1: dstBuffer[dstOffset] = srcBuffer[0];
  }
  /* eslint-enable no-fallthrough */
}

function clone(obj) {
  return Object.assign({}, obj);
}

/**
 * Opcode handlers
 */

const opcodes = {
  // text
  '1': {
    start: (receiver, data) => {
      // decode length
      const firstLength = data[1] & 0x7f;
      if (firstLength < 126) {
        if (receiver.maxPayloadExceeded(firstLength)) return;
        opcodes['1'].getData(receiver, firstLength);
      } else if (firstLength == 126) {
        receiver.expectHeader(2, (data) => {
          const length = data.readUInt16BE(0, true);
          if (receiver.maxPayloadExceeded(length)) return;
          opcodes['1'].getData(receiver, length);
        });
      } else if (firstLength == 127) {
        receiver.expectHeader(8, (data) => {
          if (data.readUInt32BE(0, true) != 0) {
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
        receiver.expectHeader(4, (mask) => {
          receiver.expectData(length, (data) => opcodes['1'].finish(receiver, mask, data));
        });
      } else {
        receiver.expectData(length, (data) => opcodes['1'].finish(receiver, null, data));
      }
    },
    finish: (receiver, mask, data) => {
      const packet = receiver.unmask(mask, data) || new Buffer(0);
      const state = clone(receiver.state);
      receiver.messageHandlers.push((callback) => {
        receiver.applyExtensions(packet, state.lastFragment, state.compressed, (err, buffer) => {
          if (err) {
            receiver.error(err, err.closeCode === 1009 ? 1009 : 1007);
            return;
          }

          if (buffer != null) {
            if (receiver.maxPayload == 0 || (receiver.maxPayload > 0 &&
              (receiver.currentMessageLength + buffer.length) < receiver.maxPayload)) {
              receiver.currentMessage.push(buffer);
            } else {
              receiver.currentMessage = [];
              receiver.currentMessageLength = 0;
              receiver.error(new Error(`payload cannot exceed ${receiver.maxPayload} bytes`), 1009);
              return;
            }
            receiver.currentMessageLength += buffer.length;
          }
          if (state.lastFragment) {
            const messageBuffer = receiver.currentMessage.length === 1 ?
              receiver.currentMessage[0] :
              Buffer.concat(receiver.currentMessage, receiver.currentMessageLength);
            receiver.currentMessage = [];
            receiver.currentMessageLength = 0;
            if (!Validation.isValidUTF8(messageBuffer)) {
              receiver.error(new Error('invalid utf8 sequence'), 1007);
              return;
            }
            receiver.ontext(messageBuffer.toString('utf8'), {
              masked: state.masked,
              buffer: messageBuffer
            });
          }
          callback();
        });
      });
      receiver.flush();
      receiver.endPacket();
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
      } else if (firstLength == 126) {
        receiver.expectHeader(2, (data) => {
          const length = data.readUInt16BE(0, true);
          if (receiver.maxPayloadExceeded(length)) return;
          opcodes['2'].getData(receiver, length);
        });
      } else if (firstLength == 127) {
        receiver.expectHeader(8, (data) => {
          if (data.readUInt32BE(0, true) != 0) {
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
        receiver.expectHeader(4, (mask) => {
          receiver.expectData(length, (data) => opcodes['2'].finish(receiver, mask, data));
        });
      } else {
        receiver.expectData(length, (data) => opcodes['2'].finish(receiver, null, data));
      }
    },
    finish: (receiver, mask, data) => {
      const packet = receiver.unmask(mask, data) || new Buffer(0);
      const state = clone(receiver.state);
      receiver.messageHandlers.push((callback) => {
        receiver.applyExtensions(packet, state.lastFragment, state.compressed, (err, buffer) => {
          if (err) {
            receiver.error(err, err.closeCode === 1009 ? 1009 : 1007);
            return;
          }

          if (buffer != null) {
            if (receiver.maxPayload == 0 || (receiver.maxPayload > 0 &&
              (receiver.currentMessageLength + buffer.length) < receiver.maxPayload)) {
              receiver.currentMessage.push(buffer);
            } else {
              receiver.currentMessage = [];
              receiver.currentMessageLength = 0;
              receiver.error(new Error(`payload cannot exceed ${receiver.maxPayload} bytes`), 1009);
              return;
            }
            receiver.currentMessageLength += buffer.length;
          }
          if (state.lastFragment) {
            const messageBuffer = receiver.currentMessage.length === 1 ?
              receiver.currentMessage[0] :
              Buffer.concat(receiver.currentMessage, receiver.currentMessageLength);
            receiver.currentMessage = [];
            receiver.currentMessageLength = 0;
            receiver.onbinary(messageBuffer, {
              masked: state.masked,
              buffer: messageBuffer
            });
          }
          callback();
        });
      });
      receiver.flush();
      receiver.endPacket();
    }
  },
  // close
  '8': {
    start: (receiver, data) => {
      if (receiver.state.lastFragment == false) {
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
        receiver.expectHeader(4, (mask) => {
          receiver.expectData(length, (data) => opcodes['8'].finish(receiver, mask, data));
        });
      } else {
        receiver.expectData(length, (data) => opcodes['8'].finish(receiver, null, data));
      }
    },
    finish: (receiver, mask, data) => {
      const packet = receiver.unmask(mask, data);
      const state = clone(receiver.state);
      receiver.messageHandlers.push(() => {
        if (packet && packet.length == 1) {
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
          message = messageBuffer.toString('utf8');
        }
        receiver.onclose(code, message, { masked: state.masked });
        receiver.reset();
      });
      receiver.flush();
    }
  },
  // ping
  '9': {
    start: (receiver, data) => {
      if (receiver.state.lastFragment == false) {
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
        receiver.expectHeader(4, (mask) => {
          receiver.expectData(length, (data) => opcodes['9'].finish(receiver, mask, data));
        });
      } else {
        receiver.expectData(length, (data) => opcodes['9'].finish(receiver, null, data));
      }
    },
    finish: (receiver, mask, data) => {
      const packet = receiver.unmask(mask, data);
      const state = clone(receiver.state);
      receiver.messageHandlers.push((callback) => {
        receiver.onping(packet, { masked: state.masked, binary: true });
        callback();
      });
      receiver.flush();
      receiver.endPacket();
    }
  },
  // pong
  '10': {
    start: (receiver, data) => {
      if (receiver.state.lastFragment == false) {
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
        receiver.expectHeader(4, (mask) => {
          receiver.expectData(length, (data) => opcodes['10'].finish(receiver, mask, data));
        });
      } else {
        receiver.expectData(length, (data) => opcodes['10'].finish(receiver, null, data));
      }
    },
    finish: (receiver, mask, data) => {
      const packet = receiver.unmask(mask, data);
      const state = clone(receiver.state);
      receiver.messageHandlers.push((callback) => {
        receiver.onpong(packet, { masked: state.masked, binary: true });
        callback();
      });
      receiver.flush();
      receiver.endPacket();
    }
  }
}
