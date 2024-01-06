'use strict';

const assert = require('assert');

const WebSocket = require('..');

describe('WebSocket', () => {
  it('communicates successfully with echo service (ws)', (done) => {
    const ws = new WebSocket('ws://websocket-echo.com/', {
      protocolVersion: 13
    });

    let dataReceived = false;

    ws.on('open', () => {
      ws.send('hello');
    });

    ws.on('close', () => {
      assert.ok(dataReceived);
      done();
    });

    ws.on('message', (message, isBinary) => {
      dataReceived = true;
      assert.ok(!isBinary);
      assert.strictEqual(message.toString(), 'hello');
      ws.close();
    });
  });

  it('communicates successfully with echo service (wss)', (done) => {
    const ws = new WebSocket('wss://websocket-echo.com/', {
      protocolVersion: 13
    });

    let dataReceived = false;

    ws.on('open', () => {
      ws.send('hello');
    });

    ws.on('close', () => {
      assert.ok(dataReceived);
      done();
    });

    ws.on('message', (message, isBinary) => {
      dataReceived = true;
      assert.ok(!isBinary);
      assert.strictEqual(message.toString(), 'hello');
      ws.close();
    });
  });
});
