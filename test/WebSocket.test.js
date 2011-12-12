var assert = require('assert')
  , WebSocket = require('../')
  , fs = require('fs')
  , server = require('./testserver');

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

describe('WebSocket', function() {
  describe('#ctor', function() {
    it('throws exception for invalid url', function(done) {
      try {
        var ws = new WebSocket('echo.websocket.org');
      }
      catch (e) {
        done();
      }
    })
  })

  it('can disconnect before connection is established', function(done) {
    server.createServer(++port, function(srv) {
      var ws = new WebSocket('ws://localhost:' + port);
      ws.terminate();
      ws.on('open', function() {
        assert.fail('connect shouldnt be raised here');
      });
      ws.on('close', function() {
        srv.close();
        done();
      });
    });
  })
  it('can close before connection is established', function(done) {
    server.createServer(++port, function(srv) {
      var ws = new WebSocket('ws://localhost:' + port);
      ws.close(1001);
      ws.on('open', function() {
        assert.fail('connect shouldnt be raised here');
      });
      ws.on('close', function() {
        srv.close();
        done();
      });
    });
  })
  it('invalid server key is denied', function(done) {
    server.createServer(++port, server.handlers.invalidKey, function(srv) {
      var ws = new WebSocket('ws://localhost:' + port);
      ws.on('error', function() {
        srv.close();
        done();
      });
    });
  })
  it('close event is raised when server closes connection', function(done) {
    server.createServer(++port, server.handlers.closeAfterConnect, function(srv) {
      var ws = new WebSocket('ws://localhost:' + port);
      ws.on('close', function() {
        srv.close();
        done();
      });
    });
  })

  describe('#ping', function() {
    it('before connect should fail', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('error', function() {});
        try {
          ws.ping();
        }
        catch (e) {
          srv.close();
          ws.terminate();
          done();
        }
      });
    })
    it('without message is successfully transmitted to the server', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          ws.ping();
        });
        srv.on('ping', function(message) {
          srv.close();
          ws.terminate();
          done();
        });
      });
    })
    it('with message is successfully transmitted to the server', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          ws.ping('hi');
        });
        srv.on('ping', function(message) {
          assert.equal('hi', message);
          srv.close();
          ws.terminate();
          done();
        });
      });
    })
    it('with encoded message is successfully transmitted to the server', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          ws.ping('hi', {mask: true});
        });
        srv.on('ping', function(message, flags) {
          assert.ok(flags.masked);
          assert.equal('hi', message);
          srv.close();
          ws.terminate();
          done();
        });
      });
    })
  })
  describe('#pong', function() {
    it('without message is successfully transmitted to the server', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          ws.pong();
        });
        srv.on('pong', function(message) {
          srv.close();
          ws.terminate();
          done();
        });
      });
    })
    it('with message is successfully transmitted to the server', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          ws.pong('hi');
        });
        srv.on('pong', function(message) {
          assert.equal('hi', message);
          srv.close();
          ws.terminate();
          done();
        });
      });
    })
    it('with encoded message is successfully transmitted to the server', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          ws.pong('hi', {mask: true});
        });
        srv.on('pong', function(message, flags) {
          assert.ok(flags.masked);
          assert.equal('hi', message);
          srv.close();
          ws.terminate();
          done();
        });
      });
    })
  })
  describe('#send', function() {
    it('very long binary data can be sent and received (with echoing server)', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        var array = new Float32Array(5 * 1024 * 1024);
        for (var i = 0; i < array.length; ++i) array[i] = i / 5;
        ws.on('open', function() {
          ws.send(array, {binary: true});
        });
        ws.on('message', function(message, flags) {
          assert.ok(flags.binary);
          assert.ok(areArraysEqual(array, new Float32Array(getArrayBuffer(message))));
          ws.terminate();
          srv.close();
          done();
        });
      });
    })
    it('can send and receive text data', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          ws.send('hi');
        });
        ws.on('message', function(message, flags) {
          assert.equal('hi', message);
          ws.terminate();
          srv.close();
          done();
        });
      });
    })
    it('send and receive binary data as an array', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        var array = new Float32Array(5);
        for (var i = 0; i < array.length; ++i) array[i] = i / 2;
        ws.on('open', function() {
          ws.send(array, {binary: true});
        });
        ws.on('message', function(message, flags) {
          assert.ok(flags.binary);
          assert.ok(areArraysEqual(array, new Float32Array(getArrayBuffer(message))));
          ws.terminate();
          srv.close();
          done();
        });
      });
    })
    it('binary data can be sent and received as buffer', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        var buf = new Buffer('foobar');
        ws.on('open', function() {
          ws.send(buf, {binary: true});
        });
        ws.on('message', function(message, flags) {
          assert.ok(flags.binary);
          assert.ok(areArraysEqual(buf, message));
          ws.terminate();
          srv.close();
          done();
        });
      });
    })
    it('before connect should fail', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('error', function() {});
        try {
          ws.send('hi');
        }
        catch (e) {
          ws.terminate();
          srv.close();
          done();
        }
      });
    })
    it('before connect should pass error through callback, if present', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('error', function() {});
        ws.send('hi', function(error) {
          assert.ok(error instanceof Error);
          ws.terminate();
          srv.close();
          done();            
        });
      });
    })
    it('without data should be successful', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          ws.send();
        });
        srv.on('message', function(message, flags) {
          assert.equal('', message);
          srv.close();
          ws.terminate();
          done();
        });
      });
    })
    it('calls optional callback when flushed', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          ws.send('hi', function() {
            srv.close();
            ws.terminate();
            done();
          });
        });
      });
    })
    it('with unencoded message is successfully transmitted to the server', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          ws.send('hi');
        });
        srv.on('message', function(message, flags) {
          assert.equal('hi', message);
          srv.close();
          ws.terminate();
          done();
        });
      });
    })
    it('with encoded message is successfully transmitted to the server', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          ws.send('hi', {mask: true});
        });
        srv.on('message', function(message, flags) {
          assert.ok(flags.masked);
          assert.equal('hi', message);
          srv.close();
          ws.terminate();
          done();
        });
      });
    })
    it('with unencoded binary message is successfully transmitted to the server', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        var array = new Float32Array(5);
        for (var i = 0; i < array.length; ++i) array[i] = i / 2;
        ws.on('open', function() {
          ws.send(array, {binary: true});
        });
        srv.on('message', function(message, flags) {
          assert.ok(flags.binary);
          assert.ok(areArraysEqual(array, new Float32Array(getArrayBuffer(message))));
          srv.close();
          ws.terminate();
          done();
        });
      });
    })
    it('with encoded binary message is successfully transmitted to the server', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        var array = new Float32Array(5);
        for (var i = 0; i < array.length; ++i) array[i] = i / 2;
        ws.on('open', function() {
          ws.send(array, {mask: true, binary: true});
        });
        srv.on('message', function(message, flags) {
          assert.ok(flags.binary);
          assert.ok(flags.masked);
          assert.ok(areArraysEqual(array, new Float32Array(getArrayBuffer(message))));
          srv.close();
          ws.terminate();
          done();
        });
      });
    })
    it('with binary stream will send fragmented data', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        var callbackFired = false;
        ws.on('open', function() {
          var fileStream = fs.createReadStream('test/fixtures/textfile');
          fileStream.bufferSize = 100;
          ws.send(fileStream, {binary: true}, function(error) {
            assert.equal(null, error);
            callbackFired = true;
          });
        });
        srv.on('message', function(data, flags) {
          assert.ok(flags.binary);
          assert.ok(areArraysEqual(fs.readFileSync('test/fixtures/textfile'), data));
          ws.terminate();
        });
        ws.on('close', function() {
          assert.ok(callbackFired);
          srv.close();
          done();
        });
      });
    })
    it('with text stream will send fragmented data', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        var callbackFired = false;
        ws.on('open', function() {
          var fileStream = fs.createReadStream('test/fixtures/textfile');
          fileStream.setEncoding('utf8');
          fileStream.bufferSize = 100;
          ws.send(fileStream, {binary: false}, function(error) {
            assert.equal(null, error);
            callbackFired = true;
          });
        });
        srv.on('message', function(data, flags) {
          assert.ok(!flags.binary);
          assert.ok(areArraysEqual(fs.readFileSync('test/fixtures/textfile', 'utf8'), data));
          ws.terminate();
        });
        ws.on('close', function() {
          assert.ok(callbackFired);
          srv.close();
          done();
        });
      });
    })
    it('will cause intermittent send to be delayed in order', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          var fileStream = fs.createReadStream('test/fixtures/textfile');
          fileStream.setEncoding('utf8');
          fileStream.bufferSize = 100;
          ws.send(fileStream);
          ws.send('foobar');
          ws.send('baz');
        });
        var receivedIndex = 0;
        srv.on('message', function(data, flags) {
          ++receivedIndex;
          if (receivedIndex == 1) {
            assert.ok(!flags.binary);
            assert.ok(areArraysEqual(fs.readFileSync('test/fixtures/textfile', 'utf8'), data));
          }
          else if (receivedIndex == 2) {
            assert.ok(!flags.binary);
            assert.equal('foobar', data);
          }
          else {
            assert.ok(!flags.binary);
            assert.equal('baz', data);
            srv.close();
            ws.terminate();
            done();
          }
        });
      });
    })
    it('will cause intermittent stream to be delayed in order', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          var fileStream = fs.createReadStream('test/fixtures/textfile');
          fileStream.setEncoding('utf8');
          fileStream.bufferSize = 100;
          ws.send(fileStream);
          var i = 0;
          ws.stream(function(error, send) {
            assert.ok(!error);
            if (++i == 1) send('foo');
            else send('bar', true);
          });
        });
        var receivedIndex = 0;
        srv.on('message', function(data, flags) {
          ++receivedIndex;
          if (receivedIndex == 1) {
            assert.ok(!flags.binary);
            assert.ok(areArraysEqual(fs.readFileSync('test/fixtures/textfile', 'utf8'), data));
          }
          else if (receivedIndex == 2) {
            assert.ok(!flags.binary);
            assert.equal('foobar', data);
            srv.close();
            ws.terminate();
            done();
          }
        });
      });
    })
    it('will cause intermittent ping to be delivered', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          var fileStream = fs.createReadStream('test/fixtures/textfile');
          fileStream.setEncoding('utf8');
          fileStream.bufferSize = 100;
          ws.send(fileStream);
          ws.ping('foobar');
        });
        var receivedIndex = 0;
        srv.on('message', function(data, flags) {
          assert.ok(!flags.binary);
          assert.ok(areArraysEqual(fs.readFileSync('test/fixtures/textfile', 'utf8'), data));
          if (++receivedIndex == 2) {
            srv.close();
            ws.terminate();
            done();
          }
        });
        srv.on('ping', function(data) {
          assert.equal('foobar', data);
          if (++receivedIndex == 2) {
            srv.close();
            ws.terminate();
            done();
          }
        });
      });
    })
    it('will cause intermittent pong to be delivered', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          var fileStream = fs.createReadStream('test/fixtures/textfile');
          fileStream.setEncoding('utf8');
          fileStream.bufferSize = 100;
          ws.send(fileStream);
          ws.pong('foobar');
        });
        var receivedIndex = 0;
        srv.on('message', function(data, flags) {
          assert.ok(!flags.binary);
          assert.ok(areArraysEqual(fs.readFileSync('test/fixtures/textfile', 'utf8'), data));
          if (++receivedIndex == 2) {
            srv.close();
            ws.terminate();
            done();
          }
        });
        srv.on('pong', function(data) {
          assert.equal('foobar', data);
          if (++receivedIndex == 2) {
            srv.close();
            ws.terminate();
            done();
          }
        });
      });
    })
    it('will cause intermittent close to be delivered', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          var fileStream = fs.createReadStream('test/fixtures/textfile');
          fileStream.setEncoding('utf8');
          fileStream.bufferSize = 100;
          ws.send(fileStream);
          ws.close(1000, 'foobar');
        });
        ws.on('close', function() {
          srv.close();
          ws.terminate();
          done();
        });
        ws.on('error', function() { /* That's quite alright -- a send was attempted after close */ });
        srv.on('message', function(data, flags) {
          assert.ok(!flags.binary);
          assert.ok(areArraysEqual(fs.readFileSync('test/fixtures/textfile', 'utf8'), data));
        });
        srv.on('close', function(code, data) {
          assert.equal(1000, code);
          assert.equal('foobar', data);
        });
      });
    })
  })
  describe('#stream', function() {
    it('very long binary data can be streamed', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        var buffer = new Buffer(10 * 1024);
        for (var i = 0; i < buffer.length; ++i) buffer[i] = i % 0xff;
        ws.on('open', function() {
          var i = 0;
          var blockSize = 800;
          var bufLen = buffer.length;
          ws.stream({binary: true}, function(error, send) {
            assert.ok(!error);
            var start = i * blockSize;
            var toSend = Math.min(blockSize, bufLen - (i * blockSize));
            var end = start + toSend;
            var isFinal = toSend < blockSize;
            send(buffer.slice(start, end), isFinal);
            i += 1;
          });
        });
        srv.on('message', function(data, flags) {
          assert.ok(flags.binary);
          assert.ok(areArraysEqual(buffer, data));
          ws.terminate();
          srv.close();
          done();
        });
      });
    })
    it('before connect should pass error through callback', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('error', function() {});
        ws.stream(function(error) {
          assert.ok(error instanceof Error);
          ws.terminate();
          srv.close();
          done();            
        });
      });
    })
    it('without callback should fail', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        var payload = 'HelloWorld';
        ws.on('open', function() {
          try {
            ws.stream();
          }
          catch (e) {
            srv.close();
            ws.terminate();
            done();
          }
        });
      });
    })
    it('will cause intermittent send to be delayed in order', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        var payload = 'HelloWorld';
        ws.on('open', function() {
          var i = 0;
          ws.stream(function(error, send) {
            assert.ok(!error);
            if (++i == 1) {
              send(payload.substr(0, 5));
              ws.send('foobar');
              ws.send('baz');
            }
            else {
              send(payload.substr(5, 5), true);
            }
          });
        });
        var receivedIndex = 0;
        srv.on('message', function(data, flags) {
          ++receivedIndex;
          if (receivedIndex == 1) {
            assert.ok(!flags.binary);
            assert.equal(payload, data);
          }
          else if (receivedIndex == 2) {
            assert.ok(!flags.binary);
            assert.equal('foobar', data);
          }
          else {
            assert.ok(!flags.binary);
            assert.equal('baz', data);
            srv.close();
            ws.terminate();
            done();
          }
        });
      });
    })
    it('will cause intermittent stream to be delayed in order', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        var payload = 'HelloWorld';
        ws.on('open', function() {
          var i = 0;
          ws.stream(function(error, send) {
            assert.ok(!error);
            if (++i == 1) {
              send(payload.substr(0, 5));
              var i2 = 0;
              ws.stream(function(error, send) {
                assert.ok(!error);
                if (++i2 == 1) send('foo');
                else send('bar', true);
              });
              ws.send('baz');
            }
            else send(payload.substr(5, 5), true);
          });
        });
        var receivedIndex = 0;
        srv.on('message', function(data, flags) {
          ++receivedIndex;
          if (receivedIndex == 1) {
            assert.ok(!flags.binary);
            assert.equal(payload, data);
          }
          else if (receivedIndex == 2) {
            assert.ok(!flags.binary);
            assert.equal('foobar', data);
          }
          else if (receivedIndex == 3){
            assert.ok(!flags.binary);
            assert.equal('baz', data);
            setTimeout(function() {
              srv.close();
              ws.terminate();
              done();
            }, 1000);
          }
          else throw new Error('more messages than we actually sent just arrived');
        });
      });
    })
    it('will cause intermittent ping to be delivered', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        var payload = 'HelloWorld';
        ws.on('open', function() {
          var i = 0;
          ws.stream(function(error, send) {
            assert.ok(!error);
            if (++i == 1) {
              send(payload.substr(0, 5));
              ws.ping('foobar');
            }
            else {
              send(payload.substr(5, 5), true);
            }
          });
        });
        var receivedIndex = 0;
        srv.on('message', function(data, flags) {
          assert.ok(!flags.binary);
          assert.equal(payload, data);
          if (++receivedIndex == 2) {
            srv.close();
            ws.terminate();
            done();
          }
        });
        srv.on('ping', function(data) {
          assert.equal('foobar', data);
          if (++receivedIndex == 2) {
            srv.close();
            ws.terminate();
            done();
          }
        });
      });
    })
    it('will cause intermittent pong to be delivered', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        var payload = 'HelloWorld';
        ws.on('open', function() {
          var i = 0;
          ws.stream(function(error, send) {
            assert.ok(!error);
            if (++i == 1) {
              send(payload.substr(0, 5));
              ws.pong('foobar');
            }
            else {
              send(payload.substr(5, 5), true);
            }
          });
        });
        var receivedIndex = 0;
        srv.on('message', function(data, flags) {
          assert.ok(!flags.binary);
          assert.equal(payload, data);
          if (++receivedIndex == 2) {
            srv.close();
            ws.terminate();
            done();
          }
        });
        srv.on('pong', function(data) {
          assert.equal('foobar', data);
          if (++receivedIndex == 2) {
            srv.close();
            ws.terminate();
            done();
          }
        });
      });
    })
    it('will cause intermittent close to be delivered', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        var payload = 'HelloWorld';
        var errorGiven = false;
        ws.on('open', function() {
          var i = 0;
          ws.stream(function(error, send) {
            if (++i == 1) {
              send(payload.substr(0, 5));
              ws.close(1000, 'foobar');
            }
            else if(i == 2) {
              send(payload.substr(5, 5), true);
            }
            else if (i == 3) {
              assert.ok(error);
              errorGiven = true;
            }
          });
        });
        ws.on('close', function() {
          assert.ok(errorGiven);
          srv.close();
          ws.terminate();
          done();
        });
        srv.on('message', function(data, flags) {
          assert.ok(!flags.binary);
          assert.equal(payload, data);
        });
        srv.on('close', function(code, data) {
          assert.equal(1000, code);
          assert.equal('foobar', data);
        });
      });
    })
  })
  describe('#close', function() {
    it('will raise error callback, if any, if called during send stream', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        var errorGiven = false;
        ws.on('open', function() {
          var fileStream = fs.createReadStream('test/fixtures/textfile');
          fileStream.setEncoding('utf8');
          fileStream.bufferSize = 100;
          ws.send(fileStream, function(error) {
            errorGiven = error != null;
          });
          ws.close(1000, 'foobar');
        });
        ws.on('close', function() {
          setTimeout(function() {
            assert.ok(errorGiven);
            srv.close();
            ws.terminate();
            done();
          }, 1000);
        });
      });
    })
    it('without invalid first argument throws exception', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          try {
            ws.close('error');
          }
          catch (e) {
            srv.close();
            ws.terminate();
            done();
          }
        });
      });
    })
    it('without reserved error code 1004 throws exception', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          try {
            ws.close(1004);
          }
          catch (e) {
            srv.close();
            ws.terminate();
            done();
          }
        });
      });
    })
    it('without message is successfully transmitted to the server', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          ws.close(1000);
        });
        srv.on('close', function(code, message, flags) {
          assert.equal('', message);
          srv.close();
          ws.terminate();
          done();
        });
      });
    })
    it('with message is successfully transmitted to the server', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          ws.close(1000, 'some reason');
        });
        srv.on('close', function(code, message, flags) {
          assert.ok(flags.masked);
          assert.equal('some reason', message);
          srv.close();
          ws.terminate();
          done();
        });
      });
    })
    it('with encoded message is successfully transmitted to the server', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        ws.on('open', function() {
          ws.close(1000, 'some reason', {mask: true});
        });
        srv.on('close', function(code, message, flags) {
          assert.ok(flags.masked);
          assert.equal('some reason', message);
          srv.close();
          ws.terminate();
          done();
        });
      });
    })
    it('ends connection to the server', function(done) {
      server.createServer(++port, function(srv) {
        var ws = new WebSocket('ws://localhost:' + port);
        var connectedOnce = false;
        ws.on('open', function() {
          connectedOnce = true;
          ws.close(1000, 'some reason', {mask: true});
        });
        ws.on('close', function() {
          assert.ok(connectedOnce);
          srv.close();
          ws.terminate();
          done();
        });
      });
    })
  })
})
