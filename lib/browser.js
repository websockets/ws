/**
 * Browser stub so we don't break bundlers.
 * Don't use the export. Instead, check for global.WebSocket presence.
 */
module.exports = function removed() {
  throw new Error('Usage of require("ws") in browsers has been removed. Please instead ' +
    'attempt to use global.WebSocket first or use process.browser in bundling environments. For example: ' +
    'var WS = global.WebSocket || global.MozWebSocket || require("ws");')
}
