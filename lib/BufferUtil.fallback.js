/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

exports.BufferUtil = {
  merge: function (mergedBuffer, buffers) {
    var offset = 0;
    for (var i = 0, l = buffers.length; i < l; ++i) {
      var buf = buffers[i];
      buf.copy(mergedBuffer, offset);
      offset += buf.length;
    }
  },
  mask: function (source, mask, output, offset, length) {
    for (var i = 0; i < length; i++) {
      output[offset + i] = source[i] ^ mask[i & 3];
    }
  },
  unmask: function (data, mask) {
    // required until https://github.com/nodejs/node/issues/9006 is resolved
    var length = data.length;
    for (var i = 0; i < length; i++) {
      data[i] ^= mask[i & 3];
    }
  }
};
