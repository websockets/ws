'use strict';

const assert = require('assert');
const WebSocket = require('../');

describe('WebSocket', function () {
  it('communicates successfully with echo service', function (done) {
    var ws = new WebSocket('ws://echo.websocket.org/', {
      origin: 'http://websocket.org',
      protocolVersion: 13
    });
    var str = Date.now().toString();
    var dataReceived = false;
    ws.on('open', function () {
      ws.send(str, {mask: true});
    });
    ws.on('close', function () {
      assert.equal(true, dataReceived);
      done();
    });
    ws.on('message', function (data, flags) {
      assert.equal(str, data);
      ws.terminate();
      dataReceived = true;
    });
  });
});
