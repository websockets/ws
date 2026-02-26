'use strict';

const assert = require('assert');
const { URL } = require('url');

const HandshakeRequest = require('../lib/handshake-request');
const WebSocket = require('..');

describe('HandshakeRequest', () => {
  function makeOpts(overrides = {}) {
    return {
      protocolVersion: 13,
      maxPayload: 100 * 1024 * 1024,
      headers: {},
      ...overrides
    };
  }

  describe('#parseUrl', () => {
    it('parses a string URL', () => {
      const r = new HandshakeRequest();
      const url = r.parseUrl('ws://example.com/path');

      assert.strictEqual(url.protocol, 'ws:');
      assert.strictEqual(url.hostname, 'example.com');
      assert.strictEqual(url.pathname, '/path');
    });

    it('accepts a URL object', () => {
      const r = new HandshakeRequest();
      const input = new URL('ws://example.com');
      const url = r.parseUrl(input);

      assert.strictEqual(url, input);
    });

    it('normalizes http: to ws:', () => {
      const r = new HandshakeRequest();
      const url = r.parseUrl('http://example.com');

      assert.strictEqual(url.protocol, 'ws:');
    });

    it('normalizes https: to wss:', () => {
      const r = new HandshakeRequest();
      const url = r.parseUrl('https://example.com');

      assert.strictEqual(url.protocol, 'wss:');
    });

    it('throws on invalid URL string', () => {
      const r = new HandshakeRequest();

      assert.throws(() => r.parseUrl('not a url'), {
        name: 'SyntaxError',
        message: 'Invalid URL: not a url'
      });
    });
  });

  describe('#validateUrl', () => {
    it('accepts ws: URLs', () => {
      const r = new HandshakeRequest();

      assert.doesNotThrow(() => r.validateUrl(new URL('ws://example.com')));
    });

    it('accepts wss: URLs', () => {
      const r = new HandshakeRequest();

      assert.doesNotThrow(() => r.validateUrl(new URL('wss://example.com')));
    });

    it('rejects unsupported protocols', () => {
      const r = new HandshakeRequest();

      assert.throws(() => r.validateUrl(new URL('ftp://example.com')), {
        name: 'SyntaxError',
        message: /protocol must be one of/
      });
    });

    it('rejects URLs with fragment identifiers', () => {
      const r = new HandshakeRequest();

      assert.throws(() => r.validateUrl(new URL('ws://example.com#frag')), {
        message: 'The URL contains a fragment identifier'
      });
    });
  });

  describe('#generateKey', () => {
    it('returns a base64-encoded string', () => {
      const r = new HandshakeRequest();
      const key = r.generateKey();

      assert.strictEqual(typeof key, 'string');
      assert.strictEqual(Buffer.from(key, 'base64').length, 16);
    });

    it('returns different values each time', () => {
      const r = new HandshakeRequest();

      assert.notStrictEqual(r.generateKey(), r.generateKey());
    });
  });

  describe('#buildProtocolSet', () => {
    it('returns an empty set for no protocols', () => {
      const r = new HandshakeRequest();
      const set = r.buildProtocolSet([]);

      assert.strictEqual(set.size, 0);
    });

    it('returns a set of valid protocols', () => {
      const r = new HandshakeRequest();
      const set = r.buildProtocolSet(['foo', 'bar']);

      assert.strictEqual(set.size, 2);
      assert.ok(set.has('foo'));
      assert.ok(set.has('bar'));
    });

    it('throws on duplicate protocols', () => {
      const r = new HandshakeRequest();

      assert.throws(() => r.buildProtocolSet(['foo', 'foo']), {
        name: 'SyntaxError',
        message: 'An invalid or duplicated subprotocol was specified'
      });
    });

    it('throws on invalid protocol characters', () => {
      const r = new HandshakeRequest();

      assert.throws(() => r.buildProtocolSet(['foo bar']), {
        name: 'SyntaxError'
      });
    });

    it('throws on non-string protocols', () => {
      const r = new HandshakeRequest();

      assert.throws(() => r.buildProtocolSet([123]), {
        name: 'SyntaxError'
      });
    });
  });

  describe('#build', () => {
    it('returns parsedUrl, key, and protocolSet', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts();

      const result = r.build('ws://example.com/path?q=1', [], opts);

      assert.strictEqual(result.parsedUrl.href, 'ws://example.com/path?q=1');
      assert.strictEqual(typeof result.key, 'string');
      assert.strictEqual(result.protocolSet.size, 0);
    });

    it('returns correct request options', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts();

      const reqOpts = r.build('ws://example.com/path?q=1', [], opts);

      assert.strictEqual(reqOpts.host, 'example.com');
      assert.strictEqual(reqOpts.port, 80);
      assert.strictEqual(reqOpts.path, '/path?q=1');
      assert.strictEqual(reqOpts.defaultPort, 80);
    });

    it('includes WS protocol headers in the headers object', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts();

      const { key, headers } = r.build('ws://example.com', [], opts);

      assert.strictEqual(headers['Connection'], 'Upgrade');
      assert.strictEqual(headers['Upgrade'], 'websocket');
      assert.strictEqual(headers['Sec-WebSocket-Version'], '13');
      assert.strictEqual(headers['Sec-WebSocket-Key'], key);
    });

    it('uses port 443 for wss:', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts();

      const reqOpts = r.build('wss://example.com', [], opts);

      assert.strictEqual(reqOpts.parsedUrl.protocol, 'wss:');
      assert.strictEqual(reqOpts.port, 443);
    });

    it('uses an explicit port when provided', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts();

      const reqOpts = r.build('ws://example.com:9000', [], opts);

      assert.strictEqual(reqOpts.port, '9000');
    });

    it('strips brackets from IPv6 hostnames', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts();

      const reqOpts = r.build('ws://[::1]:8080/path', [], opts);

      assert.strictEqual(reqOpts.host, '::1');
    });

    it('adds the extension offer header', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts();

      const { headers } = r.build(
        'ws://example.com',
        [],
        opts,
        'permessage-deflate'
      );

      assert.strictEqual(
        headers['Sec-WebSocket-Extensions'],
        'permessage-deflate'
      );
    });

    it('omits extension header when offer is empty', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts();

      const { headers } = r.build('ws://example.com', [], opts);

      assert.strictEqual(headers['Sec-WebSocket-Extensions'], undefined);
    });

    it('sets the subprotocol header', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts();

      const { headers, protocolSet } = r.build(
        'ws://example.com',
        ['foo', 'bar'],
        opts
      );

      assert.strictEqual(headers['Sec-WebSocket-Protocol'], 'foo,bar');
      assert.strictEqual(protocolSet.size, 2);
    });

    it('sets the Origin header for version >= 13', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts({ origin: 'http://example.com' });

      const { headers } = r.build('ws://example.com', [], opts);

      assert.strictEqual(headers['Origin'], 'http://example.com');
      assert.strictEqual(headers['Sec-WebSocket-Origin'], undefined);
    });

    it('sets Sec-WebSocket-Origin for version < 13', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts({
        origin: 'http://example.com',
        protocolVersion: 8
      });

      const { headers } = r.build('ws://example.com', [], opts);

      assert.strictEqual(headers['Sec-WebSocket-Origin'], 'http://example.com');
    });

    it('extracts auth from the URL', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts();

      const reqOpts = r.build('ws://user:pass@example.com', [], opts);

      assert.strictEqual(reqOpts.auth, 'user:pass');
    });

    it('extracts auth from opts.auth', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts({ auth: 'foo:bar' });

      const reqOpts = r.build('ws://example.com', [], opts);

      assert.strictEqual(reqOpts.auth, 'foo:bar');
    });

    it('URL auth takes precedence over opts.auth', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts({ auth: 'foo:bar' });

      const reqOpts = r.build('ws://baz:qux@example.com', [], opts);

      assert.strictEqual(reqOpts.auth, 'baz:qux');
    });

    it('maps handshakeTimeout to timeout', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts({ handshakeTimeout: 5000 });

      const reqOpts = r.build('ws://example.com', [], opts);

      assert.strictEqual(reqOpts.timeout, 5000);
    });

    it('does not include auth when URL has no credentials', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts();

      const reqOpts = r.build('ws://example.com', [], opts);

      assert.strictEqual(reqOpts.auth, undefined);
    });

    it('headers is a plain object', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts();

      const { headers } = r.build('ws://example.com', [], opts);

      assert.strictEqual(typeof headers, 'object');
      assert.ok(!Array.isArray(headers));
    });

    it('handles IPC URLs', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts();

      const reqOpts = r.build('ws+unix:///tmp/sock:/path', [], opts);

      assert.strictEqual(reqOpts.socketPath, '/tmp/sock');
      assert.strictEqual(reqOpts.path, '/path');
    });
  });

  describe('object headers (options.headers)', () => {
    it('preserves user-supplied headers', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts({ headers: { 'X-Custom': 'value' } });

      const { headers } = r.build('ws://example.com', [], opts);

      assert.strictEqual(headers['X-Custom'], 'value');
    });

    it('WS protocol headers overwrite user headers with same name', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts({ headers: { Connection: 'keep-alive' } });

      const { headers } = r.build('ws://example.com', [], opts);

      assert.strictEqual(headers['Connection'], 'Upgrade');
    });

    it('handles array header values', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts({
        headers: { 'X-Multi': ['one', 'two'] }
      });

      const { headers } = r.build('ws://example.com', [], opts);

      assert.deepStrictEqual(headers['X-Multi'], ['one', 'two']);
    });

    it('coerces non-string values to strings', () => {
      const r = new HandshakeRequest();
      const opts = makeOpts({ headers: { 'X-Num': 42 } });

      const { headers } = r.build('ws://example.com', [], opts);

      assert.strictEqual(headers['X-Num'], 42);
    });
  });

  describe('subclassing', () => {
    it('allows overriding generateKey', () => {
      class FixedKeyRequest extends HandshakeRequest {
        generateKey() {
          return 'fixed-key-for-testing==';
        }
      }

      const r = new FixedKeyRequest();
      const opts = makeOpts();

      const { key, headers } = r.build('ws://example.com', [], opts);

      assert.strictEqual(key, 'fixed-key-for-testing==');
      assert.strictEqual(
        headers['Sec-WebSocket-Key'],
        'fixed-key-for-testing=='
      );
    });

    it('allows overriding parseUrl', () => {
      class RewritingRequest extends HandshakeRequest {
        parseUrl(address) {
          return super.parseUrl(address.replace('internal:', 'ws:'));
        }
      }

      const r = new RewritingRequest();
      const opts = makeOpts();

      const { parsedUrl } = r.build('internal://example.com', [], opts);

      assert.strictEqual(parsedUrl.href, 'ws://example.com/');
    });

    it('allows overriding validateUrl to accept custom protocols', () => {
      class LenientRequest extends HandshakeRequest {
        validateUrl() {}
      }

      const r = new LenientRequest();
      const opts = makeOpts();

      assert.doesNotThrow(() => r.build('ftp://example.com', [], opts));
    });
  });

  describe('#initRedirectOptions', () => {
    it('lowercases header keys', () => {
      const r = new HandshakeRequest();
      const result = r.initRedirectOptions({
        headers: {
          'Content-Type': 'text/plain',
          Authorization: 'Bearer token'
        }
      });

      assert.deepStrictEqual(result, {
        headers: {
          'content-type': 'text/plain',
          authorization: 'Bearer token'
        }
      });
    });

    it('returns an empty object when headers is undefined', () => {
      const r = new HandshakeRequest();
      const result = r.initRedirectOptions({});
      assert.deepStrictEqual(result, { headers: {} });
    });

    it('returns a new object', () => {
      const r = new HandshakeRequest();
      const original = { headers: { 'X-Foo': 'bar' } };
      const result = r.initRedirectOptions(original);

      assert.notStrictEqual(result, original);
    });
  });

  describe('#stripRedirectAuth', () => {
    it('deletes authorization and cookie headers', () => {
      const r = new HandshakeRequest();
      const headers = {
        authorization: 'Basic abc',
        cookie: 'session=xyz',
        host: 'example.com',
        'x-custom': 'value'
      };

      r.stripRedirectAuth({ headers }, true);

      assert.strictEqual(headers.authorization, undefined);
      assert.strictEqual(headers.cookie, undefined);
      assert.strictEqual(headers.host, 'example.com');
      assert.strictEqual(headers['x-custom'], 'value');
    });

    it('also deletes host when not same host', () => {
      const r = new HandshakeRequest();
      const headers = {
        authorization: 'Basic abc',
        cookie: 'session=xyz',
        host: 'example.com',
        'x-custom': 'value'
      };

      r.stripRedirectAuth({ headers }, false);

      assert.strictEqual(headers.authorization, undefined);
      assert.strictEqual(headers.cookie, undefined);
      assert.strictEqual(headers.host, undefined);
      assert.strictEqual(headers['x-custom'], 'value');
    });

    it('does not throw when headers are missing', () => {
      const r = new HandshakeRequest();
      const headers = { 'x-custom': 'value' };

      assert.doesNotThrow(() => r.stripRedirectAuth({ headers }, false));
    });
  });

  describe('#injectAuthHeader', () => {
    it('sets the authorization header from auth string', () => {
      const r = new HandshakeRequest();
      const headers = {};

      r.injectAuthHeader(headers, 'user:pass');

      assert.strictEqual(
        headers.authorization,
        'Basic ' + Buffer.from('user:pass').toString('base64')
      );
    });

    it('does not overwrite an existing authorization header', () => {
      const r = new HandshakeRequest();
      const headers = { authorization: 'Bearer existing' };

      r.injectAuthHeader(headers, 'user:pass');

      assert.strictEqual(headers.authorization, 'Bearer existing');
    });

    it('does nothing when auth is undefined', () => {
      const r = new HandshakeRequest();
      const headers = {};

      r.injectAuthHeader(headers, undefined);

      assert.strictEqual(headers.authorization, undefined);
    });

    it('does nothing when auth is empty string', () => {
      const r = new HandshakeRequest();
      const headers = {};

      r.injectAuthHeader(headers, '');

      assert.strictEqual(headers.authorization, undefined);
    });
  });

  describe('Integration with WebSocket', () => {
    it('uses a custom HandshakeRequest', (done) => {
      let called = false;

      class CustomRequest extends HandshakeRequest {
        generateKey() {
          called = true;
          return super.generateKey();
        }
      }

      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
          handshakeRequest: new CustomRequest()
        });

        ws.on('open', () => {
          assert.ok(called);
          ws.close();
        });

        ws.on('close', () => wss.close(done));
      });
    });
  });
});
