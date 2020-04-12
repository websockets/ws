'use strict';

const { Duplex } = require('stream');

function once(cb) {
  let called = false;
  return (...args) => {
    if (called) return;
    called = true;
    cb(...args);
  };
}

/**
 * Wraps a `WebSocket` in a duplex stream.
 *
 * @param {WebSocket} ws The `WebSocket` to wrap
 * @param {Object} options The options for the `Duplex` constructor
 * @return {stream.Duplex} The duplex stream
 * @public
 */
function createWebSocketStream(ws, options) {
  const duplex = new Duplex({
    ...options,
    autoDestroy: true,
    emitClose: true,
    objectMode: false,
    writableObjectMode: false
  });

  function destroy(err) {
    duplex.destroy(err);
  }

  ws.on('message', function message(msg) {
    if (!duplex.push(msg)) {
      ws._socket.pause();
    }
  });

  ws.once('error', destroy);

  ws.once('close', function close() {
    duplex.push(null);
  });

  duplex._destroy = function(err, callback) {
    callback = once(callback);

    ws.off('error', destroy);
    ws.once('error', callback);

    if (ws.readyState === ws.CLOSED) {
      callback(err);
      return;
    }

    ws.once('close', function close() {
      callback(err);
    });

    ws.terminate();
  };

  duplex._final = function(callback) {
    callback = once(callback);

    ws.off('error', destroy);
    ws.once('error', callback);

    if (ws.readyState === ws.CONNECTING) {
      ws.once('open', function open() {
        duplex._final(callback);
      });
      return;
    }

    // If the value of the `_socket` property is `null` it means that `ws` is a
    // client websocket and the handshake failed. In fact, when this happens, a
    // socket is never assigned to the websocket. Wait for the `'error'` event
    // that will be emitted by the websocket.
    if (ws._socket === null) return;

    if (ws._socket._writableState.finished) {
      callback();
    } else {
      ws._socket.once('finish', callback);
      ws.close();
    }
  };

  duplex._read = function() {
    if (ws.readyState === ws.OPEN) {
      ws._socket.resume();
    }
  };

  duplex._write = function(chunk, encoding, callback) {
    if (ws.readyState === ws.CONNECTING) {
      ws.once('open', function open() {
        duplex._write(chunk, encoding, callback);
      });
      return;
    }

    ws.send(chunk, callback);
  };

  return duplex;
}

module.exports = createWebSocketStream;
