'use strict';

const assert = require('assert');

const PerMessageDeflate = require('../lib/permessage-deflate');
const Sender = require('../lib/sender');

class MockSocket {
  constructor({ write } = {}) {
    this.readable = true;
    this.writable = true;

    if (write) this.write = write;
  }

  cork() {}
  write() {}
  uncork() {}
}

describe('Sender', () => {
  describe('.frame', () => {
    it('does not mutate the input buffer if data is `readOnly`', () => {
      const buf = Buffer.from([1, 2, 3, 4, 5]);

      Sender.frame(buf, {
        readOnly: true,
        rsv1: false,
        mask: true,
        opcode: 2,
        fin: true
      });

      assert.ok(buf.equals(Buffer.from([1, 2, 3, 4, 5])));
    });

    it('sets RSV1 bit if compressed', () => {
      const list = Sender.frame(Buffer.from('hi'), {
        readOnly: false,
        mask: false,
        rsv1: true,
        opcode: 1,
        fin: true
      });

      assert.strictEqual(list[0][0] & 0x40, 0x40);
    });
  });

  describe('#send', () => {
    it('compresses data if compress option is enabled', (done) => {
      const perMessageDeflate = new PerMessageDeflate({ threshold: 0 });
      let count = 0;
      const mockSocket = new MockSocket({
        write: (data) => {
          assert.strictEqual(data[0] & 0x40, 0x40);
          if (++count === 3) done();
        }
      });
      const sender = new Sender(mockSocket, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      const options = { compress: true, fin: true };
      const array = new Uint8Array([0x68, 0x69]);

      sender.send(array.buffer, options);
      sender.send(array, options);
      sender.send('hi', options);
    });

    it('does not compress data for small payloads', (done) => {
      const perMessageDeflate = new PerMessageDeflate();
      const mockSocket = new MockSocket({
        write: (data) => {
          assert.notStrictEqual(data[0] & 0x40, 0x40);
          done();
        }
      });
      const sender = new Sender(mockSocket, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      sender.send('hi', { compress: true, fin: true });
    });

    it('compresses all frames in a fragmented message', (done) => {
      const chunks = [];
      const perMessageDeflate = new PerMessageDeflate({ threshold: 3 });
      const mockSocket = new MockSocket({
        write: (chunk) => {
          chunks.push(chunk);
          if (chunks.length !== 4) return;

          assert.strictEqual(chunks[0].length, 2);
          assert.strictEqual(chunks[0][0] & 0x40, 0x40);
          assert.strictEqual(chunks[1].length, 9);

          assert.strictEqual(chunks[2].length, 2);
          assert.strictEqual(chunks[2][0] & 0x40, 0x00);
          assert.strictEqual(chunks[3].length, 4);
          done();
        }
      });
      const sender = new Sender(mockSocket, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      sender.send('123', { compress: true, fin: false });
      sender.send('12', { compress: true, fin: true });
    });

    it('compresses no frames in a fragmented message', (done) => {
      const chunks = [];
      const perMessageDeflate = new PerMessageDeflate({ threshold: 3 });
      const mockSocket = new MockSocket({
        write: (chunk) => {
          chunks.push(chunk);
          if (chunks.length !== 4) return;

          assert.strictEqual(chunks[0].length, 2);
          assert.strictEqual(chunks[0][0] & 0x40, 0x00);
          assert.strictEqual(chunks[1].length, 2);

          assert.strictEqual(chunks[2].length, 2);
          assert.strictEqual(chunks[2][0] & 0x40, 0x00);
          assert.strictEqual(chunks[3].length, 3);
          done();
        }
      });
      const sender = new Sender(mockSocket, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      sender.send('12', { compress: true, fin: false });
      sender.send('123', { compress: true, fin: true });
    });

    it('compresses empty buffer as first fragment', (done) => {
      const chunks = [];
      const perMessageDeflate = new PerMessageDeflate({ threshold: 0 });
      const mockSocket = new MockSocket({
        write: (chunk) => {
          chunks.push(chunk);
          if (chunks.length !== 4) return;

          assert.strictEqual(chunks[0].length, 2);
          assert.strictEqual(chunks[0][0] & 0x40, 0x40);
          assert.strictEqual(chunks[1].length, 5);

          assert.strictEqual(chunks[2].length, 2);
          assert.strictEqual(chunks[2][0] & 0x40, 0x00);
          assert.strictEqual(chunks[3].length, 6);
          done();
        }
      });
      const sender = new Sender(mockSocket, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      sender.send(Buffer.alloc(0), { compress: true, fin: false });
      sender.send('data', { compress: true, fin: true });
    });

    it('compresses empty buffer as last fragment', (done) => {
      const chunks = [];
      const perMessageDeflate = new PerMessageDeflate({ threshold: 0 });
      const mockSocket = new MockSocket({
        write: (chunk) => {
          chunks.push(chunk);
          if (chunks.length !== 4) return;

          assert.strictEqual(chunks[0].length, 2);
          assert.strictEqual(chunks[0][0] & 0x40, 0x40);
          assert.strictEqual(chunks[1].length, 10);

          assert.strictEqual(chunks[2].length, 2);
          assert.strictEqual(chunks[2][0] & 0x40, 0x00);
          assert.strictEqual(chunks[3].length, 1);
          done();
        }
      });
      const sender = new Sender(mockSocket, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      sender.send('data', { compress: true, fin: false });
      sender.send(Buffer.alloc(0), { compress: true, fin: true });
    });
  });

  describe('#ping', () => {
    it('works with multiple types of data', (done) => {
      const perMessageDeflate = new PerMessageDeflate({ threshold: 0 });
      let count = 0;
      const mockSocket = new MockSocket({
        write: (data) => {
          if (++count < 3) return;

          if (count % 2) {
            assert.ok(data.equals(Buffer.from([0x89, 0x02])));
          } else {
            assert.ok(data.equals(Buffer.from([0x68, 0x69])));
          }

          if (count === 8) done();
        }
      });
      const sender = new Sender(mockSocket, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      const array = new Uint8Array([0x68, 0x69]);

      sender.send('foo', { compress: true, fin: true });
      sender.ping(array.buffer, false);
      sender.ping(array, false);
      sender.ping('hi', false);
    });
  });

  describe('#pong', () => {
    it('works with multiple types of data', (done) => {
      const perMessageDeflate = new PerMessageDeflate({ threshold: 0 });
      let count = 0;
      const mockSocket = new MockSocket({
        write: (data) => {
          if (++count < 3) return;

          if (count % 2) {
            assert.ok(data.equals(Buffer.from([0x8a, 0x02])));
          } else {
            assert.ok(data.equals(Buffer.from([0x68, 0x69])));
          }

          if (count === 8) done();
        }
      });
      const sender = new Sender(mockSocket, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      const array = new Uint8Array([0x68, 0x69]);

      sender.send('foo', { compress: true, fin: true });
      sender.pong(array.buffer, false);
      sender.pong(array, false);
      sender.pong('hi', false);
    });
  });

  describe('#close', () => {
    it('should consume all data before closing', (done) => {
      const perMessageDeflate = new PerMessageDeflate({ threshold: 0 });

      let count = 0;
      const mockSocket = new MockSocket({
        write: (data, cb) => {
          count++;
          if (cb) cb();
        }
      });
      const sender = new Sender(mockSocket, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      sender.send('foo', { compress: true, fin: true });
      sender.send('bar', { compress: true, fin: true });
      sender.send('baz', { compress: true, fin: true });

      sender.close(1000, undefined, false, () => {
        assert.strictEqual(count, 8);
        done();
      });
    });
  });
});
