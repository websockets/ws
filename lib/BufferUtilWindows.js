/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

/**
 * Windows Compatibility 
 */
 
module.exports.BufferUtil = {
  merge: function(mergedBuffer, buffers) {
    var offset = 0;
    for (var i = 0, l = buffers.length; i < l; ++i) {
      var buf = buffers[i];
      buf.copy(mergedBuffer, offset);
      offset += buf.length;
    }
  },
  mask: function(source, mask, output, offset, length) {
    var maskNum = mask.readUInt32LE(0, true);
    var i = 0;
    for (; i < length - 3; i += 4) {
      output.writeUInt32LE(maskNum ^ source.readUInt32LE(i, true), offset + i, true);
    }
    switch (length % 4) {
      case 3: output[offset + i + 2] = source[i + 2] ^ mask[2]; 
      case 2: output[offset + i + 1] = source[i + 1] ^ mask[1]; 
      case 1: output[offset + i] = source[i] ^ mask[0]; 
      case 0:;
    }
  },
  unmask: function(data, mask) {
    var maskNum = mask.readUInt32LE(0, true);
    for (var i = 0, ll = data.length; i < ll; i += 4) {
      data.writeUInt32LE(maskNum ^ data.readUInt32LE(i, true), i, true);
    }
  }
} 
