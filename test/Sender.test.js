var assert = require('assert')
  , Sender = require('../lib/Sender');
require('should');

describe('Sender', function() {  
  it('creates a send cache equal to options.sendBufferCacheSize', function() {
    var sender = new Sender(null, {
      sendBufferCacheSize: 10
    });
    sender._sendCache.length.should.eql(10);
  })

  it('keeps a send cache equal to null if options.sendBufferCacheSize is 0', function() {
    var sender = new Sender(null, {
      sendBufferCacheSize: 0
    });
    (typeof sender._sendCache).should.eql('undefined');
  })

  it('keeps a send cache equal to null if options.sendBufferCacheSize is -1', function() {
    var sender = new Sender(null, {
      sendBufferCacheSize: -1 
    });
    (typeof sender._sendCache).should.eql('undefined');
  })
})
