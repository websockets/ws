/**
 * Node version 0.4 and 0.6 compatibility
 */
try {
  module.exports = require('../build/Release/validation');
} catch (e) { try {
  module.exports = require('../build/default/validation');
} catch (e) {
  throw e;
}}