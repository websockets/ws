/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^ws$" }] */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const path = require('path');
const net = require('net');
const tls = require('tls');
const os = require('os');
const fs = require('fs');
const { getDefaultHighWaterMark } = require('stream');
const { URL } = require('url');

const Sender = require('../lib/sender');
const WebSocket = require('..');
const {
  CloseEvent,
  ErrorEvent,
  Event,
  MessageEvent
} = require('../lib/event-target');
const {
  EMPTY_BUFFER,
  GUID,
  hasBlob,
  kListener,
  NOOP
} = require('../lib/constants');

const highWaterMark = getDefaultHighWaterMark
  ? getDefaultHighWaterMark(false)
  : 16 * 1024;

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
        () => new WebSocket('bad-scheme://websocket-echo.com'),
        (err) => {
          assert.strictEqual(
            err.message,
            'The URL\'s protocol must be one of "ws:", "wss:", ' +
              '"http:", "https:", or "ws+unix:"'
          );

          return true;
        }
      );

      assert.throws(
        () => new WebSocket('ws+unix:'),
        /^SyntaxError: The URL's pathname is empty$/
      );

      assert.throws(
        () => new WebSocket('wss://websocket-echo.com#foo'),
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
      const agent = new http.Agent();

      agent.addRequest = (req, opts) => {
        assert.strictEqual(opts.host, '::1');
        assert.strictEqual(req.path, '/');
        done();
      };

      const ws = new WebSocket(new URL('ws://[::1]'), { agent });
    });

    it('allows the http scheme', (done) => {
      const agent = new CustomAgent();

      agent.addRequest = (req, opts) => {
        assert.strictEqual(opts.host, 'localhost');
        assert.strictEqual(opts.port, 80);
        done();
      };

      const ws = new WebSocket('http://localhost', { agent });
    });

    it('allows the https scheme', (done) => {
      const agent = new https.Agent();

      agent.addRequest = (req, opts) => {
        assert.strictEqual(opts.host, 'localhost');
        assert.strictEqual(opts.port, 443);
        done();
      };

      const ws = new WebSocket('https://localhost', { agent });
    });

    describe('options', () => {
      it('accepts the `options` object as 3rd argument', () => {
        const agent = new http.Agent();
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
        assert.throws(
          () => new WebSocket('ws://localhost', { protocolVersion: 1000 }),
          /^RangeError: Unsupported protocol version: 1000 \(supported versions: 8, 13\)$/
        );
      });

      it('honors the `generateMask` option', (done) => {
        const data = Buffer.from('foo');
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
            generateMask() {}
          });

          ws.on('open', () => {
            ws.send(data);
          });

          ws.on('close', (code, reason) => {
            assert.strictEqual(code, 1005);
            assert.deepStrictEqual(reason, EMPTY_BUFFER);

            wss.close(done);
          });
        });

        wss.on('connection', (ws) => {
          const chunks = [];

          ws._socket.prependListener('data', (chunk) => {
            chunks.push(chunk);
          });

          ws.on('message', (message) => {
            assert.deepStrictEqual(message, data);
            assert.deepStrictEqual(
              Buffer.concat(chunks).slice(2, 6),
              Buffer.alloc(4)
            );

            ws.close();
          });
        });
      });

      it('honors the `autoPong` option', (done) => {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
            autoPong: false
          });

          ws.on('ping', () => {
            ws.close();
          });

          ws.on('close', () => {
            wss.close(done);
          });
        });

        wss.on('connection', (ws) => {
          ws.on('pong', () => {
            done(new Error("Unexpected 'pong' event"));
          });

          ws.ping();
        });
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

    describe('`isPaused`', () => {
      it('is enumerable and configurable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(
          WebSocket.prototype,
          'isPaused'
        );

        assert.strictEqual(descriptor.configurable, true);
        assert.strictEqual(descriptor.enumerable, true);
        assert.ok(descriptor.get !== undefined);
        assert.ok(descriptor.set === undefined);
      });

      it('indicates whether the websocket is paused', (done) => {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

          ws.on('open', () => {
            ws.pause();
            assert.ok(ws.isPaused);

            ws.resume();
            assert.ok(!ws.isPaused);

            ws.close();
            wss.close(done);
          });

          assert.ok(!ws.isPaused);
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
        const schemes = new Map([
          ['ws', 'ws'],
          ['wss', 'wss'],
          ['http', 'ws'],
          ['https', 'wss']
        ]);

        for (const [key, value] of schemes) {
          const ws = new WebSocket(`${key}://localhost/`, { lookup() {} });

          assert.strictEqual(ws.url, `${value}://localhost/`);
        }
      });
    });
  });

  describe('Events', () => {
    it("emits an 'error' event if an error occurs (1/2)", (done) => {
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

    it("emits an 'error' event if an error occurs (2/2)", function (done) {
      if (!fs.openAsBlob) return this.skip();

      const randomString = crypto.randomBytes(4).toString('hex');
      const file = path.join(os.tmpdir(), `ws-${randomString}.txt`);

      fs.writeFileSync(file, 'x'.repeat(64));

      fs.openAsBlob(file)
        .then((blob) => {
          fs.writeFileSync(file, 'x'.repeat(32));
          runTest(blob);
        })
        .catch(done);

      function runTest(blob) {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
        });

        wss.on('connection', (ws) => {
          ws.send(blob);

          ws.on('error', (err) => {
            try {
              assert.ok(err instanceof DOMException);
              assert.strictEqual(err.name, 'NotReadableError');
              assert.strictEqual(err.message, 'The blob could not be read');
            } finally {
              fs.unlinkSync(file);
            }

            ws.on('close', () => {
              wss.close(done);
            });
          });
        });
      }
    });

    it("emits the 'error' event only once (1/2)", function (done) {
      if (!fs.openAsBlob) return this.skip();

      const randomString = crypto.randomBytes(4).toString('hex');
      const file = path.join(os.tmpdir(), `ws-${randomString}.txt`);

      fs.writeFileSync(file, 'x'.repeat(64));

      fs.openAsBlob(file)
        .then((blob) => {
          fs.writeFileSync(file, 'x'.repeat(32));
          runTest(blob);
        })
        .catch(done);

      function runTest(blob) {
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
              ws.send(blob);
            });

            ws.on('error', (err) => {
              try {
                assert.ok(err instanceof RangeError);
                assert.strictEqual(err.code, 'WS_ERR_INVALID_OPCODE');
                assert.strictEqual(
                  err.message,
                  'Invalid WebSocket frame: invalid opcode 5'
                );
              } finally {
                fs.unlinkSync(file);
              }

              ws.on('close', () => {
                wss.close(done);
              });
            });
          }
        );

        wss.on('connection', (ws) => {
          ws._socket.write(Buffer.from([0x85, 0x00]));
        });
      }
    });

    it("emits the 'error' event only once (2/2)", function (done) {
      if (!fs.openAsBlob) return this.skip();

      const randomString = crypto.randomBytes(4).toString('hex');
      const file = path.join(os.tmpdir(), `ws-${randomString}.txt`);

      fs.writeFileSync(file, 'x'.repeat(64));

      fs.openAsBlob(file)
        .then((blob) => {
          fs.writeFileSync(file, 'x'.repeat(32));
          runTest(blob);
        })
        .catch(done);

      function runTest(blob) {
        const wss = new WebSocket.Server(
          {
            perMessageDeflate: true,
            port: 0
          },
          () => {
            const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

            ws.on('open', () => {
              ws.send(blob);
            });

            ws.on('error', (err) => {
              try {
                assert.ok(err instanceof DOMException);
                assert.strictEqual(err.name, 'NotReadableError');
                assert.strictEqual(err.message, 'The blob could not be read');
              } finally {
                fs.unlinkSync(file);
              }

              ws.on('close', () => {
                wss.close(done);
              });
            });
          }
        );

        wss.on('connection', (ws) => {
          const buf = Buffer.from('c10100'.repeat(5) + '8500', 'hex');

          ws._socket.write(buf);
        });
      }
    });

    it("does not emit 'error' after 'close'", function (done) {
      if (!fs.openAsBlob) return this.skip();

      const randomString = crypto.randomBytes(4).toString('hex');
      const file = path.join(os.tmpdir(), `ws-${randomString}.bin`);

      fs.writeFileSync(file, crypto.randomBytes(1024 * 1024));
      fs.openAsBlob(file).then(runTest).catch(done);

      function runTest(blob) {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

          ws.on('open', () => {
            ws.send(blob, (err) => {
              try {
                assert.ok(err instanceof DOMException);
                assert.strictEqual(err.name, 'NotReadableError');
                assert.strictEqual(err.message, 'The blob could not be read');
              } catch (e) {
                ws.removeListener(onClose);
                throw e;
              } finally {
                fs.unlinkSync(file);
              }

              wss.close(done);
            });
          });

          ws.on('error', () => {
            done(new Error("Unexpected 'error' event"));
          });
          ws.on('close', onClose);

          function onClose() {
            fs.writeFileSync(file, crypto.randomBytes(32));
          }
        });

        wss.on('connection', (ws) => {
          ws._socket.end();
        });
      }
    });

    it('does not re-emit `net.Socket` errors', function (done) {
      //
      // `socket.resetAndDestroy()` is not available in Node.js < 16.17.0.
      //
      if (process.versions.modules < 93) return this.skip();

      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          ws._socket.on('error', (err) => {
            assert.ok(err instanceof Error);
            assert.strictEqual(err.code, 'ECONNRESET');
            ws.on('close', (code, message) => {
              assert.strictEqual(code, 1006);
              assert.strictEqual(message, EMPTY_BUFFER);
              wss.close(done);
            });
          });

          wss.clients.values().next().value._socket.resetAndDestroy();
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

    it("emits a 'redirect' event", (done) => {
      const server = http.createServer();
      const wss = new WebSocket.Server({ noServer: true, path: '/foo' });

      server.once('upgrade', (req, socket) => {
        socket.end('HTTP/1.1 302 Found\r\nLocation: /foo\r\n\r\n');
        server.once('upgrade', (req, socket, head) => {
          wss.handleUpgrade(req, socket, head, (ws) => {
            ws.close();
          });
        });
      });

      server.listen(() => {
        const port = server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`, {
          followRedirects: true
        });

        ws.on('redirect', (url, req) => {
          assert.strictEqual(ws._redirects, 1);
          assert.strictEqual(url, `ws://localhost:${port}/foo`);
          assert.ok(req instanceof http.ClientRequest);

          ws.on('close', (code) => {
            assert.strictEqual(code, 1005);
            server.close(done);
          });
        });
      });
    });
  });

  describe('Connection establishing', () => {
    const server = http.createServer();

    beforeEach((done) => server.listen(0, done));
    afterEach((done) => server.close(done));

    it('fails if the Upgrade header field value cannot be read', (done) => {
      server.once('upgrade', (req, socket) => {
        socket.on('end', socket.end);
        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
            'Connection: Upgrade\r\n' +
            'Upgrade: websocket\r\n' +
            '\r\n'
        );
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);

      ws._req.maxHeadersCount = 1;

      ws.on('upgrade', (res) => {
        assert.deepStrictEqual(res.headers, { connection: 'Upgrade' });

        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.message, 'Invalid Upgrade header');
          done();
        });
      });
    });

    it('fails if the Upgrade header field value is not "websocket"', (done) => {
      server.once('upgrade', (req, socket) => {
        socket.on('end', socket.end);
        socket.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
            'Connection: Upgrade\r\n' +
            'Upgrade: foo\r\n' +
            '\r\n'
        );
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);

      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Invalid Upgrade header');
        done();
      });
    });

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

    it('fails if server sends an invalid subprotocol (1/2)', (done) => {
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

    it('fails if server sends an invalid subprotocol (2/2)', (done) => {
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
            'Sec-WebSocket-Protocol:\r\n' +
            '\r\n'
        );
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`, [
        'foo',
        'bar'
      ]);

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'Server sent an invalid subprotocol');
        ws.on('close', () => done());
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

    it('honors the `createConnection` option', (done) => {
      const wss = new WebSocket.Server({ noServer: true, path: '/foo' });

      server.once('upgrade', (req, socket, head) => {
        assert.strictEqual(req.headers.host, 'google.com:22');
        wss.handleUpgrade(req, socket, head, NOOP);
      });

      const ws = new WebSocket('ws://google.com:22/foo', {
        createConnection: (options) => {
          assert.strictEqual(options.host, 'google.com');
          assert.strictEqual(options.port, '22');

          // Ignore the `options` argument, and use the correct hostname and
          // port to connect to the server.
          return net.createConnection({
            host: 'localhost',
            port: server.address().port
          });
        }
      });

      ws.on('open', () => {
        assert.strictEqual(ws.url, 'ws://google.com:22/foo');
        ws.on('close', () => done());
        ws.close();
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

    it('emits an error if the redirect URL is invalid (1/2)', (done) => {
      server.once('upgrade', (req, socket) => {
        socket.end('HTTP/1.1 302 Found\r\nLocation: ws://\r\n\r\n');
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`, {
        followRedirects: true
      });

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof SyntaxError);
        assert.strictEqual(err.message, 'Invalid URL: ws://');
        assert.strictEqual(ws._redirects, 1);

        ws.on('close', () => done());
      });
    });

    it('emits an error if the redirect URL is invalid (2/2)', (done) => {
      server.once('upgrade', (req, socket) => {
        socket.end(
          'HTTP/1.1 302 Found\r\nLocation: bad-scheme://localhost\r\n\r\n'
        );
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`, {
        followRedirects: true
      });

      ws.on('open', () => done(new Error("Unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof SyntaxError);
        assert.strictEqual(
          err.message,
          'The URL\'s protocol must be one of "ws:", "wss:", ' +
            '"http:", "https:", or "ws+unix:"'
        );
        assert.strictEqual(ws._redirects, 1);

        ws.on('close', () => done());
      });
    });

    it('uses the first url userinfo when following redirects', (done) => {
      const wss = new WebSocket.Server({ noServer: true, path: '/foo' });
      const authorization = 'Basic Zm9vOmJhcg==';

      server.once('upgrade', (req, socket) => {
        socket.end(
          'HTTP/1.1 302 Found\r\n' +
            `Location: ws://baz:qux@localhost:${port}/foo\r\n\r\n`
        );
        server.once('upgrade', (req, socket, head) => {
          wss.handleUpgrade(req, socket, head, (ws, req) => {
            assert.strictEqual(req.headers.authorization, authorization);
            ws.close();
          });
        });
      });

      const port = server.address().port;
      const ws = new WebSocket(`ws://foo:bar@localhost:${port}`, {
        followRedirects: true
      });

      assert.strictEqual(ws._req.getHeader('Authorization'), authorization);

      ws.on('close', (code) => {
        assert.strictEqual(code, 1005);
        assert.strictEqual(ws.url, `ws://baz:qux@localhost:${port}/foo`);
        assert.strictEqual(ws._redirects, 1);

        wss.close(done);
      });
    });

    describe('When moving away from a secure context', () => {
      function proxy(httpServer, httpsServer) {
        const server = net.createServer({ allowHalfOpen: true });

        server.on('connection', (socket) => {
          socket.on('readable', function read() {
            socket.removeListener('readable', read);

            const buf = socket.read(1);
            const target = buf[0] === 22 ? httpsServer : httpServer;

            socket.unshift(buf);
            target.emit('connection', socket);
          });
        });

        return server;
      }

      describe("If there is no 'redirect' event listener", () => {
        it('drops the `auth` option', (done) => {
          const httpServer = http.createServer();
          const httpsServer = https.createServer({
            cert: fs.readFileSync('test/fixtures/certificate.pem'),
            key: fs.readFileSync('test/fixtures/key.pem')
          });
          const server = proxy(httpServer, httpsServer);

          server.listen(() => {
            const port = server.address().port;

            httpsServer.on('upgrade', (req, socket) => {
              socket.on('error', NOOP);
              socket.end(
                'HTTP/1.1 302 Found\r\n' +
                  `Location: ws://localhost:${port}/\r\n\r\n`
              );
            });

            const wss = new WebSocket.Server({ server: httpServer });

            wss.on('connection', (ws, req) => {
              assert.strictEqual(req.headers.authorization, undefined);
              ws.close();
            });

            const ws = new WebSocket(`wss://localhost:${port}`, {
              auth: 'foo:bar',
              followRedirects: true,
              rejectUnauthorized: false
            });

            assert.strictEqual(
              ws._req.getHeader('Authorization'),
              'Basic Zm9vOmJhcg=='
            );

            ws.on('close', (code) => {
              assert.strictEqual(code, 1005);
              assert.strictEqual(ws.url, `ws://localhost:${port}/`);
              assert.strictEqual(ws._redirects, 1);

              server.close(done);
            });
          });
        });

        it('drops the Authorization and Cookie headers', (done) => {
          const httpServer = http.createServer();
          const httpsServer = https.createServer({
            cert: fs.readFileSync('test/fixtures/certificate.pem'),
            key: fs.readFileSync('test/fixtures/key.pem')
          });
          const server = proxy(httpServer, httpsServer);

          server.listen(() => {
            const port = server.address().port;

            httpsServer.on('upgrade', (req, socket) => {
              socket.on('error', NOOP);
              socket.end(
                'HTTP/1.1 302 Found\r\n' +
                  `Location: ws://localhost:${port}/\r\n\r\n`
              );
            });

            const headers = {
              authorization: 'Basic Zm9vOmJhcg==',
              cookie: 'foo=bar',
              host: 'foo'
            };

            const wss = new WebSocket.Server({ server: httpServer });

            wss.on('connection', (ws, req) => {
              assert.strictEqual(req.headers.authorization, undefined);
              assert.strictEqual(req.headers.cookie, undefined);
              assert.strictEqual(req.headers.host, headers.host);

              ws.close();
            });

            const ws = new WebSocket(`wss://localhost:${port}`, {
              followRedirects: true,
              headers,
              rejectUnauthorized: false
            });

            const firstRequest = ws._req;

            assert.strictEqual(
              firstRequest.getHeader('Authorization'),
              headers.authorization
            );
            assert.strictEqual(
              firstRequest.getHeader('Cookie'),
              headers.cookie
            );
            assert.strictEqual(firstRequest.getHeader('Host'), headers.host);

            ws.on('close', (code) => {
              assert.strictEqual(code, 1005);
              assert.strictEqual(ws.url, `ws://localhost:${port}/`);
              assert.strictEqual(ws._redirects, 1);

              server.close(done);
            });
          });
        });
      });

      describe("If there is at least one 'redirect' event listener", () => {
        it('does not drop any headers by default', (done) => {
          const httpServer = http.createServer();
          const httpsServer = https.createServer({
            cert: fs.readFileSync('test/fixtures/certificate.pem'),
            key: fs.readFileSync('test/fixtures/key.pem')
          });
          const server = proxy(httpServer, httpsServer);

          server.listen(() => {
            const port = server.address().port;

            httpsServer.on('upgrade', (req, socket) => {
              socket.on('error', NOOP);
              socket.end(
                'HTTP/1.1 302 Found\r\n' +
                  `Location: ws://localhost:${port}/\r\n\r\n`
              );
            });

            const headers = {
              authorization: 'Basic Zm9vOmJhcg==',
              cookie: 'foo=bar',
              host: 'foo'
            };

            const wss = new WebSocket.Server({ server: httpServer });

            wss.on('connection', (ws, req) => {
              assert.strictEqual(
                req.headers.authorization,
                headers.authorization
              );
              assert.strictEqual(req.headers.cookie, headers.cookie);
              assert.strictEqual(req.headers.host, headers.host);

              ws.close();
            });

            const ws = new WebSocket(`wss://localhost:${port}`, {
              followRedirects: true,
              headers,
              rejectUnauthorized: false
            });

            const firstRequest = ws._req;

            assert.strictEqual(
              firstRequest.getHeader('Authorization'),
              headers.authorization
            );
            assert.strictEqual(
              firstRequest.getHeader('Cookie'),
              headers.cookie
            );
            assert.strictEqual(firstRequest.getHeader('Host'), headers.host);

            ws.on('redirect', (url, req) => {
              assert.strictEqual(ws._redirects, 1);
              assert.strictEqual(url, `ws://localhost:${port}/`);
              assert.notStrictEqual(firstRequest, req);
              assert.strictEqual(
                req.getHeader('Authorization'),
                headers.authorization
              );
              assert.strictEqual(req.getHeader('Cookie'), headers.cookie);
              assert.strictEqual(req.getHeader('Host'), headers.host);

              ws.on('close', (code) => {
                assert.strictEqual(code, 1005);
                server.close(done);
              });
            });
          });
        });
      });
    });

    describe('When the redirect host is different', () => {
      describe("If there is no 'redirect' event listener", () => {
        it('drops the `auth` option', (done) => {
          const wss = new WebSocket.Server({ port: 0 }, () => {
            const port = wss.address().port;

            server.once('upgrade', (req, socket) => {
              socket.end(
                'HTTP/1.1 302 Found\r\n' +
                  `Location: ws://localhost:${port}/\r\n\r\n`
              );
            });

            const ws = new WebSocket(
              `ws://localhost:${server.address().port}`,
              {
                auth: 'foo:bar',
                followRedirects: true
              }
            );

            assert.strictEqual(
              ws._req.getHeader('Authorization'),
              'Basic Zm9vOmJhcg=='
            );

            ws.on('close', (code) => {
              assert.strictEqual(code, 1005);
              assert.strictEqual(ws.url, `ws://localhost:${port}/`);
              assert.strictEqual(ws._redirects, 1);

              wss.close(done);
            });
          });

          wss.on('connection', (ws, req) => {
            assert.strictEqual(req.headers.authorization, undefined);
            ws.close();
          });
        });

        it('drops the Authorization, Cookie and Host headers (1/4)', (done) => {
          // Test the `ws:` to `ws:` case.

          const wss = new WebSocket.Server({ port: 0 }, () => {
            const port = wss.address().port;

            server.once('upgrade', (req, socket) => {
              socket.end(
                'HTTP/1.1 302 Found\r\n' +
                  `Location: ws://localhost:${port}/\r\n\r\n`
              );
            });

            const headers = {
              authorization: 'Basic Zm9vOmJhcg==',
              cookie: 'foo=bar',
              host: 'foo'
            };

            const ws = new WebSocket(
              `ws://localhost:${server.address().port}`,
              { followRedirects: true, headers }
            );

            const firstRequest = ws._req;

            assert.strictEqual(
              firstRequest.getHeader('Authorization'),
              headers.authorization
            );
            assert.strictEqual(
              firstRequest.getHeader('Cookie'),
              headers.cookie
            );
            assert.strictEqual(firstRequest.getHeader('Host'), headers.host);

            ws.on('close', (code) => {
              assert.strictEqual(code, 1005);
              assert.strictEqual(ws.url, `ws://localhost:${port}/`);
              assert.strictEqual(ws._redirects, 1);

              wss.close(done);
            });
          });

          wss.on('connection', (ws, req) => {
            assert.strictEqual(req.headers.authorization, undefined);
            assert.strictEqual(req.headers.cookie, undefined);
            assert.strictEqual(
              req.headers.host,
              `localhost:${wss.address().port}`
            );

            ws.close();
          });
        });

        it('drops the Authorization, Cookie and Host headers (2/4)', (done) => {
          // Test the `ws:` to `ws+unix:` case.

          const randomString = crypto.randomBytes(4).toString('hex');
          const ipcPath =
            process.platform === 'win32'
              ? `\\\\.\\pipe\\ws-pipe-${randomString}`
              : path.join(os.tmpdir(), `ws-${randomString}.sock`);

          server.once('upgrade', (req, socket) => {
            socket.end(
              `HTTP/1.1 302 Found\r\nLocation: ws+unix:${ipcPath}\r\n\r\n`
            );
          });

          const redirectedServer = http.createServer();
          const wss = new WebSocket.Server({ server: redirectedServer });

          wss.on('connection', (ws, req) => {
            assert.strictEqual(req.headers.authorization, undefined);
            assert.strictEqual(req.headers.cookie, undefined);
            assert.strictEqual(req.headers.host, 'localhost');

            ws.close();
          });

          redirectedServer.listen(ipcPath, () => {
            const headers = {
              authorization: 'Basic Zm9vOmJhcg==',
              cookie: 'foo=bar',
              host: 'foo'
            };

            const ws = new WebSocket(
              `ws://localhost:${server.address().port}`,
              { followRedirects: true, headers }
            );

            const firstRequest = ws._req;

            assert.strictEqual(
              firstRequest.getHeader('Authorization'),
              headers.authorization
            );
            assert.strictEqual(
              firstRequest.getHeader('Cookie'),
              headers.cookie
            );
            assert.strictEqual(firstRequest.getHeader('Host'), headers.host);

            ws.on('close', (code) => {
              assert.strictEqual(code, 1005);
              assert.strictEqual(ws.url, `ws+unix:${ipcPath}`);
              assert.strictEqual(ws._redirects, 1);

              redirectedServer.close(done);
            });
          });
        });

        it('drops the Authorization, Cookie and Host headers (3/4)', (done) => {
          // Test the `ws+unix:` to `ws+unix:` case.

          const randomString1 = crypto.randomBytes(4).toString('hex');
          const randomString2 = crypto.randomBytes(4).toString('hex');
          let redirectingServerIpcPath;
          let redirectedServerIpcPath;

          if (process.platform === 'win32') {
            redirectingServerIpcPath = `\\\\.\\pipe\\ws-pipe-${randomString1}`;
            redirectedServerIpcPath = `\\\\.\\pipe\\ws-pipe-${randomString2}`;
          } else {
            redirectingServerIpcPath = path.join(
              os.tmpdir(),
              `ws-${randomString1}.sock`
            );
            redirectedServerIpcPath = path.join(
              os.tmpdir(),
              `ws-${randomString2}.sock`
            );
          }

          const redirectingServer = http.createServer();

          redirectingServer.on('upgrade', (req, socket) => {
            socket.end(
              'HTTP/1.1 302 Found\r\n' +
                `Location: ws+unix:${redirectedServerIpcPath}\r\n\r\n`
            );
          });

          const redirectedServer = http.createServer();
          const wss = new WebSocket.Server({ server: redirectedServer });

          wss.on('connection', (ws, req) => {
            assert.strictEqual(req.headers.authorization, undefined);
            assert.strictEqual(req.headers.cookie, undefined);
            assert.strictEqual(req.headers.host, 'localhost');

            ws.close();
          });

          redirectingServer.listen(redirectingServerIpcPath, listening);
          redirectedServer.listen(redirectedServerIpcPath, listening);

          let callCount = 0;

          function listening() {
            if (++callCount !== 2) return;

            const headers = {
              authorization: 'Basic Zm9vOmJhcg==',
              cookie: 'foo=bar',
              host: 'foo'
            };

            const ws = new WebSocket(`ws+unix:${redirectingServerIpcPath}`, {
              followRedirects: true,
              headers
            });

            const firstRequest = ws._req;

            assert.strictEqual(
              firstRequest.getHeader('Authorization'),
              headers.authorization
            );
            assert.strictEqual(
              firstRequest.getHeader('Cookie'),
              headers.cookie
            );
            assert.strictEqual(firstRequest.getHeader('Host'), headers.host);

            ws.on('close', (code) => {
              assert.strictEqual(code, 1005);
              assert.strictEqual(ws.url, `ws+unix:${redirectedServerIpcPath}`);
              assert.strictEqual(ws._redirects, 1);

              redirectingServer.close();
              redirectedServer.close(done);
            });
          }
        });

        it('drops the Authorization, Cookie and Host headers (4/4)', (done) => {
          // Test the `ws+unix:` to `ws:` case.

          const redirectingServer = http.createServer();
          const redirectedServer = http.createServer();
          const wss = new WebSocket.Server({ server: redirectedServer });

          wss.on('connection', (ws, req) => {
            assert.strictEqual(req.headers.authorization, undefined);
            assert.strictEqual(req.headers.cookie, undefined);
            assert.strictEqual(
              req.headers.host,
              `localhost:${redirectedServer.address().port}`
            );

            ws.close();
          });

          const randomString = crypto.randomBytes(4).toString('hex');
          const ipcPath =
            process.platform === 'win32'
              ? `\\\\.\\pipe\\ws-pipe-${randomString}`
              : path.join(os.tmpdir(), `ws-${randomString}.sock`);

          redirectingServer.listen(ipcPath, listening);
          redirectedServer.listen(0, listening);

          let callCount = 0;

          function listening() {
            if (++callCount !== 2) return;

            const port = redirectedServer.address().port;

            redirectingServer.on('upgrade', (req, socket) => {
              socket.end(
                `HTTP/1.1 302 Found\r\nLocation: ws://localhost:${port}\r\n\r\n`
              );
            });

            const headers = {
              authorization: 'Basic Zm9vOmJhcg==',
              cookie: 'foo=bar',
              host: 'foo'
            };

            const ws = new WebSocket(`ws+unix:${ipcPath}`, {
              followRedirects: true,
              headers
            });

            const firstRequest = ws._req;

            assert.strictEqual(
              firstRequest.getHeader('Authorization'),
              headers.authorization
            );
            assert.strictEqual(
              firstRequest.getHeader('Cookie'),
              headers.cookie
            );
            assert.strictEqual(firstRequest.getHeader('Host'), headers.host);

            ws.on('close', (code) => {
              assert.strictEqual(code, 1005);
              assert.strictEqual(ws.url, `ws://localhost:${port}/`);
              assert.strictEqual(ws._redirects, 1);

              redirectingServer.close();
              redirectedServer.close(done);
            });
          }
        });
      });

      describe("If there is at least one 'redirect' event listener", () => {
        it('does not drop any headers by default', (done) => {
          const headers = {
            authorization: 'Basic Zm9vOmJhcg==',
            cookie: 'foo=bar',
            host: 'foo'
          };

          const wss = new WebSocket.Server({ port: 0 }, () => {
            const port = wss.address().port;

            server.once('upgrade', (req, socket) => {
              socket.end(
                'HTTP/1.1 302 Found\r\n' +
                  `Location: ws://localhost:${port}/\r\n\r\n`
              );
            });

            const ws = new WebSocket(
              `ws://localhost:${server.address().port}`,
              { followRedirects: true, headers }
            );

            const firstRequest = ws._req;

            assert.strictEqual(
              firstRequest.getHeader('Authorization'),
              headers.authorization
            );
            assert.strictEqual(
              firstRequest.getHeader('Cookie'),
              headers.cookie
            );
            assert.strictEqual(firstRequest.getHeader('Host'), headers.host);

            ws.on('redirect', (url, req) => {
              assert.strictEqual(ws._redirects, 1);
              assert.strictEqual(url, `ws://localhost:${port}/`);
              assert.notStrictEqual(firstRequest, req);
              assert.strictEqual(
                req.getHeader('Authorization'),
                headers.authorization
              );
              assert.strictEqual(req.getHeader('Cookie'), headers.cookie);
              assert.strictEqual(req.getHeader('Host'), headers.host);

              ws.on('close', (code) => {
                assert.strictEqual(code, 1005);
                wss.close(done);
              });
            });
          });

          wss.on('connection', (ws, req) => {
            assert.strictEqual(
              req.headers.authorization,
              headers.authorization
            );
            assert.strictEqual(req.headers.cookie, headers.cookie);
            assert.strictEqual(req.headers.host, headers.host);
            ws.close();
          });
        });
      });
    });

    describe("In a listener of the 'redirect' event", () => {
      it('allows to abort the request without swallowing errors', (done) => {
        server.once('upgrade', (req, socket) => {
          socket.end('HTTP/1.1 302 Found\r\nLocation: /foo\r\n\r\n');
        });

        const port = server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`, {
          followRedirects: true
        });

        ws.on('redirect', (url, req) => {
          assert.strictEqual(ws._redirects, 1);
          assert.strictEqual(url, `ws://localhost:${port}/foo`);

          req.on('socket', () => {
            req.abort();
          });

          ws.on('error', (err) => {
            assert.ok(err instanceof Error);
            assert.strictEqual(err.message, 'socket hang up');

            ws.on('close', (code) => {
              assert.strictEqual(code, 1006);
              done();
            });
          });
        });
      });

      it('allows to remove headers', (done) => {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const port = wss.address().port;

          server.once('upgrade', (req, socket) => {
            socket.end(
              'HTTP/1.1 302 Found\r\n' +
                `Location: ws://localhost:${port}/\r\n\r\n`
            );
          });

          const headers = {
            authorization: 'Basic Zm9vOmJhcg==',
            cookie: 'foo=bar'
          };

          const ws = new WebSocket(`ws://localhost:${server.address().port}`, {
            followRedirects: true,
            headers
          });

          ws.on('redirect', (url, req) => {
            assert.strictEqual(ws._redirects, 1);
            assert.strictEqual(url, `ws://localhost:${port}/`);
            assert.strictEqual(
              req.getHeader('Authorization'),
              headers.authorization
            );
            assert.strictEqual(req.getHeader('Cookie'), headers.cookie);

            req.removeHeader('authorization');
            req.removeHeader('cookie');

            ws.on('close', (code) => {
              assert.strictEqual(code, 1005);
              wss.close(done);
            });
          });
        });

        wss.on('connection', (ws, req) => {
          assert.strictEqual(req.headers.authorization, undefined);
          assert.strictEqual(req.headers.cookie, undefined);
          ws.close();
        });
      });
    });
  });

  describe('#pause', () => {
    it('does nothing if `readyState` is `CONNECTING` or `CLOSED`', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        assert.strictEqual(ws.readyState, WebSocket.CONNECTING);
        assert.ok(!ws.isPaused);

        ws.pause();
        assert.ok(!ws.isPaused);

        ws.on('open', () => {
          ws.on('close', () => {
            assert.strictEqual(ws.readyState, WebSocket.CLOSED);

            ws.pause();
            assert.ok(!ws.isPaused);

            wss.close(done);
          });

          ws.close();
        });
      });
    });

    it('pauses the socket', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
      });

      wss.on('connection', (ws) => {
        assert.ok(!ws.isPaused);
        assert.ok(!ws._socket.isPaused());

        ws.pause();
        assert.ok(ws.isPaused);
        assert.ok(ws._socket.isPaused());

        ws.terminate();
        wss.close(done);
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

          if (hasBlob) {
            ws.ping(new Blob(['hi']));
            assert.strictEqual(ws.bufferedAmount, 6);
          }

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

          if (hasBlob) {
            ws.pong(new Blob(['hi']));
            assert.strictEqual(ws.bufferedAmount, 6);
          }

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

    it('is called automatically when a ping is received', (done) => {
      const buf = Buffer.from('hi');
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          ws.ping(buf);
        });

        ws.on('pong', (data) => {
          assert.deepStrictEqual(data, buf);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.on('ping', (data) => {
          assert.deepStrictEqual(data, buf);
          ws.close();
        });
      });
    });
  });

  describe('#resume', () => {
    it('does nothing if `readyState` is `CONNECTING` or `CLOSED`', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        assert.strictEqual(ws.readyState, WebSocket.CONNECTING);
        assert.ok(!ws.isPaused);

        // Verify that no exception is thrown.
        ws.resume();

        ws.on('open', () => {
          ws.pause();
          assert.ok(ws.isPaused);

          ws.on('close', () => {
            assert.strictEqual(ws.readyState, WebSocket.CLOSED);

            ws.resume();
            assert.ok(ws.isPaused);

            wss.close(done);
          });

          ws.terminate();
        });
      });
    });

    it('resumes the socket', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
      });

      wss.on('connection', (ws) => {
        assert.ok(!ws.isPaused);
        assert.ok(!ws._socket.isPaused());

        ws.pause();
        assert.ok(ws.isPaused);
        assert.ok(ws._socket.isPaused());

        ws.resume();
        assert.ok(!ws.isPaused);
        assert.ok(!ws._socket.isPaused());

        ws.close();
        wss.close(done);
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

          if (hasBlob) {
            ws.send(new Blob(['hi']));
            assert.strictEqual(ws.bufferedAmount, 6);
          }

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
        const array = new Float32Array(1024 * 1024);

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

    it('can send a `Blob`', function (done) {
      if (!hasBlob) return this.skip();

      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        const messages = [];

        ws.on('open', () => {
          ws.send(new Blob(['foo']));
          ws.send(new Blob(['bar']));
          ws.close();
        });

        ws.on('message', (message, isBinary) => {
          assert.ok(isBinary);
          messages.push(message.toString());

          if (messages.length === 2) {
            assert.deepStrictEqual(messages, ['foo', 'bar']);
            wss.close(done);
          }
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (message, isBinary) => {
          assert.ok(isBinary);
          ws.send(message);
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

    it('calls the callback if the socket is forcibly closed', function (done) {
      if (!hasBlob) return this.skip();

      const called = [];
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        ws.on('open', () => {
          ws.send(new Blob(['foo']), (err) => {
            called.push(1);

            assert.strictEqual(ws.readyState, WebSocket.CLOSING);
            assert.ok(err instanceof Error);
            assert.strictEqual(
              err.message,
              'The socket was closed while the blob was being read'
            );
          });
          ws.send('bar');
          ws.send('baz', (err) => {
            called.push(2);

            assert.strictEqual(ws.readyState, WebSocket.CLOSING);
            assert.ok(err instanceof Error);
            assert.strictEqual(
              err.message,
              'The socket was closed while the blob was being read'
            );
          });

          ws.terminate();
        });
      });

      wss.on('connection', (ws) => {
        ws.on('close', () => {
          assert.deepStrictEqual(called, [1, 2]);
          wss.close(done);
        });
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
      const server = net.createServer();

      server.on('connection', (socket) => {
        socket.on('end', socket.end);
        socket.resume();
        socket.write(Buffer.from('foo\r\n'));
      });

      server.listen(0, () => {
        const ws = new WebSocket(`ws://localhost:${server.address().port}`);

        ws.on('open', () => done(new Error("Unexpected 'open' event")));
        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.code, 'HPE_INVALID_CONSTANT');
          ws.close();
          ws.on('close', () => {
            server.close(done);
          });
        });
      });
    });

    it("can be called from a listener of the 'redirect' event", (done) => {
      const server = http.createServer();

      server.once('upgrade', (req, socket) => {
        socket.end('HTTP/1.1 302 Found\r\nLocation: /foo\r\n\r\n');
      });

      server.listen(() => {
        const port = server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`, {
          followRedirects: true
        });

        ws.on('open', () => {
          done(new Error("Unexpected 'open' event"));
        });

        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(
            err.message,
            'WebSocket was closed before the connection was established'
          );

          ws.on('close', (code) => {
            assert.strictEqual(code, 1006);
            server.close(done);
          });
        });

        ws.on('redirect', () => {
          ws.close();
        });
      });
    });

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
      const server = net.createServer();

      server.on('connection', (socket) => {
        socket.on('end', socket.end);
        socket.resume();
        socket.write(Buffer.from('foo\r\n'));
      });

      server.listen(0, () => {
        const ws = new WebSocket(`ws://localhost:${server.address().port}`);

        ws.on('open', () => done(new Error("Unexpected 'open' event")));
        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.code, 'HPE_INVALID_CONSTANT');
          ws.terminate();
          ws.on('close', () => {
            server.close(done);
          });
        });
      });
    });

    it("can be called from a listener of the 'redirect' event", (done) => {
      const server = http.createServer();

      server.once('upgrade', (req, socket) => {
        socket.end('HTTP/1.1 302 Found\r\nLocation: /foo\r\n\r\n');
      });

      server.listen(() => {
        const port = server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`, {
          followRedirects: true
        });

        ws.on('open', () => {
          done(new Error("Unexpected 'open' event"));
        });

        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(
            err.message,
            'WebSocket was closed before the connection was established'
          );

          ws.on('close', (code) => {
            assert.strictEqual(code, 1006);
            server.close(done);
          });
        });

        ws.on('redirect', () => {
          ws.terminate();
        });
      });
    });

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
      assert.strictEqual(ws.listenerCount('message'), 0);
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

      function onOpen() {
        events.push('open');
        assert.strictEqual(ws.listenerCount('open'), 1);
      }

      ws.addEventListener('open', onOpen);
      ws.addEventListener('open', onOpen);

      assert.strictEqual(ws.listenerCount('open'), 1);

      const listener = {
        handleEvent() {
          events.push('message');
          assert.strictEqual(this, listener);
          assert.strictEqual(ws.listenerCount('message'), 0);
        }
      };

      ws.addEventListener('message', listener, { once: true });
      ws.addEventListener('message', listener);

      assert.strictEqual(ws.listenerCount('message'), 1);

      ws.addEventListener('close', NOOP);
      ws.onclose = NOOP;

      let listeners = ws.listeners('close');

      assert.strictEqual(listeners.length, 2);
      assert.strictEqual(listeners[0][kListener], NOOP);
      assert.strictEqual(listeners[1][kListener], NOOP);

      ws.onerror = NOOP;
      ws.addEventListener('error', NOOP);

      listeners = ws.listeners('error');

      assert.strictEqual(listeners.length, 2);
      assert.strictEqual(listeners[0][kListener], NOOP);
      assert.strictEqual(listeners[1][kListener], NOOP);

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

      const listener = { handleEvent() {} };

      ws.addEventListener('message', listener);
      ws.addEventListener('open', NOOP);

      assert.strictEqual(ws.listeners('message')[0][kListener], listener);
      assert.strictEqual(ws.listeners('open')[0][kListener], NOOP);

      ws.removeEventListener('message', () => {});

      assert.strictEqual(ws.listeners('message')[0][kListener], listener);

      ws.removeEventListener('message', listener);
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
              assert.deepStrictEqual(evt.data, buf);
              next();
            } else if (binaryType === 'arraybuffer') {
              assert.ok(evt.data instanceof ArrayBuffer);
              assert.deepStrictEqual(Buffer.from(evt.data), buf);
              next();
            } else if (binaryType === 'fragments') {
              assert.deepStrictEqual(evt.data, [buf]);
              next();
            } else if (binaryType === 'blob') {
              assert.ok(evt.data instanceof Blob);
              evt.data
                .arrayBuffer()
                .then((arrayBuffer) => {
                  assert.deepStrictEqual(Buffer.from(arrayBuffer), buf);
                  next();
                })
                .catch(done);
            }
          };

          ws.send(buf);
        }

        function close() {
          ws.close();
          wss.close(done);
        }

        ws.onopen = () => {
          testType('nodebuffer', () => {
            testType('arraybuffer', () => {
              testType('fragments', () => {
                if (hasBlob) testType('blob', close);
                else close();
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

      const wss = new WebSocket.Server({ noServer: true });

      server.on('upgrade', (request, socket, head) => {
        assert.ok(socket.authorized);

        wss.handleUpgrade(request, socket, head, (ws) => {
          ws.on('close', (code) => {
            assert.strictEqual(code, 1005);
            server.close(done);
          });
        });
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
      const agent = new http.Agent();
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
      const agent = new http.Agent();
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
      const agent = new http.Agent();
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
      const agent = new http.Agent();

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
      const agent = new http.Agent();

      agent.addRequest = (req) => {
        assert.strictEqual(req.getHeader('origin'), undefined);
        done();
      };

      const ws = new WebSocket('ws://localhost', { agent });
    });

    it('honors the `origin` option (1/2)', (done) => {
      const agent = new http.Agent();

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
      const agent = new http.Agent();

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

    it('honors the `finishRequest` option', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const host = `localhost:${wss.address().port}`;
        const ws = new WebSocket(`ws://${host}`, {
          finishRequest(req, ws) {
            assert.ok(req instanceof http.ClientRequest);
            assert.strictEqual(req.getHeader('host'), host);
            assert.ok(ws instanceof WebSocket);
            assert.strictEqual(req, ws._req);

            req.on('socket', (socket) => {
              socket.on('connect', () => {
                req.setHeader('Cookie', 'foo=bar');
                req.end();
              });
            });
          }
        });

        ws.on('close', (code) => {
          assert.strictEqual(code, 1005);
          wss.close(done);
        });
      });

      wss.on('connection', (ws, req) => {
        assert.strictEqual(req.headers.cookie, 'foo=bar');
        ws.close();
      });
    });
  });

  describe('permessage-deflate', () => {
    it('is enabled by default', (done) => {
      const agent = new http.Agent();

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
      const agent = new http.Agent();

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
      const agent = new http.Agent();

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

    it('consumes all received data when connection is closed (1/2)', (done) => {
      const wss = new WebSocket.Server(
        {
          perMessageDeflate: { threshold: 0 },
          port: 0
        },
        () => {
          const messages = [];
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

          ws.on('open', () => {
            ws._socket.on('close', () => {
              assert.strictEqual(ws._receiver._state, 5);
            });
          });

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

    it('consumes all received data when connection is closed (2/2)', (done) => {
      const wss = new WebSocket.Server(
        {
          perMessageDeflate: true,
          port: 0
        },
        () => {
          const messageLengths = [];
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

          ws.on('open', () => {
            ws._socket.prependListener('close', () => {
              assert.strictEqual(ws._receiver._state, 5);
              assert.strictEqual(ws._socket._readableState.length, 3);
            });

            const push = ws._socket.push;

            // Override `ws._socket.push()` to know exactly when data is
            // received and call `ws.terminate()` immediately after that without
            // relying on a timer.
            ws._socket.push = (data) => {
              ws._socket.push = push;
              ws._socket.push(data);
              ws.terminate();
            };

            const payload1 = Buffer.alloc(highWaterMark - 1024);
            const payload2 = Buffer.alloc(1);

            const opts = {
              fin: true,
              opcode: 0x02,
              mask: false,
              readOnly: false
            };

            const list = [
              ...Sender.frame(payload1, { rsv1: false, ...opts }),
              ...Sender.frame(payload2, { rsv1: true, ...opts })
            ];

            for (let i = 0; i < 340; i++) {
              list.push(list[list.length - 2], list[list.length - 1]);
            }

            const data = Buffer.concat(list);

            assert.ok(data.length > highWaterMark);

            // This hack is used because there is no guarantee that more than
            // `highWaterMark` bytes will be sent as a single TCP packet.
            push.call(ws._socket, data);

            wss.clients
              .values()
              .next()
              .value.send(payload2, { compress: false });
          });

          ws.on('message', (message, isBinary) => {
            assert.ok(isBinary);
            messageLengths.push(message.length);
          });

          ws.on('close', (code) => {
            assert.strictEqual(code, 1006);
            assert.strictEqual(messageLengths.length, 343);
            assert.strictEqual(messageLengths[0], highWaterMark - 1024);
            assert.strictEqual(messageLengths[messageLengths.length - 1], 1);
            wss.close(done);
          });
        }
      );
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
              assert.strictEqual(ws._sender._state, 1);
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

            ws.on('message', (message, isBinary) => {
              assert.ok(!isBinary);

              if (messages.push(message.toString()) > 1) return;

              setImmediate(() => {
                process.nextTick(() => {
                  assert.strictEqual(ws._receiver._state, 5);
                  ws.close(1000);
                });
              });
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
      it('can send text data', (done) => {
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

      it('can send a `TypedArray`', (done) => {
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

      it('can send an `ArrayBuffer`', (done) => {
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

      it('can send a `Blob`', function (done) {
        if (!hasBlob) return this.skip();

        const wss = new WebSocket.Server(
          {
            perMessageDeflate: { threshold: 0 },
            port: 0
          },
          () => {
            const ws = new WebSocket(`ws://localhost:${wss.address().port}`, {
              perMessageDeflate: { threshold: 0 }
            });

            const messages = [];

            ws.on('open', () => {
              ws.send(new Blob(['foo']));
              ws.send(new Blob(['bar']));
              ws.close();
            });

            ws.on('message', (message, isBinary) => {
              assert.ok(isBinary);
              messages.push(message.toString());

              if (messages.length === 2) {
                assert.deepStrictEqual(messages, ['foo', 'bar']);
                wss.close(done);
              }
            });
          }
        );

        wss.on('connection', (ws) => {
          ws.on('message', (message, isBinary) => {
            assert.ok(isBinary);
            ws.send(message);
          });
        });
      });

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
              ws.close();
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

              setImmediate(() => {
                process.nextTick(() => {
                  assert.strictEqual(ws._receiver._state, 5);
                  ws.terminate();
                });
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

  describe('Connection close', () => {
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

    it('resumes the socket when an error occurs', (done) => {
      const maxPayload = 16 * 1024;
      const wss = new WebSocket.Server({ maxPayload, port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
      });

      wss.on('connection', (ws) => {
        const list = [
          ...Sender.frame(Buffer.alloc(maxPayload + 1), {
            fin: true,
            opcode: 0x02,
            mask: true,
            readOnly: false
          })
        ];

        ws.on('error', (err) => {
          assert.ok(err instanceof RangeError);
          assert.strictEqual(err.code, 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH');
          assert.strictEqual(err.message, 'Max payload size exceeded');

          ws.on('close', (code, reason) => {
            assert.strictEqual(code, 1006);
            assert.strictEqual(reason, EMPTY_BUFFER);
            wss.close(done);
          });
        });

        ws._socket.push(Buffer.concat(list));
      });
    });

    it('resumes the socket when the close frame is received', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
      });

      wss.on('connection', (ws) => {
        const opts = { fin: true, mask: true, readOnly: false };
        const list = [
          ...Sender.frame(Buffer.alloc(16 * 1024), { opcode: 0x02, ...opts }),
          ...Sender.frame(EMPTY_BUFFER, { opcode: 0x08, ...opts })
        ];

        ws.on('close', (code, reason) => {
          assert.strictEqual(code, 1005);
          assert.strictEqual(reason, EMPTY_BUFFER);
          wss.close(done);
        });

        ws._socket.push(Buffer.concat(list));
      });
    });
  });
});
