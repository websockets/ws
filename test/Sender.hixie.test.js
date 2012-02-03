var assert = require('assert')
  , Sender = require('../lib/Sender.hixie');
require('should');
require('./hybi-common');

describe('Sender', function() {
  it('frames and sends a text message', function(done) {
    var message = 'Hello world';
    var received;
    var socket = {
      write: function(data, encoding, cb) {
        received = data;
        process.nextTick(cb);
      }
    };
    var sender = new Sender(socket, {});
    sender.send(message, {}, function() {
      received.toString('utf8').should.eql('\u0000' + message + '\ufffd');
      done();
    });
  });

  it('throws an exception for binary data', function(done) {
    var socket = {
      write: function(data, encoding, cb) {
        process.nextTick(cb);
      }
    };
    var sender = new Sender(socket, {});
    sender.on('error', function() {
      done();
    });
    sender.send(new Buffer(100), {binary: true}, function() {});
  });
});
