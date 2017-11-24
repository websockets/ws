/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^ws$", "args": "none" }] */

'use strict';

const safeBuffer = require('safe-buffer');
const assert = require('assert');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const fs = require('fs');

const constants = require('../lib/Constants');
const WebSocket = require('..');

const Buffer = safeBuffer.Buffer;

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
    it('accepts an `agent` option', function (done) {
      const agent = new CustomAgent();

      agent.addRequest = () => {
        done();
      };

      const ws = new WebSocket('ws://localhost', { agent });
    });

    it('accepts the `options` object as the 3rd argument', function () {
      const agent = new CustomAgent();
      let count = 0;
      let ws;

      agent.addRequest = (req) => count++;

      ws = new WebSocket('ws://localhost', undefined, { agent });
      ws = new WebSocket('ws://localhost', null, { agent });
      ws = new WebSocket('ws://localhost', [], { agent });

      assert.strictEqual(count, 3);
    });

    it('throws an error when using an invalid `protocolVersion`', function () {
      const options = { agent: new CustomAgent(), protocolVersion: 1000 };

      assert.throws(
        () => new WebSocket('ws://localhost', options),
        /^Error: unsupported protocol version: 1000 \(supported versions: 8, 13\)$/
      );
    });

    it('accepts the localAddress option', function (done) {
      const wss = new WebSocket.Server({ host: '127.0.0.1', port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`, {
          localAddress: '127.0.0.2'
        });

        ws.on('error', (err) => {
          // Skip this test on machines where 127.0.0.2 is disabled.
          if (err.code === 'EADDRNOTAVAIL') err = undefined;
          wss.close(() => done(err));
        });
      });

      wss.on('connection', (ws, req) => {
        assert.strictEqual(req.connection.remoteAddress, '127.0.0.2');
        wss.close(done);
      });
    });

    it('accepts the localAddress option whether it was wrong interface', function () {
      const localAddress = '123.456.789.428';

      assert.throws(() => {
        const ws = new WebSocket('ws://localhost', { localAddress });
      }, (err) => {
        return err instanceof TypeError && (err.code === 'ERR_INVALID_IP_ADDRESS' ||
          err.message.includes(`must be a valid IP: ${localAddress}`));
      });
    });

    it('accepts the family option', function (done) {
      const wss = new WebSocket.Server({ host: '::1', port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`, { family: 6 });
      });

      wss.on('error', (err) => {
        // Skip this test on machines where IPv6 is not supported.
        if (err.code === 'EADDRNOTAVAIL') err = undefined;
        wss.close(() => done(err));
      });

      wss.on('connection', (ws, req) => {
        assert.strictEqual(req.connection.remoteAddress, '::1');
        wss.close(done);
      });
    });
  });

  describe('properties', function () {
    it('#bytesReceived exposes number of bytes received', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('message', () => {
          assert.strictEqual(ws.bytesReceived, 8);
          wss.close(done);
        });
      });
      wss.on('connection', (ws) => ws.send('foobar'));
    });

    it('#url exposes the server url', function () {
      const url = 'ws://localhost';
      const ws = new WebSocket(url, { agent: new CustomAgent() });

      assert.strictEqual(ws.url, url);
    });

    it('#protocolVersion exposes the protocol version', function () {
      const ws = new WebSocket('ws://localhost', {
        agent: new CustomAgent()
      });

      assert.strictEqual(ws.protocolVersion, 13);
    });

    describe('#bufferedAmount', function () {
      it('defaults to zero', function () {
        const ws = new WebSocket('ws://localhost', {
          agent: new CustomAgent()
        });

        assert.strictEqual(ws.bufferedAmount, 0);
      });

      it('defaults to zero upon "open"', function (done) {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const port = wss._server.address().port;
          const ws = new WebSocket(`ws://localhost:${port}`);

          ws.onopen = () => {
            assert.strictEqual(ws.bufferedAmount, 0);
            wss.close(done);
          };
        });
      });

      it('takes into account the data in the sender queue', function (done) {
        const wss = new WebSocket.Server({
          perMessageDeflate: true,
          port: 0
        }, () => {
          const port = wss._server.address().port;
          const ws = new WebSocket(`ws://localhost:${port}`, {
            perMessageDeflate: { threshold: 0 }
          });

          ws.on('open', () => {
            ws.send('foo');
            ws.send('bar', (err) => {
              assert.ifError(err);
              assert.strictEqual(ws.bufferedAmount, 0);
              wss.close(done);
            });

            assert.strictEqual(ws.bufferedAmount, 3);
          });
        });
      });

      it('takes into account the data in the socket queue', function (done) {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const port = wss._server.address().port;
          const ws = new WebSocket(`ws://localhost:${port}`);
        });

        wss.on('connection', (ws) => {
          while (true) {
            if (ws._socket.bufferSize > 0) {
              assert.strictEqual(ws.bufferedAmount, ws._socket.bufferSize);
              break;
            }
            ws.send('hello'.repeat(1e4));
          }
          wss.close(done);
        });
      });
    });

    describe('Custom headers', function () {
      const server = http.createServer();

      beforeEach((done) => server.listen(0, done));
      afterEach((done) => server.close(done));

      it('request has an authorization header', function (done) {
        const wss = new WebSocket.Server({ server });
        const auth = 'test:testpass';

        server.once('upgrade', (req, socket, head) => {
          assert.ok(req.headers.authorization);
          assert.strictEqual(
            req.headers.authorization,
            `Basic ${Buffer.from(auth).toString('base64')}`
          );

          wss.close(done);
        });

        const port = server.address().port;
        const ws = new WebSocket(`ws://${auth}@localhost:${port}`);
      });

      it('accepts custom headers', function (done) {
        const wss = new WebSocket.Server({ server });

        server.once('upgrade', (req, socket, head) => {
          assert.ok(req.headers.cookie);
          assert.strictEqual(req.headers.cookie, 'foo=bar');

          wss.close(done);
        });

        const ws = new WebSocket(`ws://localhost:${server.address().port}`, {
          headers: { 'Cookie': 'foo=bar' }
        });
      });
    });

    describe('#readyState', function () {
      it('defaults to connecting', function () {
        const ws = new WebSocket('ws://localhost', {
          agent: new CustomAgent()
        });

        assert.strictEqual(ws.readyState, WebSocket.CONNECTING);
      });

      it('set to open once connection is established', function (done) {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const port = wss._server.address().port;
          const ws = new WebSocket(`ws://localhost:${port}`);

          ws.on('open', () => {
            assert.strictEqual(ws.readyState, WebSocket.OPEN);
            ws.close();
          });

          ws.on('close', () => wss.close(done));
        });
      });

      it('set to closed once connection is closed', function (done) {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const port = wss._server.address().port;
          const ws = new WebSocket(`ws://localhost:${port}`);

          ws.on('close', () => {
            assert.strictEqual(ws.readyState, WebSocket.CLOSED);
            wss.close(done);
          });

          ws.on('open', () => ws.close(1001));
        });
      });

      it('set to closed once connection is terminated', function (done) {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const port = wss._server.address().port;
          const ws = new WebSocket(`ws://localhost:${port}`);

          ws.on('close', () => {
            assert.strictEqual(ws.readyState, WebSocket.CLOSED);
            wss.close(done);
          });

          ws.on('open', () => ws.terminate());
        });
      });
    });

    const readyStates = {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3
    };

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
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('ping', () => wss.close(done));
      });

      wss.on('connection', (client) => client.ping());
    });

    it('emits a pong event', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('pong', () => wss.close(done));
      });

      wss.on('connection', (client) => client.pong());
    });

    it('emits a headers event', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('headers', (headers, res) => {
          assert.strictEqual(headers, res.headers);
          wss.close(done);
        });
      });
    });
  });

  describe('connection establishing', function () {
    const server = http.createServer();

    beforeEach((done) => server.listen(0, done));
    afterEach((done) => server.close(done));

    it('invalid server key is denied', function (done) {
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
        assert.strictEqual(err.message, 'invalid server key');
        done();
      });
    });

    it('close event is raised when server closes connection', function (done) {
      server.once('upgrade', (req, socket) => {
        const key = crypto.createHash('sha1')
          .update(req.headers['sec-websocket-key'] + constants.GUID, 'binary')
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

    it('error is emitted if server aborts connection', function (done) {
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

      ws.on('open', () => done(new Error("unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'unexpected server response (401)');
        done();
      });
    });

    it('unexpected response can be read when sent by server', function (done) {
      server.once('upgrade', (req, socket) => {
        socket.end(
          `HTTP/1.1 401 ${http.STATUS_CODES[401]}\r\n` +
          'Connection: close\r\n' +
          'Content-type: text/html\r\n' +
          `Content-Length: ${http.STATUS_CODES[401].length}\r\n` +
          '\r\n' +
          'foo'
        );
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);

      ws.on('open', () => done(new Error("unexpected 'open' event")));
      ws.on('error', () => done(new Error("unexpected 'error' event")));
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

    it('request can be aborted when unexpected response is sent by server', function (done) {
      server.once('upgrade', (req, socket) => {
        socket.end(
          `HTTP/1.1 401 ${http.STATUS_CODES[401]}\r\n` +
          'Connection: close\r\n' +
          'Content-type: text/html\r\n' +
          `Content-Length: ${http.STATUS_CODES[401].length}\r\n` +
          '\r\n' +
          'foo'
        );
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);

      ws.on('open', () => done(new Error("unexpected 'open' event")));
      ws.on('error', () => done(new Error("unexpected 'error' event")));
      ws.on('unexpected-response', (req, res) => {
        assert.strictEqual(res.statusCode, 401);

        res.on('end', done);
        req.abort();
      });
    });

    it('fails if the opening handshake timeout expires', function (done) {
      server.once('upgrade', (req, socket) => socket.on('end', socket.end));

      const port = server.address().port;
      const ws = new WebSocket(`ws://localhost:${port}`, null, {
        handshakeTimeout: 100
      });

      ws.on('open', () => done(new Error("unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'opening handshake has timed out');
        done();
      });
    });

    it('fails if the Sec-WebSocket-Extensions response header is invalid', function (done) {
      server.once('upgrade', (req, socket) => {
        const key = crypto.createHash('sha1')
          .update(req.headers['sec-websocket-key'] + constants.GUID, 'binary')
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

      ws.on('open', () => done(new Error("unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'invalid Sec-WebSocket-Extensions header');
        ws.on('close', () => done());
      });
    });

    it('fails if server sends a subprotocol when none was requested', function (done) {
      server.once('upgrade', (req, socket) => {
        const key = crypto.createHash('sha1')
          .update(req.headers['sec-websocket-key'] + constants.GUID, 'binary')
          .digest('base64');

        socket.end(
          'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Accept: ${key}\r\n` +
          'Sec-WebSocket-Protocol: foo\r\n' +
          '\r\n'
        );
      });

      const ws = new WebSocket(`ws://localhost:${server.address().port}`);

      ws.on('open', () => done(new Error("unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'server sent a subprotocol even though none requested'
        );
        ws.on('close', () => done());
      });
    });
  });

  describe('connection with query string', function () {
    it('connects when pathname is not null', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}/?token=qwerty`);

        ws.on('open', () => wss.close(done));
      });
    });

    it('connects when pathname is null', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}?token=qwerty`);

        ws.on('open', () => wss.close(done));
      });
    });
  });

  describe('#pause and #resume', function () {
    it('throws an error when `readyState` is not `OPEN` (pause)', function () {
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      assert.throws(() => ws.pause(), /^Error: not opened$/);
    });

    it('throws an error when `readyState` is not `OPEN` (resume)', function () {
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      assert.throws(() => ws.resume(), /^Error: not opened$/);
    });

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
          wss.close(done);
        });
        serverClient.pause();

        setTimeout(() => {
          paused = false;
          serverClient.resume();
        }, 200);

        client.send('foo');
      };

      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
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
    it('before connect should fail', function () {
      const ws = new WebSocket('ws://localhost', {
        agent: new CustomAgent()
      });

      assert.throws(() => ws.ping(), /^Error: not opened$/);
    });

    it('before connect can silently fail', function () {
      const ws = new WebSocket('ws://localhost', {
        agent: new CustomAgent()
      });

      assert.doesNotThrow(() => ws.ping('', true, true));
    });

    it('without message is successfully transmitted to the server', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.ping());
      });

      wss.on('connection', (ws) => {
        ws.on('ping', () => wss.close(done));
      });
    });

    it('with message is successfully transmitted to the server', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => {
          ws.ping('hi', true);
          ws.ping('hi');
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

    it('can send numbers as ping payload', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.ping(0));
      });

      wss.on('connection', (ws) => {
        ws.on('ping', (message) => {
          assert.strictEqual(message.toString(), '0');
          wss.close(done);
        });
      });
    });
  });

  describe('#pong', function () {
    it('before connect should fail', () => {
      const ws = new WebSocket('ws://localhost', {
        agent: new CustomAgent()
      });

      assert.throws(() => ws.pong(), /^Error: not opened$/);
    });

    it('before connect can silently fail', function () {
      const ws = new WebSocket('ws://localhost', {
        agent: new CustomAgent()
      });

      assert.doesNotThrow(() => ws.pong('', true, true));
    });

    it('without message is successfully transmitted to the server', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.pong());
      });

      wss.on('connection', (ws) => {
        ws.on('pong', () => wss.close(done));
      });
    });

    it('with message is successfully transmitted to the server', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => {
          ws.pong('hi', true);
          ws.pong('hi');
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

    it('can send numbers as pong payload', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.pong(0));
      });

      wss.on('connection', (ws) => {
        ws.on('pong', (message) => {
          assert.strictEqual(message.toString(), '0');
          wss.close(done);
        });
      });
    });
  });

  describe('#send', function () {
    it('very long binary data can be sent and received', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const array = new Float32Array(5 * 1024 * 1024);

        for (let i = 0; i < array.length; i++) {
          array[i] = i / 5;
        }

        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

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

    it('can send and receive text data', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

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

    it('does not override the `fin` option', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
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

    it('sends numbers as strings', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send(0));
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg) => {
          assert.strictEqual(msg, '0');
          wss.close(done);
        });
      });
    });

    it('can send binary data as an array', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const array = new Float32Array(6);

        for (let i = 0; i < array.length; ++i) {
          array[i] = i / 2;
        }

        const partial = array.subarray(2, 5);
        const buf = Buffer.from(partial.buffer)
          .slice(partial.byteOffset, partial.byteOffset + partial.byteLength);

        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send(partial, { binary: true }));
        ws.on('message', (message) => {
          assert.ok(message.equals(buf));
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg) => ws.send(msg));
      });
    });

    it('can send binary data as a buffer', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const buf = Buffer.from('foobar');
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send(buf, { binary: true }));
        ws.on('message', (message) => {
          assert.ok(message.equals(buf));
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg) => ws.send(msg));
      });
    });

    it('ArrayBuffer is auto-detected without binary flag', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const array = new Float32Array(5);

        for (let i = 0; i < array.length; ++i) {
          array[i] = i / 2;
        }

        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

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

    it('Buffer is auto-detected without binary flag', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const buf = Buffer.from('foobar');
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

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

    it('before connect should fail', function () {
      const ws = new WebSocket('ws://localhost', {
        agent: new CustomAgent()
      });

      assert.throws(() => ws.send('hi'), /^Error: not opened$/);
    });

    it('before connect should pass error through callback, if present', function () {
      const ws = new WebSocket('ws://localhost', {
        agent: new CustomAgent()
      });

      ws.send('hi', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.message, 'not opened');
      });
    });

    it('without data should be successful', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send());
      });

      wss.on('connection', (ws) => {
        ws.on('message', (message) => {
          assert.ok(message.equals(Buffer.alloc(0)));
          wss.close(done);
        });
      });
    });

    it('calls optional callback when flushed', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => {
          ws.send('hi', (err) => {
            assert.ifError(err);
            wss.close(done);
          });
        });
      });
    });

    it('with unmasked message is successfully transmitted to the server', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send('hi', { mask: false }));
      });

      wss.on('connection', (ws) => {
        ws.on('message', (message) => {
          assert.strictEqual(message, 'hi');
          wss.close(done);
        });
      });
    });

    it('with masked message is successfully transmitted to the server', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send('hi', { mask: true }));
      });

      wss.on('connection', (ws) => {
        ws.on('message', (message) => {
          assert.strictEqual(message, 'hi');
          wss.close(done);
        });
      });
    });

    it('with unmasked binary message is successfully transmitted to the server', function (done) {
      const array = new Float32Array(5);

      for (let i = 0; i < array.length; ++i) {
        array[i] = i / 2;
      }

      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send(array, { mask: false, binary: true }));
      });

      wss.on('connection', (ws) => {
        ws.on('message', (message) => {
          assert.ok(message.equals(Buffer.from(array.buffer)));
          wss.close(done);
        });
      });
    });

    it('with masked binary message is successfully transmitted to the server', function (done) {
      const array = new Float32Array(5);

      for (let i = 0; i < array.length; ++i) {
        array[i] = i / 2;
      }

      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.send(array, { mask: true, binary: true }));
      });

      wss.on('connection', (ws) => {
        ws.on('message', (message) => {
          assert.ok(message.equals(Buffer.from(array.buffer)));
          wss.close(done);
        });
      });
    });
  });

  describe('#close', function () {
    it('closes the connection if called while connecting (1/2)', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => done(new Error("unexpected 'open' event")));
        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.message, 'closed before the connection is established');
          ws.on('close', () => wss.close(done));
        });
        ws.close(1001);
      });
    });

    it('closes the connection if called while connecting (2/2)', function (done) {
      const wss = new WebSocket.Server({
        verifyClient: (info, cb) => setTimeout(cb, 300, true),
        port: 0
      }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => done(new Error("unexpected 'open' event")));
        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.message, 'closed before the connection is established');
          ws.on('close', () => wss.close(done));
        });
        setTimeout(() => ws.close(1001), 150);
      });
    });

    it('can be called from an error listener while connecting', function (done) {
      const ws = new WebSocket('ws://localhost:1337');

      ws.on('open', () => done(new Error("unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.code, 'ECONNREFUSED');
        ws.close();
        ws.on('close', () => done());
      });
    });

    it('can be called from a listener of the headers event', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => done(new Error("unexpected 'open' event")));
        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.message, 'closed before the connection is established');
          ws.on('close', () => wss.close(done));
        });
        ws.on('headers', () => ws.close());
      });
    });

    it('throws an error if the first argument is invalid (1/2)', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => {
          assert.throws(
            () => ws.close('error'),
            /^Error: first argument must be a valid error code number$/
          );

          wss.close(done);
        });
      });
    });

    it('throws an error if the first argument is invalid (2/2)', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => {
          assert.throws(
            () => ws.close(1004),
            /^Error: first argument must be a valid error code number$/
          );

          wss.close(done);
        });
      });
    });

    it('works when close reason is not specified', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

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

    it('works when close reason is specified', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

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

    it('ends connection to the server', function (done) {
      const wss = new WebSocket.Server({
        clientTracking: false,
        port: 0
      }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => {
          ws.on('close', (code, reason) => {
            assert.strictEqual(reason, 'some reason');
            assert.strictEqual(code, 1000);
            wss.close(done);
          });
          ws.close(1000, 'some reason');
        });
      });
    });

    it('permits all buffered data to be delivered', function (done) {
      const wss = new WebSocket.Server({
        perMessageDeflate: { threshold: 0 },
        port: 0
      }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);
        const messages = [];

        ws.on('message', (message) => messages.push(message));
        ws.on('close', (code) => {
          assert.strictEqual(code, 1000);
          assert.deepStrictEqual(messages, ['foo', 'bar', 'baz']);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.send('foo');
        ws.send('bar');
        ws.send('baz');
        ws.close();
      });
    });

    it('allows close code 1013', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('close', (code) => {
          assert.strictEqual(code, 1013);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => ws.close(1013));
    });

    it('closes the connection when an error occurs', function (done) {
      const server = http.createServer();
      const wss = new WebSocket.Server({ server });
      let closed = false;

      wss.on('connection', (ws) => {
        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.message, 'RSV2 and RSV3 must be clear');

          ws.on('close', (code, reason) => {
            assert.strictEqual(code, 1006);
            assert.strictEqual(reason, '');

            closed = true;
          });
        });
      });

      server.listen(0, () => {
        const ws = new WebSocket(`ws://localhost:${server.address().port}`);

        ws.on('open', () => ws._socket.write(Buffer.from([0xa1, 0x00])));
        ws.on('close', (code, reason) => {
          assert.strictEqual(code, 1002);
          assert.strictEqual(reason, '');
          assert.ok(closed);

          server.close(done);
        });
      });
    });

    it('does nothing if the connection is already CLOSED', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('close', (code) => {
          assert.strictEqual(code, 1000);
          assert.strictEqual(ws.readyState, WebSocket.CLOSED);
          ws.close();
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => ws.close());
    });
  });

  describe('#terminate', function () {
    it('closes the connection if called while connecting (1/2)', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => done(new Error("unexpected 'open' event")));
        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.message, 'closed before the connection is established');
          ws.on('close', () => wss.close(done));
        });
        ws.terminate();
      });
    });

    it('closes the connection if called while connecting (2/2)', function (done) {
      const wss = new WebSocket.Server({
        verifyClient: (info, cb) => setTimeout(cb, 300, true),
        port: 0
      }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => done(new Error("unexpected 'open' event")));
        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.message, 'closed before the connection is established');
          ws.on('close', () => wss.close(done));
        });
        setTimeout(() => ws.terminate(), 150);
      });
    });

    it('can be called from an error listener while connecting', function (done) {
      const ws = new WebSocket('ws://localhost:1337');

      ws.on('open', () => done(new Error("unexpected 'open' event")));
      ws.on('error', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.code, 'ECONNREFUSED');
        ws.terminate();
        ws.on('close', () => done());
      });
    });

    it('can be called from a listener of the headers event', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => done(new Error("unexpected 'open' event")));
        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.message, 'closed before the connection is established');
          ws.on('close', () => wss.close(done));
        });
        ws.on('headers', () => ws.terminate());
      });
    });

    it('does nothing if the connection is already CLOSED', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

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

  describe('WHATWG API emulation', function () {
    it('should not throw errors when getting and setting', function () {
      const listener = () => {};
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

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
    });

    it('should ignore when setting an invalid binary type', function () {
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      ws.binaryType = 'nodebuffer';
      assert.strictEqual(ws.binaryType, 'nodebuffer');
      ws.binaryType = 'foo';
      assert.strictEqual(ws.binaryType, 'nodebuffer');
      ws.binaryType = 'arraybuffer';
      assert.strictEqual(ws.binaryType, 'arraybuffer');
      ws.binaryType = '';
      assert.strictEqual(ws.binaryType, 'arraybuffer');
      ws.binaryType = 'fragments';
      assert.strictEqual(ws.binaryType, 'fragments');
      ws.binaryType = 'buffer';
      assert.strictEqual(ws.binaryType, 'fragments');
      ws.binaryType = 'nodebuffer';
      assert.strictEqual(ws.binaryType, 'nodebuffer');
    });

    it('should work the same as the EventEmitter api', function (done) {
      const wss = new WebSocket.Server({
        clientTracking: false,
        port: 0
      }, () => {
        const port = wss._server.address().port;
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
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.on('message', (msg) => ws.send(msg));
      });
    });

    it('doesn\'t return event listeners added with `on`', function () {
      const listener = () => {};
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      ws.on('open', listener);

      assert.deepStrictEqual(ws.listeners('open'), [listener]);
      assert.strictEqual(ws.onopen, undefined);
    });

    it('doesn\'t remove event listeners added with `on`', function () {
      const listener = () => {};
      const ws = new WebSocket('ws://localhost', { agent: new CustomAgent() });

      ws.on('close', listener);
      ws.onclose = listener;

      let listeners = ws.listeners('close');

      assert.strictEqual(listeners.length, 2);
      assert.strictEqual(listeners[0], listener);
      assert.strictEqual(listeners[1]._listener, listener);

      ws.onclose = listener;

      listeners = ws.listeners('close');

      assert.strictEqual(listeners.length, 2);
      assert.strictEqual(listeners[0], listener);
      assert.strictEqual(listeners[1]._listener, listener);
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

    it('should receive text data wrapped in a MessageEvent when using addEventListener', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

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

    it('should receive valid CloseEvent when server closes with code 1000', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.addEventListener('close', (closeEvent) => {
          assert.ok(closeEvent.wasClean);
          assert.strictEqual(closeEvent.code, 1000);
          wss.close(done);
        });
      });

      wss.on('connection', (client) => client.close(1000));
    });

    it('should assign "true" to wasClean when server closes with code 3000', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.addEventListener('close', (closeEvent) => {
          assert.ok(closeEvent.wasClean);
          wss.close(done);
        });
      });

      wss.on('connection', (client) => client.close(3000));
    });

    it('should assign "true" to wasClean when server closes with code 4999', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.addEventListener('close', (closeEvent) => {
          assert.ok(closeEvent.wasClean);
          wss.close(done);
        });
      });

      wss.on('connection', (client) => client.close(4999));
    });

    it('should receive valid CloseEvent when server closes with code 1001', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.addEventListener('close', (closeEvent) => {
          assert.ok(!closeEvent.wasClean);
          assert.strictEqual(closeEvent.code, 1001);
          assert.strictEqual(closeEvent.reason, 'some daft reason');
          wss.close(done);
        });
      });

      wss.on('connection', (client) => client.close(1001, 'some daft reason'));
    });

    it('should have target set on Events', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
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
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
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

    it('should pass binary data as a Node.js Buffer by default', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.onmessage = (evt) => {
          assert.ok(Buffer.isBuffer(evt.data));
          wss.close(done);
        };
      });

      wss.on('connection', (ws) => ws.send(new Uint8Array(4096)));
    });

    it('should pass an ArrayBuffer for event.data if binaryType = arraybuffer', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.binaryType = 'arraybuffer';

        ws.onmessage = (evt) => {
          assert.ok(evt.data instanceof ArrayBuffer);
          wss.close(done);
        };
      });

      wss.on('connection', (ws) => ws.send(new Uint8Array(4096)));
    });

    it('should ignore binaryType for text messages', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.binaryType = 'arraybuffer';

        ws.onmessage = (evt) => {
          assert.strictEqual(evt.data, 'foo');
          wss.close(done);
        };
      });

      wss.on('connection', (ws) => ws.send('foo'));
    });

    it('should allow to update binaryType on the fly', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        function testType (binaryType, next) {
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

  describe('ssl', function () {
    it('can connect to secure websocket server', function (done) {
      const server = https.createServer({
        cert: fs.readFileSync('test/fixtures/certificate.pem'),
        key: fs.readFileSync('test/fixtures/key.pem')
      });
      const wss = new WebSocket.Server({ server });

      wss.on('connection', (ws) => {
        wss.close();
        server.close(done);
      });

      server.listen(0, () => {
        const ws = new WebSocket(`wss://localhost:${server.address().port}`, {
          rejectUnauthorized: false
        });
      });
    });

    it('can connect to secure websocket server with client side certificate', function (done) {
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

      wss.on('connection', (ws) => {
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

    it('cannot connect to secure websocket server via ws://', function (done) {
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

    it('can send and receive text data', function (done) {
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

    it('can send and receive very long binary data', function (done) {
      this.timeout(4000);

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
    });
  });

  describe('host and origin headers', function () {
    it('includes the host header with port number', function (done) {
      const agent = new CustomAgent();

      agent.addRequest = (req) => {
        assert.strictEqual(req._headers.host, 'localhost:1337');
        done();
      };

      const ws = new WebSocket('ws://localhost:1337', { agent });
    });

    it('lacks default origin header', function (done) {
      const agent = new CustomAgent();

      agent.addRequest = (req) => {
        assert.strictEqual(req._headers.origin, undefined);
        done();
      };

      const ws = new WebSocket('ws://localhost', { agent });
    });

    it('honors origin set in options (1/2)', function (done) {
      const agent = new CustomAgent();

      agent.addRequest = (req) => {
        assert.strictEqual(req._headers.origin, 'https://example.com:8000');
        done();
      };

      const ws = new WebSocket('ws://localhost', {
        origin: 'https://example.com:8000',
        agent
      });
    });

    it('honors origin set in options (2/2)', function (done) {
      const agent = new CustomAgent();

      agent.addRequest = (req) => {
        assert.strictEqual(
          req._headers['sec-websocket-origin'],
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
      const wss = new WebSocket.Server({ server, perMessageDeflate: true });

      server.on('upgrade', (req, socket, head) => {
        assert.ok(req.headers['sec-websocket-extensions'].includes('permessage-deflate'));
      });

      server.listen(0, () => {
        const ws = new WebSocket(`ws://localhost:${server.address().port}`);

        ws.on('open', () => {
          assert.ok(ws.extensions['permessage-deflate']);
          server.close(done);
          wss.close();
        });
      });
    });

    it('can be disabled', function (done) {
      const server = http.createServer();
      const wss = new WebSocket.Server({ server, perMessageDeflate: true });

      server.on('upgrade', (req, socket, head) => {
        assert.strictEqual(req.headers['sec-websocket-extensions'], undefined);
      });

      server.listen(0, () => {
        const ws = new WebSocket(`ws://localhost:${server.address().port}`, {
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
      const wss = new WebSocket.Server({ server, perMessageDeflate: true });

      server.on('upgrade', (req, socket, head) => {
        const extensions = req.headers['sec-websocket-extensions'];

        assert.ok(extensions.includes('permessage-deflate'));
        assert.ok(extensions.includes('server_no_context_takeover'));
        assert.ok(extensions.includes('client_no_context_takeover'));
        assert.ok(extensions.includes('server_max_window_bits=10'));
        assert.ok(extensions.includes('client_max_window_bits'));
      });

      server.listen(0, () => {
        const ws = new WebSocket(`ws://localhost:${server.address().port}`, {
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
      const wss = new WebSocket.Server({
        perMessageDeflate: { threshold: 0 },
        port: 0
      }, () => {
        const port = wss._server.address().port;
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

      const wss = new WebSocket.Server({
        perMessageDeflate: { threshold: 0 },
        port: 0
      }, () => {
        const port = wss._server.address().port;
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

      const wss = new WebSocket.Server({
        perMessageDeflate: { threshold: 0 },
        port: 0
      }, () => {
        const port = wss._server.address().port;
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

    it('consumes all received data when connection is closed abnormally', function (done) {
      const wss = new WebSocket.Server({
        perMessageDeflate: { threshold: 0 },
        port: 0
      }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);
        const messages = [];

        ws.on('message', (message) => messages.push(message));
        ws.on('close', (code) => {
          assert.strictEqual(code, 1006);
          assert.deepStrictEqual(messages, ['foo', 'bar', 'baz', 'qux']);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.send('foo');
        ws.send('bar');
        ws.send('baz');
        ws.send('qux', () => ws._socket.end());
      });
    });

    describe('#send', function () {
      it('can set the compress option true when perMessageDeflate is disabled', function (done) {
        const wss = new WebSocket.Server({ port: 0 }, () => {
          const port = wss._server.address().port;
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
        const wss = new WebSocket.Server({
          perMessageDeflate: { threshold: 0 },
          port: 0
        }, () => {
          const port = wss._server.address().port;
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
        const wss = new WebSocket.Server({
          perMessageDeflate: { threshold: 0 },
          port: 0
        }, () => {
          const port = wss._server.address().port;
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

      it('can be used while data is being processed', function (done) {
        const wss = new WebSocket.Server({
          perMessageDeflate: { threshold: 0 },
          port: 0
        }, () => {
          const port = wss._server.address().port;
          const ws = new WebSocket(`ws://localhost:${port}`, {
            perMessageDeflate: { threshold: 0 }
          });

          wss.on('connection', (client) => {
            for (let i = 0; i < 10; i++) {
              client.send('hi');
            }
            client.send('hi', () => {
              assert.strictEqual(ws._receiver._state, 5);
              ws.on('close', () => wss.close(done));
              ws.terminate();
            });
          });
        });
      });
    });
  });
});
