var assert = require('assert')
  , Sender = require('../lib/Sender');
require('should');

describe('Sender', function() {  
  it('creates a send cache equal to options.sendBufferCacheSize', function() {
    var sender = new Sender(null, {
      sendBufferCacheSize: 10
    });
    sender._sendCache.length.should.eql(10);
  });

  it('keeps a send cache equal to null if options.sendBufferCacheSize is 0', function() {
    var sender = new Sender(null, {
      sendBufferCacheSize: 0
    });
    (typeof sender._sendCache).should.eql('undefined');
  });

  it('keeps a send cache equal to null if options.sendBufferCacheSize is -1', function() {
    var sender = new Sender(null, {
      sendBufferCacheSize: -1 
    });
    (typeof sender._sendCache).should.eql('undefined');
  });

  describe('#frameAndSend', function() {
    it('does not modify a masked binary buffer', function() {
      var sender = new Sender({ write: function() {} }); 
      var buf = new Buffer([1, 2, 3, 4, 5]);
      sender.frameAndSend(2, buf, true, true);
      buf[0].should.eql(1);
      buf[1].should.eql(2);
      buf[2].should.eql(3);
      buf[3].should.eql(4);
      buf[4].should.eql(5);
    });

    it('does not modify a masked text buffer', function() {
      var sender = new Sender({ write: function() {} }); 
      var text = 'hi there';
      sender.frameAndSend(1, text, true, true);
      text.should.eql('hi there');
    });
  });
});
