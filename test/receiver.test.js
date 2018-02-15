'use strict';

const safeBuffer = require('safe-buffer');
const assert = require('assert');
const crypto = require('crypto');

const PerMessageDeflate = require('../lib/permessage-deflate');
const constants = require('../lib/constants');
const Receiver = require('../lib/receiver');
const Sender = require('../lib/sender');

const kStatusCode = constants.kStatusCode;
const Buffer = safeBuffer.Buffer;

describe('Receiver', function () {
  it('parses an unmasked text message', function (done) {
    const receiver = new Receiver();

    receiver.on('message', (data) => {
      assert.strictEqual(data, 'Hello');
      done();
    });

    receiver.write(Buffer.from('810548656c6c6f', 'hex'));
  });

  it('parses a close message', function (done) {
    const receiver = new Receiver();

    receiver.on('close', (code, data) => {
      assert.strictEqual(code, 1005);
      assert.strictEqual(data, '');
      done();
    });

    receiver.write(Buffer.from('8800', 'hex'));
  });

  it('parses a masked text message', function (done) {
    const receiver = new Receiver();

    receiver.on('message', (data) => {
      assert.strictEqual(data, '5:::{"name":"echo"}');
      done();
    });

    receiver.write(
      Buffer.from('81933483a86801b992524fa1c60959e68a5216e6cb005ba1d5', 'hex')
    );
  });

  it('parses a masked text message longer than 125 B', function (done) {
    const receiver = new Receiver();
    const msg = 'A'.repeat(200);

    const list = Sender.frame(Buffer.from(msg), {
      fin: true,
      rsv1: false,
      opcode: 0x01,
      mask: true,
      readOnly: false
    });

    const frame = Buffer.concat(list);

    receiver.on('message', (data) => {
      assert.strictEqual(data, msg);
      done();
    });

    receiver.write(frame.slice(0, 2));
    setImmediate(() => receiver.write(frame.slice(2)));
  });

  it('parses a really long masked text message', function (done) {
    const receiver = new Receiver();
    const msg = 'A'.repeat(64 * 1024);

    const list = Sender.frame(Buffer.from(msg), {
      fin: true,
      rsv1: false,
      opcode: 0x01,
      mask: true,
      readOnly: false
    });

    const frame = Buffer.concat(list);

    receiver.on('message', (data) => {
      assert.strictEqual(data, msg);
      done();
    });

    receiver.write(frame);
  });

  it('parses a 300 B fragmented masked text message', function (done) {
    const receiver = new Receiver();
    const msg = 'A'.repeat(300);

    const fragment1 = msg.substr(0, 150);
    const fragment2 = msg.substr(150);

    const options = { rsv1: false, mask: true, readOnly: false };

    const frame1 = Buffer.concat(Sender.frame(
      Buffer.from(fragment1),
      Object.assign({ fin: false, opcode: 0x01 }, options)
    ));
    const frame2 = Buffer.concat(Sender.frame(
      Buffer.from(fragment2),
      Object.assign({ fin: true, opcode: 0x00 }, options)
    ));

    receiver.on('message', (data) => {
      assert.strictEqual(data, msg);
      done();
    });

    receiver.write(frame1);
    receiver.write(frame2);
  });

  it('parses a ping message', function (done) {
    const receiver = new Receiver();
    const msg = 'Hello';

    const list = Sender.frame(Buffer.from(msg), {
      fin: true,
      rsv1: false,
      opcode: 0x09,
      mask: true,
      readOnly: false
    });

    const frame = Buffer.concat(list);

    receiver.on('ping', (data) => {
      assert.strictEqual(data.toString(), msg);
      done();
    });

    receiver.write(frame);
  });

  it('parses a ping message with no data', function (done) {
    const receiver = new Receiver();

    receiver.on('ping', (data) => {
      assert.ok(data.equals(Buffer.alloc(0)));
      done();
    });

    receiver.write(Buffer.from('8900', 'hex'));
  });

  it('parses a 300 B fragmented masked text message with a ping in the middle (1/2)', function (done) {
    const receiver = new Receiver();
    const msg = 'A'.repeat(300);
    const pingMessage = 'Hello';

    const fragment1 = msg.substr(0, 150);
    const fragment2 = msg.substr(150);

    const options = { rsv1: false, mask: true, readOnly: false };

    const frame1 = Buffer.concat(Sender.frame(
      Buffer.from(fragment1),
      Object.assign({ fin: false, opcode: 0x01 }, options)
    ));
    const frame2 = Buffer.concat(Sender.frame(
      Buffer.from(pingMessage),
      Object.assign({ fin: true, opcode: 0x09 }, options)
    ));
    const frame3 = Buffer.concat(Sender.frame(
      Buffer.from(fragment2),
      Object.assign({ fin: true, opcode: 0x00 }, options)
    ));

    let gotPing = false;

    receiver.on('message', (data) => {
      assert.strictEqual(data, msg);
      assert.ok(gotPing);
      done();
    });
    receiver.on('ping', (data) => {
      gotPing = true;
      assert.strictEqual(data.toString(), pingMessage);
    });

    receiver.write(frame1);
    receiver.write(frame2);
    receiver.write(frame3);
  });

  it('parses a 300 B fragmented masked text message with a ping in the middle (2/2)', function (done) {
    const receiver = new Receiver();
    const msg = 'A'.repeat(300);
    const pingMessage = 'Hello';

    const fragment1 = msg.substr(0, 150);
    const fragment2 = msg.substr(150);

    const options = { rsv1: false, mask: true, readOnly: false };

    const frame1 = Buffer.concat(Sender.frame(
      Buffer.from(fragment1),
      Object.assign({ fin: false, opcode: 0x01 }, options)
    ));
    const frame2 = Buffer.concat(Sender.frame(
      Buffer.from(pingMessage),
      Object.assign({ fin: true, opcode: 0x09 }, options)
    ));
    const frame3 = Buffer.concat(Sender.frame(
      Buffer.from(fragment2),
      Object.assign({ fin: true, opcode: 0x00 }, options)
    ));

    let chunks = [];
    const splitBuffer = (buf) => {
      const i = Math.floor(buf.length / 2);
      return [buf.slice(0, i), buf.slice(i)];
    };

    chunks = chunks.concat(splitBuffer(frame1));
    chunks = chunks.concat(splitBuffer(frame2));
    chunks = chunks.concat(splitBuffer(frame3));

    let gotPing = false;

    receiver.on('message', (data) => {
      assert.strictEqual(data, msg);
      assert.ok(gotPing);
      done();
    });
    receiver.on('ping', (data) => {
      gotPing = true;
      assert.strictEqual(data.toString(), pingMessage);
    });

    for (let i = 0; i < chunks.length; ++i) {
      receiver.write(chunks[i]);
    }
  });

  it('parses a 100 B masked binary message', function (done) {
    const receiver = new Receiver();
    const msg = crypto.randomBytes(100);

    const list = Sender.frame(msg, {
      fin: true,
      rsv1: false,
      opcode: 0x02,
      mask: true,
      readOnly: true
    });

    const frame = Buffer.concat(list);

    receiver.on('message', (data) => {
      assert.ok(data.equals(msg));
      done();
    });

    receiver.write(frame);
  });

  it('parses a 256 B masked binary message', function (done) {
    const receiver = new Receiver();
    const msg = crypto.randomBytes(256);

    const list = Sender.frame(msg, {
      fin: true,
      rsv1: false,
      opcode: 0x02,
      mask: true,
      readOnly: true
    });

    const frame = Buffer.concat(list);

    receiver.on('message', (data) => {
      assert.ok(data.equals(msg));
      done();
    });

    receiver.write(frame);
  });

  it('parses a 200 KiB masked binary message', function (done) {
    const receiver = new Receiver();
    const msg = crypto.randomBytes(200 * 1024);

    const list = Sender.frame(msg, {
      fin: true,
      rsv1: false,
      opcode: 0x02,
      mask: true,
      readOnly: true
    });

    const frame = Buffer.concat(list);

    receiver.on('message', (data) => {
      assert.ok(data.equals(msg));
      done();
    });

    receiver.write(frame);
  });

  it('parses a 200 KiB unmasked binary message', function (done) {
    const receiver = new Receiver();
    const msg = crypto.randomBytes(200 * 1024);

    const list = Sender.frame(msg, {
      fin: true,
      rsv1: false,
      opcode: 0x02,
      mask: false,
      readOnly: true
    });

    const frame = Buffer.concat(list);

    receiver.on('message', (data) => {
      assert.ok(data.equals(msg));
      done();
    });

    receiver.write(frame);
  });

  it('parses a compressed message', function (done) {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const receiver = new Receiver({ 'permessage-deflate': perMessageDeflate });
    const buf = Buffer.from('Hello');

    receiver.on('message', (data) => {
      assert.strictEqual(data, 'Hello');
      done();
    });

    perMessageDeflate.compress(buf, true, (err, data) => {
      if (err) return done(err);

      receiver.write(Buffer.from([0xc1, data.length]));
      receiver.write(data);
    });
  });

  it('parses a compressed and fragmented message', function (done) {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const receiver = new Receiver({ 'permessage-deflate': perMessageDeflate });
    const buf1 = Buffer.from('foo');
    const buf2 = Buffer.from('bar');

    receiver.on('message', (data) => {
      assert.strictEqual(data, 'foobar');
      done();
    });

    perMessageDeflate.compress(buf1, false, function (err, fragment1) {
      if (err) return done(err);

      receiver.write(Buffer.from([0x41, fragment1.length]));
      receiver.write(fragment1);

      perMessageDeflate.compress(buf2, true, function (err, fragment2) {
        if (err) return done(err);

        receiver.write(Buffer.from([0x80, fragment2.length]));
        receiver.write(fragment2);
      });
    });
  });

  it('parses a buffer with thousands of frames', function (done) {
    const buf = Buffer.allocUnsafe(40000);

    for (let i = 0; i < buf.length; i += 2) {
      buf[i] = 0x81;
      buf[i + 1] = 0x00;
    }

    const receiver = new Receiver();
    let counter = 0;

    receiver.on('message', (data) => {
      assert.strictEqual(data, '');
      if (++counter === 20000) done();
    });

    receiver.write(buf);
  });

  it('resets `totalPayloadLength` only on final frame (unfragmented)', function (done) {
    const receiver = new Receiver({}, 10);

    receiver.on('message', (data) => {
      assert.strictEqual(receiver._totalPayloadLength, 0);
      assert.strictEqual(data, 'Hello');
      done();
    });

    assert.strictEqual(receiver._totalPayloadLength, 0);
    receiver.write(Buffer.from('810548656c6c6f', 'hex'));
  });

  it('resets `totalPayloadLength` only on final frame (fragmented)', function (done) {
    const receiver = new Receiver({}, 10);

    receiver.on('message', (data) => {
      assert.strictEqual(receiver._totalPayloadLength, 0);
      assert.strictEqual(data, 'Hello');
      done();
    });

    assert.strictEqual(receiver._totalPayloadLength, 0);
    receiver.write(Buffer.from('01024865', 'hex'));
    assert.strictEqual(receiver._totalPayloadLength, 2);
    receiver.write(Buffer.from('80036c6c6f', 'hex'));
  });

  it('resets `totalPayloadLength` only on final frame (fragmented + ping)', function (done) {
    const receiver = new Receiver({}, 10);
    let data;

    receiver.on('ping', (buf) => {
      assert.strictEqual(receiver._totalPayloadLength, 2);
      data = buf.toString();
    });
    receiver.on('message', (buf) => {
      assert.strictEqual(receiver._totalPayloadLength, 0);
      assert.strictEqual(data, '');
      assert.strictEqual(buf.toString(), 'Hello');
      done();
    });

    assert.strictEqual(receiver._totalPayloadLength, 0);
    receiver.write(Buffer.from('02024865', 'hex'));
    receiver.write(Buffer.from('8900', 'hex'));
    receiver.write(Buffer.from('80036c6c6f', 'hex'));
  });

  it('ignores any data after a close frame', function (done) {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const receiver = new Receiver({ 'permessage-deflate': perMessageDeflate });
    const results = [];
    const push = results.push.bind(results);

    receiver.on('close', push).on('message', push);
    receiver.on('finish', () => {
      assert.deepStrictEqual(results, ['', 1005, '']);
      done();
    });

    receiver.write(Buffer.from([0xc1, 0x01, 0x00]));
    receiver.write(Buffer.from([0x88, 0x00]));
    receiver.write(Buffer.from([0x81, 0x00]));
  });

  it('emits an error if RSV1 is on and permessage-deflate is disabled', function (done) {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: RSV1 must be clear'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0xc2, 0x80, 0x00, 0x00, 0x00, 0x00]));
  });

  it('emits an error if RSV1 is on and opcode is 0', function (done) {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const receiver = new Receiver({ 'permessage-deflate': perMessageDeflate });

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: RSV1 must be clear'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x40, 0x00]));
  });

  it('emits an error if RSV2 is on', function (done) {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: RSV2 and RSV3 must be clear'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0xa2, 0x00]));
  });

  it('emits an error if RSV3 is on', function (done) {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: RSV2 and RSV3 must be clear'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x92, 0x00]));
  });

  it('emits an error if the first frame in a fragmented message has opcode 0', function (done) {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: invalid opcode 0'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x00, 0x00]));
  });

  it('emits an error if a frame has opcode 1 in the middle of a fragmented message', function (done) {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: invalid opcode 1'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x01, 0x00]));
    receiver.write(Buffer.from([0x01, 0x00]));
  });

  it('emits an error if a frame has opcode 2 in the middle of a fragmented message', function (done) {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: invalid opcode 2'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x01, 0x00]));
    receiver.write(Buffer.from([0x02, 0x00]));
  });

  it('emits an error if a control frame has the FIN bit off', function (done) {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: FIN must be set'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x09, 0x00]));
  });

  it('emits an error if a control frame has the RSV1 bit on', function (done) {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const receiver = new Receiver({ 'permessage-deflate': perMessageDeflate });

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: RSV1 must be clear'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0xc9, 0x00]));
  });

  it('emits an error if a control frame has the FIN bit off', function (done) {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: FIN must be set'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x09, 0x00]));
  });

  it('emits an error if a control frame has a payload bigger than 125 B', function (done) {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: invalid payload length 126'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x89, 0x7e]));
  });

  it('emits an error if a data frame has a payload bigger than 2^53 - 1 B', function (done) {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(
        err.message,
        'Unsupported WebSocket frame: payload length > 2^53 - 1'
      );
      assert.strictEqual(err[kStatusCode], 1009);
      done();
    });

    receiver.write(Buffer.from([0x82, 0x7f]));
    setImmediate(() => receiver.write(Buffer.from([
      0x00, 0x20, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00
    ])));
  });

  it('emits an error if a text frame contains invalid UTF-8 data', function (done) {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof Error);
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: invalid UTF-8 sequence'
      );
      assert.strictEqual(err[kStatusCode], 1007);
      done();
    });

    receiver.write(Buffer.from([0x81, 0x04, 0xce, 0xba, 0xe1, 0xbd]));
  });

  it('emits an error if a close frame has a payload of 1 B', function (done) {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: invalid payload length 1'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x88, 0x01, 0x00]));
  });

  it('emits an error if a close frame contains an invalid close code', function (done) {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: invalid status code 0'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x88, 0x02, 0x00, 0x00]));
  });

  it('emits an error if a close frame contains invalid UTF-8 data', function (done) {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof Error);
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: invalid UTF-8 sequence'
      );
      assert.strictEqual(err[kStatusCode], 1007);
      done();
    });

    receiver.write(
      Buffer.from([0x88, 0x06, 0x03, 0xef, 0xce, 0xba, 0xe1, 0xbd])
    );
  });

  it('emits an error if a frame payload length is bigger than `maxPayload`', function (done) {
    const receiver = new Receiver({}, 20 * 1024);
    const msg = crypto.randomBytes(200 * 1024);

    const list = Sender.frame(msg, {
      fin: true,
      rsv1: false,
      opcode: 0x02,
      mask: true,
      readOnly: true
    });

    const frame = Buffer.concat(list);

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.message, 'Max payload size exceeded');
      assert.strictEqual(err[kStatusCode], 1009);
      done();
    });

    receiver.write(frame);
  });

  it('emits an error if the message length exceeds `maxPayload`', function (done) {
    const perMessageDeflate = new PerMessageDeflate({}, false, 25);
    perMessageDeflate.accept([{}]);

    const receiver = new Receiver({
      'permessage-deflate': perMessageDeflate
    }, 25);
    const buf = Buffer.from('A'.repeat(50));

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.message, 'Max payload size exceeded');
      assert.strictEqual(err[kStatusCode], 1009);
      done();
    });

    perMessageDeflate.compress(buf, true, function (err, data) {
      if (err) return done(err);

      receiver.write(Buffer.from([0xc1, data.length]));
      receiver.write(data);
    });
  });

  it('emits an error if the sum of fragment lengths exceeds `maxPayload`', function (done) {
    const perMessageDeflate = new PerMessageDeflate({}, false, 25);
    perMessageDeflate.accept([{}]);

    const receiver = new Receiver({
      'permessage-deflate': perMessageDeflate
    }, 25);
    const buf = Buffer.from('A'.repeat(15));

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.message, 'Max payload size exceeded');
      assert.strictEqual(err[kStatusCode], 1009);
      done();
    });

    perMessageDeflate.compress(buf, false, function (err, fragment1) {
      if (err) return done(err);

      receiver.write(Buffer.from([0x41, fragment1.length]));
      receiver.write(fragment1);

      perMessageDeflate.compress(buf, true, function (err, fragment2) {
        if (err) return done(err);

        receiver.write(Buffer.from([0x80, fragment2.length]));
        receiver.write(fragment2);
      });
    });
  });

  it("honors the 'nodebuffer' binary type", function (done) {
    const receiver = new Receiver();
    const frags = [
      crypto.randomBytes(7321),
      crypto.randomBytes(137),
      crypto.randomBytes(285787),
      crypto.randomBytes(3)
    ];

    receiver.on('message', (data) => {
      assert.ok(Buffer.isBuffer(data));
      assert.ok(data.equals(Buffer.concat(frags)));
      done();
    });

    frags.forEach((frag, i) => {
      Sender.frame(frag, {
        fin: i === frags.length - 1,
        opcode: i === 0 ? 2 : 0,
        readOnly: true,
        mask: false,
        rsv1: false
      }).forEach((buf) => receiver.write(buf));
    });
  });

  it("honors the 'arraybuffer' binary type", function (done) {
    const receiver = new Receiver();
    const frags = [
      crypto.randomBytes(19221),
      crypto.randomBytes(954),
      crypto.randomBytes(623987)
    ];

    receiver._binaryType = 'arraybuffer';
    receiver.on('message', (data) => {
      assert.ok(data instanceof ArrayBuffer);
      assert.ok(Buffer.from(data).equals(Buffer.concat(frags)));
      done();
    });

    frags.forEach((frag, i) => {
      Sender.frame(frag, {
        fin: i === frags.length - 1,
        opcode: i === 0 ? 2 : 0,
        readOnly: true,
        mask: false,
        rsv1: false
      }).forEach((buf) => receiver.write(buf));
    });
  });

  it("honors the 'fragments' binary type", function (done) {
    const receiver = new Receiver();
    const frags = [
      crypto.randomBytes(17),
      crypto.randomBytes(419872),
      crypto.randomBytes(83),
      crypto.randomBytes(9928),
      crypto.randomBytes(1)
    ];

    receiver._binaryType = 'fragments';
    receiver.on('message', (data) => {
      assert.deepStrictEqual(data, frags);
      done();
    });

    frags.forEach((frag, i) => {
      Sender.frame(frag, {
        fin: i === frags.length - 1,
        opcode: i === 0 ? 2 : 0,
        readOnly: true,
        mask: false,
        rsv1: false
      }).forEach((buf) => receiver.write(buf));
    });
  });
});
