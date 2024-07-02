'use strict';

const assert = require('assert');
const crypto = require('crypto');
const EventEmitter = require('events');

const PerMessageDeflate = require('../lib/permessage-deflate');
const Receiver = require('../lib/receiver');
const Sender = require('../lib/sender');
const { EMPTY_BUFFER, hasBlob, kStatusCode } = require('../lib/constants');

describe('Receiver', () => {
  it('parses an unmasked text message', (done) => {
    const receiver = new Receiver();

    receiver.on('message', (data, isBinary) => {
      assert.deepStrictEqual(data, Buffer.from('Hello'));
      assert.ok(!isBinary);
      done();
    });

    receiver.write(Buffer.from('810548656c6c6f', 'hex'));
  });

  it('parses a close message', (done) => {
    const receiver = new Receiver();

    receiver.on('conclude', (code, data) => {
      assert.strictEqual(code, 1005);
      assert.strictEqual(data, EMPTY_BUFFER);
      done();
    });

    receiver.write(Buffer.from('8800', 'hex'));
  });

  it('parses a close message spanning multiple writes', (done) => {
    const receiver = new Receiver();

    receiver.on('conclude', (code, data) => {
      assert.strictEqual(code, 1000);
      assert.deepStrictEqual(data, Buffer.from('DONE'));
      done();
    });

    receiver.write(Buffer.from('8806', 'hex'));
    receiver.write(Buffer.from('03e8444F4E45', 'hex'));
  });

  it('parses a masked text message', (done) => {
    const receiver = new Receiver({ isServer: true });

    receiver.on('message', (data, isBinary) => {
      assert.deepStrictEqual(data, Buffer.from('5:::{"name":"echo"}'));
      assert.ok(!isBinary);
      done();
    });

    receiver.write(
      Buffer.from('81933483a86801b992524fa1c60959e68a5216e6cb005ba1d5', 'hex')
    );
  });

  it('parses a masked text message longer than 125 B', (done) => {
    const receiver = new Receiver({ isServer: true });
    const msg = Buffer.from('A'.repeat(200));

    const list = Sender.frame(msg, {
      fin: true,
      rsv1: false,
      opcode: 0x01,
      mask: true,
      readOnly: true
    });

    const frame = Buffer.concat(list);

    receiver.on('message', (data, isBinary) => {
      assert.deepStrictEqual(data, msg);
      assert.ok(!isBinary);
      done();
    });

    receiver.write(frame.slice(0, 2));
    setImmediate(() => receiver.write(frame.slice(2)));
  });

  it('parses a really long masked text message', (done) => {
    const receiver = new Receiver({ isServer: true });
    const msg = Buffer.from('A'.repeat(64 * 1024));

    const list = Sender.frame(msg, {
      fin: true,
      rsv1: false,
      opcode: 0x01,
      mask: true,
      readOnly: true
    });

    const frame = Buffer.concat(list);

    receiver.on('message', (data, isBinary) => {
      assert.deepStrictEqual(data, msg);
      assert.ok(!isBinary);
      done();
    });

    receiver.write(frame);
  });

  it('parses a 300 B fragmented masked text message', (done) => {
    const receiver = new Receiver({ isServer: true });
    const msg = Buffer.from('A'.repeat(300));

    const fragment1 = msg.slice(0, 150);
    const fragment2 = msg.slice(150);

    const options = { rsv1: false, mask: true, readOnly: true };

    const frame1 = Buffer.concat(
      Sender.frame(fragment1, {
        fin: false,
        opcode: 0x01,
        ...options
      })
    );
    const frame2 = Buffer.concat(
      Sender.frame(fragment2, {
        fin: true,
        opcode: 0x00,
        ...options
      })
    );

    receiver.on('message', (data, isBinary) => {
      assert.deepStrictEqual(data, msg);
      assert.ok(!isBinary);
      done();
    });

    receiver.write(frame1);
    receiver.write(frame2);
  });

  it('parses a ping message', (done) => {
    const receiver = new Receiver({ isServer: true });
    const msg = Buffer.from('Hello');

    const list = Sender.frame(msg, {
      fin: true,
      rsv1: false,
      opcode: 0x09,
      mask: true,
      readOnly: true
    });

    const frame = Buffer.concat(list);

    receiver.on('ping', (data) => {
      assert.deepStrictEqual(data, msg);
      done();
    });

    receiver.write(frame);
  });

  it('parses a ping message with no data', (done) => {
    const receiver = new Receiver();

    receiver.on('ping', (data) => {
      assert.strictEqual(data, EMPTY_BUFFER);
      done();
    });

    receiver.write(Buffer.from('8900', 'hex'));
  });

  it('parses a 300 B fragmented masked text message with a ping in the middle (1/2)', (done) => {
    const receiver = new Receiver({ isServer: true });
    const msg = Buffer.from('A'.repeat(300));
    const pingMessage = Buffer.from('Hello');

    const fragment1 = msg.slice(0, 150);
    const fragment2 = msg.slice(150);

    const options = { rsv1: false, mask: true, readOnly: true };

    const frame1 = Buffer.concat(
      Sender.frame(fragment1, {
        fin: false,
        opcode: 0x01,
        ...options
      })
    );
    const frame2 = Buffer.concat(
      Sender.frame(pingMessage, {
        fin: true,
        opcode: 0x09,
        ...options
      })
    );
    const frame3 = Buffer.concat(
      Sender.frame(fragment2, {
        fin: true,
        opcode: 0x00,
        ...options
      })
    );

    let gotPing = false;

    receiver.on('message', (data, isBinary) => {
      assert.deepStrictEqual(data, msg);
      assert.ok(!isBinary);
      assert.ok(gotPing);
      done();
    });
    receiver.on('ping', (data) => {
      gotPing = true;
      assert.ok(data.equals(pingMessage));
    });

    receiver.write(frame1);
    receiver.write(frame2);
    receiver.write(frame3);
  });

  it('parses a 300 B fragmented masked text message with a ping in the middle (2/2)', (done) => {
    const receiver = new Receiver({ isServer: true });
    const msg = Buffer.from('A'.repeat(300));
    const pingMessage = Buffer.from('Hello');

    const fragment1 = msg.slice(0, 150);
    const fragment2 = msg.slice(150);

    const options = { rsv1: false, mask: true, readOnly: false };

    const frame1 = Buffer.concat(
      Sender.frame(Buffer.from(fragment1), {
        fin: false,
        opcode: 0x01,
        ...options
      })
    );
    const frame2 = Buffer.concat(
      Sender.frame(Buffer.from(pingMessage), {
        fin: true,
        opcode: 0x09,
        ...options
      })
    );
    const frame3 = Buffer.concat(
      Sender.frame(Buffer.from(fragment2), {
        fin: true,
        opcode: 0x00,
        ...options
      })
    );

    let chunks = [];
    const splitBuffer = (buf) => {
      const i = Math.floor(buf.length / 2);
      return [buf.slice(0, i), buf.slice(i)];
    };

    chunks = chunks.concat(splitBuffer(frame1));
    chunks = chunks.concat(splitBuffer(frame2));
    chunks = chunks.concat(splitBuffer(frame3));

    let gotPing = false;

    receiver.on('message', (data, isBinary) => {
      assert.deepStrictEqual(data, msg);
      assert.ok(!isBinary);
      assert.ok(gotPing);
      done();
    });
    receiver.on('ping', (data) => {
      gotPing = true;
      assert.ok(data.equals(pingMessage));
    });

    for (let i = 0; i < chunks.length; ++i) {
      receiver.write(chunks[i]);
    }
  });

  it('parses a 100 B masked binary message', (done) => {
    const receiver = new Receiver({ isServer: true });
    const msg = crypto.randomBytes(100);

    const list = Sender.frame(msg, {
      fin: true,
      rsv1: false,
      opcode: 0x02,
      mask: true,
      readOnly: true
    });

    const frame = Buffer.concat(list);

    receiver.on('message', (data, isBinary) => {
      assert.deepStrictEqual(data, msg);
      assert.ok(isBinary);
      done();
    });

    receiver.write(frame);
  });

  it('parses a 256 B masked binary message', (done) => {
    const receiver = new Receiver({ isServer: true });
    const msg = crypto.randomBytes(256);

    const list = Sender.frame(msg, {
      fin: true,
      rsv1: false,
      opcode: 0x02,
      mask: true,
      readOnly: true
    });

    const frame = Buffer.concat(list);

    receiver.on('message', (data, isBinary) => {
      assert.deepStrictEqual(data, msg);
      assert.ok(isBinary);
      done();
    });

    receiver.write(frame);
  });

  it('parses a 200 KiB masked binary message', (done) => {
    const receiver = new Receiver({ isServer: true });
    const msg = crypto.randomBytes(200 * 1024);

    const list = Sender.frame(msg, {
      fin: true,
      rsv1: false,
      opcode: 0x02,
      mask: true,
      readOnly: true
    });

    const frame = Buffer.concat(list);

    receiver.on('message', (data, isBinary) => {
      assert.deepStrictEqual(data, msg);
      assert.ok(isBinary);
      done();
    });

    receiver.write(frame);
  });

  it('parses a 200 KiB unmasked binary message', (done) => {
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

    receiver.on('message', (data, isBinary) => {
      assert.deepStrictEqual(data, msg);
      assert.ok(isBinary);
      done();
    });

    receiver.write(frame);
  });

  it('parses a compressed message', (done) => {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const receiver = new Receiver({
      extensions: {
        'permessage-deflate': perMessageDeflate
      }
    });
    const buf = Buffer.from('Hello');

    receiver.on('message', (data, isBinary) => {
      assert.deepStrictEqual(data, buf);
      assert.ok(!isBinary);
      done();
    });

    perMessageDeflate.compress(buf, true, (err, data) => {
      if (err) return done(err);

      receiver.write(Buffer.from([0xc1, data.length]));
      receiver.write(data);
    });
  });

  it('parses a compressed and fragmented message', (done) => {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const receiver = new Receiver({
      extensions: {
        'permessage-deflate': perMessageDeflate
      }
    });
    const buf1 = Buffer.from('foo');
    const buf2 = Buffer.from('bar');

    receiver.on('message', (data, isBinary) => {
      assert.deepStrictEqual(data, Buffer.concat([buf1, buf2]));
      assert.ok(!isBinary);
      done();
    });

    perMessageDeflate.compress(buf1, false, (err, fragment1) => {
      if (err) return done(err);

      receiver.write(Buffer.from([0x41, fragment1.length]));
      receiver.write(fragment1);

      perMessageDeflate.compress(buf2, true, (err, fragment2) => {
        if (err) return done(err);

        receiver.write(Buffer.from([0x80, fragment2.length]));
        receiver.write(fragment2);
      });
    });
  });

  it('parses a buffer with thousands of frames', (done) => {
    const buf = Buffer.allocUnsafe(40000);

    for (let i = 0; i < buf.length; i += 2) {
      buf[i] = 0x81;
      buf[i + 1] = 0x00;
    }

    const receiver = new Receiver();
    let counter = 0;

    receiver.on('message', (data, isBinary) => {
      assert.strictEqual(data, EMPTY_BUFFER);
      assert.ok(!isBinary);
      if (++counter === 20000) done();
    });

    receiver.write(buf);
  });

  it('resets `totalPayloadLength` only on final frame (unfragmented)', (done) => {
    const receiver = new Receiver({ maxPayload: 10 });

    receiver.on('message', (data, isBinary) => {
      assert.strictEqual(receiver._totalPayloadLength, 0);
      assert.deepStrictEqual(data, Buffer.from('Hello'));
      assert.ok(!isBinary);
      done();
    });

    assert.strictEqual(receiver._totalPayloadLength, 0);
    receiver.write(Buffer.from('810548656c6c6f', 'hex'));
  });

  it('resets `totalPayloadLength` only on final frame (fragmented)', (done) => {
    const receiver = new Receiver({ maxPayload: 10 });

    receiver.on('message', (data, isBinary) => {
      assert.strictEqual(receiver._totalPayloadLength, 0);
      assert.deepStrictEqual(data, Buffer.from('Hello'));
      assert.ok(!isBinary);
      done();
    });

    assert.strictEqual(receiver._totalPayloadLength, 0);
    receiver.write(Buffer.from('01024865', 'hex'));
    assert.strictEqual(receiver._totalPayloadLength, 2);
    receiver.write(Buffer.from('80036c6c6f', 'hex'));
  });

  it('resets `totalPayloadLength` only on final frame (fragmented + ping)', (done) => {
    const receiver = new Receiver({ maxPayload: 10 });
    let data;

    receiver.on('ping', (buf) => {
      assert.strictEqual(receiver._totalPayloadLength, 2);
      data = buf;
    });
    receiver.on('message', (buf, isBinary) => {
      assert.strictEqual(receiver._totalPayloadLength, 0);
      assert.deepStrictEqual(data, EMPTY_BUFFER);
      assert.deepStrictEqual(buf, Buffer.from('Hello'));
      assert.ok(isBinary);
      done();
    });

    assert.strictEqual(receiver._totalPayloadLength, 0);
    receiver.write(Buffer.from('02024865', 'hex'));
    receiver.write(Buffer.from('8900', 'hex'));
    receiver.write(Buffer.from('80036c6c6f', 'hex'));
  });

  it('ignores any data after a close frame', (done) => {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const receiver = new Receiver({
      extensions: {
        'permessage-deflate': perMessageDeflate
      }
    });
    const results = [];
    const push = results.push.bind(results);

    receiver.on('conclude', push).on('message', push);
    receiver.on('finish', () => {
      assert.deepStrictEqual(results, [
        EMPTY_BUFFER,
        false,
        1005,
        EMPTY_BUFFER
      ]);
      done();
    });

    receiver.write(Buffer.from([0xc1, 0x01, 0x00]));
    receiver.write(Buffer.from([0x88, 0x00]));
    receiver.write(Buffer.from([0x81, 0x00]));
  });

  it('emits an error if RSV1 is on and permessage-deflate is disabled', (done) => {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.code, 'WS_ERR_UNEXPECTED_RSV_1');
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: RSV1 must be clear'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0xc2, 0x80, 0x00, 0x00, 0x00, 0x00]));
  });

  it('emits an error if RSV1 is on and opcode is 0', (done) => {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const receiver = new Receiver({
      extensions: {
        'permessage-deflate': perMessageDeflate
      }
    });

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.code, 'WS_ERR_UNEXPECTED_RSV_1');
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: RSV1 must be clear'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x40, 0x00]));
  });

  it('emits an error if RSV2 is on', (done) => {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.code, 'WS_ERR_UNEXPECTED_RSV_2_3');
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: RSV2 and RSV3 must be clear'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0xa2, 0x00]));
  });

  it('emits an error if RSV3 is on', (done) => {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.code, 'WS_ERR_UNEXPECTED_RSV_2_3');
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: RSV2 and RSV3 must be clear'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x92, 0x00]));
  });

  it('emits an error if the first frame in a fragmented message has opcode 0', (done) => {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.code, 'WS_ERR_INVALID_OPCODE');
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: invalid opcode 0'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x00, 0x00]));
  });

  it('emits an error if a frame has opcode 1 in the middle of a fragmented message', (done) => {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.code, 'WS_ERR_INVALID_OPCODE');
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

  it('emits an error if a frame has opcode 2 in the middle of a fragmented message', (done) => {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.code, 'WS_ERR_INVALID_OPCODE');
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

  it('emits an error if a control frame has the FIN bit off', (done) => {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.code, 'WS_ERR_EXPECTED_FIN');
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: FIN must be set'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x09, 0x00]));
  });

  it('emits an error if a control frame has the RSV1 bit on', (done) => {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const receiver = new Receiver({
      extensions: {
        'permessage-deflate': perMessageDeflate
      }
    });

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.code, 'WS_ERR_UNEXPECTED_RSV_1');
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: RSV1 must be clear'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0xc9, 0x00]));
  });

  it('emits an error if a control frame has the FIN bit off', (done) => {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.code, 'WS_ERR_EXPECTED_FIN');
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: FIN must be set'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x09, 0x00]));
  });

  it('emits an error if a frame has the MASK bit off (server mode)', (done) => {
    const receiver = new Receiver({ isServer: true });

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.code, 'WS_ERR_EXPECTED_MASK');
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: MASK must be set'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x81, 0x02, 0x68, 0x69]));
  });

  it('emits an error if a frame has the MASK bit on (client mode)', (done) => {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.code, 'WS_ERR_UNEXPECTED_MASK');
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: MASK must be clear'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(
      Buffer.from([0x81, 0x82, 0x56, 0x3a, 0xac, 0x80, 0x3e, 0x53])
    );
  });

  it('emits an error if a control frame has a payload bigger than 125 B', (done) => {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.code, 'WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH');
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: invalid payload length 126'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x89, 0x7e]));
  });

  it('emits an error if a data frame has a payload bigger than 2^53 - 1 B', (done) => {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.code, 'WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH');
      assert.strictEqual(
        err.message,
        'Unsupported WebSocket frame: payload length > 2^53 - 1'
      );
      assert.strictEqual(err[kStatusCode], 1009);
      done();
    });

    receiver.write(Buffer.from([0x82, 0x7f]));
    setImmediate(() =>
      receiver.write(
        Buffer.from([0x00, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
      )
    );
  });

  it('emits an error if a text frame contains invalid UTF-8 data (1/2)', (done) => {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.code, 'WS_ERR_INVALID_UTF8');
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: invalid UTF-8 sequence'
      );
      assert.strictEqual(err[kStatusCode], 1007);
      done();
    });

    receiver.write(Buffer.from([0x81, 0x04, 0xce, 0xba, 0xe1, 0xbd]));
  });

  it('emits an error if a text frame contains invalid UTF-8 data (2/2)', (done) => {
    const perMessageDeflate = new PerMessageDeflate();
    perMessageDeflate.accept([{}]);

    const receiver = new Receiver({
      extensions: {
        'permessage-deflate': perMessageDeflate
      }
    });
    const buf = Buffer.from([0xce, 0xba, 0xe1, 0xbd]);

    receiver.on('error', (err) => {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.code, 'WS_ERR_INVALID_UTF8');
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: invalid UTF-8 sequence'
      );
      assert.strictEqual(err[kStatusCode], 1007);
      done();
    });

    perMessageDeflate.compress(buf, true, (err, data) => {
      if (err) return done(err);

      receiver.write(Buffer.from([0xc1, data.length]));
      receiver.write(data);
    });
  });

  it('emits an error if a close frame has a payload of 1 B', (done) => {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.code, 'WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH');
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: invalid payload length 1'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x88, 0x01]));
  });

  it('emits an error if a close frame contains an invalid close code', (done) => {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.code, 'WS_ERR_INVALID_CLOSE_CODE');
      assert.strictEqual(
        err.message,
        'Invalid WebSocket frame: invalid status code 0'
      );
      assert.strictEqual(err[kStatusCode], 1002);
      done();
    });

    receiver.write(Buffer.from([0x88, 0x02, 0x00, 0x00]));
  });

  it('emits an error if a close frame contains invalid UTF-8 data', (done) => {
    const receiver = new Receiver();

    receiver.on('error', (err) => {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.code, 'WS_ERR_INVALID_UTF8');
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

  it('emits an error if a frame payload length is bigger than `maxPayload`', (done) => {
    const receiver = new Receiver({ isServer: true, maxPayload: 20 * 1024 });
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
      assert.strictEqual(err.code, 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH');
      assert.strictEqual(err.message, 'Max payload size exceeded');
      assert.strictEqual(err[kStatusCode], 1009);
      done();
    });

    receiver.write(frame);
  });

  it('emits an error if the message length exceeds `maxPayload`', (done) => {
    const perMessageDeflate = new PerMessageDeflate({}, false, 25);
    perMessageDeflate.accept([{}]);

    const receiver = new Receiver({
      extensions: { 'permessage-deflate': perMessageDeflate },
      isServer: false,
      maxPayload: 25
    });
    const buf = Buffer.from('A'.repeat(50));

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.code, 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH');
      assert.strictEqual(err.message, 'Max payload size exceeded');
      assert.strictEqual(err[kStatusCode], 1009);
      done();
    });

    perMessageDeflate.compress(buf, true, (err, data) => {
      if (err) return done(err);

      receiver.write(Buffer.from([0xc1, data.length]));
      receiver.write(data);
    });
  });

  it('emits an error if the sum of fragment lengths exceeds `maxPayload`', (done) => {
    const perMessageDeflate = new PerMessageDeflate({}, false, 25);
    perMessageDeflate.accept([{}]);

    const receiver = new Receiver({
      extensions: { 'permessage-deflate': perMessageDeflate },
      isServer: false,
      maxPayload: 25
    });
    const buf = Buffer.from('A'.repeat(15));

    receiver.on('error', (err) => {
      assert.ok(err instanceof RangeError);
      assert.strictEqual(err.code, 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH');
      assert.strictEqual(err.message, 'Max payload size exceeded');
      assert.strictEqual(err[kStatusCode], 1009);
      done();
    });

    perMessageDeflate.compress(buf, false, (err, fragment1) => {
      if (err) return done(err);

      receiver.write(Buffer.from([0x41, fragment1.length]));
      receiver.write(fragment1);

      perMessageDeflate.compress(buf, true, (err, fragment2) => {
        if (err) return done(err);

        receiver.write(Buffer.from([0x80, fragment2.length]));
        receiver.write(fragment2);
      });
    });
  });

  it("honors the 'nodebuffer' binary type", (done) => {
    const receiver = new Receiver();
    const frags = [
      crypto.randomBytes(7321),
      crypto.randomBytes(137),
      crypto.randomBytes(285787),
      crypto.randomBytes(3)
    ];

    receiver.on('message', (data, isBinary) => {
      assert.deepStrictEqual(data, Buffer.concat(frags));
      assert.ok(isBinary);
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

  it("honors the 'arraybuffer' binary type", (done) => {
    const receiver = new Receiver({ binaryType: 'arraybuffer' });
    const frags = [
      crypto.randomBytes(19221),
      crypto.randomBytes(954),
      crypto.randomBytes(623987)
    ];

    receiver.on('message', (data, isBinary) => {
      assert.ok(data instanceof ArrayBuffer);
      assert.deepStrictEqual(Buffer.from(data), Buffer.concat(frags));
      assert.ok(isBinary);
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

  it("honors the 'fragments' binary type", (done) => {
    const receiver = new Receiver({ binaryType: 'fragments' });
    const frags = [
      crypto.randomBytes(17),
      crypto.randomBytes(419872),
      crypto.randomBytes(83),
      crypto.randomBytes(9928),
      crypto.randomBytes(1)
    ];

    receiver.on('message', (data, isBinary) => {
      assert.deepStrictEqual(data, frags);
      assert.ok(isBinary);
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

  it("honors the 'blob' binary type", function (done) {
    if (!hasBlob) return this.skip();

    const receiver = new Receiver({ binaryType: 'blob' });
    const frags = [
      crypto.randomBytes(75688),
      crypto.randomBytes(2688),
      crypto.randomBytes(46753)
    ];

    receiver.on('message', (data, isBinary) => {
      assert.ok(data instanceof Blob);
      assert.ok(isBinary);

      data
        .arrayBuffer()
        .then((arrayBuffer) => {
          assert.deepStrictEqual(
            Buffer.from(arrayBuffer),
            Buffer.concat(frags)
          );

          done();
        })
        .catch(done);
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

  it('honors the `skipUTF8Validation` option (1/2)', (done) => {
    const receiver = new Receiver({ skipUTF8Validation: true });

    receiver.on('message', (data, isBinary) => {
      assert.deepStrictEqual(data, Buffer.from([0xf8]));
      assert.ok(!isBinary);
      done();
    });

    receiver.write(Buffer.from([0x81, 0x01, 0xf8]));
  });

  it('honors the `skipUTF8Validation` option (2/2)', (done) => {
    const receiver = new Receiver({ skipUTF8Validation: true });

    receiver.on('conclude', (code, data) => {
      assert.strictEqual(code, 1000);
      assert.deepStrictEqual(data, Buffer.from([0xf8]));
      done();
    });

    receiver.write(Buffer.from([0x88, 0x03, 0x03, 0xe8, 0xf8]));
  });

  it('honors the `allowSynchronousEvents` option', (done) => {
    const actual = [];
    const expected = [
      '1',
      '- 1',
      '-- 1',
      '2',
      '- 2',
      '-- 2',
      '3',
      '- 3',
      '-- 3',
      '4',
      '- 4',
      '-- 4'
    ];

    function listener(data) {
      const message = data.toString();
      actual.push(message);

      // `queueMicrotask()` is not available in Node.js < 11.
      Promise.resolve().then(() => {
        actual.push(`- ${message}`);

        Promise.resolve().then(() => {
          actual.push(`-- ${message}`);

          if (actual.length === 12) {
            assert.deepStrictEqual(actual, expected);
            done();
          }
        });
      });
    }

    const receiver = new Receiver({ allowSynchronousEvents: false });

    receiver.on('message', listener);
    receiver.on('ping', listener);
    receiver.on('pong', listener);

    receiver.write(Buffer.from('8101318901328a0133820134', 'hex'));
  });

  it('does not swallow errors thrown from event handlers', (done) => {
    const receiver = new Receiver();
    let count = 0;

    receiver.on('message', () => {
      if (++count === 2) {
        throw new Error('Oops');
      }
    });

    assert.strictEqual(
      process.listenerCount('uncaughtException'),
      EventEmitter.usingDomains ? 2 : 1
    );

    const listener = process.listeners('uncaughtException').pop();

    process.removeListener('uncaughtException', listener);
    process.once('uncaughtException', (err) => {
      assert.ok(err instanceof Error);
      assert.strictEqual(err.message, 'Oops');

      process.on('uncaughtException', listener);
      done();
    });

    setImmediate(() => {
      receiver.write(Buffer.from('82008200', 'hex'));
    });
  });
});
