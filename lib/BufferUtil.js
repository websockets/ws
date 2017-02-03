'use strict';

/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

try {
  const bufferUtil = require('bufferutil');

  module.exports = bufferUtil.BufferUtil || bufferUtil;
} catch (e) {
  module.exports = require('./BufferUtil.fallback');
}
