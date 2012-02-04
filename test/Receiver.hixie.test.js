var assert = require('assert')
  , Receiver = require('../lib/Receiver.hixie');
require('should');
require('./hybi-common');

describe('Receiver', function() {
  it('can parse text message', function() {
    var p = new Receiver();
    var packet = '00 48 65 6c 6c 6f ff';

    var gotData = false;
    p.on('text', function(data) {
      gotData = true;
      assert.equal('Hello', data);
    });

    p.add(getBufferFromHexString(packet));
    gotData.should.be.ok;
  });

  it('can parse multiple text messages', function() {
    var p = new Receiver();
    var packet = '00 48 65 6c 6c 6f ff 00 48 65 6c 6c 6f ff';

    var gotData = false;
    var messages = [];
    p.on('text', function(data) {
      gotData = true;
      messages.push(data);
    });

    p.add(getBufferFromHexString(packet));
    gotData.should.be.ok;
    for (var i = 0; i < 2; ++i) {
      messages[i].should.eql('Hello');
    }
  });

  it('can parse text messages delivered over multiple frames', function() {
    var p = new Receiver();
    var packets = [
      '00 48',
      '65 6c 6c',
      '6f ff 00 48',
      '65',
      '6c 6c 6f',
      'ff'
    ];

    var gotData = false;
    var messages = [];
    p.on('text', function(data) {
      gotData = true;
      messages.push(data);
    });

    for (var i = 0; i < packets.length; ++i) {
      p.add(getBufferFromHexString(packets[i]));
    }
    gotData.should.be.ok;
    for (var i = 0; i < 2; ++i) {
      messages[i].should.eql('Hello');
    }
  });

  it('ignores empty messages', function() {
    var p = new Receiver();
    var packets = [
      '00 ff',
      '00 ff 00',
      'ff 00 ff 00 ff',
      '00',
      '6c 6c 6f',
      'ff'
    ];

    var gotData = false;
    var messages = [];
    p.on('text', function(data) {
      gotData = true;
      messages.push(data);
    });

    for (var i = 0; i < packets.length; ++i) {
      p.add(getBufferFromHexString(packets[i]));
    }
    gotData.should.be.ok;
    messages[0].should.eql('');
    messages[1].should.eql('');
    messages[2].should.eql('');
    messages[3].should.eql('');
    messages[4].should.eql('');
    messages[5].should.eql('llo');
    messages.length.should.eql(6);
  });

  it('emits an error if a payload doesnt start with 0x00', function() {
    var p = new Receiver();
    var packets = [
      '00 ff',
      '00 ff ff',
      'ff 00 ff 00 ff',
      '00',
      '6c 6c 6f',
      'ff'
    ];

    var gotData = false;
    var gotError = false;
    var messages = [];
    p.on('text', function(data) {
      gotData = true;
      messages.push(data);
    });
    p.on('error', function(reason, code) {
      gotError = code == true;
    });

    for (var i = 0; i < packets.length && !gotError; ++i) {
      p.add(getBufferFromHexString(packets[i]));
    }
    gotError.should.be.ok;
    messages[0].should.eql('');
    messages[1].should.eql('');
    messages.length.should.eql(2);
  });
});
