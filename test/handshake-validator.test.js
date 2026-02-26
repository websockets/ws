'use strict';

const assert = require('assert');
const { createHash } = require('crypto');

const HandshakeValidator = require('../lib/handshake-validator');
const { GUID } = require('../lib/constants');
const WebSocket = require('..');

function computeAccept(key) {
  return createHash('sha1')
    .update(key + GUID)
    .digest('base64');
}

describe('HandshakeValidator', () => {
  const key = 'dGhlIHNhbXBsZSBub25jZQ==';
  const accept = computeAccept(key);

  function makeRes(overrides = {}) {
    return {
      headers: {
        upgrade: 'websocket',
        'sec-websocket-accept': accept,
        ...overrides
      }
    };
  }

  describe('#validate', () => {
    it('accepts a valid handshake with no subprotocol or extensions', () => {
      const v = new HandshakeValidator();
      const { protocol, extensions } = v.validate(
        makeRes(),
        key,
        new Set(),
        null
      );

      assert.strictEqual(protocol, '');
      assert.deepStrictEqual(extensions, {});
    });

    it('throws on missing Upgrade header', () => {
      const v = new HandshakeValidator();

      assert.throws(
        () => v.validate(makeRes({ upgrade: undefined }), key, new Set(), null),
        { message: 'Invalid Upgrade header' }
      );
    });

    it('throws on wrong Upgrade header value', () => {
      const v = new HandshakeValidator();

      assert.throws(
        () => v.validate(makeRes({ upgrade: 'http' }), key, new Set(), null),
        { message: 'Invalid Upgrade header' }
      );
    });

    it('throws on invalid Sec-WebSocket-Accept', () => {
      const v = new HandshakeValidator();

      assert.throws(
        () =>
          v.validate(
            makeRes({ 'sec-websocket-accept': 'wrong' }),
            key,
            new Set(),
            null
          ),
        { message: 'Invalid Sec-WebSocket-Accept header' }
      );
    });

    it('throws if server sends a subprotocol but none was requested', () => {
      const v = new HandshakeValidator();

      assert.throws(
        () =>
          v.validate(
            makeRes({ 'sec-websocket-protocol': 'foo' }),
            key,
            new Set(),
            null
          ),
        { message: 'Server sent a subprotocol but none was requested' }
      );
    });

    it('throws if server sends an invalid subprotocol', () => {
      const v = new HandshakeValidator();

      assert.throws(
        () =>
          v.validate(
            makeRes({ 'sec-websocket-protocol': 'bar' }),
            key,
            new Set(['foo']),
            null
          ),
        { message: 'Server sent an invalid subprotocol' }
      );
    });

    it('throws if server omits subprotocol when one was requested', () => {
      const v = new HandshakeValidator();

      assert.throws(() => v.validate(makeRes(), key, new Set(['foo']), null), {
        message: 'Server sent no subprotocol'
      });
    });

    it('returns the matched subprotocol', () => {
      const v = new HandshakeValidator();
      const { protocol } = v.validate(
        makeRes({ 'sec-websocket-protocol': 'foo' }),
        key,
        new Set(['foo', 'bar']),
        null
      );

      assert.strictEqual(protocol, 'foo');
    });

    it('throws if server sends extensions but none were requested', () => {
      const v = new HandshakeValidator();

      assert.throws(
        () =>
          v.validate(
            makeRes({ 'sec-websocket-extensions': 'permessage-deflate' }),
            key,
            new Set(),
            null
          ),
        { message: /no extension was requested/ }
      );
    });

    it('throws if server indicates an unrequested extension', () => {
      const v = new HandshakeValidator();

      assert.throws(
        () =>
          v.validate(
            makeRes({ 'sec-websocket-extensions': 'foo' }),
            key,
            new Set(),
            {}
          ),
        { message: 'Server indicated an extension that was not requested' }
      );
    });

    it('wraps extension accept errors', () => {
      const v = new HandshakeValidator();
      const fakeDeflate = {
        accept() {
          throw new Error('accept failure');
        }
      };

      assert.throws(
        () =>
          v.validate(
            makeRes({
              'sec-websocket-extensions': 'permessage-deflate'
            }),
            key,
            new Set(),
            fakeDeflate
          ),
        { message: 'Invalid Sec-WebSocket-Extensions header' }
      );
    });

    it('wraps unparseable extensions header', () => {
      const v = new HandshakeValidator();

      assert.throws(
        () =>
          v.validate(
            makeRes({
              'sec-websocket-extensions': 'permessage-deflate; =bad'
            }),
            key,
            new Set(),
            {}
          ),
        { message: 'Invalid Sec-WebSocket-Extensions header' }
      );
    });
  });

  describe('subclassing', () => {
    it('allows overriding validateAcceptKey', () => {
      let called = false;

      class CustomValidator extends HandshakeValidator {
        validateAcceptKey(actual, k) {
          called = true;
          assert.strictEqual(actual, 'custom');
          assert.strictEqual(k, key);
        }
      }

      const v = new CustomValidator();

      v.validate(
        makeRes({ 'sec-websocket-accept': 'custom' }),
        key,
        new Set(),
        null
      );
      assert.ok(called);
    });

    it('allows overriding validateSubprotocol to be lenient', () => {
      class LenientValidator extends HandshakeValidator {
        validateSubprotocol(serverProt, protocolSet) {
          if (serverProt !== undefined) {
            return super.validateSubprotocol(serverProt, protocolSet);
          }

          return '';
        }
      }

      const v = new LenientValidator();
      const { protocol } = v.validate(makeRes(), key, new Set(['foo']), null);

      assert.strictEqual(protocol, '');
    });

    it('allows overriding validateUpgrade', () => {
      class SkipUpgradeValidator extends HandshakeValidator {
        validateUpgrade() {}
      }

      const v = new SkipUpgradeValidator();
      const { protocol } = v.validate(
        makeRes({ upgrade: undefined }),
        key,
        new Set(),
        null
      );

      assert.strictEqual(protocol, '');
    });
  });

  describe('Integration with WebSocket', () => {
    it('uses a custom handshakeValidator subclass', (done) => {
      let called = false;

      class CustomValidator extends HandshakeValidator {
        validateAcceptKey() {
          called = true;
        }
      }

      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
          handshakeValidator: new CustomValidator()
        });

        ws.on('open', () => {
          assert.ok(called);
          ws.close();
        });

        ws.on('close', () => wss.close(done));
      });
    });

    it('aborts when a custom validator rejects', (done) => {
      class RejectingValidator extends HandshakeValidator {
        validateAcceptKey() {
          throw new Error('rejected');
        }
      }

      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
          handshakeValidator: new RejectingValidator()
        });

        ws.on('error', (err) => {
          assert.strictEqual(err.message, 'rejected');
          ws.on('close', () => wss.close(done));
        });
      });
    });
  });
});
