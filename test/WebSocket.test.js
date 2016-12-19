/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^ws$", "args": "none" }] */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const fs = require('fs');

const server = require('./testserver');
const WebSocket = require('..');

const WebSocketServer = WebSocket.Server;
let port = 20000;

class CustomAgent extends http.Agent {
  addRequest () {}
}

describe('WebSocket', function () {
  describe('#ctor', function () {
    it('throws an error when using an invalid url', function () {
      assert.throws(
        () => new WebSocket('echo.websocket.org'),
        /^Error: invalid url$/
      );
    });
  });

  describe('options', function () {
    it('should accept an `agent` option', function (done) {
      const agent = new CustomAgent();

      agent.addRequest = () => {
        done();
      };

      const ws = new WebSocket('ws://localhost', { agent });
    });

    // GH-227
    it('should accept the `options` object as the 3rd argument', function () {
      const ws = new WebSocket('ws://localhost', [], {
        agent: new CustomAgent()
      });
    });

    it('throws an error when using an invalid `protocolVersion`', function () {
      const options = { agent: new CustomAgent(), protocolVersion: 1000 };

      assert.throws(
        () => new WebSocket('ws://localhost', options),
        /^Error: unsupported protocol version$/
      );
    });

    it('should accept the localAddress option', function (done) {
      //
      // Skip this test on macOS as by default all loopback addresses other
      // than 127.0.0.1 are disabled.
      //
      if (process.platform === 'darwin') return done();

      const wss = new WebSocketServer({ host: '127.0.0.1', port: ++port }, () => {
        const ws = new WebSocket(`ws://localhost:${port}`, {
          localAddress: '127.0.0.2'
        });
      });

      wss.on('connection', (ws) => {
        assert.strictEqual(ws.upgradeReq.connection.remoteAddress, '127.0.0.2');
        wss.close(done);
      });
    });

    it('should accept the localAddress option whether it was wrong interface', function () {
      assert.throws(
        () => new WebSocket(`ws://localhost:${port}`, { localAddress: '123.456.789.428' }),
        /must be a valid IP: 123.456.789.428/
      );
    });
  });

  describe('properties', function () {
    it('#bytesReceived exposes number of bytes received', function (done) {
      const wss = new WebSocketServer({ port: ++port }, () => {
        const ws = new WebSocket(`ws://localhost:${port}`, { perMessageDeflate: false });
        ws.on('message', () => {
          assert.strictEqual(ws.bytesReceived, 8);
          wss.close();
          done();
        });
      });
      wss.on('connection', (ws) => ws.send('foobar'));
    });

    it('#url exposes the server url', function (done) {
      server.createServer(++port, (srv) => {
        const url = `ws://localhost:${port}`;
        const ws = new WebSocket(url);

        assert.strictEqual(ws.url, url);

        ws.on('close', () => srv.close(done));
        ws.close();
      });
    });

    it('#protocolVersion exposes the protocol version', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        assert.strictEqual(ws.protocolVersion, 13);

        ws.on('close', () => srv.close(done));
        ws.close();
      });
    });

    describe('#bufferedAmount', function () {
      it('defaults to zero', function (done) {
        server.createServer(++port, (srv) => {
          const ws = new WebSocket(`ws://localhost:${port}`);

          assert.strictEqual(ws.bufferedAmount, 0);

          ws.on('close', () => srv.close(done));
          ws.close();
        });
      });

      it('defaults to zero upon "open"', function (done) {
        server.createServer(++port, (srv) => {
          const ws = new WebSocket(`ws://localhost:${port}`);

          ws.onopen = () => {
            assert.strictEqual(ws.bufferedAmount, 0);

            ws.on('close', () => srv.close(done));
            ws.close();
          };
        });
      });

      it('stress kernel write buffer', function (done) {
        const wss = new WebSocketServer({ port: ++port }, () => {
          const ws = new WebSocket(`ws://localhost:${port}`, {
            perMessageDeflate: false
          });
        });

        wss.on('connection', (ws) => {
          while (true) {
            if (ws.bufferedAmount > 0) break;
            ws.send('hello'.repeat(1e4));
          }
          wss.close(done);
        });
      });
    });

    describe('Custom headers', function () {
      it('request has an authorization header', function (done) {
        const server = http.createServer();
        const wss = new WebSocketServer({ server });
        const auth = 'test:testpass';

        server.listen(++port, () => {
          const ws = new WebSocket(`ws://${auth}@localhost:${port}`);
        });

        server.on('upgrade', (req, socket, head) => {
          assert.ok(req.headers.authorization);
          assert.strictEqual(
            req.headers.authorization,
            `Basic ${new Buffer(auth).toString('base64')}`
          );

          wss.close();
          server.close(done);
        });
      });

      it('accepts custom headers', function (done) {
        const server = http.createServer();
        const wss = new WebSocketServer({ server });

        server.on('upgrade', (req, socket, head) => {
          assert.ok(req.headers.cookie);
          assert.strictEqual(req.headers.cookie, 'foo=bar');

          wss.close();
          server.close(done);
        });

        server.listen(++port, () => {
          const ws = new WebSocket(`ws://localhost:${port}`, {
            headers: { 'Cookie': 'foo=bar' }
          });
        });
      });
    });

    describe('#readyState', function () {
      it('defaults to connecting', function (done) {
        server.createServer(++port, (srv) => {
          const ws = new WebSocket(`ws://localhost:${port}`);

          assert.strictEqual(ws.readyState, WebSocket.CONNECTING);

          ws.on('close', () => srv.close(done));
          ws.close();
        });
      });

      it('set to open once connection is established', function (done) {
        server.createServer(++port, (srv) => {
          const ws = new WebSocket(`ws://localhost:${port}`);

          ws.on('open', () => {
            assert.strictEqual(ws.readyState, WebSocket.OPEN);
            ws.close();
          });

          ws.on('close', () => srv.close(done));
        });
      });

      it('set to closed once connection is closed', function (done) {
        server.createServer(++port, (srv) => {
          const ws = new WebSocket(`ws://localhost:${port}`);

          ws.on('close', () => {
            assert.strictEqual(ws.readyState, WebSocket.CLOSED);
            srv.close(done);
          });

          ws.close(1001);
        });
      });

      it('set to closed once connection is terminated', function (done) {
        server.createServer(++port, (srv) => {
          const ws = new WebSocket(`ws://localhost:${port}`);

          ws.on('close', () => {
            assert.strictEqual(ws.readyState, WebSocket.CLOSED);
            srv.close(done);
          });

          ws.terminate();
        });
      });
    });

    /*
     * Ready state constants
     */

    const readyStates = {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3
    };

    /*
     * Ready state constant tests
     */

    Object.keys(readyStates).forEach((state) => {
      describe(`.${state}`, function () {
        it('is enumerable property of class', function () {
          const propertyDescripter = Object.getOwnPropertyDescriptor(WebSocket, state);

          assert.strictEqual(propertyDescripter.value, readyStates[state]);
          assert.strictEqual(propertyDescripter.enumerable, true);
        });

        it('is property of instance', function () {
          const ws = new WebSocket('ws://localhost', {
            agent: new CustomAgent()
          });

          assert.strictEqual(ws[state], readyStates[state]);
        });
      });
    });
  });

  describe('events', function () {
    it('emits a ping event', function (done) {
      const wss = new WebSocketServer({ port: ++port }, () => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('ping', function () {
          wss.close();
          done();
        });
      });

      wss.on('connection', (client) => client.ping());
    });

    it('emits a pong event', function (done) {
      const wss = new WebSocketServer({ port: ++port }, () => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('pong', () => {
          wss.close();
          done();
        });
      });

      wss.on('connection', (client) => client.pong());
    });
  });

  describe('connection establishing', function () {
    it('can disconnect before connection is established', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => assert.fail(null, null, 'connect shouldnt be raised here'));
        ws.on('close', () => srv.close(done));
        ws.terminate();
      });
    });

    it('can close before connection is established', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => assert.fail(null, null, 'connect shouldnt be raised here'));
        ws.on('close', () => srv.close(done));
        ws.close(1001);
      });
    });

    it('can handle error before request is upgraded', function (done) {
      // Here, we don't create a server, to guarantee that the connection will
      // fail before the request is upgraded
      const ws = new WebSocket(`ws://localhost:${++port}`);

      ws.on('open', () => assert.fail(null, null, 'connect shouldnt be raised here'));
      ws.on('error', () => done());
    });

    it('invalid server key is denied', function (done) {
      server.createServer(++port, server.handlers.invalidKey, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('error', () => srv.close(done));
      });
    });

    it('close event is raised when server closes connection', function (done) {
      server.createServer(++port, server.handlers.closeAfterConnect, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('close', () => srv.close(done));
      });
    });

    it('error is emitted if server aborts connection', function (done) {
      server.createServer(++port, server.handlers.return401, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => assert.fail(null, null, 'connect shouldnt be raised here'));
        ws.on('error', () => srv.close(done));
      });
    });

    it('unexpected response can be read when sent by server', function (done) {
      server.createServer(++port, server.handlers.return401, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => assert.fail(null, null, 'connect shouldnt be raised here'));
        ws.on('error', () => assert.fail(null, null, 'error shouldnt be raised here'));
        ws.on('unexpected-response', (req, res) => {
          assert.strictEqual(res.statusCode, 401);

          let data = '';

          res.on('data', (v) => {
            data += v;
          });

          res.on('end', () => {
            assert.strictEqual(data, 'Not allowed!');
            srv.close(done);
          });
        });
      });
    });

    it('request can be aborted when unexpected response is sent by server', function (done) {
      server.createServer(++port, server.handlers.return401, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => assert.fail(null, null, 'connect shouldnt be raised here'));
        ws.on('error', () => assert.fail(null, null, 'error shouldnt be raised here'));
        ws.on('unexpected-response', (req, res) => {
          assert.strictEqual(res.statusCode, 401);

          res.on('end', () => srv.close(done));
          req.abort();
        });
      });
    });
  });

  describe('connection with query string', function () {
    it('connects when pathname is not null', function (done) {
      const wss = new WebSocketServer({ port: ++port }, () => {
        const ws = new WebSocket(`ws://localhost:${port}/?token=qwerty`);

        ws.on('open', () => wss.close(done));
      });
    });

    it('connects when pathname is null', function (done) {
      const wss = new WebSocketServer({ port: ++port }, () => {
        const ws = new WebSocket(`ws://localhost:${port}?token=qwerty`);

        ws.on('open', () => wss.close(done));
      });
    });
  });

  describe('#pause and #resume', function () {
    it('pauses the underlying stream', function (done) {
      // this test is sort-of racecondition'y, since an unlikely slow connection
      // to localhost can cause the test to succeed even when the stream pausing
      // isn't working as intended. that is an extremely unlikely scenario, though
      // and an acceptable risk for the test.
      let openCount = 0;
      let serverClient;
      let client;

      const onOpen = () => {
        if (++openCount !== 2) return;

        let paused = true;
        serverClient.on('message', () => {
          assert.ok(!paused);
          wss.close();
          done();
        });
        serverClient.pause();

        setTimeout(() => {
          paused = false;
          serverClient.resume();
        }, 200);

        client.send('foo');
      };

      const wss = new WebSocketServer({ port: ++port }, () => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        serverClient = ws;
        serverClient.on('open', onOpen);
      });

      wss.on('connection', (ws) => {
        client = ws;
        onOpen();
      });
    });
  });

  describe('#ping', function () {
    it('before connect should fail', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('error', () => {});

        try {
          ws.ping();
        } catch (e) {
          srv.close(done);
          ws.terminate();
        }
      });
    });

    it('before connect can silently fail', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('error', () => {});
        ws.ping('', {}, true);

        srv.close(done);
        ws.terminate();
      });
    });

    it('without message is successfully transmitted to the server', function (done) {
      server.createServer(++port, function (srv) {
        srv.on('ping', () => {
          srv.close(done);
          ws.terminate();
        });

        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.ping());
      });
    });

    it('with message is successfully transmitted to the server', function (done) {
      server.createServer(++port, (srv) => {
        srv.on('ping', (message) => {
          assert.strictEqual(message.toString(), 'hi');
          srv.close(done);
          ws.terminate();
        });

        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.ping('hi'));
      });
    });

    it('can send safely receive numbers as ping payload', function (done) {
      server.createServer(++port, (srv) => {
        srv.on('ping', (message) => {
          assert.strictEqual(message.toString(), '200');
          srv.close(done);
          ws.terminate();
        });

        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.ping(200));
      });
    });

    it('with encoded message is successfully transmitted to the server', function (done) {
      server.createServer(++port, (srv) => {
        srv.on('ping', (message, flags) => {
          assert.ok(flags.masked);
          assert.strictEqual(message.toString(), 'hi');
          srv.close(done);
          ws.terminate();
        });

        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.ping('hi', { mask: true }));
      });
    });
  });

  describe('#pong', function () {
    it('before connect should fail', (done) => {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('error', () => {});

        try {
          ws.pong();
        } catch (e) {
          srv.close(done);
          ws.terminate();
        }
      });
    });

    it('before connect can silently fail', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('error', () => {});
        ws.pong('', {}, true);

        srv.close(done);
        ws.terminate();
      });
    });

    it('without message is successfully transmitted to the server', function (done) {
      server.createServer(++port, (srv) => {
        srv.on('pong', () => {
          srv.close(done);
          ws.terminate();
        });

        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.pong());
      });
    });

    it('with message is successfully transmitted to the server', function (done) {
      server.createServer(++port, (srv) => {
        srv.on('pong', (message) => {
          assert.strictEqual(message.toString(), 'hi');
          srv.close(done);
          ws.terminate();
        });

        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.pong('hi'));
      });
    });

    it('with encoded message is successfully transmitted to the server', function (done) {
      server.createServer(++port, (srv) => {
        srv.on('pong', (message, flags) => {
          assert.ok(flags.masked);
          assert.strictEqual(message.toString(), 'hi');
          srv.close(done);
          ws.terminate();
        });

        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.pong('hi', { mask: true }));
      });
    });
  });

  describe('#send', function () {
    it('very long binary data can be sent and received (with echoing server)', (done) => {
      server.createServer(++port, (srv) => {
        const array = new Float32Array(5 * 1024 * 1024);

        for (let i = 0; i < array.length; ++i) {
          array[i] = i / 5;
        }

        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send(array, { binary: true }));
        ws.on('message', (message, flags) => {
          assert.ok(flags.binary);
          assert.ok(message.equals(Buffer.from(array.buffer)));
          srv.close(done);
          ws.terminate();
        });
      });
    });

    it('can send and receive text data', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send('hi'));
        ws.on('message', (message, flags) => {
          assert.strictEqual(message, 'hi');
          srv.close(done);
          ws.terminate();
        });
      });
    });

    it('does not override the `fin` option', function (done) {
      const wss = new WebSocketServer({ port: ++port }, () => {
        const ws = new WebSocket(`ws://localhost:${port}`);

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

    it('send and receive binary data as an array', function (done) {
      server.createServer(++port, (srv) => {
        const array = new Float32Array(6);

        for (let i = 0; i < array.length; ++i) {
          array[i] = i / 2;
        }

        const partial = array.subarray(2, 5);
        const buf = Buffer.from(partial.buffer)
          .slice(partial.byteOffset, partial.byteOffset + partial.byteLength);

        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send(partial, { binary: true }));
        ws.on('message', (message, flags) => {
          assert.ok(flags.binary);
          assert.ok(message.equals(buf));
          ws.terminate();
          srv.close();
          done();
        });
      });
    });

    it('binary data can be sent and received as buffer', function (done) {
      server.createServer(++port, (srv) => {
        const buf = Buffer.from('foobar');
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send(buf, { binary: true }));
        ws.on('message', (message, flags) => {
          assert.ok(flags.binary);
          assert.ok(message.equals(buf));
          srv.close(done);
          ws.terminate();
        });
      });
    });

    it('ArrayBuffer is auto-detected without binary flag', function (done) {
      server.createServer(++port, (srv) => {
        const array = new Float32Array(5);

        for (let i = 0; i < array.length; ++i) {
          array[i] = i / 2;
        }

        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send(array.buffer));
        ws.onmessage = (event) => {
          assert.ok(event.binary);
          assert.ok(event.data.equals(Buffer.from(array.buffer)));
          srv.close(done);
          ws.terminate();
        };
      });
    });

    it('Buffer is auto-detected without binary flag', function (done) {
      server.createServer(++port, (srv) => {
        const buf = Buffer.from('foobar');
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send(buf));

        ws.onmessage = (event) => {
          assert.ok(event.binary);
          assert.ok(event.data.equals(buf));
          srv.close(done);
          ws.terminate();
        };
      });
    });

    it('before connect should fail', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('error', () => {});

        try {
          ws.send('hi');
        } catch (e) {
          srv.close(done);
          ws.terminate();
        }
      });
    });

    it('before connect should pass error through callback, if present', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.send('hi', (error) => {
          assert.ok(error instanceof Error);
          srv.close(done);
          ws.terminate();
        });
      });
    });

    it('without data should be successful', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send());

        srv.on('message', (message, flags) => {
          assert.strictEqual(message, '');
          srv.close(done);
          ws.terminate();
        });
      });
    });

    it('calls optional callback when flushed', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => {
          ws.send('hi', () => {
            srv.close(done);
            ws.terminate();
          });
        });
      });
    });

    it('with unmasked message is successfully transmitted to the server', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send('hi', { mask: false }));

        srv.on('message', (message, flags) => {
          assert.strictEqual(message, 'hi');
          srv.close(done);
          ws.terminate();
        });
      });
    });

    it('with masked message is successfully transmitted to the server', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send('hi', { mask: true }));

        srv.on('message', (message, flags) => {
          assert.ok(flags.masked);
          assert.strictEqual(message, 'hi');
          srv.close(done);
          ws.terminate();
        });
      });
    });

    it('with unmasked binary message is successfully transmitted to the server', function (done) {
      server.createServer(++port, (srv) => {
        const array = new Float32Array(5);

        for (let i = 0; i < array.length; ++i) {
          array[i] = i / 2;
        }

        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send(array, { mask: false, binary: true }));

        srv.on('message', (message, flags) => {
          assert.ok(flags.binary);
          assert.ok(message.equals(Buffer.from(array.buffer)));
          srv.close(done);
          ws.terminate();
        });
      });
    });

    it('with masked binary message is successfully transmitted to the server', function (done) {
      server.createServer(++port, (srv) => {
        const array = new Float32Array(5);

        for (let i = 0; i < array.length; ++i) {
          array[i] = i / 2;
        }

        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send(array, { mask: true, binary: true }));

        srv.on('message', (message, flags) => {
          assert.ok(flags.binary);
          assert.ok(flags.masked);
          assert.ok(message.equals(Buffer.from(array.buffer)));
          srv.close(done);
          ws.terminate();
        });
      });
    });
  });

  describe('#close', function () {
    it('without invalid first argument throws exception', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => {
          try {
            ws.close('error');
          } catch (e) {
            srv.close(done);
            ws.terminate();
          }
        });
      });
    });

    it('without reserved error code 1004 throws exception', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => {
          try {
            ws.close(1004);
          } catch (e) {
            srv.close(done);
            ws.terminate();
          }
        });
      });
    });

    it('without message is successfully transmitted to the server', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.close(1000));

        srv.on('close', (code, message) => {
          assert.strictEqual(message, '');
          srv.close(done);
          ws.terminate();
        });
      });
    });

    it('with message is successfully transmitted to the server', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.close(1000, 'some reason'));

        srv.on('close', (code, message, flags) => {
          assert.ok(flags.masked);
          assert.strictEqual(message, 'some reason');
          srv.close(done);
          ws.terminate();
        });
      });
    });

    it('with encoded message is successfully transmitted to the server', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.close(1000, 'some reason', { mask: true }));

        srv.on('close', (code, message, flags) => {
          assert.ok(flags.masked);
          assert.strictEqual(message, 'some reason');
          srv.close(done);
          ws.terminate();
        });
      });
    });

    it('ends connection to the server', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        let connectedOnce = false;

        ws.on('open', () => {
          connectedOnce = true;
          ws.close(1000, 'some reason', {mask: true});
        });

        ws.on('close', () => {
          assert.ok(connectedOnce);
          srv.close(done);
          ws.terminate();
        });
      });
    });

    it('consumes all data when the server socket closed', function (done) {
      const wss = new WebSocketServer({ port: ++port }, () => {
        wss.on('connection', (conn) => {
          conn.send('foo');
          conn.send('bar');
          conn.send('baz');
          conn.close();
        });

        const ws = new WebSocket(`ws://localhost:${port}`);
        const messages = [];

        ws.on('message', (message) => {
          messages.push(message);
          if (messages.length === 3) {
            assert.deepStrictEqual(messages, ['foo', 'bar', 'baz']);

            wss.close(done);
            ws.terminate();
          }
        });
      });
    });

    it('allows close code 1013', function (done) {
      const wss = new WebSocketServer({ port: ++port }, () => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('close', (code) => {
          assert.strictEqual(code, 1013);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => ws.close(1013));
    });
  });

  describe('WHATWG API emulation', function () {
    it('should not throw errors when getting and setting', function (done) {
      server.createServer(++port, (srv) => {
        const listener = () => {};
        const ws = new WebSocket(`ws://localhost:${port}`);

        assert.strictEqual(ws.onmessage, undefined);
        assert.strictEqual(ws.onclose, undefined);
        assert.strictEqual(ws.onerror, undefined);
        assert.strictEqual(ws.onopen, undefined);

        ws.onmessage = listener;
        ws.onerror = listener;
        ws.onclose = listener;
        ws.onopen = listener;

        assert.strictEqual(ws.binaryType, 'nodebuffer');
        ws.binaryType = 'arraybuffer';
        assert.strictEqual(ws.binaryType, 'arraybuffer');
        ws.binaryType = 'nodebuffer';
        assert.strictEqual(ws.binaryType, 'nodebuffer');

        assert.strictEqual(ws.onmessage, listener);
        assert.strictEqual(ws.onclose, listener);
        assert.strictEqual(ws.onerror, listener);
        assert.strictEqual(ws.onopen, listener);

        srv.close(done);
        ws.terminate();
      });
    });

    it('should throw an error when setting an invalid binary type', function () {
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      assert.throws(() => {
        ws.binaryType = 'foo';
      }, /^SyntaxError: unsupported binaryType: must be either "nodebuffer" or "arraybuffer"$/);
    });

    it('should work the same as the EventEmitter api', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        let message = 0;
        let close = 0;
        let open = 0;

        ws.onmessage = (messageEvent) => {
          assert.strictEqual(messageEvent.data, 'foo');
          ++message;
          ws.close();
        };

        ws.onopen = () => ++open;
        ws.onclose = () => ++close;

        ws.on('open', () => ws.send('foo'));

        ws.on('close', () => {
          assert.strictEqual(message, 1);
          assert.strictEqual(open, 1);
          assert.strictEqual(close, 1);
          srv.close(done);
          ws.terminate();
        });
      });
    });

    it('should receive text data wrapped in a MessageEvent when using addEventListener', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.addEventListener('open', () => ws.send('hi'));
        ws.addEventListener('message', (messageEvent) => {
          assert.strictEqual(messageEvent.data, 'hi');
          srv.close(done);
          ws.terminate();
        });
      });
    });

    it('registers listeners for custom events with addEventListener', function () {
      const listener = () => {};
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      ws.addEventListener('foo', listener);
      assert.strictEqual(ws.listeners('foo')[0], listener);

      //
      // Fails silently when the `listener` is not a function.
      //
      ws.addEventListener('bar', {});
      assert.strictEqual(ws.listeners('bar').length, 0);
    });

    it('removes event listeners added with addEventListener', function () {
      const listener = () => {};
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      ws.addEventListener('message', listener);
      ws.addEventListener('open', listener);
      ws.addEventListener('foo', listener);

      assert.strictEqual(ws.listeners('message')[0]._listener, listener);
      assert.strictEqual(ws.listeners('open')[0]._listener, listener);
      assert.strictEqual(ws.listeners('foo')[0], listener);

      ws.removeEventListener('message', () => {});

      assert.strictEqual(ws.listeners('message')[0]._listener, listener);

      ws.removeEventListener('message', listener);
      ws.removeEventListener('open', listener);
      ws.removeEventListener('foo', listener);

      assert.strictEqual(ws.listeners('message').length, 0);
      assert.strictEqual(ws.listeners('open').length, 0);
      assert.strictEqual(ws.listeners('foo').length, 0);
    });

    it('should receive valid CloseEvent when server closes with code 1000', function (done) {
      const wss = new WebSocketServer({ port: ++port }, () => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.addEventListener('close', (closeEvent) => {
          assert.ok(closeEvent.wasClean);
          assert.strictEqual(closeEvent.code, 1000);

          wss.close();
          done();
        });
      });

      wss.on('connection', (client) => client.close(1000));
    });

    it('should receive valid CloseEvent when server closes with code 1001', function (done) {
      const wss = new WebSocketServer({ port: ++port }, () => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.addEventListener('close', (closeEvent) => {
          assert.ok(!closeEvent.wasClean);
          assert.strictEqual(closeEvent.code, 1001);
          assert.strictEqual(closeEvent.reason, 'some daft reason');

          wss.close();
          done();
        });
      });

      wss.on('connection', (client) => client.close(1001, 'some daft reason'));
    });

    it('should have target set on Events', function (done) {
      const wss = new WebSocketServer({ port: ++port }, () => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.addEventListener('open', (openEvent) => {
          assert.strictEqual(openEvent.target, ws);
        });
        ws.addEventListener('message', (messageEvent) => {
          assert.strictEqual(messageEvent.target, ws);
          wss.close();
        });
        ws.addEventListener('close', (closeEvent) => {
          assert.strictEqual(closeEvent.target, ws);
          ws.emit('error', new Error('forced'));
        });
        ws.addEventListener('error', (errorEvent) => {
          assert.strictEqual(errorEvent.message, 'forced');
          assert.strictEqual(errorEvent.target, ws);

          done();
        });
      });

      wss.on('connection', (client) => client.send('hi'));
    });

    it('should have type set on Events', function (done) {
      const wss = new WebSocketServer({ port: ++port }, () => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.addEventListener('open', (openEvent) => {
          assert.strictEqual(openEvent.type, 'open');
        });
        ws.addEventListener('message', (messageEvent) => {
          assert.strictEqual(messageEvent.type, 'message');
          wss.close();
        });
        ws.addEventListener('close', (closeEvent) => {
          assert.strictEqual(closeEvent.type, 'close');
          ws.emit('error', new Error('forced'));
        });
        ws.addEventListener('error', (errorEvent) => {
          assert.strictEqual(errorEvent.message, 'forced');
          assert.strictEqual(errorEvent.type, 'error');

          done();
        });
      });

      wss.on('connection', (client) => client.send('hi'));
    });

    it('should pass binary data as a node.js Buffer by default', function (done) {
      server.createServer(++port, (srv) => {
        const array = new Uint8Array(4096);
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.onopen = () => ws.send(array, { binary: true });
        ws.onmessage = (messageEvent) => {
          assert.ok(messageEvent.binary);
          assert.strictEqual(ws.binaryType, 'nodebuffer');
          assert.ok(messageEvent.data instanceof Buffer);
          srv.close(done);
          ws.terminate();
        };
      });
    });

    it('should pass an ArrayBuffer for event.data if binaryType = arraybuffer', function (done) {
      server.createServer(++port, (srv) => {
        const array = new Uint8Array(4096);
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.binaryType = 'arraybuffer';

        ws.onopen = () => ws.send(array, { binary: true });
        ws.onmessage = (messageEvent) => {
          assert.ok(messageEvent.binary);
          assert.ok(messageEvent.data instanceof ArrayBuffer);
          srv.close(done);
          ws.terminate();
        };
      });
    });

    it('should ignore binaryType for text messages', function (done) {
      server.createServer(++port, (srv) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => ws.send('foobar');
        ws.onmessage = (messageEvent) => {
          assert.ok(!messageEvent.binary);
          assert.strictEqual(typeof messageEvent.data, 'string');
          srv.close(done);
          ws.terminate();
        };
      });
    });
  });

  describe('ssl', function () {
    it('can connect to secure websocket server', function (done) {
      const server = https.createServer({
        cert: fs.readFileSync('test/fixtures/certificate.pem'),
        key: fs.readFileSync('test/fixtures/key.pem')
      });
      const wss = new WebSocketServer({ server });

      wss.on('connection', (ws) => {
        wss.close();
        server.close(done);
      });

      server.listen(++port, () => new WebSocket(`wss://localhost:${port}`, {
        rejectUnauthorized: false
      }));
    });

    it('can connect to secure websocket server with client side certificate', function (done) {
      const server = https.createServer({
        cert: fs.readFileSync('test/fixtures/certificate.pem'),
        ca: [fs.readFileSync('test/fixtures/ca1-cert.pem')],
        key: fs.readFileSync('test/fixtures/key.pem'),
        requestCert: true
      });

      let success = false;
      const wss = new WebSocketServer({
        verifyClient: (info) => {
          success = !!info.req.client.authorized;
          return true;
        },
        server
      });

      wss.on('connection', (ws) => {
        assert.ok(success);
        server.close(done);
        wss.close();
      });

      server.listen(++port, () => {
        const ws = new WebSocket(`wss://localhost:${port}`, {
          cert: fs.readFileSync('test/fixtures/agent1-cert.pem'),
          key: fs.readFileSync('test/fixtures/agent1-key.pem'),
          rejectUnauthorized: false
        });
      });
    });

    it('cannot connect to secure websocket server via ws://', function (done) {
      const server = https.createServer({
        cert: fs.readFileSync('test/fixtures/certificate.pem'),
        key: fs.readFileSync('test/fixtures/key.pem')
      });
      const wss = new WebSocketServer({ server });

      server.listen(++port, () => {
        const ws = new WebSocket(`ws://localhost:${port}`, {
          rejectUnauthorized: false
        });

        ws.on('error', () => {
          server.close(done);
          wss.close();
        });
      });
    });

    it('can send and receive text data', function (done) {
      const server = https.createServer({
        cert: fs.readFileSync('test/fixtures/certificate.pem'),
        key: fs.readFileSync('test/fixtures/key.pem')
      });
      const wss = new WebSocketServer({ server });

      wss.on('connection', (ws) => {
        ws.on('message', (message, flags) => {
          assert.strictEqual(message, 'foobar');
          server.close(done);
          wss.close();
        });
      });

      server.listen(++port, () => {
        const ws = new WebSocket(`wss://localhost:${port}`, {
          rejectUnauthorized: false
        });

        ws.on('open', () => ws.send('foobar'));
      });
    });

    it('can send and receive very long binary data', function (done) {
      const buf = crypto.randomBytes(5 * 1024 * 1024);
      const server = https.createServer({
        cert: fs.readFileSync('test/fixtures/certificate.pem'),
        key: fs.readFileSync('test/fixtures/key.pem')
      });
      const wss = new WebSocketServer({ server });

      wss.on('connection', (ws) => {
        ws.on('message', (message) => ws.send(message));
      });

      server.listen(++port, () => {
        const ws = new WebSocket(`wss://localhost:${port}`, {
          rejectUnauthorized: false
        });

        ws.on('open', () => ws.send(buf));
        ws.on('message', (message, flags) => {
          assert.strictEqual(flags.binary, true);
          assert.ok(buf.equals(message));

          server.close(done);
          wss.close();
        });
      });
    });
  });

  describe('host and origin headers', function () {
    it('includes the host header with port number', function (done) {
      const server = http.createServer();

      server.listen(++port, () => {
        server.on('upgrade', (req, socket, head) => {
          assert.strictEqual(req.headers.host, `localhost:${port}`);
          server.close(done);
          socket.destroy();
        });

        const ws = new WebSocket(`ws://localhost:${port}`);
      });
    });

    it('lacks default origin header', function (done) {
      const server = http.createServer();

      server.listen(++port, () => {
        server.on('upgrade', (req, socket, head) => {
          assert.strictEqual(req.headers.origin, undefined);
          server.close(done);
          socket.destroy();
        });

        const ws = new WebSocket(`ws://localhost:${port}`);
      });
    });

    it('honors origin set in options (1/2)', function (done) {
      const server = http.createServer();

      server.listen(++port, () => {
        const options = { origin: 'https://example.com:8000' };

        server.on('upgrade', (req, socket, head) => {
          assert.strictEqual(req.headers.origin, options.origin);
          server.close(done);
          socket.destroy();
        });

        const ws = new WebSocket(`ws://localhost:${port}`, options);
      });
    });

    it('honors origin set in options (2/2)', function (done) {
      const server = http.createServer();

      server.listen(++port, () => {
        const options = {
          origin: 'https://example.com:8000',
          protocolVersion: 8
        };

        server.on('upgrade', (req, socket, head) => {
          assert.strictEqual(req.headers['sec-websocket-origin'], options.origin);
          server.close(done);
          socket.destroy();
        });

        const ws = new WebSocket(`ws://localhost:${port}`, options);
      });
    });

    it('excludes default ports from host header', function () {
      const httpsAgent = new https.Agent();
      const httpAgent = new http.Agent();
      const values = [];
      let ws;

      httpsAgent.addRequest = httpAgent.addRequest = (req) => {
        values.push(req._headers.host);
      };

      ws = new WebSocket('wss://localhost:8443', { agent: httpsAgent });
      ws = new WebSocket('wss://localhost:443', { agent: httpsAgent });
      ws = new WebSocket('ws://localhost:88', { agent: httpAgent });
      ws = new WebSocket('ws://localhost:80', { agent: httpAgent });

      assert.deepStrictEqual(values, [
        'localhost:8443',
        'localhost',
        'localhost:88',
        'localhost'
      ]);
    });
  });

  describe('permessage-deflate', function () {
    it('is enabled by default', (done) => {
      const server = http.createServer();
      const wss = new WebSocketServer({ server, perMessageDeflate: true });

      server.on('upgrade', (req, socket, head) => {
        assert.ok(req.headers['sec-websocket-extensions'].includes('permessage-deflate'));
      });

      server.listen(++port, () => {
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => {
          assert.ok(ws.extensions['permessage-deflate']);
          server.close(done);
          wss.close();
        });
      });
    });

    it('can be disabled', function (done) {
      const server = http.createServer();
      const wss = new WebSocketServer({ server, perMessageDeflate: true });

      server.on('upgrade', (req, socket, head) => {
        assert.strictEqual(req.headers['sec-websocket-extensions'], undefined);
      });

      server.listen(++port, () => {
        const ws = new WebSocket(`ws://localhost:${port}`, {
          perMessageDeflate: false
        });

        ws.on('open', () => {
          server.close(done);
          wss.close();
        });
      });
    });

    it('can send extension parameters', function (done) {
      const server = http.createServer();
      const wss = new WebSocketServer({ server, perMessageDeflate: true });

      server.on('upgrade', (req, socket, head) => {
        const extensions = req.headers['sec-websocket-extensions'];

        assert.ok(extensions.includes('permessage-deflate'));
        assert.ok(extensions.includes('server_no_context_takeover'));
        assert.ok(extensions.includes('client_no_context_takeover'));
        assert.ok(extensions.includes('server_max_window_bits=10'));
        assert.ok(extensions.includes('client_max_window_bits'));
      });

      server.listen(++port, () => {
        const ws = new WebSocket(`ws://localhost:${port}`, {
          perMessageDeflate: {
            serverNoContextTakeover: true,
            clientNoContextTakeover: true,
            serverMaxWindowBits: 10,
            clientMaxWindowBits: true
          }
        });

        ws.on('open', () => {
          server.close(done);
          wss.close();
        });
      });
    });

    it('can send and receive text data', function (done) {
      const wss = new WebSocketServer({
        perMessageDeflate: { threshold: 0 },
        port: ++port
      }, () => {
        const ws = new WebSocket(`ws://localhost:${port}`, {
          perMessageDeflate: { threshold: 0 }
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

    it('can send and receive a typed array', function (done) {
      const array = new Float32Array(5);

      for (let i = 0; i < array.length; i++) {
        array[i] = i / 2;
      }

      const wss = new WebSocketServer({
        perMessageDeflate: { threshold: 0 },
        port: ++port
      }, () => {
        const ws = new WebSocket(`ws://localhost:${port}`, {
          perMessageDeflate: { threshold: 0 }
        });

        ws.on('open', () => ws.send(array, { compress: true }));
        ws.on('message', (message) => {
          assert.ok(message.equals(Buffer.from(array.buffer)));
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (message) => ws.send(message, { compress: true }));
      });
    });

    it('can send and receive ArrayBuffer', function (done) {
      const array = new Float32Array(5);

      for (let i = 0; i < array.length; i++) {
        array[i] = i / 2;
      }

      const wss = new WebSocketServer({
        perMessageDeflate: { threshold: 0 },
        port: ++port
      }, () => {
        const ws = new WebSocket(`ws://localhost:${port}`, {
          perMessageDeflate: { threshold: 0 }
        });

        ws.on('open', () => ws.send(array.buffer, { compress: true }));
        ws.on('message', (message) => {
          assert.ok(message.equals(Buffer.from(array.buffer)));
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (message) => ws.send(message, { compress: true }));
      });
    });

    describe('#send', function () {
      it('can set the compress option true when perMessageDeflate is disabled', function (done) {
        const wss = new WebSocketServer({ port: ++port }, () => {
          const ws = new WebSocket(`ws://localhost:${port}`, {
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
    });

    describe('#close', function () {
      it('should not raise error callback, if any, if called during send data', function (done) {
        const wss = new WebSocketServer({
          perMessageDeflate: { threshold: 0 },
          port: ++port
        }, () => {
          const ws = new WebSocket(`ws://localhost:${port}`, {
            perMessageDeflate: { threshold: 0 }
          });

          ws.on('open', () => {
            ws.send('hi', (error) => assert.ifError(error));
            ws.close();
          });
        });

        wss.on('connection', (ws) => {
          ws.on('message', (message) => {
            assert.strictEqual(message, 'hi');
            ws.on('close', (code) => {
              assert.strictEqual(code, 1000);
              wss.close(done);
            });
          });
        });
      });
    });

    describe('#terminate', function () {
      it('will raise error callback, if any, if called during send data', function (done) {
        const wss = new WebSocketServer({
          perMessageDeflate: { threshold: 0 },
          port: ++port
        }, () => {
          const ws = new WebSocket(`ws://localhost:${port}`, {
            perMessageDeflate: { threshold: 0 }
          });

          ws.on('open', () => {
            ws.send('hi', (error) => {
              assert.ok(error instanceof Error);
              wss.close(done);
            });
            ws.terminate();
          });
        });
      });

      it('can call during receiving data', function (done) {
        const wss = new WebSocketServer({
          perMessageDeflate: { threshold: 0 },
          port: ++port
        }, () => {
          const ws = new WebSocket(`ws://localhost:${port}`, {
            perMessageDeflate: { threshold: 0 }
          });

          wss.on('connection', (client) => {
            for (let i = 0; i < 10; i++) {
              client.send('hi');
            }
            client.send('hi', () => {
              ws.extensions['permessage-deflate']._inflate.on('close', () => {
                wss.close(done);
              });
              ws.terminate();
            });
          });
        });
      });
    });
  });
});
