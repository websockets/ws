/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^ws$", "args": "none" }] */

'use strict';

const assert = require('assert');
const WebSocket = require('../');
const https = require('https');
const http = require('http');
const fs = require('fs');
require('should');

const WebSocketServer = WebSocket.Server;

let port = 8000;

describe('WebSocketServer', function () {
  describe('#ctor', function () {
    it('throws an error if no option object is passed', function () {
      assert.throws(() => new WebSocketServer());
    });

    it('throws an error if no port or server is specified', function () {
      assert.throws(() => new WebSocketServer({}));
    });

    it('should return a new instance if called without new', function () {
      var wss = WebSocketServer({ noServer: true });

      assert.ok(wss instanceof WebSocketServer);
    });

    it('emits an error if http server bind fails', function (done) {
      var wss1 = new WebSocketServer({ port: 50003 });
      var wss2 = new WebSocketServer({ port: 50003 });
      wss2.on('error', function () {
        wss1.close();
        done();
      });
    });

    it('starts a server on a given port', function (done) {
      var wss = new WebSocketServer({port: ++port}, function () {
        var ws = new WebSocket('ws://localhost:' + port);
      });
      wss.on('connection', function (client) {
        wss.close();
        done();
      });
    });

    it('uses a precreated http server', function (done) {
      const server = http.createServer();

      server.listen(++port, () => {
        const wss = new WebSocketServer({ server });
        const ws = new WebSocket(`ws://localhost:${port}`);

        wss.on('connection', function (client) {
          wss.close();
          server.close(done);
        });
      });
    });

    it('426s for non-Upgrade requests', function (done) {
      var wss = new WebSocketServer({ port: ++port }, function () {
        http.get('http://localhost:' + port, function (res) {
          var body = '';

          assert.strictEqual(res.statusCode, 426);
          res.on('data', function (chunk) { body += chunk; });
          res.on('end', function () {
            assert.strictEqual(body, http.STATUS_CODES[426]);
            wss.close();
            done();
          });
        });
      });
    });

    // Don't test this on Windows. It throws errors for obvious reasons.
    if (!/^win/i.test(process.platform)) {
      it('uses a precreated http server listening on unix socket', function (done) {
        const server = http.createServer();
        const sockPath = `/tmp/ws_socket_${new Date().getTime()}.${Math.floor(Math.random() * 1000)}`;

        server.listen(sockPath, () => {
          const wss = new WebSocketServer({ server });
          const ws = new WebSocket(`ws+unix://${sockPath}`);

          wss.on('connection', (ws) => {
            wss.close();
            server.close(done);
          });
        });
      });
    }

    it('emits path specific connection event', function (done) {
      const server = http.createServer();

      server.listen(++port, () => {
        const wss = new WebSocketServer({ server });
        const ws = new WebSocket(`ws://localhost:${port}/endpointName`);

        wss.on('connection/endpointName', (ws) => {
          wss.close();
          server.close(done);
        });
      });
    });

    it('can have two different instances listening on the same http server with two different paths', function (done) {
      const server = http.createServer();

      server.listen(++port, () => {
        const wss1 = new WebSocketServer({ server, path: '/wss1' });
        const wss2 = new WebSocketServer({ server, path: '/wss2' });
        let doneCount = 0;

        wss1.on('connection', (client) => {
          wss1.close();
          if (++doneCount === 2) {
            server.close(done);
          }
        });

        wss2.on('connection', (client) => {
          wss2.close();
          if (++doneCount === 2) {
            server.close(done);
          }
        });

        /* eslint-disable no-unused-vars */
        const ws1 = new WebSocket(`ws://localhost:${port}/wss1`);
        const ws2 = new WebSocket(`ws://localhost:${port}/wss2?foo=1`);
        /* eslint-enable no-unused-vars */
      });
    });

    it('cannot have two different instances listening on the same http server with the same path', function (done) {
      const server = http.createServer();
      const wss1 = new WebSocketServer({ server: server, path: '/wss1' });

      try {
        // eslint-disable-next-line no-unused-vars
        const wss2 = new WebSocketServer({ server: server, path: '/wss1' });
      } catch (e) {
        wss1.close();
        done();
      }
    });

    it('will not crash when it receives an unhandled opcode', function (done) {
      const wss = new WebSocketServer({ port: 8080 });

      wss.on('connection', (ws) => {
        ws.onerror = () => done();
      });

      const ws = new WebSocket('ws://localhost:8080/');

      ws.onopen = () => {
        ws._socket.write(new Buffer([5]));
        ws.send('');
      };
    });
  });

  describe('#close', function () {
    it('does not thrown when called twice', function (done) {
      var wss = new WebSocketServer({port: ++port}, function () {
        wss.close();
        wss.close();
        wss.close();

        done();
      });
    });

    it('will close all clients', function (done) {
      var wss = new WebSocketServer({port: ++port}, function () {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('close', function () {
          if (++closes === 2) done();
        });
      });
      var closes = 0;
      wss.on('connection', function (client) {
        client.on('close', function () {
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

      const wss = new WebSocketServer({ server });

      wss.on('connection', function (ws) {
        wss.close();
        server.close = realClose;
        server.close(done);
      });

      server.listen(++port, () => {
        const ws = new WebSocket(`ws://localhost:${port}`);
      });
    });

    it('cleans event handlers on precreated server', function (done) {
      const server = http.createServer();

      server.listen(++port, () => {
        const wss = new WebSocketServer({ server });
        wss.close();

        assert.strictEqual(server.listeners('listening').length, 0);
        assert.strictEqual(server.listeners('upgrade').length, 0);
        assert.strictEqual(server.listeners('error').length, 0);

        server.close(done);
      });
    });

    it('cleans up websocket data on a precreated server', function (done) {
      const srv = http.createServer();
      srv.listen(++port, () => {
        const wss1 = new WebSocketServer({server: srv, path: '/wss1'});
        const wss2 = new WebSocketServer({server: srv, path: '/wss2'});
        (typeof srv._webSocketPaths).should.eql('object');
        Object.keys(srv._webSocketPaths).length.should.eql(2);
        wss1.close();
        Object.keys(srv._webSocketPaths).length.should.eql(1);
        wss2.close();
        (typeof srv._webSocketPaths).should.eql('undefined');
        srv.close(done);
      });
    });
  });

  describe('#clients', function () {
    it('returns a list of connected clients', function (done) {
      var wss = new WebSocketServer({port: ++port}, function () {
        wss.clients.size.should.eql(0);
        var ws = new WebSocket('ws://localhost:' + port);
      });
      wss.on('connection', function (client) {
        wss.clients.size.should.eql(1);
        wss.close();
        done();
      });
    });

    it('can be disabled', function (done) {
      var wss = new WebSocketServer({port: ++port, clientTracking: false}, function () {
        wss.should.not.have.property('clients');
        var ws = new WebSocket('ws://localhost:' + port);
      });
      wss.on('connection', function (client) {
        wss.should.not.have.property('clients');
        wss.close();
        done();
      });
    });

    it('is updated when client terminates the connection', function (done) {
      var ws;
      var wss = new WebSocketServer({port: ++port}, function () {
        ws = new WebSocket('ws://localhost:' + port);
      });
      wss.on('connection', function (client) {
        client.on('close', function () {
          wss.clients.size.should.eql(0);
          wss.close();
          done();
        });
        ws.terminate();
      });
    });

    it('is updated when client closes the connection', function (done) {
      var ws;
      var wss = new WebSocketServer({port: ++port}, function () {
        ws = new WebSocket('ws://localhost:' + port);
      });
      wss.on('connection', function (client) {
        client.on('close', function () {
          wss.clients.size.should.eql(0);
          wss.close();
          done();
        });
        ws.close();
      });
    });
  });

  describe('#options', function () {
    it('exposes options passed to constructor', function (done) {
      var wss = new WebSocketServer({port: ++port}, function () {
        wss.options.port.should.eql(port);
        wss.close();
        done();
      });
    });
  });

  describe('#maxpayload', function () {
    it('maxpayload is passed on to clients,', function (done) {
      var _maxPayload = 20480;
      var wss = new WebSocketServer({port: ++port, maxPayload: _maxPayload}, function () {
        wss.clients.size.should.eql(0);
        var ws = new WebSocket('ws://localhost:' + port);
      });
      wss.on('connection', function (client) {
        wss.clients.size.should.eql(1);
        client.maxPayload.should.eql(_maxPayload);
        wss.close();
        done();
      });
    });
    it('maxpayload is passed on to hybi receivers', function (done) {
      var _maxPayload = 20480;
      var wss = new WebSocketServer({port: ++port, maxPayload: _maxPayload}, function () {
        wss.clients.size.should.eql(0);
        var ws = new WebSocket('ws://localhost:' + port);
      });
      wss.on('connection', function (client) {
        wss.clients.size.should.eql(1);
        client._receiver.maxPayload.should.eql(_maxPayload);
        wss.close();
        done();
      });
    });
    it('maxpayload is passed on to permessage-deflate', function (done) {
      var PerMessageDeflate = require('../lib/PerMessageDeflate');
      var _maxPayload = 20480;
      var wss = new WebSocketServer({port: ++port, maxPayload: _maxPayload}, function () {
        wss.clients.size.should.eql(0);
        var ws = new WebSocket('ws://localhost:' + port);
      });
      wss.on('connection', function (client) {
        wss.clients.size.should.eql(1);
        client._receiver.extensions[PerMessageDeflate.extensionName]._maxPayload.should.eql(_maxPayload);
        wss.close();
        done();
      });
    });
  });

  describe('#handleUpgrade', function () {
    it('can be used for a pre-existing server', function (done) {
      var srv = http.createServer();
      srv.listen(++port, function () {
        var wss = new WebSocketServer({noServer: true});
        srv.on('upgrade', function (req, socket, upgradeHead) {
          wss.handleUpgrade(req, socket, upgradeHead, function (client) {
            client.send('hello');
          });
        });
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('message', function (message) {
          message.should.eql('hello');
          wss.close();
          srv.close();
          done();
        });
      });
    });

    it('closes the connection when path does not match', function (done) {
      var wss = new WebSocketServer({port: ++port, path: '/ws'}, function () {
        var options = {
          port: port,
          host: '127.0.0.1',
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket'
          }
        };
        var req = http.request(options);
        req.end();
        req.on('response', function (res) {
          res.statusCode.should.eql(400);
          wss.close();
          done();
        });
      });
    });

    it('closes the connection when protocol version is Hixie-76', function (done) {
      var wss = new WebSocketServer({port: ++port}, function () {
        var options = {
          port: port,
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'WebSocket',
            'Sec-WebSocket-Key1': '4 @1  46546xW%0l 1 5',
            'Sec-WebSocket-Key2': '12998 5 Y3 1  .P00',
            'Sec-WebSocket-Protocol': 'sample'
          }
        };
        var req = http.request(options);
        req.on('response', function (res) {
          res.statusCode.should.eql(400);
          wss.close();
          done();
        });
        req.end();
      });
    });
  });

  describe('hybi mode', function () {
    describe('connection establishing', function () {
      it('does not accept connections with no sec-websocket-key', function (done) {
        var wss = new WebSocketServer({port: ++port}, function () {
          var options = {
            port: port,
            host: '127.0.0.1',
            headers: {
              'Connection': 'Upgrade',
              'Upgrade': 'websocket'
            }
          };
          var req = http.request(options);
          req.end();
          req.on('response', function (res) {
            res.statusCode.should.eql(400);
            wss.close();
            done();
          });
        });
        wss.on('connection', function (ws) {
          done(new Error('connection must not be established'));
        });
        wss.on('error', function () {});
      });

      it('does not accept connections with no sec-websocket-version', function (done) {
        var wss = new WebSocketServer({port: ++port}, function () {
          var options = {
            port: port,
            host: '127.0.0.1',
            headers: {
              'Connection': 'Upgrade',
              'Upgrade': 'websocket',
              'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ=='
            }
          };
          var req = http.request(options);
          req.end();
          req.on('response', function (res) {
            res.statusCode.should.eql(400);
            wss.close();
            done();
          });
        });
        wss.on('connection', function (ws) {
          done(new Error('connection must not be established'));
        });
        wss.on('error', function () {});
      });

      it('does not accept connections with invalid sec-websocket-version', function (done) {
        var wss = new WebSocketServer({port: ++port}, function () {
          var options = {
            port: port,
            host: '127.0.0.1',
            headers: {
              'Connection': 'Upgrade',
              'Upgrade': 'websocket',
              'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
              'Sec-WebSocket-Version': 12
            }
          };
          var req = http.request(options);
          req.end();
          req.on('response', function (res) {
            res.statusCode.should.eql(400);
            wss.close();
            done();
          });
        });
        wss.on('connection', function (ws) {
          done(new Error('connection must not be established'));
        });
        wss.on('error', function () {});
      });

      it('client can be denied', function (done) {
        const wss = new WebSocketServer({
          verifyClient: (o) => false,
          port: ++port
        }, () => {
          const req = http.request({
            port: port,
            host: '127.0.0.1',
            headers: {
              'Connection': 'Upgrade',
              'Upgrade': 'websocket',
              'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
              'Sec-WebSocket-Version': 8,
              'Sec-WebSocket-Origin': 'http://foobar.com'
            }
          });

          req.on('response', (res) => {
            assert.strictEqual(res.statusCode, 401);
            wss.close();
            done();
          });

          req.end();
        });

        wss.on('connection', (ws) => {
          done(new Error('connection must not be established'));
        });
      });

      it('client can be accepted', function (done) {
        var wss = new WebSocketServer({
          port: ++port,
          verifyClient: (o) => true
        }, () => {
          var req = http.request({
            port: port,
            host: '127.0.0.1',
            headers: {
              'Connection': 'Upgrade',
              'Upgrade': 'websocket',
              'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
              'Sec-WebSocket-Version': 13,
              'Origin': 'http://foobar.com'
            }
          });
          req.end();
        });

        wss.on('connection', function (ws) {
          ws.terminate();
          wss.close();
          done();
        });
      });

      it('verifyClient gets client origin', function (done) {
        var verifyClientCalled = false;
        var wss = new WebSocketServer({
          verifyClient: (info) => {
            info.origin.should.eql('http://foobarbaz.com');
            verifyClientCalled = true;
            return false;
          },
          port: ++port
        }, () => {
          var req = http.request({
            port: port,
            host: '127.0.0.1',
            headers: {
              'Connection': 'Upgrade',
              'Upgrade': 'websocket',
              'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
              'Sec-WebSocket-Version': 13,
              'Origin': 'http://foobarbaz.com'
            }
          });
          req.on('response', (res) => {
            verifyClientCalled.should.be.ok;
            wss.close();
            done();
          });
          req.end();
        });
      });

      it('verifyClient gets original request', function (done) {
        var verifyClientCalled = false;
        var wss = new WebSocketServer({
          verifyClient: (info) => {
            info.req.headers['sec-websocket-key'].should.eql('dGhlIHNhbXBsZSBub25jZQ==');
            verifyClientCalled = true;
            return false;
          },
          port: ++port
        }, () => {
          var req = http.request({
            port: port,
            host: '127.0.0.1',
            headers: {
              'Connection': 'Upgrade',
              'Upgrade': 'websocket',
              'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
              'Sec-WebSocket-Version': 13,
              'Origin': 'http://foobarbaz.com'
            }
          });
          req.on('response', (res) => {
            verifyClientCalled.should.be.ok;
            wss.close();
            done();
          });
          req.end();
        });
      });

      it('verifyClient has secure:true for ssl connections', function (done) {
        var options = {
          key: fs.readFileSync('test/fixtures/key.pem'),
          cert: fs.readFileSync('test/fixtures/certificate.pem')
        };
        var app = https.createServer(options, function (req, res) {
          res.writeHead(200);
          res.end();
        });
        var success = false;
        var wss = new WebSocketServer({
          server: app,
          verifyClient: function (info) {
            success = info.secure === true;
            return true;
          }
        });
        app.listen(++port, function () {
          var ws = new WebSocket('wss://localhost:' + port);
        });
        wss.on('connection', function (ws) {
          app.close();
          ws.terminate();
          wss.close();
          success.should.be.ok;
          done();
        });
      });

      it('verifyClient has secure:false for non-ssl connections', function (done) {
        var app = http.createServer(function (req, res) {
          res.writeHead(200);
          res.end();
        });
        var success = false;
        var wss = new WebSocketServer({
          server: app,
          verifyClient: function (info) {
            success = info.secure === false;
            return true;
          }
        });
        app.listen(++port, function () {
          var ws = new WebSocket('ws://localhost:' + port);
        });
        wss.on('connection', function (ws) {
          app.close();
          ws.terminate();
          wss.close();
          success.should.be.ok;
          done();
        });
      });

      it('client can be denied asynchronously', function (done) {
        const wss = new WebSocketServer({
          verifyClient: (o, cb) => process.nextTick(cb, false),
          port: ++port
        }, () => {
          const req = http.request({
            port: port,
            host: '127.0.0.1',
            headers: {
              'Connection': 'Upgrade',
              'Upgrade': 'websocket',
              'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
              'Sec-WebSocket-Version': 8,
              'Sec-WebSocket-Origin': 'http://foobar.com'
            }
          });
          req.on('response', (res) => {
            res.statusCode.should.eql(401);
            wss.close();
            done();
          });
          req.end();
        });

        wss.on('connection', (ws) => {
          done(new Error('connection must not be established'));
        });
      });

      it('client can be denied asynchronously with custom response code', function (done) {
        const wss = new WebSocketServer({
          verifyClient: (o, cb) => process.nextTick(cb, false, 404),
          port: ++port
        }, () => {
          const req = http.request({
            port: port,
            host: '127.0.0.1',
            headers: {
              'Connection': 'Upgrade',
              'Upgrade': 'websocket',
              'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
              'Sec-WebSocket-Version': 8,
              'Sec-WebSocket-Origin': 'http://foobar.com'
            }
          });
          req.on('response', (res) => {
            res.statusCode.should.eql(404);
            wss.close();
            done();
          });
          req.end();
        });

        wss.on('connection', (ws) => {
          done(new Error('connection must not be established'));
        });
      });

      it('client can be accepted asynchronously', function (done) {
        const wss = new WebSocketServer({
          verifyClient: (o, cb) => process.nextTick(cb, true),
          port: ++port
        }, () => {
          const req = http.request({
            port: port,
            host: '127.0.0.1',
            headers: {
              'Connection': 'Upgrade',
              'Upgrade': 'websocket',
              'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
              'Sec-WebSocket-Version': 13,
              'Origin': 'http://foobar.com'
            }
          });
          req.end();
        });
        wss.on('connection', (ws) => {
          ws.terminate();
          wss.close();
          done();
        });
      });

      it('handles messages passed along with the upgrade request (upgrade head)', function (done) {
        const wss = new WebSocketServer({ port: ++port }, () => {
          const req = http.request({
            port: port,
            host: '127.0.0.1',
            headers: {
              'Connection': 'Upgrade',
              'Upgrade': 'websocket',
              'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
              'Sec-WebSocket-Version': 13,
              'Origin': 'http://foobar.com'
            }
          });
          req.write(Buffer.from([0x81, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f]));
          req.end();
        });

        wss.on('connection', (ws) => {
          ws.on('message', (data) => {
            data.should.eql('Hello');
            ws.terminate();
            wss.close();
            done();
          });
        });
      });

      it('selects the first protocol by default', function (done) {
        var wss = new WebSocketServer({port: ++port}, function () {
          var ws = new WebSocket('ws://localhost:' + port, ['prot1', 'prot2']);
          ws.on('open', function (client) {
            ws.protocol.should.eql('prot1');
            wss.close();
            done();
          });
        });
      });

      it('selects the last protocol via protocol handler', function (done) {
        const wss = new WebSocketServer({
          handleProtocols: (ps, cb) => cb(true, ps[ps.length - 1]),
          port: ++port
        }, () => {
          const ws = new WebSocket(`ws://localhost:${port}`, ['prot1', 'prot2']);

          ws.on('open', () => {
            ws.protocol.should.eql('prot2');
            wss.close();
            done();
          });
        });
      });

      it('client detects invalid server protocol', function (done) {
        const wss = new WebSocketServer({
          handleProtocols: (ps, cb) => cb(true, 'prot3'),
          port: ++port
        }, () => {
          const ws = new WebSocket(`ws://localhost:${port}`, ['prot1', 'prot2']);

          ws.on('open', () => done(new Error('connection must not be established')));
          ws.on('error', () => {
            wss.close();
            done();
          });
        });
      });

      it('client detects no server protocol', function (done) {
        const wss = new WebSocketServer({
          handleProtocols: (ps, cb) => cb(true),
          port: ++port
        }, () => {
          const ws = new WebSocket(`ws://localhost:${port}`, ['prot1', 'prot2']);

          ws.on('open', () => done(new Error('connection must not be established')));
          ws.on('error', () => {
            wss.close();
            done();
          });
        });
      });

      it('client refuses server protocols', function (done) {
        const wss = new WebSocketServer({
          handleProtocols: (ps, cb) => cb(false),
          port: ++port
        }, () => {
          const ws = new WebSocket(`ws://localhost:${port}`, ['prot1', 'prot2']);

          ws.on('open', () => done(new Error('connection must not be established')));
          ws.on('error', () => {
            wss.close();
            done();
          });
        });
      });

      it('server detects unauthorized protocol handler', function (done) {
        const wss = new WebSocketServer({
          handleProtocols: (ps, cb) => cb(false),
          port: ++port
        }, () => {
          const req = http.request({
            port: port,
            host: '127.0.0.1',
            headers: {
              'Connection': 'Upgrade',
              'Upgrade': 'websocket',
              'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
              'Sec-WebSocket-Version': 13,
              'Sec-WebSocket-Origin': 'http://foobar.com'
            }
          });
          req.on('response', (res) => {
            assert.strictEqual(res.statusCode, 401);
            wss.close();
            done();
          });
          req.end();
        });
      });

      it('server detects invalid protocol handler', function (done) {
        const wss = new WebSocketServer({
          handleProtocols: (ps, cb) => {
            // not calling callback is an error and shouldn't timeout
          },
          port: ++port
        }, () => {
          const req = http.request({
            port: port,
            host: '127.0.0.1',
            headers: {
              'Connection': 'Upgrade',
              'Upgrade': 'websocket',
              'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
              'Sec-WebSocket-Version': 13,
              'Sec-WebSocket-Origin': 'http://foobar.com'
            }
          });
          req.on('response', (res) => {
            assert.strictEqual(res.statusCode, 501);
            wss.close();
            done();
          });
          req.end();
        });
      });

      it('accept connections with sec-websocket-extensions', function (done) {
        var wss = new WebSocketServer({port: ++port}, function () {
          var options = {
            port: port,
            host: '127.0.0.1',
            headers: {
              'Connection': 'Upgrade',
              'Upgrade': 'websocket',
              'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
              'Sec-WebSocket-Version': 13,
              'Sec-WebSocket-Extensions': 'permessage-foo; x=10'
            }
          };
          var req = http.request(options);
          req.end();
        });
        wss.on('connection', function (ws) {
          ws.terminate();
          wss.close();
          done();
        });
        wss.on('error', function () {});
      });
    });

    describe('messaging', function () {
      it('can send and receive data', function (done) {
        var data = new Array(65 * 1024);
        for (var i = 0; i < data.length; ++i) {
          data[i] = String.fromCharCode(65 + ~~(25 * Math.random()));
        }
        data = data.join('');
        var wss = new WebSocketServer({port: ++port}, function () {
          var ws = new WebSocket('ws://localhost:' + port);
          ws.on('message', function (message, flags) {
            ws.send(message);
          });
        });
        wss.on('connection', function (client) {
          client.on('message', function (message) {
            message.should.eql(data);
            wss.close();
            done();
          });
          client.send(data);
        });
      });
    });
  });

  describe('client properties', function () {
    it('protocol is exposed', function (done) {
      var wss = new WebSocketServer({port: ++port}, function () {
        var ws = new WebSocket('ws://localhost:' + port, 'hi');
      });
      wss.on('connection', function (client) {
        client.protocol.should.eql('hi');
        wss.close();
        done();
      });
    });

    it('protocolVersion is exposed', function (done) {
      var wss = new WebSocketServer({port: ++port}, function () {
        var ws = new WebSocket('ws://localhost:' + port, {protocolVersion: 8});
      });
      wss.on('connection', function (client) {
        client.protocolVersion.should.eql(8);
        wss.close();
        done();
      });
    });

    it('upgradeReq is the original request object', function (done) {
      var wss = new WebSocketServer({port: ++port}, function () {
        var ws = new WebSocket('ws://localhost:' + port, {protocolVersion: 8});
      });
      wss.on('connection', function (client) {
        client.upgradeReq.httpVersion.should.eql('1.1');
        wss.close();
        done();
      });
    });
  });

  describe('permessage-deflate', function () {
    it('accept connections with permessage-deflate extension', function (done) {
      var wss = new WebSocketServer({port: ++port}, function () {
        var options = {
          port: port,
          host: '127.0.0.1',
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': 13,
            'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits=8; server_max_window_bits=8; client_no_context_takeover; server_no_context_takeover'
          }
        };
        var req = http.request(options);
        req.end();
      });
      wss.on('connection', function (ws) {
        ws.terminate();
        wss.close();
        done();
      });
      wss.on('error', function () {});
    });

    it('does not accept connections with not defined extension parameter', function (done) {
      var wss = new WebSocketServer({port: ++port}, function () {
        var options = {
          port: port,
          host: '127.0.0.1',
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': 13,
            'Sec-WebSocket-Extensions': 'permessage-deflate; foo=15'
          }
        };
        var req = http.request(options);
        req.end();
        req.on('response', function (res) {
          res.statusCode.should.eql(400);
          wss.close();
          done();
        });
      });
      wss.on('connection', function (ws) {
        done(new Error('connection must not be established'));
      });
      wss.on('error', function () {});
    });

    it('does not accept connections with invalid extension parameter', function (done) {
      var wss = new WebSocketServer({port: ++port}, function () {
        var options = {
          port: port,
          host: '127.0.0.1',
          headers: {
            'Connection': 'Upgrade',
            'Upgrade': 'websocket',
            'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
            'Sec-WebSocket-Version': 13,
            'Sec-WebSocket-Extensions': 'permessage-deflate; server_max_window_bits=foo'
          }
        };
        var req = http.request(options);
        req.end();
        req.on('response', function (res) {
          res.statusCode.should.eql(400);
          wss.close();
          done();
        });
      });
      wss.on('connection', function (ws) {
        done(new Error('connection must not be established'));
      });
      wss.on('error', function () {});
    });
  });
});
