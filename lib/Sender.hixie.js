/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

const EventEmitter = require('events');

/**
 * Hixie Sender implementation, Inherits from EventEmitter.
 */

class Sender extends EventEmitter {
  constructor(socket) {
    super();

    this.socket = socket;
    this.continuationFrame = false;
    this.isClosed = false;
  }

  /**
   * Frames and writes data.
   *
   * @api public
   */
  send(data, options, cb) {
    if (this.isClosed) return;

    var isString = typeof data == 'string';
    var length = isString ? Buffer.byteLength(data) : data.length;
    var lengthbytes = (length > 127) ? 2 : 1; // assume less than 2**14 bytes
    var writeStartMarker = this.continuationFrame == false;
    var writeEndMarker = !options || !(typeof options.fin != 'undefined' && !options.fin);

    var bufferLength = writeStartMarker ? ((options && options.binary) ? (1 + lengthbytes) : 1) : 0;
    bufferLength += length;
    bufferLength += (writeEndMarker && !(options && options.binary)) ? 1 : 0;

    var buffer = new Buffer(bufferLength);
    var offset = writeStartMarker ? 1 : 0;

    if (writeStartMarker) {
      if (options && options.binary) {
        buffer.write('\x80', 'binary');
        // assume length less than 2**14 bytes
        if (lengthbytes > 1)
          buffer.write(String.fromCharCode(128 + length / 128), offset++, 'binary');
        buffer.write(String.fromCharCode(length & 0x7f), offset++, 'binary');
      } else
        buffer.write('\x00', 'binary');
    }

    if (isString) buffer.write(data, offset, 'utf8');
    else data.copy(buffer, offset, 0);

    if (writeEndMarker) {
      if (options && options.binary) {
        // sending binary, not writing end marker
      } else
        buffer.write('\xff', offset + length, 'binary');
      this.continuationFrame = false;
    }
    else this.continuationFrame = true;

    try {
      this.socket.write(buffer, 'binary', cb);
    } catch (e) {
      this.emit('error', e)
    }
  }

  /**
   * Sends a close instruction to the remote party.
   *
   * @api public
   */

  close(code, data, mask, cb) {
    if (this.isClosed) return;
    this.isClosed = true;
    try {
      if (this.continuationFrame) this.socket.write(new Buffer([0xff], 'binary'));
      this.socket.write(new Buffer([0xff, 0x00]), 'binary', cb);
    } catch (e) {
      this.emit('error', e);
    }
  }

  /**
   * Sends a ping message to the remote party. Not available for hixie.
   *
   * @api public
   */

  ping(data, options) {}

  /**
   * Sends a pong message to the remote party. Not available for hixie.
   *
   * @api public
   */
  pong(data, options) {}
}

module.exports = Sender;
