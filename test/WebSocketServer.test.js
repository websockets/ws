/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^ws$", "args": "none" }] */

'use strict';

const safeBuffer = require('safe-buffer');
const assert = require('assert');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const net = require('net');
const fs = require('fs');

const WebSocket = require('..');

const Buffer = safeBuffer.Buffer;

describe('WebSocketServer', function () {
  describe('#ctor', function () {
    it('throws an error if no option object is passed', function () {
      assert.throws(() => new WebSocket.Server());
    });

    it('throws an error if no port or server is specified', function () {
      assert.throws(() => new WebSocket.Server({}));
    });

    it('emits an error if http server bind fails', function (done) {
      const wss1 = new WebSocket.Server({ port: 0 }, () => {
        const wss2 = new WebSocket.Server({
          port: wss1._server.address().port
        });

        wss2.on('error', () => wss1.close(done));
      });
    });

    it('starts a server on a given port', function (done) {
      const port = 1337;
      const wss = new WebSocket.Server({ port }, () => {
        const ws = new WebSocket(`ws://localhost:${port}`);
      });

      wss.on('connection', (client) => wss.close(done));
    });

    it('binds the server on any IPv6 address when available', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        assert.strictEqual(wss._server.address().address, '::');
        wss.close(done);
      });
    });

    it('uses a precreated http server', function (done) {
      const server = http.createServer();

      server.listen(0, () => {
        const wss = new WebSocket.Server({ server });
        const ws = new WebSocket(`ws://localhost:${server.address().port}`);

        wss.on('connection', (client) => {
          wss.close();
          server.close(done);
        });
      });
    });

    it('426s for non-Upgrade requests', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        http.get(`http://localhost:${wss._server.address().port}`, (res) => {
          let body = '';

          assert.strictEqual(res.statusCode, 426);
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            assert.strictEqual(body, http.STATUS_CODES[426]);
            wss.close(done);
          });
        });
      });
    });

    it('uses a precreated http server listening on unix socket', function (done) {
      //
      // Skip this test on Windows as it throws errors for obvious reasons.
      //
      if (process.platform === 'win32') return done();

      const server = http.createServer();
      const sockPath = `/tmp/ws.${crypto.randomBytes(16).toString('hex')}.socket`;

      server.listen(sockPath, () => {
        const wss = new WebSocket.Server({ server });

        wss.on('connection', (ws, req) => {
          if (wss.clients.size === 1) {
            assert.strictEqual(req.url, '/foo?bar=bar');
          } else {
            assert.strictEqual(req.url, '/');
            wss.close();
            server.close(done);
          }
        });

        const ws = new WebSocket(`ws+unix://${sockPath}:/foo?bar=bar`);
        ws.on('open', () => new WebSocket(`ws+unix://${sockPath}`));
      });
    });

    it('will not crash when it receives an unhandled opcode', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}/`);

        ws.on('open', () => ws._socket.write(Buffer.from([0x85, 0x00])));
      });

      wss.on('connection', (ws) => {
        ws.on('error', (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.message, 'invalid opcode: 5');
          wss.close(done);
        });
      });
    });
  });

  describe('#close', function () {
    it('does not thrown when called twice', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        wss.close();
        wss.close();
        wss.close();

        done();
      });
    });

    it('closes all clients', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.on('close', () => {
          if (++closes === 2) done();
        });
      });
      let closes = 0;
      wss.on('connection', (ws) => {
        ws.on('close', () => {
          if (++closes === 2) done();
        });
        wss.close();
      });
    });

    it('does not close a precreated server', function (done) {
      const server = http.createServer();
      const realClose = server.close;

      server.close = () => {
        throw new Error('must not close pre-created server');
      };

      const wss = new WebSocket.Server({ server });

      wss.on('connection', (ws) => {
        wss.close();
        server.close = realClose;
        server.close(done);
      });

      server.listen(0, () => {
        const ws = new WebSocket(`ws://localhost:${server.address().port}`);
      });
    });

    it('invokes the callback in noServer mode', function (done) {
      const wss = new WebSocket.Server({ noServer: true });

      wss.close(done);
    });

    it('cleans event handlers on precreated server', function (done) {
      const server = http.createServer();
      const wss = new WebSocket.Server({ server });

      server.listen(0, () => {
        wss.close(() => {
          assert.strictEqual(server.listeners('listening').length, 0);
          assert.strictEqual(server.listeners('upgrade').length, 0);
          assert.strictEqual(server.listeners('error').length, 0);

          server.close(done);
        });
      });
    });
  });

  describe('#clients', function () {
    it('returns a list of connected clients', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        assert.strictEqual(wss.clients.size, 0);
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);
      });

      wss.on('connection', (ws) => {
        assert.strictEqual(wss.clients.size, 1);
        wss.close(done);
      });
    });

    it('can be disabled', function (done) {
      const wss = new WebSocket.Server({ port: 0, clientTracking: false }, () => {
        assert.strictEqual(wss.clients, undefined);
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.close());
      });

      wss.on('connection', (ws) => {
        assert.strictEqual(wss.clients, undefined);
        ws.on('close', () => wss.close(done));
      });
    });

    it('is updated when client terminates the connection', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.terminate());
      });

      wss.on('connection', (ws) => {
        ws.on('close', () => {
          assert.strictEqual(wss.clients.size, 0);
          wss.close(done);
        });
      });
    });

    it('is updated when client closes the connection', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('open', () => ws.close());
      });

      wss.on('connection', (ws) => {
        ws.on('close', () => {
          assert.strictEqual(wss.clients.size, 0);
          wss.close(done);
        });
      });
    });
  });

  describe('#options', function () {
    it('exposes options passed to constructor', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        assert.strictEqual(wss.options.port, 0);
        wss.close(done);
      });
    });
  });

  describe('#maxpayload', function () {
    it('maxpayload is passed on to clients', function (done) {
      const maxPayload = 20480;
      const wss = new WebSocket.Server({ port: 0, maxPayload }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);
      });

      wss.on('connection', (client) => {
        assert.strictEqual(client._maxPayload, maxPayload);
        wss.close(done);
      });
    });

    it('maxpayload is passed on to hybi receivers', function (done) {
      const maxPayload = 20480;
      const wss = new WebSocket.Server({ port: 0, maxPayload }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);
      });

      wss.on('connection', (client) => {
        assert.strictEqual(client._receiver._maxPayload, maxPayload);
        wss.close(done);
      });
    });

    it('maxpayload is passed on to permessage-deflate', function (done) {
      const PerMessageDeflate = require('../lib/PerMessageDeflate');
      const maxPayload = 20480;
      const wss = new WebSocket.Server({
        perMessageDeflate: true,
        maxPayload,
        port: 0
      }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);
      });

      wss.on('connection', (client) => {
        assert.strictEqual(
          client._receiver._extensions[PerMessageDeflate.extensionName]._maxPayload,
          maxPayload
        );
        wss.close(done);
      });
    });
  });

  describe('#shouldHandle', function () {
    it('returns true when the path matches', function () {
      const wss = new WebSocket.Server({ noServer: true, path: '/foo' });

      assert.strictEqual(wss.shouldHandle({ url: '/foo' }), true);
    });

    it('returns false when the path does not match', function () {
      const wss = new WebSocket.Server({ noServer: true, path: '/foo' });

      assert.strictEqual(wss.shouldHandle({ url: '/bar' }), false);
    });
  });

  describe('#handleUpgrade', function () {
    it('can be used for a pre-existing server', function (done) {
      const server = http.createServer();

      server.listen(0, () => {
        const wss = new WebSocket.Server({ noServer: true });

        server.on('upgrade', (req, socket, head) => {
          wss.handleUpgrade(req, socket, head, (client) => client.send('hello'));
        });

        const ws = new WebSocket(`ws://localhost:${server.address().port}`);

        ws.on('message', (message) => {
          assert.strictEqual(message, 'hello');
          wss.close();
          server.close(done);
        });
      });
    });

    it('closes the connection when path does not match', function (done) {
      const wss = new WebSocket.Server({ port: 0, path: '/ws' }, () => {
        const req = http.get({
          port: wss._server.address().port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket'
          }
        });

        req.on('response', (res) => {
          assert.strictEqual(res.statusCode, 400);
          wss.close(done);
        });
      });
    });

    it('closes the connection when protocol version is Hixie-76', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const req = http.get({
          port: wss._server.address().port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'WebSocket',
            'Sec-WebSocket-Key1': '4 @1  46546xW%0l 1 5',
            'Sec-WebSocket-Key2': '12998 5 Y3 1  .P00',
            'Sec-WebSocket-Protocol': 'sample'
          }
        });

        req.on('response', (res) => {
          assert.strictEqual(res.statusCode, 400);
          wss.close(done);
        });
      });
    });
  });

  describe('connection establishing', function () {
    it('does not accept connections with no sec-websocket-key', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const req = http.get({
          port: wss._server.address().port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket'
          }
        });

        req.on('response', (res) => {
          assert.strictEqual(res.statusCode, 400);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        done(new Error('connection must not be established'));
      });
    });

    it('does not accept connections with no sec-websocket-version', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const req = http.get({
          port: wss._server.address().port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ=='
          }
        });

        req.on('response', (res) => {
          assert.strictEqual(res.statusCode, 400);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        done(new Error('connection must not be established'));
      });
    });

    it('does not accept connections with invalid sec-websocket-version', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const req = http.get({
          port: wss._server.address().port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': 12
          }
        });

        req.on('response', (res) => {
          assert.strictEqual(res.statusCode, 400);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        done(new Error('connection must not be established'));
      });
    });

    it('client can be denied', function (done) {
      const wss = new WebSocket.Server({
        verifyClient: (o) => false,
        port: 0
      }, () => {
        const req = http.get({
          port: wss._server.address().port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': 8
          }
        });

        req.on('response', (res) => {
          assert.strictEqual(res.statusCode, 401);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        done(new Error('connection must not be established'));
      });
    });

    it('client can be accepted', function (done) {
      const wss = new WebSocket.Server({
        port: 0,
        verifyClient: (o) => true
      }, () => {
        http.get({
          port: wss._server.address().port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': 13
          }
        });
      });

      wss.on('connection', (ws) => wss.close(done));
    });

    it('verifyClient gets client origin', function (done) {
      let verifyClientCalled = false;
      const wss = new WebSocket.Server({
        verifyClient: (info) => {
          assert.strictEqual(info.origin, 'http://foobarbaz.com');
          verifyClientCalled = true;
          return false;
        },
        port: 0
      }, () => {
        const req = http.get({
          port: wss._server.address().port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': 13,
            'Origin': 'http://foobarbaz.com'
          }
        });

        req.on('response', (res) => {
          assert.ok(verifyClientCalled);
          wss.close(done);
        });
      });
    });

    it('verifyClient gets original request', function (done) {
      let verifyClientCalled = false;
      const wss = new WebSocket.Server({
        verifyClient: (info) => {
          assert.strictEqual(
            info.req.headers['sec-websocket-key'],
            'dGhlIHNhbXBsZSBub25jZQ=='
          );
          verifyClientCalled = true;
          return false;
        },
        port: 0
      }, () => {
        const req = http.get({
          port: wss._server.address().port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': 13
          }
        });

        req.on('response', (res) => {
          assert.ok(verifyClientCalled);
          wss.close(done);
        });
      });
    });

    it('verifyClient has secure:true for ssl connections', function (done) {
      const server = https.createServer({
        cert: fs.readFileSync('test/fixtures/certificate.pem'),
        key: fs.readFileSync('test/fixtures/key.pem')
      });

      let success = false;
      const wss = new WebSocket.Server({
        verifyClient: (info) => {
          success = info.secure === true;
          return true;
        },
        server
      });

      wss.on('connection', (ws) => {
        assert.ok(success);
        wss.close();
        server.close(done);
      });

      server.listen(0, () => {
        const ws = new WebSocket(`wss://localhost:${server.address().port}`, {
          rejectUnauthorized: false
        });
      });
    });

    it('verifyClient has secure:false for non-ssl connections', function (done) {
      const server = http.createServer();

      let success = false;
      const wss = new WebSocket.Server({
        server: server,
        verifyClient: (info) => {
          success = info.secure === false;
          return true;
        }
      });

      wss.on('connection', (ws) => {
        assert.ok(success);
        wss.close();
        server.close(done);
      });

      server.listen(0, () => {
        const ws = new WebSocket(`ws://localhost:${server.address().port}`);
      });
    });

    it('client can be denied asynchronously', function (done) {
      const wss = new WebSocket.Server({
        verifyClient: (o, cb) => process.nextTick(cb, false),
        port: 0
      }, () => {
        const req = http.get({
          port: wss._server.address().port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': 8
          }
        });

        req.on('response', (res) => {
          assert.strictEqual(res.statusCode, 401);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        done(new Error('connection must not be established'));
      });
    });

    it('client can be denied asynchronously with custom response code', function (done) {
      const wss = new WebSocket.Server({
        verifyClient: (o, cb) => process.nextTick(cb, false, 404),
        port: 0
      }, () => {
        const req = http.get({
          port: wss._server.address().port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': 8
          }
        });

        req.on('response', (res) => {
          assert.strictEqual(res.statusCode, 404);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        done(new Error('connection must not be established'));
      });
    });

    it('client can be accepted asynchronously', function (done) {
      const wss = new WebSocket.Server({
        verifyClient: (o, cb) => process.nextTick(cb, true),
        port: 0
      }, () => {
        http.get({
          port: wss._server.address().port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': 13
          }
        });
      });

      wss.on('connection', (ws) => wss.close(done));
    });

    it('doesn\'t emit the `connection` event if socket is closed prematurely', function (done) {
      const server = http.createServer();

      server.listen(0, () => {
        const wss = new WebSocket.Server({
          verifyClient: (o, cb) => setTimeout(cb, 100, true),
          server
        });

        wss.on('connection', () => {
          throw new Error('connection event emitted');
        });

        const socket = net.connect({ port: server.address().port }, () => {
          socket.write([
            'GET / HTTP/1.1',
            'Host: localhost',
            'Upgrade: websocket',
            'Connection: Upgrade',
            'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version: 13',
            '',
            ''
          ].join('\r\n'));
        });

        socket.on('end', () => {
          wss.close();
          server.close(done);
        });

        socket.setTimeout(50, () => socket.end());
      });
    });

    it('handles messages passed along with the upgrade request (upgrade head)', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const req = http.request({
          port: wss._server.address().port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': 13
          }
        });

        req.write(Buffer.from([0x81, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f]));
        req.end();
      });

      wss.on('connection', (ws) => {
        ws.on('message', (data) => {
          assert.strictEqual(data, 'Hello');
          wss.close(done);
        });
      });
    });

    it('selects the first protocol by default', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`, ['prot1', 'prot2']);

        ws.on('open', () => {
          assert.strictEqual(ws.protocol, 'prot1');
          wss.close(done);
        });
      });
    });

    it('selects the last protocol via protocol handler', function (done) {
      const handleProtocols = (protocols, request) => {
        assert.ok(request instanceof http.IncomingMessage);
        assert.strictEqual(request.url, '/');
        return protocols.pop();
      };
      const wss = new WebSocket.Server({ handleProtocols, port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`, ['prot1', 'prot2']);

        ws.on('open', () => {
          assert.strictEqual(ws.protocol, 'prot2');
          wss.close(done);
        });
      });
    });

    it('client detects invalid server protocol', function (done) {
      const wss = new WebSocket.Server({
        handleProtocols: (ps) => 'prot3',
        port: 0
      }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`, ['prot1', 'prot2']);

        ws.on('open', () => done(new Error('connection must not be established')));
        ws.on('error', () => wss.close(done));
      });
    });

    it('client detects no server protocol', function (done) {
      const wss = new WebSocket.Server({
        handleProtocols: (ps) => {},
        port: 0
      }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`, ['prot1', 'prot2']);

        ws.on('open', () => done(new Error('connection must not be established')));
        ws.on('error', () => wss.close(done));
      });
    });

    it('server detects unauthorized protocol handler', function (done) {
      const wss = new WebSocket.Server({
        handleProtocols: (ps) => false,
        port: 0
      }, () => {
        const req = http.get({
          port: wss._server.address().port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': 13
          }
        });

        req.on('response', (res) => {
          assert.strictEqual(res.statusCode, 401);
          wss.close(done);
        });
      });
    });

    it('accept connections with sec-websocket-extensions', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        http.get({
          port: wss._server.address().port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': 13,
            'Sec-WebSocket-Extensions': 'permessage-foo; x=10'
          }
        });
      });

      wss.on('connection', (ws) => wss.close(done));
    });

    it('emits the `headers` event', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        wss.on('headers', (headers, request) => {
          assert.deepStrictEqual(headers.slice(0, 3), [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade'
          ]);
          assert.ok(request instanceof http.IncomingMessage);
          assert.strictEqual(request.url, '/');

          wss.on('connection', () => wss.close(done));
        });
      });
    });
  });

  describe('messaging', function () {
    it('can send and receive data', function (done) {
      let data = new Array(65 * 1024);

      for (let i = 0; i < data.length; ++i) {
        data[i] = String.fromCharCode(65 + ~~(25 * Math.random()));
      }
      data = data.join('');

      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`);

        ws.on('message', (message) => ws.send(message));
      });

      wss.on('connection', (client) => {
        client.on('message', (message) => {
          assert.strictEqual(message, data);
          wss.close(done);
        });

        client.send(data);
      });
    });
  });

  describe('client properties', function () {
    it('protocol is exposed', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`, 'hi');
      });

      wss.on('connection', (client) => {
        assert.strictEqual(client.protocol, 'hi');
        wss.close(done);
      });
    });

    it('protocolVersion is exposed', function (done) {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const port = wss._server.address().port;
        const ws = new WebSocket(`ws://localhost:${port}`, {
          protocolVersion: 8
        });
      });

      wss.on('connection', (client) => {
        assert.strictEqual(client.protocolVersion, 8);
        wss.close(done);
      });
    });
  });

  describe('permessage-deflate', function () {
    it('accept connections with permessage-deflate extension', function (done) {
      const wss = new WebSocket.Server({
        perMessageDeflate: true,
        port: 0
      }, () => {
        http.get({
          port: wss._server.address().port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': 13,
            'Sec-WebSocket-Extensions': 'permessage-deflate; ' +
              'client_max_window_bits=8; server_max_window_bits=8; ' +
              'client_no_context_takeover; server_no_context_takeover'
          }
        });
      });

      wss.on('connection', (ws) => wss.close(done));
    });

    it('does not accept connections with invalid extension parameters (name)', function (done) {
      const wss = new WebSocket.Server({
        perMessageDeflate: true,
        port: 0
      }, () => {
        const req = http.get({
          port: wss._server.address().port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': 13,
            'Sec-WebSocket-Extensions': 'permessage-deflate; foo=15'
          }
        });

        req.on('response', (res) => {
          assert.strictEqual(res.statusCode, 400);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        done(new Error('connection must not be established'));
      });
    });

    it('does not accept connections with invalid extension parameters (value)', function (done) {
      const wss = new WebSocket.Server({
        perMessageDeflate: true,
        port: 0
      }, () => {
        const req = http.get({
          port: wss._server.address().port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': 13,
            'Sec-WebSocket-Extensions': 'permessage-deflate; server_max_window_bits=foo'
          }
        });

        req.on('response', (res) => {
          assert.strictEqual(res.statusCode, 400);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        done(new Error('connection must not be established'));
      });
    });
  });
});
