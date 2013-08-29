/// shim for browser packaging

module.exports = global.WebSocket || global.MozWebSocket;
