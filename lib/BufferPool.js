/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

class BufferPool {
  constructor(initialSize, growStrategy, shrinkStrategy) {
    this._growStrategy = (growStrategy || function(db, size) {
      return db.used + size;
    }).bind(null, this);

    this._shrinkStrategy = (shrinkStrategy || function(db) {
      return initialSize;
    }).bind(null, this);

    this._buffer = new Buffer(initialSize);
    this._offset = 0;
    this._used = 0;
    this._changeFactor = 0;
  }

  get size() {
    return this._buffer.length;
  }

  get used() {
    return this._used;
  }

  get(length) {
    if (this._buffer == null || this._offset + length > this._buffer.length) {
      var newBuf = new Buffer(this._growStrategy(length));
      this._buffer = newBuf;
      this._offset = 0;
    }
    this._used += length;
    var buf = this._buffer.slice(this._offset, this._offset + length);
    this._offset += length;
    return buf;
  }

  reset(forceNewBuffer) {
    var len = this._shrinkStrategy();
    if (len < this.size) this._changeFactor -= 1;
    if (forceNewBuffer || this._changeFactor < -2) {
      this._changeFactor = 0;
      this._buffer = new Buffer(len);
    }
    this._offset = 0;
    this._used = 0;
  }
}

module.exports = BufferPool;
