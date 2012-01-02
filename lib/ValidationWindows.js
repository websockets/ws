/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

/**
 * Windows Compatibility 
 */
 
module.exports.Validation = {
  isValidUTF8: function(buffer) {
    return true;
  }
};

