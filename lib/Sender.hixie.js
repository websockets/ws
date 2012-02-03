/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

var events = require('events')
  , util = require('util')
  , EventEmitter = events.EventEmitter;

/**
 * Hixie Sender implementation
 */

function Sender (socket, options) {
  this.socket = socket;
}

module.exports = Sender;

/**
 * Inherits from EventEmitter.
 */

util.inherits(Sender, events.EventEmitter);

/**
 * Frames and writes data.
 *
 * @api public
 */

Sender.prototype.send = function(data, options, cb) {
  if (options && options.binary) {
    this.error('hixie websockets do not support binary');
    return;
  }
  var length = Buffer.byteLength(data)
    , buffer = new Buffer(2 + length);

  buffer.write('\x00', 'binary');
  buffer.write(data, 1, 'utf8');
  buffer.write('\xff', 1 + length, 'binary');

  try {
    this.socket.write(buffer, 'binary', cb);
  } catch (e) {
    this.error(e.toString());
  }
}

/**
 * Handles an error
 *
 * @api private
 */

Sender.prototype.error = function (reason) {
  this.emit('error', reason);
  return this;
}
