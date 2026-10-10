'use strict';

const assert = require('assert');
const WebSocket = require('..');

describe('EventTarget nullable listeners', () => {
  for (const type of ['open', 'message', 'close', 'error']) {
    it(`ignores a null ${type} listener`, () => {
      const ws = new WebSocket(null, undefined, {});
      ws.addEventListener(type, null);
      assert.strictEqual(ws.listenerCount(type), 0);
      ws.removeEventListener(type, null);
    });

    it(`ignores an undefined ${type} listener`, () => {
      const ws = new WebSocket(null, undefined, {});
      ws.addEventListener(type);
      assert.strictEqual(ws.listenerCount(type), 0);
      ws.removeEventListener(type);
    });
  }

  it('preserves function and object listeners when ignoring null callbacks', () => {
    const ws = new WebSocket(null, undefined, {});
    const calls = [];
    const listener = {
      handleEvent(event) {
        assert.strictEqual(this, listener);
        assert.strictEqual(event.target, ws);
        calls.push('object');
      }
    };
    function onOpen(event) {
      assert.strictEqual(this, ws);
      assert.strictEqual(event.target, ws);
      calls.push('function');
    }

    ws.addEventListener('open', onOpen);
    ws.addEventListener('open', null);
    ws.addEventListener('open', listener, { once: true });
    ws.addEventListener('open', undefined, { once: true });
    ws.emit('open');
    ws.emit('open');
    assert.deepStrictEqual(calls, ['function', 'object', 'function']);
    ws.removeEventListener('open', onOpen);
    assert.strictEqual(ws.listenerCount('open'), 0);
  });
});
