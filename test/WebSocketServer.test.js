var assert = require('assert')
  , http = require('http')
  , WebSocket = require('../')
  , WebSocketServer = WebSocket.Server
  , fs = require('fs');
require('should');

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
    })
    it('throws an error if no port is specified', function() {
      var gotException = false;
      try {
        var wss = new WebSocketServer({});
      }
      catch (e) {
        gotException = true;
      }
      gotException.should.be.ok;
    })
    it('emits an error if http server bind fails', function(done) {
      var wss = new WebSocketServer({port: 1});
      wss.on('error', function() { done(); })
    })
    it('uses passed server object', function () {
      var srv = http.createServer()
        , wss = new WebSocketServer({server: srv});
      wss._server.should.equal(srv);
    });
  })

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
    })
  })

  it('starts a server at the given port', function(done) {
    var wss = new WebSocketServer({port: ++port}, function() {
      var ws = new WebSocket('ws://localhost:' + port);
    });
    wss.on('connection', function(client) {
      wss.close();
      done();
    });
  })

  it('works with a http server', function (done) {
    var srv = http.createServer();
    srv.listen(++port, function () {
      var wss = new WebSocketServer({server: srv});
      var ws = new WebSocket('ws://localhost:' + port);

      wss.on('connection', function(client) {
        wss.close();
        done();
      });
    });
  })

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
  })

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
  })

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
  })

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
  })

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
  })

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
  })

  it('tracks the client protocol', function(done) {
    var wss = new WebSocketServer({port: ++port}, function() {
      var ws = new WebSocket('ws://localhost:' + port, {protocol: 'hi'});
    });
    wss.on('connection', function(client) {
      client.protocol.should.eql('hi'); 
        wss.close();
        done();
    });
  })

  it('tracks the client protocolVersion', function(done) {
    var wss = new WebSocketServer({port: ++port}, function() {
      var ws = new WebSocket('ws://localhost:' + port, {protocolVersion: 8});
    });
    wss.on('connection', function(client) {
      client.protocolVersion.should.eql(8); 
        wss.close();
        done();
    });
  })

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
    })
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
    })
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
    })
  })
})

