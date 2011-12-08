var assert = require('assert')
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

  it('server can send data', function(done) {
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
})