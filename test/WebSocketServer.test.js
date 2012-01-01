var assert = require('assert')
  , http = require('http')
  , WebSocket = require('../')
  , WebSocketServer = WebSocket.Server
  , fs = require('fs')
  , should = require('should');

var port = 20000;

function getArrayBuffer(buf) {
  var l = buf.length;
  var arrayBuf = new ArrayBuffer(l);
  for (var i = 0; i < l; ++i) {
    arrayBuf[i] = buf[i];
  }
  return arrayBuf;
}

function areArraysEqual(x, y) {
  if (x.length != y.length) return false;
  for (var i = 0, l = x.length; i < l; ++i) {
    if (x[i] !== y[i]) return false;
  }
  return true;
}

describe('WebSocketServer', function() {
  describe('#ctor', function() {
    it('throws an error if no option object is passed', function() {
      var gotException = false;
      try {
        var wss = new WebSocketServer();
      }
      catch (e) {
        gotException = true;
      }
      gotException.should.be.ok;
    });

    it('throws an error if no port or server is specified', function() {
      var gotException = false;
      try {
        var wss = new WebSocketServer({});
      }
      catch (e) {
        gotException = true;
      }
      gotException.should.be.ok;
    });

    it('emits an error if http server bind fails', function(done) {
      var wss = new WebSocketServer({port: 1});
      wss.on('error', function() { done(); });
    });

    it('uses passed server object', function () {
      var srv = http.createServer()
        , wss = new WebSocketServer({server: srv});
      wss._server.should.equal(srv);
    });

    it('starts a server on a given port', function(done) {
      var wss = new WebSocketServer({port: ++port}, function() {
        var ws = new WebSocket('ws://localhost:' + port);
      });
      wss.on('connection', function(client) {
        wss.close();
        done();
      });
    });

    it('works with a precreated http server', function (done) {
      var srv = http.createServer();
      srv.listen(++port, function () {
        var wss = new WebSocketServer({server: srv});
        var ws = new WebSocket('ws://localhost:' + port);

        wss.on('connection', function(client) {
          wss.close();
          done();
        });
      });
    });

    it('can have two different instances listening on the same http server with two different paths', function(done) {
      var srv = http.createServer();
      srv.listen(++port, function () {
        var wss1 = new WebSocketServer({server: srv, path: '/wss1'})
          , wss2 = new WebSocketServer({server: srv, path: '/wss2'});
        var doneCount = 0;
        wss1.on('connection', function(client) {
          wss1.close();
          if (++doneCount == 2) {
            srv.close();
            done();
          }
        });
        wss2.on('connection', function(client) {
          wss2.close();
          if (++doneCount == 2) {
            srv.close();
            done();
          }
        });
        var ws1 = new WebSocket('ws://localhost:' + port + '/wss1');
        var ws2 = new WebSocket('ws://localhost:' + port + '/wss2?foo=1');
      });
    });
    
    it('cannot have two different instances listening on the same http server with two different paths', function(done) {
      var srv = http.createServer();
      srv.listen(++port, function () {
        var wss1 = new WebSocketServer({server: srv, path: '/wss1'});
        try {
          var wss2 = new WebSocketServer({server: srv, path: '/wss1'});          
        }
        catch (e) {
          done();
        }
      });
    });
  });

  describe('#close', function() {
    it('will close all clients', function(done) {
      var wss = new WebSocketServer({port: ++port}, function() {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('close', function() {
          if (++closes == 2) done();
        });
      });
      var closes = 0;
      wss.on('connection', function(client) {
        client.on('close', function() {
          if (++closes == 2) done();
        });
        wss.close();
      });
    });
    
    it('does not close a precreated server', function(done) {
      var srv = http.createServer();
      var realClose = srv.close;
      srv.close = function() {
        should.fail('must not close pre-created server');
      }
      srv.listen(++port, function () {
        var wss = new WebSocketServer({server: srv});
        var ws = new WebSocket('ws://localhost:' + port);
        wss.on('connection', function(client) {
          wss.close();
          srv.close = realClose;
          srv.close();
          done();
        });
      });
    });

    it('cleans up websocket data on a precreated server', function(done) {
      var srv = http.createServer();
      srv.listen(++port, function () {
        var wss1 = new WebSocketServer({server: srv, path: '/wss1'})
          , wss2 = new WebSocketServer({server: srv, path: '/wss2'});
        (typeof srv._webSocketPaths).should.eql('object');
        Object.keys(srv._webSocketPaths).length.should.eql(2);
        wss1.close();
        Object.keys(srv._webSocketPaths).length.should.eql(1);
        wss2.close();
        (typeof srv._webSocketPaths).should.eql('undefined');
        srv.close();
        done();
      });
    });
  });

  it('does not accept connections with no sec-websocket-key', function(done) {
    var wss = new WebSocketServer({port: ++port}, function() {
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
      req.on('response', function(res) {
        res.statusCode.should.eql(400);
        wss.close();
        done();
      });
    });
    wss.on('error', function() {});
  });

  it('does not accept connections with no sec-websocket-version', function(done) {
    var wss = new WebSocketServer({port: ++port}, function() {
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
      req.on('response', function(res) {
        res.statusCode.should.eql(400);
        wss.close();
        done();
      });
    });
    wss.on('error', function() {});
  });

  it('does not accept connections with invalid sec-websocket-version', function(done) {
    var wss = new WebSocketServer({port: ++port}, function() {
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
      req.on('response', function(res) {
        res.statusCode.should.eql(400);
        wss.close();
        done();
      });
    });
    wss.on('error', function() {});
  });

  it('does not accept connections with invalid sec-websocket-origin (8)', function(done) {
    var wss = new WebSocketServer({port: ++port, verifyOrigin: function(o) {
      o.should.eql('http://foobar.com');
      return false;
    }}, function() {
      var options = {
        port: port,
        host: '127.0.0.1',
        headers: {
          'Connection': 'Upgrade',
          'Upgrade': 'websocket',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': 8,
          'Sec-WebSocket-Origin': 'http://foobar.com'
        }
      };
      var req = http.request(options);
      req.end();
      req.on('response', function(res) {
        res.statusCode.should.eql(401);
        wss.close();
        done();
      });
    });
    wss.on('error', function() {});
  });

  it('does not accept connections with invalid origin', function(done) {
    var wss = new WebSocketServer({port: ++port, verifyOrigin: function(o) {
      o.should.eql('http://foobar.com');
      return false;
    }}, function() {
      var options = {
        port: port,
        host: '127.0.0.1',
        headers: {
          'Connection': 'Upgrade',
          'Upgrade': 'websocket',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': 13,
          'Origin': 'http://foobar.com'
        }
      };
      var req = http.request(options);
      req.end();
      req.on('response', function(res) {
        res.statusCode.should.eql(401);
        wss.close();
        done();
      });
    });
    wss.on('error', function() {});
  });

  it('can send data', function(done) {
    var wss = new WebSocketServer({port: ++port}, function() {
      var ws = new WebSocket('ws://localhost:' + port);
      ws.on('message', function(data, flags) {
        data.should.eql('hello!');
        wss.close();
        done();
      });
    });
    wss.on('connection', function(client) {
      client.send('hello!');
    });
  });

  describe('properties', function() {
    it('protocol is exposed', function(done) {
      var wss = new WebSocketServer({port: ++port}, function() {
        var ws = new WebSocket('ws://localhost:' + port, {protocol: 'hi'});
      });
      wss.on('connection', function(client) {
        client.protocol.should.eql('hi');
        wss.close();
        done();
      });
    });

    it('protocolVersion is exposed', function(done) {
      var wss = new WebSocketServer({port: ++port}, function() {
        var ws = new WebSocket('ws://localhost:' + port, {protocolVersion: 8});
      });
      wss.on('connection', function(client) {
        client.protocolVersion.should.eql(8);
        wss.close();
        done();
      });
    });

    it('upgradeReq is the original request object', function(done) {
      var wss = new WebSocketServer({port: ++port}, function() {
        var ws = new WebSocket('ws://localhost:' + port, {protocolVersion: 8});
      });
      wss.on('connection', function(client) {
        client.upgradeReq.httpVersion.should.eql('1.1');
        wss.close();
        done();
      });
    });
  });

  describe('#clients', function() {
    it('returns a list of connected clients', function(done) {
      var wss = new WebSocketServer({port: ++port}, function() {
        wss.clients.length.should.eql(0);
        var ws = new WebSocket('ws://localhost:' + port);
      });
      wss.on('connection', function(client) {
        wss.clients.length.should.eql(1);
        wss.close();
        done();
      });
    });
    
    it('is updated when client terminates the connection', function(done) {
      var ws;
      var wss = new WebSocketServer({port: ++port}, function() {
        ws = new WebSocket('ws://localhost:' + port);
      });
      wss.on('connection', function(client) {
        client.on('close', function() {
          wss.clients.length.should.eql(0);
          wss.close();
          done();
        });
        ws.terminate();
      });
    });
    
    it('is updated when client closes the connection', function(done) {
      var ws;
      var wss = new WebSocketServer({port: ++port}, function() {
        ws = new WebSocket('ws://localhost:' + port);
      });
      wss.on('connection', function(client) {
        client.on('close', function() {
          wss.clients.length.should.eql(0);
          wss.close();
          done();
        });
        ws.close();
      });
    });
  });
});

