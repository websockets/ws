/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

var events = require('events')
  , util = require('util')
  , EventEmitter = events.EventEmitter
  , Validation = require('./Validation').Validation
  , ErrorCodes = require('./ErrorCodes')
  , BufferPool = require('./BufferPool');

/**
 * Node version 0.4 and 0.6 compatibility
 */
var isNodeV4 = /^v0\.4/.test(process.version);
var readUInt16BE = !isNodeV4
  ? Buffer.prototype.readUInt16BE
  : function(start) {
    var n = 0;
    for (var i = start; i < start + 2; ++i) {
      n = (i == 0) ? this[i] : (n * 256) + this[i];
    }
    return n;
  };
var readUInt32BE = !isNodeV4
  ? Buffer.prototype.readUInt32BE
  : function(start) {
    var n = 0;
    for (var i = start; i < start + 4; ++i) {
      n = (i == 0) ? this[i] : (n * 256) + this[i];
    }
    return n;
  };

/**
 * HyBi Receiver implementation
 */

function Receiver () {
  this.state = {
    activeFragmentedOperation: null,
    lastFragment: false,
    masked: false,
    opcode: 0
  };
  this.overflow = null;
  this.bufferPool = new BufferPool(1024, function(db, length) {
    return db.used + length;
  }, function(db) {
    return db.prevUsed = (typeof db.prevUsed == 'undefined' ? (db.prevUsed + db.used) / 2 : db.used);
  });
  this.expectOffset = 0;
  this.expectBuffer = null;
  this.expectHandler = null;
  this.currentMessage = [];

  var self = this;
  var opcodes = this.opcodeHandlers = {
    // text
    '1': {
      start: function(data) {
        // decode length
        var firstLength = data[1] & 0x7f;
        if (firstLength < 126) {
          opcodes['1'].getData(firstLength);
        }
        else if (firstLength == 126) {
          self.expect(2, function(data) {
            opcodes['1'].getData(readUInt16BE.call(data, 0));
          });
        }
        else if (firstLength == 127) {
          self.expect(8, function(data) {
            if (readUInt32BE.call(data, 0) != 0) {
              self.error('packets with length spanning more than 32 bit is currently not supported', 1008);
              return;
            }
            opcodes['1'].getData(readUInt32BE.call(data, 4));
          });
        }
      },
      getData: function(length) {
        if (self.state.masked) {
          self.expect(4, function(data) {
            var mask = data;
            self.expect(length, function(data) {
              opcodes['1'].finish(mask, data);
            });
          });
        }
        else {
          self.expect(length, function(data) {
            opcodes['1'].finish(null, data);
          });
        }
      },
      finish: function(mask, data) {
        var packet = self.unmask(mask, data, true);
        if (packet != null) self.currentMessage.push(packet);
        if (self.state.lastFragment) {
          var messageBuffer = self.concatBuffers(self.currentMessage);
          if (!Validation.isValidUTF8(messageBuffer)) {
            self.error('invalid utf8 sequence', 1007);
            return;
          }
          self.emit('text', messageBuffer.toString('utf8'), {masked: self.state.masked, buffer: messageBuffer});
          self.currentMessage = [];
        }
        self.endPacket();
      }
    },
    // binary
    '2': {
      start: function(data) {
        // decode length
        var firstLength = data[1] & 0x7f;
        if (firstLength < 126) {
          opcodes['2'].getData(firstLength);
        }
        else if (firstLength == 126) {
          self.expect(2, function(data) {
            opcodes['2'].getData(readUInt16BE.call(data, 0));
          });
        }
        else if (firstLength == 127) {
          self.expect(8, function(data) {
            if (readUInt32BE.call(data, 0) != 0) {
              self.error('packets with length spanning more than 32 bit is currently not supported', 1008);
              return;
            }
            opcodes['2'].getData(readUInt32BE.call(data, 4));
          });
        }
      },
      getData: function(length) {
        if (self.state.masked) {
          self.expect(4, function(data) {
            var mask = data;
            self.expect(length, function(data) {
              opcodes['2'].finish(mask, data);
            });
          });
        }
        else {
          self.expect(length, function(data) {
            opcodes['2'].finish(null, data);
          });
        }
      },
      finish: function(mask, data) {
        var packet = self.unmask(mask, data, true);
        if (packet != null) self.currentMessage.push(packet);
        if (self.state.lastFragment) {
          var messageBuffer = self.concatBuffers(self.currentMessage);
          self.emit('binary', messageBuffer, {masked: self.state.masked, buffer: messageBuffer});
          self.currentMessage = [];
        }
        self.endPacket();
      }
    },
    // close
    '8': {
      start: function(data) {
        if (self.state.lastFragment == false) {
          self.error('fragmented close is not supported', 1002);
          return;
        }

        // decode length
        var firstLength = data[1] & 0x7f;
        if (firstLength < 126) {
          opcodes['8'].getData(firstLength);
        }
        else {
          self.error('control frames cannot have more than 125 bytes of data', 1002);
        }
      },
      getData: function(length) {
        if (self.state.masked) {
          self.expect(4, function(data) {
            var mask = data;
            self.expect(length, function(data) {
              opcodes['8'].finish(mask, data);
            });
          });
        }
        else {
          self.expect(length, function(data) {
            opcodes['8'].finish(null, data);
          });
        }
      },
      finish: function(mask, data) {
        data = self.unmask(mask, data, true);
        if (data && data.length == 1) {
          self.error('close packets with data must be at least two bytes long', 1002);
          return;
        }
        var code = data && data.length > 1 ? readUInt16BE.call(data, 0, true) : 1000;
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
        self.emit('close', code, message, {masked: self.state.masked});
        self.reset();
      },
    },
    // ping
    '9': {
      start: function(data) {
        if (self.state.lastFragment == false) {
          self.error('fragmented ping is not supported', 1002);
          return;
        }

        // decode length
        var firstLength = data[1] & 0x7f;
        if (firstLength < 126) {
          opcodes['9'].getData(firstLength);
        }
        else {
          self.error('control frames cannot have more than 125 bytes of data', 1002);
        }
      },
      getData: function(length) {
        if (self.state.masked) {
          self.expect(4, function(data) {
            var mask = data;
            self.expect(length, function(data) {
              opcodes['9'].finish(mask, data);
            });
          });
        }
        else {
          self.expect(length, function(data) {
            opcodes['9'].finish(null, data);
          });
        }
      },
      finish: function(mask, data) {
        self.emit('ping', self.unmask(mask, data, true), {masked: self.state.masked, binary: true});
        self.endPacket();
      }
    },
    // pong
    '10': {
      start: function(data) {
        if (self.state.lastFragment == false) {
          self.error('fragmented pong is not supported', 1002);
          return;
        }

        // decode length
        var firstLength = data[1] & 0x7f;
        if (firstLength < 126) {
          opcodes['10'].getData(firstLength);
        }
        else {
          self.error('control frames cannot have more than 125 bytes of data', 1002);
        }
      },
      getData: function(length) {
        if (self.state.masked) {
          self.expect(4, function(data) {
            var mask = data;
            self.expect(length, function(data) {
              opcodes['10'].finish(mask, data);
            });
          });
        }
        else {
          self.expect(length, function(data) {
            opcodes['10'].finish(null, data);
          });
        }
      },
      finish: function(mask, data) {
        self.emit('pong', self.unmask(mask, data, true), {masked: self.state.masked, binary: true});
        self.endPacket();
      }
    }
  }
  this.expect(2, this.processPacket);
};

/**
 * Inherits from EventEmitter.
 */

util.inherits(Receiver, events.EventEmitter);

/**
 * Add new data to the parser.
 *
 * @api public
 */

Receiver.prototype.add = function(data) {
  if (this.expectBuffer == null) {
    this.addToOverflow(data);
    return;
  }
  var toRead = Math.min(data.length, this.expectBuffer.length - this.expectOffset);
  data.copy(this.expectBuffer, this.expectOffset, 0, toRead);
  this.expectOffset += toRead;
  if (toRead < data.length) {
    this.addToOverflow(data.slice(toRead, data.length));
  }
  if (this.expectOffset == this.expectBuffer.length) {
    var bufferForHandler = this.expectBuffer;
    this.expectBuffer = null;
    this.expectOffset = 0;
    this.expectHandler.call(this, bufferForHandler);
  }
}

/**
 * Adds a piece of data to the overflow.
 *
 * @api private
 */

Receiver.prototype.addToOverflow = function(data) {
  if (this.overflow == null) this.overflow = data;
  else {
    var prevOverflow = this.overflow;
    this.overflow = this.allocateFromPool(this.overflow.length + data.length);
    prevOverflow.copy(this.overflow, 0);
    data.copy(this.overflow, prevOverflow.length);
  }
}

/**
 * Waits for a certain amount of bytes to be available, then fires a callback.
 *
 * @api private
 */

Receiver.prototype.expect = function(length, handler) {
  if (length == 0) {
    handler(null);
    return;
  }
  this.expectBuffer = this.allocateFromPool(length);
  this.expectOffset = 0;
  this.expectHandler = handler;
  if (this.overflow != null) {
    var toOverflow = this.overflow;
    this.overflow = null;
    this.add(toOverflow);
  }
}

/**
 * Allocates memory from the buffer pool.
 *
 * @api private
 */

Receiver.prototype.allocateFromPool = !isNodeV4
  ? function(length) { return this.bufferPool.get(length); }
  : function(length) { return new Buffer(length); };

/**
 * Start processing a new packet.
 *
 * @api private
 */

Receiver.prototype.processPacket = function (data) {
  if ((data[0] & 0x70) != 0) {
    this.error('reserved fields must be empty', 1002);
    return;
  }
  this.state.lastFragment = (data[0] & 0x80) == 0x80;
  this.state.masked = (data[1] & 0x80) == 0x80;
  var opcode = data[0] & 0xf;
  if (opcode == 0) {
    // continuation frame
    this.state.opcode = this.state.activeFragmentedOperation;
    if (!(this.state.opcode == 1 || this.state.opcode == 2)) {
      this.error('continuation frame cannot follow current opcode', 1002)
      return;
    }
  }
  else {
    if ((opcode === 1 || opcode === 2) && this.state.activeFragmentedOperation != null) {
      this.error('data frames after the initial data frame must have opcode 0', 1002);
      return;
    }
    this.state.opcode = opcode;
    if (this.state.lastFragment === false) {
      this.state.activeFragmentedOperation = opcode;
    }
  }
  var handler = this.opcodeHandlers[this.state.opcode];
  if (typeof handler == 'undefined') this.error('no handler for opcode ' + this.state.opcode, 1002);
  else {
    if (handler.start) handler.start(data)
    else handler(data);
  }
}

/**
 * Endprocessing a packet.
 *
 * @api private
 */

Receiver.prototype.endPacket = function() {
  this.bufferPool.reset();
  this.expectOffset = 0;
  this.expectBuffer = null;
  this.expectHandler = null;
  if (this.state.lastFragment && this.state.opcode == this.state.activeFragmentedOperation) {
    // end current fragmented operation
    this.state.activeFragmentedOperation = null;
  }
  this.state.lastFragment = false;
  this.state.opcode = this.state.activeFragmentedOperation != null ? this.state.activeFragmentedOperation : 0;
  this.state.masked = false;
  this.expect(2, this.processPacket);
}

/**
 * Reset the parser state.
 *
 * @api private
 */

Receiver.prototype.reset = function() {
  this.state = {
    activeFragmentedOperation: null,
    lastFragment: false,
    masked: false,
    opcode: 0
  };
  this.bufferPool.reset();
  this.expectOffset = 0;
  this.expectBuffer = null;
  this.expectHandler = null;
  this.overflow = null;
  this.currentMessage = [];
}

/**
 * Unmask received data.
 *
 * @api private
 */

Receiver.prototype.unmask = function (mask, buf, binary) {
  if (mask != null && buf != null) {
    for (var i = 0, ll = buf.length; i < ll; i++) {
      buf[i] ^= mask[i % 4];
    }
  }
  if (binary) return buf;
  return buf != null ? buf.toString('utf8') : '';
}

/**
 * Concatenates a list of buffers.
 *
 * @api private
 */

Receiver.prototype.concatBuffers = function(buffers) {
  var length = 0;
  for (var i = 0, l = buffers.length; i < l; ++i) {
    length += buffers[i].length;
  }
  var mergedBuffer = new Buffer(length);
  var offset = 0;
  for (var i = 0, l = buffers.length; i < l; ++i) {
    buffers[i].copy(mergedBuffer, offset);
    offset += buffers[i].length;
  }
  return mergedBuffer;
}

/**
 * Handles an error
 *
 * @api private
 */

Receiver.prototype.error = function (reason, protocolErrorCode) {
  this.reset();
  this.emit('error', reason, protocolErrorCode);
  return this;
};

module.exports = Receiver;