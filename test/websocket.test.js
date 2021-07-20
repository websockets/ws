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
const {
  CloseEvent,
  ErrorEvent,
  Event,
  MessageEvent
} = require('../lib/event-target');
const { EMPTY_BUFFER, GUID, kListener, NOOP } = require('../lib/constants');

class CustomAgent extends http.Agent {
  addRequest() {}
}

describe('WebSocket', () => {
  describe('#ctor', () => {
    it('throws an error when using an invalid url', () => {
      assert.throws(
        () => new WebSocket('foo'),
        /^SyntaxError: Invalid URL: foo$/
      );

      assert.throws(
        () => new WebSocket('https://echo.websocket.org'),
        /^SyntaxError: The URL's protocol must be one of "ws:", "wss:", or "ws\+unix:"$/
      );

      assert.throws(
        () => new WebSocket('ws+unix:'),
        /^SyntaxError: The URL's pathname is empty$/
      );

      assert.throws(
        () => new WebSocket('wss://echo.websocket.org#foo'),
        /^SyntaxError: The URL contains a fragment identifier$/
      );
    });

    it('throws an error if a subprotocol is invalid or duplicated', () => {
      for (const subprotocol of [null, '', 'a,b', ['a', 'a']]) {
        assert.throws(
          () => new WebSocket('ws://localhost', subprotocol),
          /^SyntaxError: An invalid or duplicated subprotocol was specified$/
        );
      }
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

        agent.addRequest = (req) => {
          assert.strictEqual(
            req.getHeader('sec-websocket-protocol'),
            undefined
          );
          count++;
        };

        ws = new WebSocket('ws://localhost', undefined, { agent });
        ws = new WebSocket('ws://localhost', [], { agent });

        assert.strictEqual(count, 2);
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

        wss.on('connection', (ws) => {
          ws.close();
        });
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

        wss.on('connection', (ws) => {
          ws.close();
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

        wss.on('connection', (ws) => {
          ws.close();
        });
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
      let clientCloseEventEmitted = false;
      let serverClientCloseEventEmitted = false;

      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('error', (err) => {
          assert.ok(err instanceof RangeError);
          assert.strictEqual(err.code, 'WS_ERR_INVALID_OPCODE');
          assert.strictEqual(
            err.message,
            'Invalid WebSocket frame: invalid opcode 5'
          );

          ws.on('close', (code, reason) => {
            assert.strictEqual(code, 1006);
            assert.strictEqual(reason, EMPTY_BUFFER);

            clientCloseEventEmitted = true;
            if (serverClientCloseEventEmitted) wss.close(done);
          });
        });
      });

      wss.on('connection', (ws) => {
        ws.on('close', (code, reason) => {
          assert.strictEqual(code, 1002);
          assert.deepStrictEqual(reason, EMPTY_BUFFER);

          serverClientCloseEventEmitted = true;
          if (clientCloseEventEmitted) wss.close(done);
        });

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
              assert.strictEqual(code, 1006);
              assert.strictEqual(message, EMPTY_BUFFER);
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

      wss.on('connection', (ws) => {
        ws.close();
      });
    });

    it("emits a 'ping' event", (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
        ws.on('ping', () => wss.close(done));
      });

      wss.on('connection', (ws) => {
        ws.ping();
        ws.close();
      });
    });

    it("emits a 'pong' event", (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
        ws.on('pong', () => wss.close(done));
      });

      wss.on('connection', (ws) => {
        ws.pong();
        ws.close();
      });
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
        assert.strictEqual(reason, EMPTY_BUFFER);
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
      const ws = new WebSocket(`ws://localhost:${port}`, {
        handshakeTimeout: 100
      });

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Opening handshake has timed out');
        done();
      });
    });

    it('fails if an unexpected Sec-WebSocket-Extensions header is received', (done) => {
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
            'Sec-WebSocket-Extensions: foo\r\n' +
            '\r\n'
        );
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`, {
        perMessageDeflate: false
      });

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'Server sent a Sec-WebSocket-Extensions header but no extension ' +
            'was requested'
        );
        ws.on('close', () => done());
      });
    });

    it('fails if the Sec-WebSocket-Extensions header is invalid (1/2)', (done) => {
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

    it('fails if the Sec-WebSocket-Extensions header is invalid (2/2)', (done) => {
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
            'Sec-WebSocket-Extensions: ' +
            'permessage-deflate; client_max_window_bits=7\r\n' +
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

    it('fails if an unexpected extension is received (1/2)', (done) => {
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
            'Sec-WebSocket-Extensions: foo\r\n' +
            '\r\n'
        );
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'Server indicated an extension that was not requested'
        );
        ws.on('close', () => done());
      });
    });

    it('fails if an unexpected extension is received (2/2)', (done) => {
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
            'Sec-WebSocket-Extensions: permessage-deflate,foo\r\n' +
            '\r\n'
        );
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'Server indicated an extension that was not requested'
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

        ws.on('open', () => {
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.close();
      });
    });

    it('connects when pathname is null', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss.address().port;
        const ws = new WebSocket(`ws://localhost:${port}?token=qwerty`);

        ws.on('open', () => {
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.close();
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
          ws.ping(() => {
            ws.ping();
            ws.close();
          });
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
          ws.ping('hi', () => {
            ws.ping('hi', true);
            ws.close();
          });
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

        ws.on('open', () => {
          ws.ping(0);
          ws.close();
        });
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

      wss.on('connection', (ws) => {
        ws.close();
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
          ws.pong(() => {
            ws.pong();
            ws.close();
          });
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
          ws.pong('hi', () => {
            ws.pong('hi', true);
            ws.close();
          });
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

        ws.on('open', () => {
          ws.pong(0);
          ws.close();
        });
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

      wss.on('connection', (ws) => {
        ws.close();
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

        ws.on('open', () => ws.send(array));
        ws.on('message', (msg, isBinary) => {
          assert.deepStrictEqual(msg, Buffer.from(array.buffer));
          assert.ok(isBinary);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg, isBinary) => {
          assert.ok(isBinary);
          ws.send(msg);
          ws.close();
        });
      });
    });

    it('can send text data', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => ws.send('hi'));
        ws.on('message', (message, isBinary) => {
          assert.deepStrictEqual(message, Buffer.from('hi'));
          assert.ok(!isBinary);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg, isBinary) => {
          ws.send(msg, { binary: isBinary });
          ws.close();
        });
      });
    });

    it('does not override the `fin` option', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          ws.send('fragment', { fin: false });
          ws.send('fragment', { fin: true });
          ws.close();
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg, isBinary) => {
          assert.deepStrictEqual(msg, Buffer.from('fragmentfragment'));
          assert.ok(!isBinary);
          wss.close(done);
        });
      });
    });

    it('sends numbers as strings', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          ws.send(0);
          ws.close();
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg, isBinary) => {
          assert.deepStrictEqual(msg, Buffer.from('0'));
          assert.ok(!isBinary);
          wss.close(done);
        });
      });
    });

    it('can send a `TypedArray`', (done) => {
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

        ws.on('open', () => {
          ws.send(partial);
          ws.close();
        });

        ws.on('message', (message, isBinary) => {
          assert.deepStrictEqual(message, buf);
          assert.ok(isBinary);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg, isBinary) => {
          assert.ok(isBinary);
          ws.send(msg);
        });
      });
    });

    it('can send an `ArrayBuffer`', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const array = new Float32Array(5);

        for (let i = 0; i < array.length; ++i) {
          array[i] = i / 2;
        }

        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          ws.send(array.buffer);
          ws.close();
        });

        ws.onmessage = (event) => {
          assert.ok(event.data.equals(Buffer.from(array.buffer)));
          wss.close(done);
        };
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg, isBinary) => {
          assert.ok(isBinary);
          ws.send(msg);
        });
      });
    });

    it('can send a `Buffer`', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const buf = Buffer.from('foobar');
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          ws.send(buf);
          ws.close();
        });

        ws.onmessage = (event) => {
          assert.deepStrictEqual(event.data, buf);
          wss.close(done);
        };
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg, isBinary) => {
          assert.ok(isBinary);
          ws.send(msg);
        });
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

      wss.on('connection', (ws) => {
        ws.close();
      });
    });

    it('works when the `data` argument is falsy', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          ws.send();
          ws.close();
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (message, isBinary) => {
          assert.strictEqual(message, EMPTY_BUFFER);
          assert.ok(isBinary);
          wss.close(done);
        });
      });
    });

    it('honors the `mask` option', (done) => {
      let clientCloseEventEmitted = false;
      let serverClientCloseEventEmitted = false;

      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => ws.send('hi', { mask: false }));
        ws.on('close', (code, reason) => {
          assert.strictEqual(code, 1002);
          assert.deepStrictEqual(reason, EMPTY_BUFFER);

          clientCloseEventEmitted = true;
          if (serverClientCloseEventEmitted) wss.close(done);
        });
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
            assert.strictEqual(code, 1006);
            assert.strictEqual(reason, EMPTY_BUFFER);

            serverClientCloseEventEmitted = true;
            if (clientCloseEventEmitted) wss.close(done);
          });
        });
      });
    });
  });

  describe('#close', () => {
    it('closes the connection if called while connecting (1/3)', (done) => {
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

    it('closes the connection if called while connecting (2/3)', (done) => {
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

    it('closes the connection if called while connecting (3/3)', (done) => {
      const server = http.createServer();

      server.listen(0, () => {
        const ws = new WebSocket(`ws://localhost:${server.address().port}`);

        ws.on('open', () => done(new Error("Unexpected 'open' event")));
        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(
            err.message,
            'WebSocket was closed before the connection was established'
          );
          ws.on('close', () => {
            server.close(done);
          });
        });

        ws.on('unexpected-response', (req, res) => {
          assert.strictEqual(res.statusCode, 502);

          const chunks = [];

          res.on('data', (chunk) => {
            chunks.push(chunk);
          });

          res.on('end', () => {
            assert.strictEqual(Buffer.concat(chunks).toString(), 'foo');
            ws.close();
          });
        });
      });

      server.on('upgrade', (req, socket) => {
        socket.on('end', socket.end);

        socket.write(
          `HTTP/1.1 502 ${http.STATUS_CODES[502]}\r\n` +
            'Connection: keep-alive\r\n' +
            'Content-type: text/html\r\n' +
            'Content-Length: 3\r\n' +
            '\r\n' +
            'foo'
        );
      });
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
          assert.deepStrictEqual(
            received.slice(0, 2),
            Buffer.from([0x88, 0x80])
          );
          assert.deepStrictEqual(sent, Buffer.from([0x88, 0x00]));

          ws.on('close', (code, reason) => {
            assert.strictEqual(code, 1005);
            assert.strictEqual(reason, EMPTY_BUFFER);
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
          assert.strictEqual(code, 1000);
          assert.deepStrictEqual(message, EMPTY_BUFFER);
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
          assert.strictEqual(code, 1000);
          assert.deepStrictEqual(message, Buffer.from('some reason'));
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

          ws.on('message', (message, isBinary) => {
            assert.ok(!isBinary);
            messages.push(message.toString());
          });
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
          assert.deepStrictEqual(reason, Buffer.from('some reason'));
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

      assert.strictEqual(ws.onmessage, null);
      assert.strictEqual(ws.onclose, null);
      assert.strictEqual(ws.onerror, null);
      assert.strictEqual(ws.onopen, null);

      ws.onmessage = NOOP;
      ws.onerror = NOOP;
      ws.onclose = NOOP;
      ws.onopen = NOOP;

      assert.strictEqual(ws.onmessage, NOOP);
      assert.strictEqual(ws.onclose, NOOP);
      assert.strictEqual(ws.onerror, NOOP);
      assert.strictEqual(ws.onopen, NOOP);

      ws.onmessage = 'foo';

      assert.strictEqual(ws.onmessage, null);
      assert.strictEqual(ws.listenerCount('onmessage'), 0);
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
        ws.on('message', (msg, isBinary) => {
          ws.send(msg, { binary: isBinary });
        });
      });
    });

    it("doesn't return listeners added with `on`", () => {
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      ws.on('open', NOOP);

      assert.deepStrictEqual(ws.listeners('open'), [NOOP]);
      assert.strictEqual(ws.onopen, null);
    });

    it("doesn't remove listeners added with `on`", () => {
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      ws.on('close', NOOP);
      ws.onclose = NOOP;

      let listeners = ws.listeners('close');

      assert.strictEqual(listeners.length, 2);
      assert.strictEqual(listeners[0], NOOP);
      assert.strictEqual(listeners[1][kListener], NOOP);

      ws.onclose = NOOP;

      listeners = ws.listeners('close');

      assert.strictEqual(listeners.length, 2);
      assert.strictEqual(listeners[0], NOOP);
      assert.strictEqual(listeners[1][kListener], NOOP);
    });

    it('supports the `addEventListener` method', () => {
      const events = [];
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      ws.addEventListener('foo', () => {});
      assert.strictEqual(ws.listenerCount('foo'), 0);

      ws.addEventListener('open', () => {
        events.push('open');
        assert.strictEqual(ws.listenerCount('open'), 1);
      });

      assert.strictEqual(ws.listenerCount('open'), 1);

      ws.addEventListener(
        'message',
        () => {
          events.push('message');
          assert.strictEqual(ws.listenerCount('message'), 0);
        },
        { once: true }
      );

      assert.strictEqual(ws.listenerCount('message'), 1);

      ws.emit('open');
      ws.emit('message', EMPTY_BUFFER, false);

      assert.deepStrictEqual(events, ['open', 'message']);
    });

    it("doesn't return listeners added with `addEventListener`", () => {
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      ws.addEventListener('open', NOOP);

      const listeners = ws.listeners('open');

      assert.strictEqual(listeners.length, 1);
      assert.strictEqual(listeners[0][kListener], NOOP);

      assert.strictEqual(ws.onopen, null);
    });

    it("doesn't remove listeners added with `addEventListener`", () => {
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      ws.addEventListener('close', NOOP);
      ws.onclose = NOOP;

      let listeners = ws.listeners('close');

      assert.strictEqual(listeners.length, 2);
      assert.strictEqual(listeners[0][kListener], NOOP);
      assert.strictEqual(listeners[1][kListener], NOOP);

      ws.onclose = NOOP;

      listeners = ws.listeners('close');

      assert.strictEqual(listeners.length, 2);
      assert.strictEqual(listeners[0][kListener], NOOP);
      assert.strictEqual(listeners[1][kListener], NOOP);
    });

    it('supports the `removeEventListener` method', () => {
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      ws.addEventListener('message', NOOP);
      ws.addEventListener('open', NOOP);

      assert.strictEqual(ws.listeners('message')[0][kListener], NOOP);
      assert.strictEqual(ws.listeners('open')[0][kListener], NOOP);

      ws.removeEventListener('message', () => {});

      assert.strictEqual(ws.listeners('message')[0][kListener], NOOP);

      ws.removeEventListener('message', NOOP);
      ws.removeEventListener('open', NOOP);

      assert.strictEqual(ws.listenerCount('message'), 0);
      assert.strictEqual(ws.listenerCount('open'), 0);

      ws.addEventListener('message', NOOP, { once: true });
      ws.addEventListener('open', NOOP, { once: true });

      assert.strictEqual(ws.listeners('message')[0][kListener], NOOP);
      assert.strictEqual(ws.listeners('open')[0][kListener], NOOP);

      ws.removeEventListener('message', () => {});

      assert.strictEqual(ws.listeners('message')[0][kListener], NOOP);

      ws.removeEventListener('message', NOOP);
      ws.removeEventListener('open', NOOP);

      assert.strictEqual(ws.listenerCount('message'), 0);
      assert.strictEqual(ws.listenerCount('open'), 0);

      // Multiple listeners.
      ws.addEventListener('message', NOOP);
      ws.addEventListener('message', NOOP);

      assert.strictEqual(ws.listeners('message')[0][kListener], NOOP);
      assert.strictEqual(ws.listeners('message')[1][kListener], NOOP);

      ws.removeEventListener('message', NOOP);

      assert.strictEqual(ws.listeners('message')[0][kListener], NOOP);

      ws.removeEventListener('message', NOOP);

      assert.strictEqual(ws.listenerCount('message'), 0);

      // Listeners not added with `websocket.addEventListener()`.
      ws.on('message', NOOP);

      assert.deepStrictEqual(ws.listeners('message'), [NOOP]);

      ws.removeEventListener('message', NOOP);

      assert.deepStrictEqual(ws.listeners('message'), [NOOP]);

      ws.onclose = NOOP;

      assert.strictEqual(ws.listeners('close')[0][kListener], NOOP);

      ws.removeEventListener('close', NOOP);

      assert.strictEqual(ws.listeners('close')[0][kListener], NOOP);
    });

    it('wraps text data in a `MessageEvent`', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.addEventListener('open', () => {
          ws.send('hi');
          ws.close();
        });

        ws.addEventListener('message', (event) => {
          assert.ok(event instanceof MessageEvent);
          assert.strictEqual(event.data, 'hi');
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg, isBinary) => {
          ws.send(msg, { binary: isBinary });
        });
      });
    });

    it('receives a `CloseEvent` when server closes (1000)', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.addEventListener('close', (event) => {
          assert.ok(event instanceof CloseEvent);
          assert.ok(event.wasClean);
          assert.strictEqual(event.reason, '');
          assert.strictEqual(event.code, 1000);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => ws.close(1000));
    });

    it('receives a `CloseEvent` when server closes (4000)', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.addEventListener('close', (event) => {
          assert.ok(event instanceof CloseEvent);
          assert.ok(event.wasClean);
          assert.strictEqual(event.reason, 'some daft reason');
          assert.strictEqual(event.code, 4000);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => ws.close(4000, 'some daft reason'));
    });

    it('sets `target` and `type` on events', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const err = new Error('forced');
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.addEventListener('open', (event) => {
          assert.ok(event instanceof Event);
          assert.strictEqual(event.type, 'open');
          assert.strictEqual(event.target, ws);
        });
        ws.addEventListener('message', (event) => {
          assert.ok(event instanceof MessageEvent);
          assert.strictEqual(event.type, 'message');
          assert.strictEqual(event.target, ws);
          ws.close();
        });
        ws.addEventListener('close', (event) => {
          assert.ok(event instanceof CloseEvent);
          assert.strictEqual(event.type, 'close');
          assert.strictEqual(event.target, ws);
          ws.emit('error', err);
        });
        ws.addEventListener('error', (event) => {
          assert.ok(event instanceof ErrorEvent);
          assert.strictEqual(event.message, 'forced');
          assert.strictEqual(event.type, 'error');
          assert.strictEqual(event.target, ws);
          assert.strictEqual(event.error, err);

          wss.close(done);
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

      wss.on('connection', (ws) => {
        ws.send(new Uint8Array(4096));
        ws.close();
      });
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

      wss.on('connection', (ws) => {
        ws.send('foo');
        ws.close();
      });
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
              testType('fragments', () => {
                ws.close();
                wss.close(done);
              });
            });
          });
        };
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg, isBinary) => {
          assert.ok(isBinary);
          ws.send(msg);
        });
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
        server.close(done);
      });

      server.listen(0, () => {
        const ws = new WebSocket(`wss://127.0.0.1:${server.address().port}`, {
          rejectUnauthorized: false
        });

        ws.on('open', ws.close);
      });
    });

    it('connects to secure websocket server with client side certificate', (done) => {
      const server = https.createServer({
        cert: fs.readFileSync('test/fixtures/certificate.pem'),
        ca: [fs.readFileSync('test/fixtures/ca-certificate.pem')],
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
      });

      server.listen(0, () => {
        const ws = new WebSocket(`wss://localhost:${server.address().port}`, {
          cert: fs.readFileSync('test/fixtures/client-certificate.pem'),
          key: fs.readFileSync('test/fixtures/client-key.pem'),
          rejectUnauthorized: false
        });

        ws.on('open', ws.close);
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
        ws.on('message', (message, isBinary) => {
          assert.deepStrictEqual(message, Buffer.from('foobar'));
          assert.ok(!isBinary);
          server.close(done);
        });
      });

      server.listen(0, () => {
        const ws = new WebSocket(`wss://localhost:${server.address().port}`, {
          rejectUnauthorized: false
        });

        ws.on('open', () => {
          ws.send('foobar');
          ws.close();
        });
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
        ws.on('message', (message, isBinary) => {
          assert.ok(isBinary);
          ws.send(message);
          ws.close();
        });
      });

      server.listen(0, () => {
        const ws = new WebSocket(`wss://localhost:${server.address().port}`, {
          rejectUnauthorized: false
        });

        ws.on('open', () => ws.send(buf));
        ws.on('message', (message, isBinary) => {
          assert.deepStrictEqual(message, buf);
          assert.ok(isBinary);

          server.close(done);
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

    it("works around a double 'error' event bug in Node.js", function (done) {
      //
      // The `minVersion` and `maxVersion` options are not supported in
      // Node.js < 10.16.0.
      //
      if (process.versions.modules < 64) return this.skip();

      //
      // The `'error'` event can be emitted multiple times by the
      // `http.ClientRequest` object in Node.js < 13. This test reproduces the
      // issue in Node.js 12.
      //
      const server = https.createServer({
        cert: fs.readFileSync('test/fixtures/certificate.pem'),
        key: fs.readFileSync('test/fixtures/key.pem'),
        minVersion: 'TLSv1.2'
      });
      const wss = new WebSocket.Server({ server });

      server.listen(0, () => {
        const ws = new WebSocket(`wss://localhost:${server.address().port}`, {
          maxVersion: 'TLSv1.1',
          rejectUnauthorized: false
        });

        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          server.close(done);
          wss.close();
        });
      });
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

          ws.on('open', () => {
            ws.send('hi', { compress: true });
            ws.close();
          });

          ws.on('message', (message, isBinary) => {
            assert.deepStrictEqual(message, Buffer.from('hi'));
            assert.ok(!isBinary);
            wss.close(done);
          });
        }
      );

      wss.on('connection', (ws) => {
        ws.on('message', (message, isBinary) => {
          ws.send(message, { binary: isBinary, compress: true });
        });
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

          ws.on('open', () => {
            ws.send(array, { compress: true });
            ws.close();
          });

          ws.on('message', (message, isBinary) => {
            assert.deepStrictEqual(message, Buffer.from(array.buffer));
            assert.ok(isBinary);
            wss.close(done);
          });
        }
      );

      wss.on('connection', (ws) => {
        ws.on('message', (message, isBinary) => {
          assert.ok(isBinary);
          ws.send(message, { compress: true });
        });
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

          ws.on('open', () => {
            ws.send(array.buffer, { compress: true });
            ws.close();
          });

          ws.on('message', (message, isBinary) => {
            assert.deepStrictEqual(message, Buffer.from(array.buffer));
            assert.ok(isBinary);
            wss.close(done);
          });
        }
      );

      wss.on('connection', (ws) => {
        ws.on('message', (message, isBinary) => {
          assert.ok(isBinary);
          ws.send(message, { compress: true });
        });
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

          ws.on('message', (message, isBinary) => {
            assert.ok(!isBinary);
            messages.push(message.toString());
          });

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

    it('handles a close frame received while compressing data', (done) => {
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
            ws._receiver.on('conclude', () => {
              assert.ok(ws._sender._deflating);
            });

            ws.send('foo');
            ws.send('bar');
            ws.send('baz');
            ws.send('qux');
          });
        }
      );

      wss.on('connection', (ws) => {
        const messages = [];

        ws.on('message', (message, isBinary) => {
          assert.ok(!isBinary);
          messages.push(message.toString());
        });

        ws.on('close', (code, reason) => {
          assert.deepStrictEqual(messages, ['foo', 'bar', 'baz', 'qux']);
          assert.strictEqual(code, 1000);
          assert.deepStrictEqual(reason, EMPTY_BUFFER);
          wss.close(done);
        });

        ws.close(1000);
      });
    });

    describe('#close', () => {
      it('can be used while data is being decompressed', (done) => {
        const wss = new WebSocket.Server(
          {
            perMessageDeflate: true,
            port: 0
          },
          () => {
            const messages = [];
            const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

            ws.on('open', () => {
              ws._socket.on('end', () => {
                assert.strictEqual(ws._receiver._state, 5);
              });
            });

            ws.on('message', (message, isBinary) => {
              assert.ok(!isBinary);

              if (messages.push(message.toString()) > 1) return;

              ws.close(1000);
            });

            ws.on('close', (code, reason) => {
              assert.deepStrictEqual(messages, ['', '', '', '']);
              assert.strictEqual(code, 1000);
              assert.deepStrictEqual(reason, EMPTY_BUFFER);
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

    describe('#send', () => {
      it('ignores the `compress` option if the extension is disabled', (done) => {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
            perMessageDeflate: false
          });

          ws.on('open', () => {
            ws.send('hi', { compress: true });
            ws.close();
          });

          ws.on('message', (message, isBinary) => {
            assert.deepStrictEqual(message, Buffer.from('hi'));
            assert.ok(!isBinary);
            wss.close(done);
          });
        });

        wss.on('connection', (ws) => {
          ws.on('message', (message, isBinary) => {
            ws.send(message, { binary: isBinary, compress: true });
          });
        });
      });

      it('calls the callback if the socket is closed prematurely', (done) => {
        const called = [];
        const wss = new WebSocket.Server(
          { perMessageDeflate: true, port: 0 },
          () => {
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
          }
        );

        wss.on('connection', (ws) => {
          ws.on('close', () => {
            assert.deepStrictEqual(called, [1, 2]);
            wss.close(done);
          });

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

            ws.on('message', (message, isBinary) => {
              assert.ok(!isBinary);

              if (messages.push(message.toString()) > 1) return;

              process.nextTick(() => {
                assert.strictEqual(ws._receiver._state, 5);
                ws.terminate();
              });
            });

            ws.on('close', (code, reason) => {
              assert.deepStrictEqual(messages, ['', '', '', '']);
              assert.strictEqual(code, 1006);
              assert.strictEqual(reason, EMPTY_BUFFER);
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

  describe('Connection close edge cases', () => {
    it('closes cleanly after simultaneous errors (1/2)', (done) => {
      let clientCloseEventEmitted = false;
      let serverClientCloseEventEmitted = false;

      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('error', (err) => {
          assert.ok(err instanceof RangeError);
          assert.strictEqual(err.code, 'WS_ERR_INVALID_OPCODE');
          assert.strictEqual(
            err.message,
            'Invalid WebSocket frame: invalid opcode 5'
          );

          ws.on('close', (code, reason) => {
            assert.strictEqual(code, 1006);
            assert.strictEqual(reason, EMPTY_BUFFER);

            clientCloseEventEmitted = true;
            if (serverClientCloseEventEmitted) wss.close(done);
          });
        });

        ws.on('open', () => {
          // Write an invalid frame in both directions to trigger simultaneous
          // failure.
          const chunk = Buffer.from([0x85, 0x00]);

          wss.clients.values().next().value._socket.write(chunk);
          ws._socket.write(chunk);
        });
      });

      wss.on('connection', (ws) => {
        ws.on('error', (err) => {
          assert.ok(err instanceof RangeError);
          assert.strictEqual(err.code, 'WS_ERR_INVALID_OPCODE');
          assert.strictEqual(
            err.message,
            'Invalid WebSocket frame: invalid opcode 5'
          );

          ws.on('close', (code, reason) => {
            assert.strictEqual(code, 1006);
            assert.strictEqual(reason, EMPTY_BUFFER);

            serverClientCloseEventEmitted = true;
            if (clientCloseEventEmitted) wss.close(done);
          });
        });
      });
    });

    it('closes cleanly after simultaneous errors (2/2)', (done) => {
      let clientCloseEventEmitted = false;
      let serverClientCloseEventEmitted = false;

      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('error', (err) => {
          assert.ok(err instanceof RangeError);
          assert.strictEqual(err.code, 'WS_ERR_INVALID_OPCODE');
          assert.strictEqual(
            err.message,
            'Invalid WebSocket frame: invalid opcode 5'
          );

          ws.on('close', (code, reason) => {
            assert.strictEqual(code, 1006);
            assert.strictEqual(reason, EMPTY_BUFFER);

            clientCloseEventEmitted = true;
            if (serverClientCloseEventEmitted) wss.close(done);
          });
        });

        ws.on('open', () => {
          // Write an invalid frame in both directions and change the
          // `readyState` to `WebSocket.CLOSING`.
          const chunk = Buffer.from([0x85, 0x00]);
          const serverWs = wss.clients.values().next().value;

          serverWs._socket.write(chunk);
          serverWs.close();

          ws._socket.write(chunk);
          ws.close();
        });
      });

      wss.on('connection', (ws) => {
        ws.on('error', (err) => {
          assert.ok(err instanceof RangeError);
          assert.strictEqual(err.code, 'WS_ERR_INVALID_OPCODE');
          assert.strictEqual(
            err.message,
            'Invalid WebSocket frame: invalid opcode 5'
          );

          ws.on('close', (code, reason) => {
            assert.strictEqual(code, 1006);
            assert.strictEqual(reason, EMPTY_BUFFER);

            serverClientCloseEventEmitted = true;
            if (clientCloseEventEmitted) wss.close(done);
          });
        });
      });
    });
  });
});
