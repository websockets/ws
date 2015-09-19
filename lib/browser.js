/**
 * WebSocket constructor.
 */

var BrowserWebSocket = WebSocket || MozWebSocket;

/**
 * WebSocket constructor.
 *
 * @param {String} uri
 * @param {Array} protocols (optional)
 * @api public
 */

function ws(uri, protocols) {
  var instance;
  if (protocols) {
    instance = new BrowserWebSocket(uri, protocols);
  } else {
    instance = new BrowserWebSocket(uri);
  }
  return instance;
}

if (BrowserWebSocket) ws.prototype = BrowserWebSocket.prototype;

/**
 * Module exports.
 */

module.exports = BrowserWebSocket ? ws : null;
