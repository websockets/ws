/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

/**
 * Node version 0.4 and 0.6 compatibility
 */

try {
  module.exports = require('../build/Release/bufferutil');
} catch (e) { try {
  module.exports = require('../build/default/bufferutil');
} catch (e) {
  console.error('bufferutil.node has either not been built (run make),');
  console.error('or your node install has changed architecture (run make clean && make).')
  throw e;
}}
