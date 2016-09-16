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
    var dataLength = data.length;
    if (dataLength == 0) return;
    if (this.expectBuffer == null) {
      this.overflow.push(data);
      return;
    }
    var toRead = Math.min(dataLength, this.expectBuffer.length - this.expectOffset);
    fastCopy(toRead, data, this.expectBuffer, this.expectOffset);
    this.expectOffset += toRead;
    if (toRead < dataLength) {
      this.overflow.push(data.slice(toRead));
    }
    while (this.expectBuffer && this.expectOffset == this.expectBuffer.length) {
      var bufferForHandler = this.expectBuffer;
      this.expectBuffer = null;
      this.expectOffset = 0;
      this.expectHandler.call(this, bufferForHandler);
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
    if (length == 0) {
      handler(null);
      return;
    }
    this.expectBuffer = this.headerBuffer.slice(this.expectOffset, this.expectOffset + length);
    this.expectHandler = handler;
    var toRead = length;
    while (toRead > 0 && this.overflow.length > 0) {
      var fromOverflow = this.overflow.pop();
      if (toRead < fromOverflow.length) this.overflow.push(fromOverflow.slice(toRead));
      var read = Math.min(fromOverflow.length, toRead);
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
      if (toRead < fromOverflow.length) this.overflow.push(fromOverflow.slice(toRead));
      var read = Math.min(fromOverflow.length, toRead);
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

  processPacket (data) {
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
    var compressed = (data[0] & 0x40) == 0x40;
    var opcode = data[0] & 0xf;
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
    }
    else {
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
      }
      else this.state.fragmentedOperation = false;
    }
    var handler = opcodes[this.state.opcode];
    if (typeof handler == 'undefined') {
      this.error(new Error(`no handler for opcode ${this.state.opcode}`), 1002);
    }
    else {
      handler.start.call(this, data);
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

  unmask(mask, buf, binary) {
    if (mask != null && buf != null) bufferUtil.unmask(buf, mask);
    if (binary) return buf;
    return buf != null ? buf.toString('utf8') : '';
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
      var extension = this.extensions[PerMessageDeflate.extensionName];
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
    var fullLength = this.currentPayloadLength + length;
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

function readUInt16BE(start) {
  return (this[start] << 8) +
         this[start + 1];
}

function readUInt32BE(start) {
  return (this[start] << 24) +
         (this[start + 1] << 16) +
         (this[start + 2] << 8) +
         this[start + 3];
}

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

var opcodes = {
  // text
  '1': {
    start: function(data) {
      // decode length
      var firstLength = data[1] & 0x7f;
      if (firstLength < 126) {
        if (this.maxPayloadExceeded(firstLength)) return;
        opcodes['1'].getData.call(this, firstLength);
      }
      else if (firstLength == 126) {
        this.expectHeader(2, (data) => {
          var length = readUInt16BE.call(data, 0);
          if (this.maxPayloadExceeded(length)) return;
          opcodes['1'].getData.call(this, length);
        });
      }
      else if (firstLength == 127) {
        this.expectHeader(8, (data) => {
          if (readUInt32BE.call(data, 0) != 0) {
            this.error(new Error('packets with length spanning more than 32 bit is currently not supported'), 1008);
            return;
          }
          var length = readUInt32BE.call(data, 4);
          if (this.maxPayloadExceeded(length)) return;
          opcodes['1'].getData.call(this, length);
        });
      }
    },
    getData: function(length) {
      if (this.state.masked) {
        this.expectHeader(4, (data) => {
          var mask = data;
          this.expectData(length, (data) => {
            opcodes['1'].finish.call(this, mask, data);
          });
        });
      }
      else {
        this.expectData(length, (data) => {
          opcodes['1'].finish.call(this, null, data);
        });
      }
    },
    finish: function(mask, data) {
      var packet = this.unmask(mask, data, true) || new Buffer(0);
      var state = clone(this.state);
      this.messageHandlers.push((callback) => {
        this.applyExtensions(packet, state.lastFragment, state.compressed, (err, buffer) => {
          if (err) {
            this.error(err, err.closeCode === 1009 ? 1009 : 1007);
            return;
          }

          if (buffer != null) {
            if (this.maxPayload == 0 || (this.maxPayload > 0 &&
              (this.currentMessageLength + buffer.length) < this.maxPayload)) {
              this.currentMessage.push(buffer);
            }
            else {
              this.currentMessage = [];
              this.currentMessageLength = 0;
              this.error(new Error(`payload cannot exceed ${this.maxPayload} bytes`), 1009);
              return;
            }
            this.currentMessageLength += buffer.length;
          }
          if (state.lastFragment) {
            var messageBuffer = this.currentMessage.length === 1 ?
              this.currentMessage[0] :
              Buffer.concat(this.currentMessage, this.currentMessageLength);
            this.currentMessage = [];
            this.currentMessageLength = 0;
            if (!Validation.isValidUTF8(messageBuffer)) {
              this.error(new Error('invalid utf8 sequence'), 1007);
              return;
            }
            this.ontext(messageBuffer.toString('utf8'), {masked: state.masked, buffer: messageBuffer});
          }
          callback();
        });
      });
      this.flush();
      this.endPacket();
    }
  },
  // binary
  '2': {
    start: function(data) {
      // decode length
      var firstLength = data[1] & 0x7f;
      if (firstLength < 126) {
        if (this.maxPayloadExceeded(firstLength)) return;
        opcodes['2'].getData.call(this, firstLength);
      }
      else if (firstLength == 126) {
        this.expectHeader(2, (data) => {
          var length = readUInt16BE.call(data, 0);
          if (this.maxPayloadExceeded(length)) return;
          opcodes['2'].getData.call(this, length);
        });
      }
      else if (firstLength == 127) {
        this.expectHeader(8, (data) => {
          if (readUInt32BE.call(data, 0) != 0) {
            this.error(new Error('packets with length spanning more than 32 bit is currently not supported'), 1008);
            return;
          }
          var length = readUInt32BE.call(data, 4, true);
          if (this.maxPayloadExceeded(length)) return;
          opcodes['2'].getData.call(this, length);
        });
      }
    },
    getData: function(length) {
      if (this.state.masked) {
        this.expectHeader(4, (data) => {
          var mask = data;
          this.expectData(length, (data) => {
            opcodes['2'].finish.call(this, mask, data);
          });
        });
      }
      else {
        this.expectData(length, (data) => {
          opcodes['2'].finish.call(this, null, data);
        });
      }
    },
    finish: function(mask, data) {
      var packet = this.unmask(mask, data, true) || new Buffer(0);
      var state = clone(this.state);
      this.messageHandlers.push((callback) => {
        this.applyExtensions(packet, state.lastFragment, state.compressed, (err, buffer) => {
          if (err) {
            this.error(err, err.closeCode === 1009 ? 1009 : 1007);
            return;
          }

          if (buffer != null) {
            if (this.maxPayload == 0 || (this.maxPayload > 0 &&
              (this.currentMessageLength + buffer.length) < this.maxPayload)) {
              this.currentMessage.push(buffer);
            }
            else {
              this.currentMessage = [];
              this.currentMessageLength = 0;
              this.error(new Error(`payload cannot exceed ${this.maxPayload} bytes`), 1009);
              return;
            }
            this.currentMessageLength += buffer.length;
          }
          if (state.lastFragment) {
            var messageBuffer = this.currentMessage.length === 1 ?
              this.currentMessage[0] :
              Buffer.concat(this.currentMessage, this.currentMessageLength);
            this.currentMessage = [];
            this.currentMessageLength = 0;
            this.onbinary(messageBuffer, {masked: state.masked, buffer: messageBuffer});
          }
          callback();
        });
      });
      this.flush();
      this.endPacket();
    }
  },
  // close
  '8': {
    start: function(data) {
      var self = this;
      if (self.state.lastFragment == false) {
        self.error('fragmented close is not supported', 1002);
        return;
      }

      // decode length
      var firstLength = data[1] & 0x7f;
      if (firstLength < 126) {
        opcodes['8'].getData.call(self, firstLength);
      }
      else {
        self.error('control frames cannot have more than 125 bytes of data', 1002);
      }
    },
    getData: function(length) {
      var self = this;
      if (self.state.masked) {
        self.expectHeader(4, function(data) {
          var mask = data;
          self.expectData(length, function(data) {
            opcodes['8'].finish.call(self, mask, data);
          });
        });
      }
      else {
        self.expectData(length, function(data) {
          opcodes['8'].finish.call(self, null, data);
        });
      }
    },
    finish: function(mask, data) {
      var self = this;
      data = self.unmask(mask, data, true);

      var state = clone(this.state);
      this.messageHandlers.push(function() {
        if (data && data.length == 1) {
          self.error('close packets with data must be at least two bytes long', 1002);
          return;
        }
        var code = data && data.length > 1 ? readUInt16BE.call(data, 0) : 1000;
        if (!ErrorCodes.isValidErrorCode(code)) {
          self.error('invalid error code', 1002);
          return;
        }
        var message = '';
        if (data && data.length > 2) {
          var messageBuffer = data.slice(2);
          if (!Validation.isValidUTF8(messageBuffer)) {
            self.error('invalid utf8 sequence', 1007);
            return;
          }
          message = messageBuffer.toString('utf8');
        }
        self.onclose(code, message, {masked: state.masked});
        self.reset();
      });
      this.flush();
    }
  },
  // ping
  '9': {
    start: function(data) {
      var self = this;
      if (self.state.lastFragment == false) {
        self.error('fragmented ping is not supported', 1002);
        return;
      }

      // decode length
      var firstLength = data[1] & 0x7f;
      if (firstLength < 126) {
        opcodes['9'].getData.call(self, firstLength);
      }
      else {
        self.error('control frames cannot have more than 125 bytes of data', 1002);
      }
    },
    getData: function(length) {
      var self = this;
      if (self.state.masked) {
        self.expectHeader(4, function(data) {
          var mask = data;
          self.expectData(length, function(data) {
            opcodes['9'].finish.call(self, mask, data);
          });
        });
      }
      else {
        self.expectData(length, function(data) {
          opcodes['9'].finish.call(self, null, data);
        });
      }
    },
    finish: function(mask, data) {
      var self = this;
      data = this.unmask(mask, data, true);
      var state = clone(this.state);
      this.messageHandlers.push(function(callback) {
        self.onping(data, {masked: state.masked, binary: true});
        callback();
      });
      this.flush();
      this.endPacket();
    }
  },
  // pong
  '10': {
    start: function(data) {
      var self = this;
      if (self.state.lastFragment == false) {
        self.error('fragmented pong is not supported', 1002);
        return;
      }

      // decode length
      var firstLength = data[1] & 0x7f;
      if (firstLength < 126) {
        opcodes['10'].getData.call(self, firstLength);
      }
      else {
        self.error('control frames cannot have more than 125 bytes of data', 1002);
      }
    },
    getData: function(length) {
      if (this.state.masked) {
        this.expectHeader(4, (data) => {
          var mask = data;
          this.expectData(length, (data) => {
            opcodes['10'].finish.call(this, mask, data);
          });
        });
      }
      else {
        this.expectData(length, (data) => {
          opcodes['10'].finish.call(this, null, data);
        });
      }
    },
    finish: function(mask, data) {
      data = this.unmask(mask, data, true);
      var state = clone(this.state);
      this.messageHandlers.push((callback) => {
        this.onpong(data, {masked: state.masked, binary: true});
        callback();
      });
      this.flush();
      this.endPacket();
    }
  }
}
