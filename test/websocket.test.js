/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^ws$" }] */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const tls = require('tls');
const fs = require('fs');
const { URL } = require('url');

const WebSocket = require('..');
const { GUID, NOOP } = require('../lib/constants');

class CustomAgent extends http.Agent {
  addRequest() {}
}

describe('WebSocket', () => {
  describe('#ctor', () => {
    it('throws an error when using an invalid url', () => {
      assert.throws(
        () => new WebSocket('ws+unix:'),
        /^Error: Invalid URL: ws\+unix:$/
      );
    });

    it('accepts `url.URL` objects as url', (done) => {
      const agent = new CustomAgent();

      agent.addRequest = (req, opts) => {
        assert.strictEqual(opts.host, '::1');
        assert.strictEqual(req.path, '/');
        done();
      };

      const ws = new WebSocket(new URL('ws://[::1]'), { agent });
    });

    describe('options', () => {
      it('accepts the `options` object as 3rd argument', () => {
        const agent = new CustomAgent();
        let count = 0;
        let ws;

        agent.addRequest = () => count++;

        ws = new WebSocket('ws://localhost', undefined, { agent });
        ws = new WebSocket('ws://localhost', null, { agent });
        ws = new WebSocket('ws://localhost', [], { agent });

        assert.strictEqual(count, 3);
      });

      it('accepts the `maxPayload` option', (done) => {
        const maxPayload = 20480;
        const wss = new WebSocket.Server(
          {
            perMessageDeflate: true,
            port: 0
          },
          () => {
            const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
              perMessageDeflate: true,
              maxPayload
            });

            ws.on('open', () => {
              assert.strictEqual(ws._receiver._maxPayload, maxPayload);
              assert.strictEqual(
                ws._receiver._extensions['permessage-deflate']._maxPayload,
                maxPayload
              );
              wss.close(done);
            });
          }
        );
      });

      it('throws an error when using an invalid `protocolVersion`', () => {
        const options = { agent: new CustomAgent(), protocolVersion: 1000 };

        assert.throws(
          () => new WebSocket('ws://localhost', options),
          /^RangeError: Unsupported protocol version: 1000 \(supported versions: 8, 13\)$/
        );
      });
    });
  });

  describe('Constants', () => {
    const readyStates = {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3
    };

    Object.keys(readyStates).forEach((state) => {
      describe(`\`${state}\``, () => {
        it('is enumerable property of class', () => {
          const descriptor = Object.getOwnPropertyDescriptor(WebSocket, state);

          assert.deepStrictEqual(descriptor, {
            configurable: false,
            enumerable: true,
            value: readyStates[state],
            writable: false
          });
        });

        it('is enumerable property of prototype', () => {
          const descriptor = Object.getOwnPropertyDescriptor(
            WebSocket.prototype,
            state
          );

          assert.deepStrictEqual(descriptor, {
            configurable: false,
            enumerable: true,
            value: readyStates[state],
            writable: false
          });
        });
      });
    });
  });

  describe('Attributes', () => {
    describe('`binaryType`', () => {
      it('is enumerable and configurable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(
          WebSocket.prototype,
          'binaryType'
        );

        assert.strictEqual(descriptor.configurable, true);
        assert.strictEqual(descriptor.enumerable, true);
        assert.ok(descriptor.get !== undefined);
        assert.ok(descriptor.set !== undefined);
      });

      it("defaults to 'nodebuffer'", () => {
        const ws = new WebSocket('ws://localhost', {
          agent: new CustomAgent()
        });

        assert.strictEqual(ws.binaryType, 'nodebuffer');
      });

      it("can be changed to 'arraybuffer' or 'fragments'", () => {
        const ws = new WebSocket('ws://localhost', {
          agent: new CustomAgent()
        });

        ws.binaryType = 'arraybuffer';
        assert.strictEqual(ws.binaryType, 'arraybuffer');

        ws.binaryType = 'foo';
        assert.strictEqual(ws.binaryType, 'arraybuffer');

        ws.binaryType = 'fragments';
        assert.strictEqual(ws.binaryType, 'fragments');

        ws.binaryType = '';
        assert.strictEqual(ws.binaryType, 'fragments');

        ws.binaryType = 'nodebuffer';
        assert.strictEqual(ws.binaryType, 'nodebuffer');
      });
    });

    describe('`bufferedAmount`', () => {
      it('is enumerable and configurable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(
          WebSocket.prototype,
          'bufferedAmount'
        );

        assert.strictEqual(descriptor.configurable, true);
        assert.strictEqual(descriptor.enumerable, true);
        assert.ok(descriptor.get !== undefined);
        assert.ok(descriptor.set === undefined);
      });

      it('defaults to zero', () => {
        const ws = new WebSocket('ws://localhost', {
          agent: new CustomAgent()
        });

        assert.strictEqual(ws.bufferedAmount, 0);
      });

      it('defaults to zero upon "open"', (done) => {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

          ws.onopen = () => {
            assert.strictEqual(ws.bufferedAmount, 0);
            wss.close(done);
          };
        });
      });

      it('takes into account the data in the sender queue', (done) => {
        const wss = new WebSocket.Server(
          {
            perMessageDeflate: true,
            port: 0
          },
          () => {
            const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
              perMessageDeflate: { threshold: 0 }
            });

            ws.on('open', () => {
              ws.send('foo');

              assert.strictEqual(ws.bufferedAmount, 3);

              ws.send('bar', (err) => {
                assert.ifError(err);
                assert.strictEqual(ws.bufferedAmount, 0);
                wss.close(done);
              });

              assert.strictEqual(ws.bufferedAmount, 6);
            });
          }
        );
      });

      it('takes into account the data in the socket queue', (done) => {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
        });

        wss.on('connection', (ws) => {
          const data = Buffer.alloc(1024, 61);

          while (ws.bufferedAmount === 0) {
            ws.send(data);
          }

          assert.ok(ws.bufferedAmount > 0);
          assert.strictEqual(
            ws.bufferedAmount,
            ws._socket._writableState.length
          );

          ws.on('close', () => wss.close(done));
          ws.close();
        });
      });
    });

    describe('`extensions`', () => {
      it('is enumerable and configurable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(
          WebSocket.prototype,
          'bufferedAmount'
        );

        assert.strictEqual(descriptor.configurable, true);
        assert.strictEqual(descriptor.enumerable, true);
        assert.ok(descriptor.get !== undefined);
        assert.ok(descriptor.set === undefined);
      });

      it('exposes the negotiated extensions names (1/2)', (done) => {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

          assert.strictEqual(ws.extensions, '');

          ws.on('open', () => {
            assert.strictEqual(ws.extensions, '');
            ws.on('close', () => wss.close(done));
          });
        });

        wss.on('connection', (ws) => {
          assert.strictEqual(ws.extensions, '');
          ws.close();
        });
      });

      it('exposes the negotiated extensions names (2/2)', (done) => {
        const wss = new WebSocket.Server(
          {
            perMessageDeflate: true,
            port: 0
          },
          () => {
            const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

            assert.strictEqual(ws.extensions, '');

            ws.on('open', () => {
              assert.strictEqual(ws.extensions, 'permessage-deflate');
              ws.on('close', () => wss.close(done));
            });
          }
        );

        wss.on('connection', (ws) => {
          assert.strictEqual(ws.extensions, 'permessage-deflate');
          ws.close();
        });
      });
    });

    describe('`protocol`', () => {
      it('is enumerable and configurable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(
          WebSocket.prototype,
          'protocol'
        );

        assert.strictEqual(descriptor.configurable, true);
        assert.strictEqual(descriptor.enumerable, true);
        assert.ok(descriptor.get !== undefined);
        assert.ok(descriptor.set === undefined);
      });

      it('exposes the subprotocol selected by the server', (done) => {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const port = wss.address().port;
          const ws = new WebSocket(`ws://localhost:${port}`, 'foo');

          assert.strictEqual(ws.extensions, '');

          ws.on('open', () => {
            assert.strictEqual(ws.protocol, 'foo');
            ws.on('close', () => wss.close(done));
          });
        });

        wss.on('connection', (ws) => {
          assert.strictEqual(ws.protocol, 'foo');
          ws.close();
        });
      });
    });

    describe('`readyState`', () => {
      it('is enumerable and configurable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(
          WebSocket.prototype,
          'readyState'
        );

        assert.strictEqual(descriptor.configurable, true);
        assert.strictEqual(descriptor.enumerable, true);
        assert.ok(descriptor.get !== undefined);
        assert.ok(descriptor.set === undefined);
      });

      it('defaults to `CONNECTING`', () => {
        const ws = new WebSocket('ws://localhost', {
          agent: new CustomAgent()
        });

        assert.strictEqual(ws.readyState, WebSocket.CONNECTING);
      });

      it('is set to `OPEN` once connection is established', (done) => {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

          ws.on('open', () => {
            assert.strictEqual(ws.readyState, WebSocket.OPEN);
            ws.close();
          });

          ws.on('close', () => wss.close(done));
        });
      });

      it('is set to `CLOSED` once connection is closed', (done) => {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

          ws.on('close', () => {
            assert.strictEqual(ws.readyState, WebSocket.CLOSED);
            wss.close(done);
          });

          ws.on('open', () => ws.close(1001));
        });
      });

      it('is set to `CLOSED` once connection is terminated', (done) => {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

          ws.on('close', () => {
            assert.strictEqual(ws.readyState, WebSocket.CLOSED);
            wss.close(done);
          });

          ws.on('open', () => ws.terminate());
        });
      });
    });

    describe('`url`', () => {
      it('is enumerable and configurable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(
          WebSocket.prototype,
          'url'
        );

        assert.strictEqual(descriptor.configurable, true);
        assert.strictEqual(descriptor.enumerable, true);
        assert.ok(descriptor.get !== undefined);
        assert.ok(descriptor.set === undefined);
      });

      it('exposes the server url', () => {
        const url = 'ws://localhost';
        const ws = new WebSocket(url, { agent: new CustomAgent() });

        assert.strictEqual(ws.url, url);
      });
    });
  });

  describe('Events', () => {
    it("emits an 'error' event if an error occurs", (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('error', (err) => {
          assert.ok(err instanceof RangeError);
          assert.strictEqual(
            err.message,
            'Invalid WebSocket frame: invalid opcode 5'
          );

          ws.on('close', (code, reason) => {
            assert.strictEqual(code, 1002);
            assert.strictEqual(reason, '');
            wss.close(done);
          });
        });
      });

      wss.on('connection', (ws) => {
        ws._socket.write(Buffer.from([0x85, 0x00]));
      });
    });

    it('does not re-emit `net.Socket` errors', (done) => {
      const codes = ['EPIPE', 'ECONNABORTED', 'ECANCELED', 'ECONNRESET'];
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          ws._socket.on('error', (err) => {
            assert.ok(err instanceof Error);
            assert.ok(codes.includes(err.code), `Unexpected code: ${err.code}`);
            ws.on('close', (code, message) => {
              assert.strictEqual(message, '');
              assert.strictEqual(code, 1006);
              wss.close(done);
            });
          });

          for (const client of wss.clients) client.terminate();
          ws.send('foo');
          ws.send('bar');
        });
      });
    });

    it("emits an 'upgrade' event", (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
        ws.on('upgrade', (res) => {
          assert.ok(res instanceof http.IncomingMessage);
          wss.close(done);
        });
      });
    });

    it("emits a 'ping' event", (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
        ws.on('ping', () => wss.close(done));
      });

      wss.on('connection', (ws) => ws.ping());
    });

    it("emits a 'pong' event", (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
        ws.on('pong', () => wss.close(done));
      });

      wss.on('connection', (ws) => ws.pong());
    });
  });

  describe('Connection establishing', () => {
    const server = http.createServer();

    beforeEach((done) => server.listen(0, done));
    afterEach((done) => server.close(done));

    it('fails if the Sec-WebSocket-Accept header is invalid', (done) => {
      server.once('upgrade', (req, socket) => {
        socket.on('end', socket.end);
        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Accept: CxYS6+NgJSBG74mdgLvGscRvpns=\r\n' +
            '\r\n'
        );
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);

      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Invalid Sec-WebSocket-Accept header');
        done();
      });
    });

    it('close event is raised when server closes connection', (done) => {
      server.once('upgrade', (req, socket) => {
        const key = crypto
          .createHash('sha1')
          .update(req.headers['sec-websocket-key'] + GUID)
          .digest('base64');

        socket.end(
          'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${key}\r\n` +
            '\r\n'
        );
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);

      ws.on('close', (code, reason) => {
        assert.strictEqual(code, 1006);
        assert.strictEqual(reason, '');
        done();
      });
    });

    it('error is emitted if server aborts connection', (done) => {
      server.once('upgrade', (req, socket) => {
        socket.end(
          `HTTP/1.1 401 ${http.STATUS_CODES[401]}\r\n` +
            'Connection: close\r\n' +
            'Content-type: text/html\r\n' +
            `Content-Length: ${http.STATUS_CODES[401].length}\r\n` +
            '\r\n'
        );
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Unexpected server response: 401');
        done();
      });
    });

    it('unexpected response can be read when sent by server', (done) => {
      server.once('upgrade', (req, socket) => {
        socket.end(
          `HTTP/1.1 401 ${http.STATUS_CODES[401]}\r\n` +
            'Connection: close\r\n' +
            'Content-type: text/html\r\n' +
            'Content-Length: 3\r\n' +
            '\r\n' +
            'foo'
        );
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', () => done(new Error("Unexpected 'error' event")));
      ws.on('unexpected-response', (req, res) => {
        assert.strictEqual(res.statusCode, 401);

        let data = '';

        res.on('data', (v) => {
          data += v;
        });

        res.on('end', () => {
          assert.strictEqual(data, 'foo');
          done();
        });
      });
    });

    it('request can be aborted when unexpected response is sent by server', (done) => {
      server.once('upgrade', (req, socket) => {
        socket.end(
          `HTTP/1.1 401 ${http.STATUS_CODES[401]}\r\n` +
            'Connection: close\r\n' +
            'Content-type: text/html\r\n' +
            'Content-Length: 3\r\n' +
            '\r\n' +
            'foo'
        );
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', () => done(new Error("Unexpected 'error' event")));
      ws.on('unexpected-response', (req, res) => {
        assert.strictEqual(res.statusCode, 401);

        res.on('end', done);
        req.abort();
      });
    });

    it('fails if the opening handshake timeout expires', (done) => {
      server.once('upgrade', (req, socket) => socket.on('end', socket.end));

      const port = server.address().port;
      const ws = new WebSocket(`ws://localhost:${port}`, null, {
        handshakeTimeout: 100
      });

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Opening handshake has timed out');
        done();
      });
    });

    it('fails if the Sec-WebSocket-Extensions response header is invalid', (done) => {
      server.once('upgrade', (req, socket) => {
        const key = crypto
          .createHash('sha1')
          .update(req.headers['sec-websocket-key'] + GUID)
          .digest('base64');

        socket.end(
          'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${key}\r\n` +
            'Sec-WebSocket-Extensions: foo;=\r\n' +
            '\r\n'
        );
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'Invalid Sec-WebSocket-Extensions header'
        );
        ws.on('close', () => done());
      });
    });

    it('fails if server sends a subprotocol when none was requested', (done) => {
      const wss = new WebSocket.Server({ server });

      wss.on('headers', (headers) => {
        headers.push('Sec-WebSocket-Protocol: foo');
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'Server sent a subprotocol but none was requested'
        );
        ws.on('close', () => wss.close(done));
      });
    });

    it('fails if server sends an invalid subprotocol', (done) => {
      const wss = new WebSocket.Server({
        handleProtocols: () => 'baz',
        server
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`, [
        'foo',
        'bar'
      ]);

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Server sent an invalid subprotocol');
        ws.on('close', () => wss.close(done));
      });
    });

    it('fails if server sends no subprotocol', (done) => {
      const wss = new WebSocket.Server({
        handleProtocols() {},
        server
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`, [
        'foo',
        'bar'
      ]);

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Server sent no subprotocol');
        ws.on('close', () => wss.close(done));
      });
    });

    it('does not follow redirects by default', (done) => {
      server.once('upgrade', (req, socket) => {
        socket.end(
          'HTTP/1.1 301 Moved Permanently\r\n' +
            'Location: ws://localhost:8080\r\n' +
            '\r\n'
        );
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Unexpected server response: 301');
        assert.strictEqual(ws._redirects, 0);
        ws.on('close', () => done());
      });
    });

    it('honors the `followRedirects` option', (done) => {
      const wss = new WebSocket.Server({ noServer: true, path: '/foo' });

      server.once('upgrade', (req, socket) => {
        socket.end('HTTP/1.1 302 Found\r\nLocation: /foo\r\n\r\n');
        server.once('upgrade', (req, socket, head) => {
          wss.handleUpgrade(req, socket, head, NOOP);
        });
      });

      const port = server.address().port;
      const ws = new WebSocket(`ws://localhost:${port}`, {
        followRedirects: true
      });

      ws.on('open', () => {
        assert.strictEqual(ws.url, `ws://localhost:${port}/foo`);
        assert.strictEqual(ws._redirects, 1);
        ws.on('close', () => done());
        ws.close();
      });
    });

    it('honors the `maxRedirects` option', (done) => {
      const onUpgrade = (req, socket) => {
        socket.end('HTTP/1.1 302 Found\r\nLocation: /\r\n\r\n');
      };

      server.on('upgrade', onUpgrade);

      const ws = new WebSocket(`ws://localhost:${server.address().port}`, {
        followRedirects: true,
        maxRedirects: 1
      });

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Maximum redirects exceeded');
        assert.strictEqual(ws._redirects, 2);

        server.removeListener('upgrade', onUpgrade);
        ws.on('close', () => done());
      });
    });
  });

  describe('Connection with query string', () => {
    it('connects when pathname is not null', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss.address().port;
        const ws = new WebSocket(`ws://localhost:${port}/?token=qwerty`);

        ws.on('open', () => wss.close(done));
      });
    });

    it('connects when pathname is null', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss.address().port;
        const ws = new WebSocket(`ws://localhost:${port}?token=qwerty`);

        ws.on('open', () => wss.close(done));
      });
    });
  });

  describe('#ping', () => {
    it('throws an error if `readyState` is `CONNECTING`', () => {
      const ws = new WebSocket('ws://localhost', {
        lookup() {}
      });

      assert.throws(
        () => ws.ping(),
        /^Error: WebSocket is not open: readyState 0 \(CONNECTING\)$/
      );

      assert.throws(
        () => ws.ping(NOOP),
        /^Error: WebSocket is not open: readyState 0 \(CONNECTING\)$/
      );
    });

    it('increases `bufferedAmount` if `readyState` is 2 or 3', (done) => {
      const ws = new WebSocket('ws://localhost', {
        lookup() {}
      });

      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'WebSocket was closed before the connection was established'
        );

        assert.strictEqual(ws.readyState, WebSocket.CLOSING);
        assert.strictEqual(ws.bufferedAmount, 0);

        ws.ping('hi');
        assert.strictEqual(ws.bufferedAmount, 2);

        ws.ping();
        assert.strictEqual(ws.bufferedAmount, 2);

        ws.on('close', () => {
          assert.strictEqual(ws.readyState, WebSocket.CLOSED);

          ws.ping('hi');
          assert.strictEqual(ws.bufferedAmount, 4);

          ws.ping();
          assert.strictEqual(ws.bufferedAmount, 4);

          done();
        });
      });

      ws.close();
    });

    it('calls the callback w/ an error if `readyState` is 2 or 3', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
      });

      wss.on('connection', (ws) => {
        ws.close();

        assert.strictEqual(ws.bufferedAmount, 0);

        ws.ping('hi', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(
            err.message,
            'WebSocket is not open: readyState 2 (CLOSING)'
          );
          assert.strictEqual(ws.bufferedAmount, 2);

          ws.on('close', () => {
            ws.ping((err) => {
              assert.ok(err instanceof Error);
              assert.strictEqual(
                err.message,
                'WebSocket is not open: readyState 3 (CLOSED)'
              );
              assert.strictEqual(ws.bufferedAmount, 2);

              wss.close(done);
            });
          });
        });
      });
    });

    it('can send a ping with no data', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          ws.ping(() => ws.ping());
        });
      });

      wss.on('connection', (ws) => {
        let pings = 0;
        ws.on('ping', (data) => {
          assert.ok(Buffer.isBuffer(data));
          assert.strictEqual(data.length, 0);
          if (++pings === 2) wss.close(done);
        });
      });
    });

    it('can send a ping with data', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          ws.ping('hi', () => ws.ping('hi', true));
        });
      });

      wss.on('connection', (ws) => {
        let pings = 0;
        ws.on('ping', (message) => {
          assert.strictEqual(message.toString(), 'hi');
          if (++pings === 2) wss.close(done);
        });
      });
    });

    it('can send numbers as ping payload', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => ws.ping(0));
      });

      wss.on('connection', (ws) => {
        ws.on('ping', (message) => {
          assert.strictEqual(message.toString(), '0');
          wss.close(done);
        });
      });
    });

    it('throws an error if the data size is greater than 125 bytes', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          assert.throws(
            () => ws.ping(Buffer.alloc(126)),
            /^RangeError: The data size must not be greater than 125 bytes$/
          );

          wss.close(done);
        });
      });
    });
  });

  describe('#pong', () => {
    it('throws an error if `readyState` is `CONNECTING`', () => {
      const ws = new WebSocket('ws://localhost', {
        lookup() {}
      });

      assert.throws(
        () => ws.pong(),
        /^Error: WebSocket is not open: readyState 0 \(CONNECTING\)$/
      );

      assert.throws(
        () => ws.pong(NOOP),
        /^Error: WebSocket is not open: readyState 0 \(CONNECTING\)$/
      );
    });

    it('increases `bufferedAmount` if `readyState` is 2 or 3', (done) => {
      const ws = new WebSocket('ws://localhost', {
        lookup() {}
      });

      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'WebSocket was closed before the connection was established'
        );

        assert.strictEqual(ws.readyState, WebSocket.CLOSING);
        assert.strictEqual(ws.bufferedAmount, 0);

        ws.pong('hi');
        assert.strictEqual(ws.bufferedAmount, 2);

        ws.pong();
        assert.strictEqual(ws.bufferedAmount, 2);

        ws.on('close', () => {
          assert.strictEqual(ws.readyState, WebSocket.CLOSED);

          ws.pong('hi');
          assert.strictEqual(ws.bufferedAmount, 4);

          ws.pong();
          assert.strictEqual(ws.bufferedAmount, 4);

          done();
        });
      });

      ws.close();
    });

    it('calls the callback w/ an error if `readyState` is 2 or 3', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
      });

      wss.on('connection', (ws) => {
        ws.close();

        assert.strictEqual(ws.bufferedAmount, 0);

        ws.pong('hi', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(
            err.message,
            'WebSocket is not open: readyState 2 (CLOSING)'
          );
          assert.strictEqual(ws.bufferedAmount, 2);

          ws.on('close', () => {
            ws.pong((err) => {
              assert.ok(err instanceof Error);
              assert.strictEqual(
                err.message,
                'WebSocket is not open: readyState 3 (CLOSED)'
              );
              assert.strictEqual(ws.bufferedAmount, 2);

              wss.close(done);
            });
          });
        });
      });
    });

    it('can send a pong with no data', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          ws.pong(() => ws.pong());
        });
      });

      wss.on('connection', (ws) => {
        let pongs = 0;
        ws.on('pong', (data) => {
          assert.ok(Buffer.isBuffer(data));
          assert.strictEqual(data.length, 0);
          if (++pongs === 2) wss.close(done);
        });
      });
    });

    it('can send a pong with data', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          ws.pong('hi', () => ws.pong('hi', true));
        });
      });

      wss.on('connection', (ws) => {
        let pongs = 0;
        ws.on('pong', (message) => {
          assert.strictEqual(message.toString(), 'hi');
          if (++pongs === 2) wss.close(done);
        });
      });
    });

    it('can send numbers as pong payload', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => ws.pong(0));
      });

      wss.on('connection', (ws) => {
        ws.on('pong', (message) => {
          assert.strictEqual(message.toString(), '0');
          wss.close(done);
        });
      });
    });

    it('throws an error if the data size is greater than 125 bytes', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          assert.throws(
            () => ws.pong(Buffer.alloc(126)),
            /^RangeError: The data size must not be greater than 125 bytes$/
          );

          wss.close(done);
        });
      });
    });
  });

  describe('#send', () => {
    it('throws an error if `readyState` is `CONNECTING`', () => {
      const ws = new WebSocket('ws://localhost', {
        lookup() {}
      });

      assert.throws(
        () => ws.send('hi'),
        /^Error: WebSocket is not open: readyState 0 \(CONNECTING\)$/
      );

      assert.throws(
        () => ws.send('hi', NOOP),
        /^Error: WebSocket is not open: readyState 0 \(CONNECTING\)$/
      );
    });

    it('increases `bufferedAmount` if `readyState` is 2 or 3', (done) => {
      const ws = new WebSocket('ws://localhost', {
        lookup() {}
      });

      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'WebSocket was closed before the connection was established'
        );

        assert.strictEqual(ws.readyState, WebSocket.CLOSING);
        assert.strictEqual(ws.bufferedAmount, 0);

        ws.send('hi');
        assert.strictEqual(ws.bufferedAmount, 2);

        ws.send();
        assert.strictEqual(ws.bufferedAmount, 2);

        ws.on('close', () => {
          assert.strictEqual(ws.readyState, WebSocket.CLOSED);

          ws.send('hi');
          assert.strictEqual(ws.bufferedAmount, 4);

          ws.send();
          assert.strictEqual(ws.bufferedAmount, 4);

          done();
        });
      });

      ws.close();
    });

    it('calls the callback w/ an error if `readyState` is 2 or 3', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
      });

      wss.on('connection', (ws) => {
        ws.close();

        assert.strictEqual(ws.bufferedAmount, 0);

        ws.send('hi', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(
            err.message,
            'WebSocket is not open: readyState 2 (CLOSING)'
          );
          assert.strictEqual(ws.bufferedAmount, 2);

          ws.on('close', () => {
            ws.send('hi', (err) => {
              assert.ok(err instanceof Error);
              assert.strictEqual(
                err.message,
                'WebSocket is not open: readyState 3 (CLOSED)'
              );
              assert.strictEqual(ws.bufferedAmount, 4);

              wss.close(done);
            });
          });
        });
      });
    });

    it('can send a big binary message', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const array = new Float32Array(5 * 1024 * 1024);

        for (let i = 0; i < array.length; i++) {
          array[i] = i / 5;
        }

        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => ws.send(array, { compress: false }));
        ws.on('message', (msg) => {
          assert.ok(msg.equals(Buffer.from(array.buffer)));
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg) => ws.send(msg, { compress: false }));
      });
    });

    it('can send text data', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => ws.send('hi'));
        ws.on('message', (message) => {
          assert.strictEqual(message, 'hi');
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg) => ws.send(msg));
      });
    });

    it('does not override the `fin` option', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          ws.send('fragment', { fin: false });
          ws.send('fragment', { fin: true });
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg) => {
          assert.strictEqual(msg, 'fragmentfragment');
          wss.close(done);
        });
      });
    });

    it('sends numbers as strings', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => ws.send(0));
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg) => {
          assert.strictEqual(msg, '0');
          wss.close(done);
        });
      });
    });

    it('can send binary data as an array', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const array = new Float32Array(6);

        for (let i = 0; i < array.length; ++i) {
          array[i] = i / 2;
        }

        const partial = array.subarray(2, 5);
        const buf = Buffer.from(
          partial.buffer,
          partial.byteOffset,
          partial.byteLength
        );

        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => ws.send(partial));
        ws.on('message', (message) => {
          assert.ok(message.equals(buf));
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg) => ws.send(msg));
      });
    });

    it('can send binary data as a buffer', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const buf = Buffer.from('foobar');
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => ws.send(buf));
        ws.on('message', (message) => {
          assert.ok(message.equals(buf));
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg) => ws.send(msg));
      });
    });

    it('can send an `ArrayBuffer`', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const array = new Float32Array(5);

        for (let i = 0; i < array.length; ++i) {
          array[i] = i / 2;
        }

        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => ws.send(array.buffer));
        ws.onmessage = (event) => {
          assert.ok(event.data.equals(Buffer.from(array.buffer)));
          wss.close(done);
        };
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg) => ws.send(msg));
      });
    });

    it('can send a `Buffer`', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const buf = Buffer.from('foobar');
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => ws.send(buf));

        ws.onmessage = (event) => {
          assert.ok(event.data.equals(buf));
          wss.close(done);
        };
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg) => ws.send(msg));
      });
    });

    it('calls the callback when data is written out', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          ws.send('hi', (err) => {
            assert.ifError(err);
            wss.close(done);
          });
        });
      });
    });

    it('works when the `data` argument is falsy', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => ws.send());
      });

      wss.on('connection', (ws) => {
        ws.on('message', (message) => {
          assert.ok(message.equals(Buffer.alloc(0)));
          wss.close(done);
        });
      });
    });

    it('honors the `mask` option', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => ws.send('hi', { mask: false }));
      });

      wss.on('connection', (ws) => {
        const chunks = [];

        ws._socket.prependListener('data', (chunk) => {
          chunks.push(chunk);
        });

        ws.on('error', (err) => {
          assert.ok(err instanceof RangeError);
          assert.strictEqual(
            err.message,
            'Invalid WebSocket frame: MASK must be set'
          );
          assert.ok(
            Buffer.concat(chunks).slice(0, 2).equals(Buffer.from('8102', 'hex'))
          );

          ws.on('close', (code, reason) => {
            assert.strictEqual(code, 1002);
            assert.strictEqual(reason, '');
            wss.close(done);
          });
        });
      });
    });
  });

  describe('#close', () => {
    it('closes the connection if called while connecting (1/2)', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => done(new Error("Unexpected 'open' event")));
        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(
            err.message,
            'WebSocket was closed before the connection was established'
          );
          ws.on('close', () => wss.close(done));
        });
        ws.close(1001);
      });
    });

    it('closes the connection if called while connecting (2/2)', (done) => {
      const wss = new WebSocket.Server(
        {
          verifyClient: (info, cb) => setTimeout(cb, 300, true),
          port: 0
        },
        () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

          ws.on('open', () => done(new Error("Unexpected 'open' event")));
          ws.on('error', (err) => {
            assert.ok(err instanceof Error);
            assert.strictEqual(
              err.message,
              'WebSocket was closed before the connection was established'
            );
            ws.on('close', () => wss.close(done));
          });
          setTimeout(() => ws.close(1001), 150);
        }
      );
    });

    it('can be called from an error listener while connecting', (done) => {
      const ws = new WebSocket('ws://localhost:1337');

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.code, 'ECONNREFUSED');
        ws.close();
        ws.on('close', () => done());
      });
    }).timeout(4000);

    it("can be called from a listener of the 'upgrade' event", (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => done(new Error("Unexpected 'open' event")));
        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(
            err.message,
            'WebSocket was closed before the connection was established'
          );
          ws.on('close', () => wss.close(done));
        });
        ws.on('upgrade', () => ws.close());
      });
    });

    it('throws an error if the first argument is invalid (1/2)', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          assert.throws(
            () => ws.close('error'),
            /^TypeError: First argument must be a valid error code number$/
          );

          wss.close(done);
        });
      });
    });

    it('throws an error if the first argument is invalid (2/2)', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          assert.throws(
            () => ws.close(1004),
            /^TypeError: First argument must be a valid error code number$/
          );

          wss.close(done);
        });
      });
    });

    it('throws an error if the message is greater than 123 bytes', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          assert.throws(
            () => ws.close(1000, 'a'.repeat(124)),
            /^RangeError: The message must not be greater than 123 bytes$/
          );

          wss.close(done);
        });
      });
    });

    it('sends the close status code only when necessary', (done) => {
      let sent;
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          ws._socket.once('data', (data) => {
            sent = data;
          });
        });
      });

      wss.on('connection', (ws) => {
        ws._socket.once('data', (received) => {
          assert.ok(received.slice(0, 2).equals(Buffer.from([0x88, 0x80])));
          assert.ok(sent.equals(Buffer.from([0x88, 0x00])));

          ws.on('close', (code, reason) => {
            assert.strictEqual(code, 1005);
            assert.strictEqual(reason, '');
            wss.close(done);
          });
        });
        ws.close();
      });
    });

    it('works when close reason is not specified', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => ws.close(1000));
      });

      wss.on('connection', (ws) => {
        ws.on('close', (code, message) => {
          assert.strictEqual(message, '');
          assert.strictEqual(code, 1000);
          wss.close(done);
        });
      });
    });

    it('works when close reason is specified', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => ws.close(1000, 'some reason'));
      });

      wss.on('connection', (ws) => {
        ws.on('close', (code, message) => {
          assert.strictEqual(message, 'some reason');
          assert.strictEqual(code, 1000);
          wss.close(done);
        });
      });
    });

    it('permits all buffered data to be delivered', (done) => {
      const wss = new WebSocket.Server(
        {
          perMessageDeflate: { threshold: 0 },
          port: 0
        },
        () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
          const messages = [];

          ws.on('message', (message) => messages.push(message));
          ws.on('close', (code) => {
            assert.strictEqual(code, 1005);
            assert.deepStrictEqual(messages, ['foo', 'bar', 'baz']);
            wss.close(done);
          });
        }
      );

      wss.on('connection', (ws) => {
        const callback = (err) => assert.ifError(err);

        ws.send('foo', callback);
        ws.send('bar', callback);
        ws.send('baz', callback);
        ws.close();
        ws.close();
      });
    });

    it('allows close code 1013', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('close', (code) => {
          assert.strictEqual(code, 1013);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => ws.close(1013));
    });

    it('allows close code 1014', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('close', (code) => {
          assert.strictEqual(code, 1014);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => ws.close(1014));
    });

    it('does nothing if `readyState` is `CLOSED`', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('close', (code) => {
          assert.strictEqual(code, 1005);
          assert.strictEqual(ws.readyState, WebSocket.CLOSED);
          ws.close();
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => ws.close());
    });

    it('sets a timer for the closing handshake to complete', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('close', (code, reason) => {
          assert.strictEqual(code, 1000);
          assert.strictEqual(reason, 'some reason');
          wss.close(done);
        });

        ws.on('open', () => {
          let callbackCalled = false;

          assert.strictEqual(ws._closeTimer, null);

          ws.send('foo', () => {
            callbackCalled = true;
          });

          ws.close(1000, 'some reason');

          //
          // Check that the close timer is set even if the `Sender.close()`
          // callback is not called.
          //
          assert.strictEqual(callbackCalled, false);
          assert.strictEqual(ws._closeTimer._idleTimeout, 30000);
        });
      });
    });
  });

  describe('#terminate', () => {
    it('closes the connection if called while connecting (1/2)', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => done(new Error("Unexpected 'open' event")));
        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(
            err.message,
            'WebSocket was closed before the connection was established'
          );
          ws.on('close', () => wss.close(done));
        });
        ws.terminate();
      });
    });

    it('closes the connection if called while connecting (2/2)', (done) => {
      const wss = new WebSocket.Server(
        {
          verifyClient: (info, cb) => setTimeout(cb, 300, true),
          port: 0
        },
        () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

          ws.on('open', () => done(new Error("Unexpected 'open' event")));
          ws.on('error', (err) => {
            assert.ok(err instanceof Error);
            assert.strictEqual(
              err.message,
              'WebSocket was closed before the connection was established'
            );
            ws.on('close', () => wss.close(done));
          });
          setTimeout(() => ws.terminate(), 150);
        }
      );
    });

    it('can be called from an error listener while connecting', (done) => {
      const ws = new WebSocket('ws://localhost:1337');

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.code, 'ECONNREFUSED');
        ws.terminate();
        ws.on('close', () => done());
      });
    }).timeout(4000);

    it("can be called from a listener of the 'upgrade' event", (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => done(new Error("Unexpected 'open' event")));
        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(
            err.message,
            'WebSocket was closed before the connection was established'
          );
          ws.on('close', () => wss.close(done));
        });
        ws.on('upgrade', () => ws.terminate());
      });
    });

    it('does nothing if `readyState` is `CLOSED`', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('close', (code) => {
          assert.strictEqual(code, 1006);
          assert.strictEqual(ws.readyState, WebSocket.CLOSED);
          ws.terminate();
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => ws.terminate());
    });
  });

  describe('WHATWG API emulation', () => {
    it('supports the `on{close,error,message,open}` attributes', () => {
      for (const property of ['onclose', 'onerror', 'onmessage', 'onopen']) {
        const descriptor = Object.getOwnPropertyDescriptor(
          WebSocket.prototype,
          property
        );

        assert.strictEqual(descriptor.configurable, true);
        assert.strictEqual(descriptor.enumerable, true);
        assert.ok(descriptor.get !== undefined);
        assert.ok(descriptor.set !== undefined);
      }

      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      assert.strictEqual(ws.onmessage, undefined);
      assert.strictEqual(ws.onclose, undefined);
      assert.strictEqual(ws.onerror, undefined);
      assert.strictEqual(ws.onopen, undefined);

      ws.onmessage = NOOP;
      ws.onerror = NOOP;
      ws.onclose = NOOP;
      ws.onopen = NOOP;

      assert.strictEqual(ws.onmessage, NOOP);
      assert.strictEqual(ws.onclose, NOOP);
      assert.strictEqual(ws.onerror, NOOP);
      assert.strictEqual(ws.onopen, NOOP);
    });

    it('works like the `EventEmitter` interface', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.onmessage = (messageEvent) => {
          assert.strictEqual(messageEvent.data, 'foo');
          ws.onclose = (closeEvent) => {
            assert.strictEqual(closeEvent.wasClean, true);
            assert.strictEqual(closeEvent.code, 1005);
            assert.strictEqual(closeEvent.reason, '');
            wss.close(done);
          };
          ws.close();
        };

        ws.onopen = () => ws.send('foo');
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg) => ws.send(msg));
      });
    });

    it("doesn't return listeners added with `on`", () => {
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      ws.on('open', NOOP);

      assert.deepStrictEqual(ws.listeners('open'), [NOOP]);
      assert.strictEqual(ws.onopen, undefined);
    });

    it("doesn't remove listeners added with `on`", () => {
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      ws.on('close', NOOP);
      ws.onclose = NOOP;

      let listeners = ws.listeners('close');

      assert.strictEqual(listeners.length, 2);
      assert.strictEqual(listeners[0], NOOP);
      assert.strictEqual(listeners[1]._listener, NOOP);

      ws.onclose = NOOP;

      listeners = ws.listeners('close');

      assert.strictEqual(listeners.length, 2);
      assert.strictEqual(listeners[0], NOOP);
      assert.strictEqual(listeners[1]._listener, NOOP);
    });

    it('adds listeners for custom events with `addEventListener`', () => {
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      ws.addEventListener('foo', NOOP);
      assert.strictEqual(ws.listeners('foo')[0], NOOP);

      //
      // Fails silently when the `listener` is not a function.
      //
      ws.addEventListener('bar', {});
      assert.strictEqual(ws.listeners('bar').length, 0);
    });

    it('allows to add one time listeners with `addEventListener`', (done) => {
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      ws.addEventListener(
        'foo',
        () => {
          assert.strictEqual(ws.listenerCount('foo'), 0);
          done();
        },
        { once: true }
      );

      assert.strictEqual(ws.listenerCount('foo'), 1);
      ws.emit('foo');
    });

    it('supports the `removeEventListener` method', () => {
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      ws.addEventListener('message', NOOP);
      ws.addEventListener('open', NOOP);
      ws.addEventListener('foo', NOOP);

      assert.strictEqual(ws.listeners('message')[0]._listener, NOOP);
      assert.strictEqual(ws.listeners('open')[0]._listener, NOOP);
      assert.strictEqual(ws.listeners('foo')[0], NOOP);

      ws.removeEventListener('message', () => {});

      assert.strictEqual(ws.listeners('message')[0]._listener, NOOP);

      ws.removeEventListener('message', NOOP);
      ws.removeEventListener('open', NOOP);
      ws.removeEventListener('foo', NOOP);

      assert.strictEqual(ws.listenerCount('message'), 0);
      assert.strictEqual(ws.listenerCount('open'), 0);
      assert.strictEqual(ws.listenerCount('foo'), 0);

      ws.addEventListener('message', NOOP, { once: true });
      ws.addEventListener('open', NOOP, { once: true });
      ws.addEventListener('foo', NOOP, { once: true });

      assert.strictEqual(ws.listeners('message')[0]._listener, NOOP);
      assert.strictEqual(ws.listeners('open')[0]._listener, NOOP);
      assert.strictEqual(ws.listeners('foo')[0], NOOP);

      ws.removeEventListener('message', () => {});

      assert.strictEqual(ws.listeners('message')[0]._listener, NOOP);

      ws.removeEventListener('message', NOOP);
      ws.removeEventListener('open', NOOP);
      ws.removeEventListener('foo', NOOP);

      assert.strictEqual(ws.listenerCount('message'), 0);
      assert.strictEqual(ws.listenerCount('open'), 0);
      assert.strictEqual(ws.listenerCount('foo'), 0);
    });

    it('wraps text data in a `MessageEvent`', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.addEventListener('open', () => ws.send('hi'));
        ws.addEventListener('message', (messageEvent) => {
          assert.strictEqual(messageEvent.data, 'hi');
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg) => ws.send(msg));
      });
    });

    it('receives a `CloseEvent` when server closes (1000)', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.addEventListener('close', (closeEvent) => {
          assert.ok(closeEvent.wasClean);
          assert.strictEqual(closeEvent.reason, '');
          assert.strictEqual(closeEvent.code, 1000);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => ws.close(1000));
    });

    it('receives a `CloseEvent` when server closes (4000)', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.addEventListener('close', (closeEvent) => {
          assert.ok(closeEvent.wasClean);
          assert.strictEqual(closeEvent.reason, 'some daft reason');
          assert.strictEqual(closeEvent.code, 4000);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => ws.close(4000, 'some daft reason'));
    });

    it('sets `target` and `type` on events', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const err = new Error('forced');
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.addEventListener('open', (openEvent) => {
          assert.strictEqual(openEvent.type, 'open');
          assert.strictEqual(openEvent.target, ws);
        });
        ws.addEventListener('message', (messageEvent) => {
          assert.strictEqual(messageEvent.type, 'message');
          assert.strictEqual(messageEvent.target, ws);
          wss.close();
        });
        ws.addEventListener('close', (closeEvent) => {
          assert.strictEqual(closeEvent.type, 'close');
          assert.strictEqual(closeEvent.target, ws);
          ws.emit('error', err);
        });
        ws.addEventListener('error', (errorEvent) => {
          assert.strictEqual(errorEvent.message, 'forced');
          assert.strictEqual(errorEvent.type, 'error');
          assert.strictEqual(errorEvent.target, ws);
          assert.strictEqual(errorEvent.error, err);

          done();
        });
      });

      wss.on('connection', (client) => client.send('hi'));
    });

    it('passes binary data as a Node.js `Buffer` by default', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.onmessage = (evt) => {
          assert.ok(Buffer.isBuffer(evt.data));
          wss.close(done);
        };
      });

      wss.on('connection', (ws) => ws.send(new Uint8Array(4096)));
    });

    it('ignores `binaryType` for text messages', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.binaryType = 'arraybuffer';

        ws.onmessage = (evt) => {
          assert.strictEqual(evt.data, 'foo');
          wss.close(done);
        };
      });

      wss.on('connection', (ws) => ws.send('foo'));
    });

    it('allows to update `binaryType` on the fly', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        function testType(binaryType, next) {
          const buf = Buffer.from(binaryType);
          ws.binaryType = binaryType;

          ws.onmessage = (evt) => {
            if (binaryType === 'nodebuffer') {
              assert.ok(Buffer.isBuffer(evt.data));
              assert.ok(evt.data.equals(buf));
            } else if (binaryType === 'arraybuffer') {
              assert.ok(evt.data instanceof ArrayBuffer);
              assert.ok(Buffer.from(evt.data).equals(buf));
            } else if (binaryType === 'fragments') {
              assert.deepStrictEqual(evt.data, [buf]);
            }
            next();
          };

          ws.send(buf);
        }

        ws.onopen = () => {
          testType('nodebuffer', () => {
            testType('arraybuffer', () => {
              testType('fragments', () => wss.close(done));
            });
          });
        };
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg) => ws.send(msg));
      });
    });
  });

  describe('SSL', () => {
    it('connects to secure websocket server', (done) => {
      const server = https.createServer({
        cert: fs.readFileSync('test/fixtures/certificate.pem'),
        key: fs.readFileSync('test/fixtures/key.pem')
      });
      const wss = new WebSocket.Server({ server });

      wss.on('connection', () => {
        wss.close();
        server.close(done);
      });

      server.listen(0, () => {
        const ws = new WebSocket(`wss://localhost:${server.address().port}`, {
          rejectUnauthorized: false
        });
      });
    });

    it('connects to secure websocket server with client side certificate', (done) => {
      const server = https.createServer({
        cert: fs.readFileSync('test/fixtures/certificate.pem'),
        ca: [fs.readFileSync('test/fixtures/ca1-cert.pem')],
        key: fs.readFileSync('test/fixtures/key.pem'),
        requestCert: true
      });

      let success = false;
      const wss = new WebSocket.Server({
        verifyClient: (info) => {
          success = !!info.req.client.authorized;
          return true;
        },
        server
      });

      wss.on('connection', () => {
        assert.ok(success);
        server.close(done);
        wss.close();
      });

      server.listen(0, () => {
        const ws = new WebSocket(`wss://localhost:${server.address().port}`, {
          cert: fs.readFileSync('test/fixtures/agent1-cert.pem'),
          key: fs.readFileSync('test/fixtures/agent1-key.pem'),
          rejectUnauthorized: false
        });
      });
    });

    it('cannot connect to secure websocket server via ws://', (done) => {
      const server = https.createServer({
        cert: fs.readFileSync('test/fixtures/certificate.pem'),
        key: fs.readFileSync('test/fixtures/key.pem')
      });
      const wss = new WebSocket.Server({ server });

      server.listen(0, () => {
        const ws = new WebSocket(`ws://localhost:${server.address().port}`, {
          rejectUnauthorized: false
        });

        ws.on('error', () => {
          server.close(done);
          wss.close();
        });
      });
    });

    it('can send and receive text data', (done) => {
      const server = https.createServer({
        cert: fs.readFileSync('test/fixtures/certificate.pem'),
        key: fs.readFileSync('test/fixtures/key.pem')
      });
      const wss = new WebSocket.Server({ server });

      wss.on('connection', (ws) => {
        ws.on('message', (message) => {
          assert.strictEqual(message, 'foobar');
          server.close(done);
          wss.close();
        });
      });

      server.listen(0, () => {
        const ws = new WebSocket(`wss://localhost:${server.address().port}`, {
          rejectUnauthorized: false
        });

        ws.on('open', () => ws.send('foobar'));
      });
    });

    it('can send a big binary message', (done) => {
      const buf = crypto.randomBytes(5 * 1024 * 1024);
      const server = https.createServer({
        cert: fs.readFileSync('test/fixtures/certificate.pem'),
        key: fs.readFileSync('test/fixtures/key.pem')
      });
      const wss = new WebSocket.Server({ server });

      wss.on('connection', (ws) => {
        ws.on('message', (message) => ws.send(message));
      });

      server.listen(0, () => {
        const ws = new WebSocket(`wss://localhost:${server.address().port}`, {
          rejectUnauthorized: false
        });

        ws.on('open', () => ws.send(buf));
        ws.on('message', (message) => {
          assert.ok(buf.equals(message));

          server.close(done);
          wss.close();
        });
      });
    }).timeout(4000);

    it('allows to disable sending the SNI extension', (done) => {
      const original = tls.connect;

      tls.connect = (options) => {
        assert.strictEqual(options.servername, '');
        tls.connect = original;
        done();
      };

      const ws = new WebSocket('wss://127.0.0.1', { servername: '' });
    });
  });

  describe('Request headers', () => {
    it('adds the authorization header if the url has userinfo', (done) => {
      const agent = new CustomAgent();
      const userinfo = 'test:testpass';

      agent.addRequest = (req) => {
        assert.strictEqual(
          req.getHeader('authorization'),
          `Basic ${Buffer.from(userinfo).toString('base64')}`
        );
        done();
      };

      const ws = new WebSocket(`ws://${userinfo}@localhost`, { agent });
    });

    it('honors the `auth` option', (done) => {
      const agent = new CustomAgent();
      const auth = 'user:pass';

      agent.addRequest = (req) => {
        assert.strictEqual(
          req.getHeader('authorization'),
          `Basic ${Buffer.from(auth).toString('base64')}`
        );
        done();
      };

      const ws = new WebSocket('ws://localhost', { agent, auth });
    });

    it('favors the url userinfo over the `auth` option', (done) => {
      const agent = new CustomAgent();
      const auth = 'foo:bar';
      const userinfo = 'baz:qux';

      agent.addRequest = (req) => {
        assert.strictEqual(
          req.getHeader('authorization'),
          `Basic ${Buffer.from(userinfo).toString('base64')}`
        );
        done();
      };

      const ws = new WebSocket(`ws://${userinfo}@localhost`, { agent, auth });
    });

    it('adds custom headers', (done) => {
      const agent = new CustomAgent();

      agent.addRequest = (req) => {
        assert.strictEqual(req.getHeader('cookie'), 'foo=bar');
        done();
      };

      const ws = new WebSocket('ws://localhost', {
        headers: { Cookie: 'foo=bar' },
        agent
      });
    });

    it('excludes default ports from host header', () => {
      const options = { lookup() {} };
      const variants = [
        ['wss://localhost:8443', 'localhost:8443'],
        ['wss://localhost:443', 'localhost'],
        ['ws://localhost:88', 'localhost:88'],
        ['ws://localhost:80', 'localhost']
      ];

      for (const [url, host] of variants) {
        const ws = new WebSocket(url, options);
        assert.strictEqual(ws._req.getHeader('host'), host);
      }
    });

    it("doesn't add the origin header by default", (done) => {
      const agent = new CustomAgent();

      agent.addRequest = (req) => {
        assert.strictEqual(req.getHeader('origin'), undefined);
        done();
      };

      const ws = new WebSocket('ws://localhost', { agent });
    });

    it('honors the `origin` option (1/2)', (done) => {
      const agent = new CustomAgent();

      agent.addRequest = (req) => {
        assert.strictEqual(req.getHeader('origin'), 'https://example.com:8000');
        done();
      };

      const ws = new WebSocket('ws://localhost', {
        origin: 'https://example.com:8000',
        agent
      });
    });

    it('honors the `origin` option (2/2)', (done) => {
      const agent = new CustomAgent();

      agent.addRequest = (req) => {
        assert.strictEqual(
          req.getHeader('sec-websocket-origin'),
          'https://example.com:8000'
        );
        done();
      };

      const ws = new WebSocket('ws://localhost', {
        origin: 'https://example.com:8000',
        protocolVersion: 8,
        agent
      });
    });
  });

  describe('permessage-deflate', () => {
    it('is enabled by default', (done) => {
      const agent = new CustomAgent();

      agent.addRequest = (req) => {
        assert.strictEqual(
          req.getHeader('sec-websocket-extensions'),
          'permessage-deflate; client_max_window_bits'
        );
        done();
      };

      const ws = new WebSocket('ws://localhost', { agent });
    });

    it('can be disabled', (done) => {
      const agent = new CustomAgent();

      agent.addRequest = (req) => {
        assert.strictEqual(
          req.getHeader('sec-websocket-extensions'),
          undefined
        );
        done();
      };

      const ws = new WebSocket('ws://localhost', {
        perMessageDeflate: false,
        agent
      });
    });

    it('can send extension parameters', (done) => {
      const agent = new CustomAgent();

      const value =
        'permessage-deflate; server_no_context_takeover;' +
        ' client_no_context_takeover; server_max_window_bits=10;' +
        ' client_max_window_bits';

      agent.addRequest = (req) => {
        assert.strictEqual(req.getHeader('sec-websocket-extensions'), value);
        done();
      };

      const ws = new WebSocket('ws://localhost', {
        perMessageDeflate: {
          clientNoContextTakeover: true,
          serverNoContextTakeover: true,
          clientMaxWindowBits: true,
          serverMaxWindowBits: 10
        },
        agent
      });
    });

    it('can send and receive text data', (done) => {
      const wss = new WebSocket.Server(
        {
          perMessageDeflate: { threshold: 0 },
          port: 0
        },
        () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
            perMessageDeflate: { threshold: 0 }
          });

          ws.on('open', () => ws.send('hi', { compress: true }));
          ws.on('message', (message) => {
            assert.strictEqual(message, 'hi');
            wss.close(done);
          });
        }
      );

      wss.on('connection', (ws) => {
        ws.on('message', (message) => ws.send(message, { compress: true }));
      });
    });

    it('can send and receive a `TypedArray`', (done) => {
      const array = new Float32Array(5);

      for (let i = 0; i < array.length; i++) {
        array[i] = i / 2;
      }

      const wss = new WebSocket.Server(
        {
          perMessageDeflate: { threshold: 0 },
          port: 0
        },
        () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
            perMessageDeflate: { threshold: 0 }
          });

          ws.on('open', () => ws.send(array, { compress: true }));
          ws.on('message', (message) => {
            assert.ok(message.equals(Buffer.from(array.buffer)));
            wss.close(done);
          });
        }
      );

      wss.on('connection', (ws) => {
        ws.on('message', (message) => ws.send(message, { compress: true }));
      });
    });

    it('can send and receive an `ArrayBuffer`', (done) => {
      const array = new Float32Array(5);

      for (let i = 0; i < array.length; i++) {
        array[i] = i / 2;
      }

      const wss = new WebSocket.Server(
        {
          perMessageDeflate: { threshold: 0 },
          port: 0
        },
        () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
            perMessageDeflate: { threshold: 0 }
          });

          ws.on('open', () => ws.send(array.buffer, { compress: true }));
          ws.on('message', (message) => {
            assert.ok(message.equals(Buffer.from(array.buffer)));
            wss.close(done);
          });
        }
      );

      wss.on('connection', (ws) => {
        ws.on('message', (message) => ws.send(message, { compress: true }));
      });
    });

    it('consumes all received data when connection is closed abnormally', (done) => {
      const wss = new WebSocket.Server(
        {
          perMessageDeflate: { threshold: 0 },
          port: 0
        },
        () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
          const messages = [];

          ws.on('message', (message) => messages.push(message));
          ws.on('close', (code) => {
            assert.strictEqual(code, 1006);
            assert.deepStrictEqual(messages, ['foo', 'bar', 'baz', 'qux']);
            wss.close(done);
          });
        }
      );

      wss.on('connection', (ws) => {
        ws.send('foo');
        ws.send('bar');
        ws.send('baz');
        ws.send('qux', () => ws._socket.end());
      });
    });

    describe('#send', () => {
      it('ignores the `compress` option if the extension is disabled', (done) => {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
            perMessageDeflate: false
          });

          ws.on('open', () => ws.send('hi', { compress: true }));
          ws.on('message', (message) => {
            assert.strictEqual(message, 'hi');
            wss.close(done);
          });
        });

        wss.on('connection', (ws) => {
          ws.on('message', (message) => ws.send(message, { compress: true }));
        });
      });

      it('calls the callback if the socket is closed prematurely', (done) => {
        const wss = new WebSocket.Server(
          { perMessageDeflate: true, port: 0 },
          () => {
            const called = [];
            const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
              perMessageDeflate: { threshold: 0 }
            });

            ws.on('open', () => {
              ws.send('foo');
              ws.send('bar', (err) => {
                called.push(1);

                assert.strictEqual(ws.readyState, WebSocket.CLOSING);
                assert.ok(err instanceof Error);
                assert.strictEqual(
                  err.message,
                  'The socket was closed while data was being compressed'
                );
              });
              ws.send('baz');
              ws.send('qux', (err) => {
                called.push(2);

                assert.strictEqual(ws.readyState, WebSocket.CLOSING);
                assert.ok(err instanceof Error);
                assert.strictEqual(
                  err.message,
                  'The socket was closed while data was being compressed'
                );
              });
            });

            ws.on('close', () => {
              assert.deepStrictEqual(called, [1, 2]);
              wss.close(done);
            });
          }
        );

        wss.on('connection', (ws) => {
          ws._socket.end();
        });
      });
    });

    describe('#terminate', () => {
      it('can be used while data is being compressed', (done) => {
        const wss = new WebSocket.Server(
          {
            perMessageDeflate: { threshold: 0 },
            port: 0
          },
          () => {
            const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
              perMessageDeflate: { threshold: 0 }
            });

            ws.on('open', () => {
              ws.send('hi', (err) => {
                assert.strictEqual(ws.readyState, WebSocket.CLOSING);
                assert.ok(err instanceof Error);
                assert.strictEqual(
                  err.message,
                  'The socket was closed while data was being compressed'
                );

                ws.on('close', () => {
                  wss.close(done);
                });
              });
              ws.terminate();
            });
          }
        );
      });

      it('can be used while data is being decompressed', (done) => {
        const wss = new WebSocket.Server(
          {
            perMessageDeflate: true,
            port: 0
          },
          () => {
            const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
            const messages = [];

            ws.on('message', (message) => {
              if (messages.push(message) > 1) return;

              process.nextTick(() => {
                assert.strictEqual(ws._receiver._state, 5);
                ws.terminate();
              });
            });

            ws.on('close', (code, reason) => {
              assert.deepStrictEqual(messages, ['', '', '', '']);
              assert.strictEqual(code, 1006);
              assert.strictEqual(reason, '');
              wss.close(done);
            });
          }
        );

        wss.on('connection', (ws) => {
          const buf = Buffer.from('c10100c10100c10100c10100', 'hex');
          ws._socket.write(buf);
        });
      });
    });
  });
});
