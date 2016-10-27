'use strict';

const assert = require('assert');

const WebSocket = require('..');

describe('WebSocket', function () {
  it('communicates successfully with echo service', function (done) {
    const ws = new WebSocket('ws://echo.websocket.org/', {
      origin: 'http://websocket.org',
      protocolVersion: 13
    });
    const str = Date.now().toString();

    let dataReceived = false;

    ws.on('open', () => ws.send(str, { mask: true }));
    ws.on('close', () => {
      assert.ok(dataReceived);
      done();
    });
    ws.on('message', (data) => {
      dataReceived = true;
      assert.strictEqual(data, str);
      ws.close();
    });
  });
});
