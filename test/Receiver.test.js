'use strict';

const safeBuffer = require('safe-buffer');
const assert = require('assert');
const crypto = require('crypto');

const PerMessageDeflate = require('../lib/PerMessageDeflate');
const Receiver = require('../lib/Receiver');
const Sender = require('../lib/Sender');
const util = require('./hybi-util');

const Buffer = safeBuffer.Buffer;

describe('Receiver', function () {
  it('can parse unmasked text message', function (done) {
    const p = new Receiver();

    p.onmessage = function (data) {
      assert.strictEqual(data, 'Hello');
      done();
    };

    p.add(Buffer.from('810548656c6c6f', 'hex'));
  });

  it('can parse close message', function (done) {
    const p = new Receiver();

    p.onclose = function (code, data) {
      assert.strictEqual(code, 1000);
      assert.strictEqual(data, '');
      done();
    };

    p.add(Buffer.from('8800', 'hex'));
  });

  it('can parse masked text message', function (done) {
    const p = new Receiver();

    p.onmessage = function (data) {
      assert.strictEqual(data, '5:::{"name":"echo"}');
      done();
    };

    p.add(Buffer.from('81933483a86801b992524fa1c60959e68a5216e6cb005ba1d5', 'hex'));
  });

  it('can parse a masked text message longer than 125 B', function (done) {
    const p = new Receiver();
    const msg = 'A'.repeat(200);

    const mask = '3483a868';
    const frame = Buffer.from('81FE' + util.pack(4, msg.length) + mask +
      util.mask(msg, mask).toString('hex'), 'hex');

    p.onmessage = function (data) {
      assert.strictEqual(data, msg);
      done();
    };

    p.add(frame.slice(0, 2));
    setImmediate(() => p.add(frame.slice(2)));
  });

  it('can parse a really long masked text message', function (done) {
    const p = new Receiver();
    const msg = 'A'.repeat(64 * 1024);

    const mask = '3483a868';
    const frame = '81FF' + util.pack(16, msg.length) + mask +
      util.mask(msg, mask).toString('hex');

    p.onmessage = function (data) {
      assert.strictEqual(data, msg);
      done();
    };

    p.add(Buffer.from(frame, 'hex'));
  });

  it('can parse a fragmented masked text message of 300 B', function (done) {
    const p = new Receiver();
    const msg = 'A'.repeat(300);

    const fragment1 = msg.substr(0, 150);
    const fragment2 = msg.substr(150);

    const mask = '3483a868';
    const frame1 = '01FE' + util.pack(4, fragment1.length) + mask +
      util.mask(fragment1, mask).toString('hex');
    const frame2 = '80FE' + util.pack(4, fragment2.length) + mask +
      util.mask(fragment2, mask).toString('hex');

    p.onmessage = function (data) {
      assert.strictEqual(data, msg);
      done();
    };

    p.add(Buffer.from(frame1, 'hex'));
    p.add(Buffer.from(frame2, 'hex'));
  });

  it('can parse a ping message', function (done) {
    const p = new Receiver();
    const msg = 'Hello';

    const mask = '3483a868';
    const frame = '89' + util.getHybiLengthAsHexString(msg.length, true) + mask +
      util.mask(msg, mask).toString('hex');

    p.onping = function (data) {
      assert.strictEqual(data.toString(), msg);
      done();
    };

    p.add(Buffer.from(frame, 'hex'));
  });

  it('can parse a ping with no data', function (done) {
    const p = new Receiver();

    p.onping = function (data) {
      assert.ok(data.equals(Buffer.alloc(0)));
      done();
    };

    p.add(Buffer.from('8900', 'hex'));
  });

  it('can parse a fragmented masked text message of 300 B with a ping in the middle (1/2)', function (done) {
    const p = new Receiver();
    const msg = 'A'.repeat(300);
    const pingMessage = 'Hello';

    const fragment1 = msg.substr(0, 150);
    const fragment2 = msg.substr(150);

    const mask = '3483a868';
    const frame1 = '01FE' + util.pack(4, fragment1.length) + mask +
      util.mask(fragment1, mask).toString('hex');
    const frame2 = '89' + util.getHybiLengthAsHexString(pingMessage.length, true) + mask +
      util.mask(pingMessage, mask).toString('hex');
    const frame3 = '80FE' + util.pack(4, fragment2.length) + mask +
      util.mask(fragment2, mask).toString('hex');

    let gotPing = false;

    p.onmessage = function (data) {
      assert.strictEqual(data, msg);
      assert.ok(gotPing);
      done();
    };
    p.onping = function (data) {
      gotPing = true;
      assert.strictEqual(data.toString(), pingMessage);
    };

    p.add(Buffer.from(frame1, 'hex'));
    p.add(Buffer.from(frame2, 'hex'));
    p.add(Buffer.from(frame3, 'hex'));
  });

  it('can parse a fragmented masked text message of 300 B with a ping in the middle (2/2)', function (done) {
    const p = new Receiver();
    const msg = 'A'.repeat(300);
    const pingMessage = 'Hello';

    const fragment1 = msg.substr(0, 150);
    const fragment2 = msg.substr(150);

    const mask = '3483a868';
    const frame1 = '01FE' + util.pack(4, fragment1.length) + mask +
      util.mask(fragment1, mask).toString('hex');
    const frame2 = '89' + util.getHybiLengthAsHexString(pingMessage.length, true) + mask +
      util.mask(pingMessage, mask).toString('hex');
    const frame3 = '80FE' + util.pack(4, fragment2.length) + mask +
      util.mask(fragment2, mask).toString('hex');

    let buffers = [];

    buffers = buffers.concat(util.splitBuffer(Buffer.from(frame1, 'hex')));
    buffers = buffers.concat(util.splitBuffer(Buffer.from(frame2, 'hex')));
    buffers = buffers.concat(util.splitBuffer(Buffer.from(frame3, 'hex')));

    let gotPing = false;

    p.onmessage = function (data) {
      assert.strictEqual(data, msg);
      assert.ok(gotPing);
      done();
    };
    p.onping = function (data) {
      gotPing = true;
      assert.strictEqual(data.toString(), pingMessage);
    };

    for (let i = 0; i < buffers.length; ++i) {
      p.add(buffers[i]);
    }
  });

  it('can parse a 100 B long masked binary message', function (done) {
    const p = new Receiver();
    const msg = crypto.randomBytes(100);

    const mask = '3483a868';
    const frame = '82' + util.getHybiLengthAsHexString(msg.length, true) + mask +
      util.mask(msg, mask).toString('hex');

    p.onmessage = function (data) {
      assert.ok(data.equals(msg));
      done();
    };

    p.add(Buffer.from(frame, 'hex'));
  });

  it('can parse a 256 B long masked binary message', function (done) {
    const p = new Receiver();
    const msg = crypto.randomBytes(256);

    const mask = '3483a868';
    const frame = '82' + util.getHybiLengthAsHexString(msg.length, true) + mask +
      util.mask(msg, mask).toString('hex');

    p.onmessage = function (data) {
      assert.ok(data.equals(msg));
      done();
    };

    p.add(Buffer.from(frame, 'hex'));
  });

  it('can parse a 200 KiB long masked binary message', function (done) {
    const p = new Receiver();
    const msg = crypto.randomBytes(200 * 1024);

    const mask = '3483a868';
    const frame = '82' + util.getHybiLengthAsHexString(msg.length, true) + mask +
      util.mask(msg, mask).toString('hex');

    p.onmessage = function (data) {
      assert.ok(data.equals(msg));
      done();
    };

    p.add(Buffer.from(frame, 'hex'));
  });

  it('can parse a 200 KiB long unmasked binary message', function (done) {
    const p = new Receiver();
    const msg = crypto.randomBytes(200 * 1024);

    const frame = '82' + util.getHybiLengthAsHexString(msg.length, false) +
      msg.toString('hex');

    p.onmessage = function (data) {
      assert.ok(data.equals(msg));
      done();
    };

    p.add(Buffer.from(frame, 'hex'));
  });

  it('can parse compressed message', function (done) {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const p = new Receiver({ 'permessage-deflate': perMessageDeflate });
    const buf = Buffer.from('Hello');

    p.onmessage = function (data) {
      assert.strictEqual(data, 'Hello');
      done();
    };

    perMessageDeflate.compress(buf, true, function (err, compressed) {
      if (err) return done(err);

      p.add(Buffer.from([0xc1, compressed.length]));
      p.add(compressed);
    });
  });

  it('can parse compressed fragments', function (done) {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const p = new Receiver({ 'permessage-deflate': perMessageDeflate });
    const buf1 = Buffer.from('foo');
    const buf2 = Buffer.from('bar');

    p.onmessage = function (data) {
      assert.strictEqual(data, 'foobar');
      done();
    };

    perMessageDeflate.compress(buf1, false, function (err, compressed1) {
      if (err) return done(err);

      p.add(Buffer.from([0x41, compressed1.length]));
      p.add(compressed1);

      perMessageDeflate.compress(buf2, true, function (err, compressed2) {
        if (err) return done(err);

        p.add(Buffer.from([0x80, compressed2.length]));
        p.add(compressed2);
      });
    });
  });

  it('can parse a buffer with thousands of frames', function (done) {
    const buf = Buffer.allocUnsafe(40000);

    for (let i = 0; i < buf.length; i += 2) {
      buf[i] = 0x81;
      buf[i + 1] = 0x00;
    }

    const p = new Receiver();
    let counter = 0;

    p.onmessage = function (data) {
      assert.strictEqual(data, '');
      if (++counter === 20000) done();
    };

    p.add(buf);
  });

  it('resets `totalPayloadLength` only on final frame (unfragmented)', function () {
    const p = new Receiver({}, 10);
    let message;

    p.onmessage = function (msg) {
      message = msg;
    };

    assert.strictEqual(p.totalPayloadLength, 0);
    p.add(Buffer.from('810548656c6c6f', 'hex'));
    assert.strictEqual(p.totalPayloadLength, 0);
    assert.strictEqual(message, 'Hello');
  });

  it('resets `totalPayloadLength` only on final frame (fragmented)', function () {
    const p = new Receiver({}, 10);
    let message;

    p.onmessage = function (msg) {
      message = msg;
    };

    assert.strictEqual(p.totalPayloadLength, 0);
    p.add(Buffer.from('01024865', 'hex'));
    assert.strictEqual(p.totalPayloadLength, 2);
    p.add(Buffer.from('80036c6c6f', 'hex'));
    assert.strictEqual(p.totalPayloadLength, 0);
    assert.strictEqual(message, 'Hello');
  });

  it('resets `totalPayloadLength` only on final frame (fragmented + ping)', function () {
    const p = new Receiver({}, 10);
    const data = [];

    p.onmessage = p.onping = function (buf) {
      data.push(buf.toString());
    };

    assert.strictEqual(p.totalPayloadLength, 0);
    p.add(Buffer.from('02024865', 'hex'));
    assert.strictEqual(p.totalPayloadLength, 2);
    p.add(Buffer.from('8900', 'hex'));
    assert.strictEqual(p.totalPayloadLength, 2);
    p.add(Buffer.from('80036c6c6f', 'hex'));
    assert.strictEqual(p.totalPayloadLength, 0);
    assert.deepStrictEqual(data, ['', 'Hello']);
  });

  it('raises an error when RSV1 is on and permessage-deflate is disabled', function (done) {
    const p = new Receiver();

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'RSV1 must be clear');
      assert.strictEqual(code, 1002);
      done();
    };

    p.add(Buffer.from([0xc2, 0x80, 0x00, 0x00, 0x00, 0x00]));
  });

  it('raises an error when RSV1 is on and opcode is 0', function (done) {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const p = new Receiver({ 'permessage-deflate': perMessageDeflate });

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'RSV1 must be clear');
      assert.strictEqual(code, 1002);
      done();
    };

    p.add(Buffer.from([0x40, 0x00]));
  });

  it('raises an error when RSV2 is on', function (done) {
    const p = new Receiver();

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'RSV2 and RSV3 must be clear');
      assert.strictEqual(code, 1002);
      done();
    };

    p.add(Buffer.from([0xa2, 0x00]));
  });

  it('raises an error when RSV3 is on', function (done) {
    const p = new Receiver();

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'RSV2 and RSV3 must be clear');
      assert.strictEqual(code, 1002);
      done();
    };

    p.add(Buffer.from([0x92, 0x00]));
  });

  it('raises an error if the first frame in a fragmented message has opcode 0', function (done) {
    const p = new Receiver();

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'invalid opcode: 0');
      assert.strictEqual(code, 1002);
      done();
    };

    p.add(Buffer.from([0x00, 0x00]));
  });

  it('raises an error if a frame has opcode 1 in the middle of a fragmented message', function (done) {
    const p = new Receiver();

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'invalid opcode: 1');
      assert.strictEqual(code, 1002);
      done();
    };

    p.add(Buffer.from([0x01, 0x00]));
    p.add(Buffer.from([0x01, 0x00]));
  });

  it('raises an error if a frame has opcode 2 in the middle of a fragmented message', function (done) {
    const p = new Receiver();

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'invalid opcode: 2');
      assert.strictEqual(code, 1002);
      done();
    };

    p.add(Buffer.from([0x01, 0x00]));
    p.add(Buffer.from([0x02, 0x00]));
  });

  it('raises an error when a control frame has the FIN bit off', function (done) {
    const p = new Receiver();

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'FIN must be set');
      assert.strictEqual(code, 1002);
      done();
    };

    p.add(Buffer.from([0x09, 0x00]));
  });

  it('raises an error when a control frame has the RSV1 bit on', function (done) {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const p = new Receiver({ 'permessage-deflate': perMessageDeflate });

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'RSV1 must be clear');
      assert.strictEqual(code, 1002);
      done();
    };

    p.add(Buffer.from([0xc9, 0x00]));
  });

  it('raises an error when a control frame has the FIN bit off', function (done) {
    const p = new Receiver();

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'FIN must be set');
      assert.strictEqual(code, 1002);
      done();
    };

    p.add(Buffer.from([0x09, 0x00]));
  });

  it('raises an error when a control frame has a payload bigger than 125 B', function (done) {
    const p = new Receiver();

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'invalid payload length');
      assert.strictEqual(code, 1002);
      done();
    };

    p.add(Buffer.from([0x89, 0x7e]));
  });

  it('raises an error when a data frame has a payload bigger than 2^53 - 1 B', function (done) {
    const p = new Receiver();

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'max payload size exceeded');
      assert.strictEqual(code, 1009);
      done();
    };

    p.add(Buffer.from([0x82, 0x7f]));
    setImmediate(() => p.add(Buffer.from([
      0x00, 0x20, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00
    ])));
  });

  it('raises an error if a text frame contains invalid UTF-8 data', function (done) {
    const p = new Receiver();

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'invalid utf8 sequence');
      assert.strictEqual(code, 1007);
      done();
    };

    p.add(Buffer.from([0x81, 0x04, 0xce, 0xba, 0xe1, 0xbd]));
  });

  it('raises an error if a close frame has a payload of 1 B', function (done) {
    const p = new Receiver();

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'invalid payload length');
      assert.strictEqual(code, 1002);
      done();
    };

    p.add(Buffer.from([0x88, 0x01, 0x00]));
  });

  it('raises an error if a close frame contains an invalid close code', function (done) {
    const p = new Receiver();

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'invalid status code: 0');
      assert.strictEqual(code, 1002);
      done();
    };

    p.add(Buffer.from([0x88, 0x02, 0x00, 0x00]));
  });

  it('raises an error if a close frame contains invalid UTF-8 data', function (done) {
    const p = new Receiver();

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'invalid utf8 sequence');
      assert.strictEqual(code, 1007);
      done();
    };

    p.add(Buffer.from([0x88, 0x06, 0x03, 0xef, 0xce, 0xba, 0xe1, 0xbd]));
  });

  it('raises an error on a 200 KiB long masked binary message when `maxPayload` is 20 KiB', function (done) {
    const p = new Receiver({}, 20 * 1024);
    const msg = crypto.randomBytes(200 * 1024);

    const mask = '3483a868';
    const frame = '82' + util.getHybiLengthAsHexString(msg.length, true) + mask +
      util.mask(msg, mask).toString('hex');

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'max payload size exceeded');
      assert.strictEqual(code, 1009);
      done();
    };

    p.add(Buffer.from(frame, 'hex'));
  });

  it('raises an error on a 200 KiB long unmasked binary message when `maxPayload` is 20 KiB', function (done) {
    const p = new Receiver({}, 20 * 1024);
    const msg = crypto.randomBytes(200 * 1024);

    const frame = '82' + util.getHybiLengthAsHexString(msg.length, false) +
      msg.toString('hex');

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'max payload size exceeded');
      assert.strictEqual(code, 1009);
      done();
    };

    p.add(Buffer.from(frame, 'hex'));
  });

  it('raises an error on a compressed message that exceeds `maxPayload`', function (done) {
    const perMessageDeflate = new PerMessageDeflate({}, false, 25);
    perMessageDeflate.accept([{}]);

    const p = new Receiver({ 'permessage-deflate': perMessageDeflate }, 25);
    const buf = Buffer.from('A'.repeat(50));

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'max payload size exceeded');
      assert.strictEqual(code, 1009);
      done();
    };

    perMessageDeflate.compress(buf, true, function (err, data) {
      if (err) return done(err);

      p.add(Buffer.from([0xc1, data.length]));
      p.add(data);
    });
  });

  it('raises an error if the sum of fragment lengths exceeds `maxPayload`', function (done) {
    const perMessageDeflate = new PerMessageDeflate({}, false, 25);
    perMessageDeflate.accept([{}]);

    const p = new Receiver({ 'permessage-deflate': perMessageDeflate }, 25);
    const buf = Buffer.from('A'.repeat(15));

    p.onerror = function (err, code) {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'max payload size exceeded');
      assert.strictEqual(code, 1009);
      done();
    };

    perMessageDeflate.compress(buf, false, function (err, fragment1) {
      if (err) return done(err);

      p.add(Buffer.from([0x41, fragment1.length]));
      p.add(fragment1);

      perMessageDeflate.compress(buf, true, function (err, fragment2) {
        if (err) return done(err);

        p.add(Buffer.from([0x80, fragment2.length]));
        p.add(fragment2);
      });
    });
  });

  it('doesn\'t crash if data is received after `maxPayload` is exceeded', function (done) {
    const p = new Receiver({}, 5);
    const buf = crypto.randomBytes(10);

    let gotError = false;

    p.onerror = function (reason, code) {
      gotError = true;
      assert.strictEqual(code, 1009);
    };

    p.add(Buffer.from([0x82, buf.length]));

    assert.ok(gotError);
    assert.strictEqual(p.onerror, null);

    p.add(buf);
    done();
  });

  it('consumes all data before calling `cleanup` callback (1/4)', function (done) {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const p = new Receiver({ 'permessage-deflate': perMessageDeflate });
    const buf = Buffer.from('Hello');
    const results = [];

    p.onmessage = (message) => results.push(message);

    perMessageDeflate.compress(buf, true, (err, data) => {
      if (err) return done(err);

      const frame = Buffer.concat([Buffer.from([0xc1, data.length]), data]);

      p.add(frame);
      p.add(frame);

      assert.strictEqual(p.state, 5);
      assert.strictEqual(p.bufferedBytes, frame.length);

      p.cleanup(() => {
        assert.deepStrictEqual(results, ['Hello', 'Hello']);
        assert.strictEqual(p.onmessage, null);
        done();
      });
    });
  });

  it('consumes all data before calling `cleanup` callback (2/4)', function (done) {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const p = new Receiver({ 'permessage-deflate': perMessageDeflate });
    const buf = Buffer.from('Hello');
    const results = [];

    p.onclose = (code, reason) => results.push(code, reason);
    p.onmessage = (message) => results.push(message);

    perMessageDeflate.compress(buf, true, (err, data) => {
      if (err) return done(err);

      const textFrame = Buffer.concat([Buffer.from([0xc1, data.length]), data]);
      const closeFrame = Buffer.from([0x88, 0x00]);

      p.add(textFrame);
      p.add(textFrame);
      p.add(closeFrame);

      assert.strictEqual(p.state, 5);
      assert.strictEqual(p.bufferedBytes, textFrame.length + closeFrame.length);

      p.cleanup(() => {
        assert.deepStrictEqual(results, ['Hello', 'Hello', 1000, '']);
        assert.strictEqual(p.onmessage, null);
        done();
      });
    });
  });

  it('consumes all data before calling `cleanup` callback (3/4)', function (done) {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const p = new Receiver({ 'permessage-deflate': perMessageDeflate });
    const buf = Buffer.from('Hello');
    const results = [];

    p.onerror = (err, code) => results.push(err.message, code);
    p.onmessage = (message) => results.push(message);

    perMessageDeflate.compress(buf, true, (err, data) => {
      if (err) return done(err);

      const textFrame = Buffer.concat([Buffer.from([0xc1, data.length]), data]);
      const invalidFrame = Buffer.from([0xa0, 0x00]);

      p.add(textFrame);
      p.add(textFrame);
      p.add(invalidFrame);

      assert.strictEqual(p.state, 5);
      assert.strictEqual(p.bufferedBytes, textFrame.length + invalidFrame.length);

      p.cleanup(() => {
        assert.deepStrictEqual(results, [
          'Hello',
          'Hello',
          'RSV2 and RSV3 must be clear',
          1002
        ]);
        assert.strictEqual(p.onmessage, null);
        done();
      });
    });
  });

  it('consumes all data before calling `cleanup` callback (4/4)', function (done) {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const p = new Receiver({ 'permessage-deflate': perMessageDeflate });
    const buf = Buffer.from('Hello');
    const results = [];

    p.onmessage = (message) => results.push(message);

    perMessageDeflate.compress(buf, true, (err, data) => {
      if (err) return done(err);

      const textFrame = Buffer.concat([Buffer.from([0xc1, data.length]), data]);
      const incompleteFrame = Buffer.from([0x82, 0x0a, 0x00, 0x00]);

      p.add(textFrame);
      p.add(incompleteFrame);

      assert.strictEqual(p.state, 5);
      assert.strictEqual(p.bufferedBytes, incompleteFrame.length);

      p.cleanup(() => {
        assert.deepStrictEqual(results, ['Hello']);
        assert.strictEqual(p.onmessage, null);
        done();
      });
    });
  });

  it('can emit nodebuffer of fragmented binary message', function (done) {
    const p = new Receiver();
    const frags = [
      crypto.randomBytes(7321),
      crypto.randomBytes(137),
      crypto.randomBytes(285787),
      crypto.randomBytes(3)
    ];

    p.binaryType = 'nodebuffer';
    p.onmessage = (data) => {
      assert.ok(Buffer.isBuffer(data));
      assert.ok(data.equals(Buffer.concat(frags)));
      done();
    };

    frags.forEach((frag, i) => {
      Sender.frame(frag, {
        fin: i === frags.length - 1,
        opcode: i === 0 ? 2 : 0,
        readOnly: true,
        mask: false,
        rsv1: false
      }).forEach((buf) => p.add(buf));
    });
  });

  it('can emit arraybuffer of fragmented binary message', function (done) {
    const p = new Receiver();
    const frags = [
      crypto.randomBytes(19221),
      crypto.randomBytes(954),
      crypto.randomBytes(623987)
    ];

    p.binaryType = 'arraybuffer';
    p.onmessage = (data) => {
      assert.ok(data instanceof ArrayBuffer);
      assert.ok(Buffer.from(data).equals(Buffer.concat(frags)));
      done();
    };

    frags.forEach((frag, i) => {
      Sender.frame(frag, {
        fin: i === frags.length - 1,
        opcode: i === 0 ? 2 : 0,
        readOnly: true,
        mask: false,
        rsv1: false
      }).forEach((buf) => p.add(buf));
    });
  });

  it('can emit fragments of fragmented binary message', function (done) {
    const p = new Receiver();
    const frags = [
      crypto.randomBytes(17),
      crypto.randomBytes(419872),
      crypto.randomBytes(83),
      crypto.randomBytes(9928),
      crypto.randomBytes(1)
    ];

    p.binaryType = 'fragments';
    p.onmessage = (data) => {
      assert.deepStrictEqual(data, frags);
      done();
    };

    frags.forEach((frag, i) => {
      Sender.frame(frag, {
        fin: i === frags.length - 1,
        opcode: i === 0 ? 2 : 0,
        readOnly: true,
        mask: false,
        rsv1: false
      }).forEach((buf) => p.add(buf));
    });
  });
});
