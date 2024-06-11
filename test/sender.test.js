'use strict';

const assert = require('assert');

const extension = require('../lib/extension');
const PerMessageDeflate = require('../lib/permessage-deflate');
const Sender = require('../lib/sender');
const { EMPTY_BUFFER, hasBlob } = require('../lib/constants');

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

    it('honors the `rsv1` option', () => {
      const list = Sender.frame(EMPTY_BUFFER, {
        readOnly: false,
        mask: false,
        rsv1: true,
        opcode: 1,
        fin: true
      });

      assert.strictEqual(list[0][0] & 0x40, 0x40);
    });

    it('accepts a string as first argument', () => {
      const list = Sender.frame('€', {
        readOnly: false,
        rsv1: false,
        mask: false,
        opcode: 1,
        fin: true
      });

      assert.deepStrictEqual(list[0], Buffer.from('8103', 'hex'));
      assert.deepStrictEqual(list[1], Buffer.from('e282ac', 'hex'));
    });
  });

  describe('#send', () => {
    it('compresses data if compress option is enabled', (done) => {
      const chunks = [];
      const perMessageDeflate = new PerMessageDeflate();
      const mockSocket = new MockSocket({
        write: (chunk) => {
          chunks.push(chunk);
          if (chunks.length !== 6) return;

          assert.strictEqual(chunks[0].length, 2);
          assert.strictEqual(chunks[0][0] & 0x40, 0x40);

          assert.strictEqual(chunks[2].length, 2);
          assert.strictEqual(chunks[2][0] & 0x40, 0x40);

          assert.strictEqual(chunks[4].length, 2);
          assert.strictEqual(chunks[4][0] & 0x40, 0x40);
          done();
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

    describe('when context takeover is disabled', () => {
      it('honors the compression threshold', (done) => {
        const chunks = [];
        const perMessageDeflate = new PerMessageDeflate();
        const mockSocket = new MockSocket({
          write: (chunk) => {
            chunks.push(chunk);
            if (chunks.length !== 2) return;

            assert.strictEqual(chunks[0].length, 2);
            assert.notStrictEqual(chunk[0][0] & 0x40, 0x40);
            assert.strictEqual(chunks[1], 'hi');
            done();
          }
        });
        const sender = new Sender(mockSocket, {
          'permessage-deflate': perMessageDeflate
        });
        const extensions = extension.parse(
          'permessage-deflate; client_no_context_takeover'
        );

        perMessageDeflate.accept(extensions['permessage-deflate']);

        sender.send('hi', { compress: true, fin: true });
      });

      it('compresses all fragments of a fragmented message', (done) => {
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
        const extensions = extension.parse(
          'permessage-deflate; client_no_context_takeover'
        );

        perMessageDeflate.accept(extensions['permessage-deflate']);

        sender.send('123', { compress: true, fin: false });
        sender.send('12', { compress: true, fin: true });
      });

      it('does not compress any fragments of a fragmented message', (done) => {
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
        const extensions = extension.parse(
          'permessage-deflate; client_no_context_takeover'
        );

        perMessageDeflate.accept(extensions['permessage-deflate']);

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
        const extensions = extension.parse(
          'permessage-deflate; client_no_context_takeover'
        );

        perMessageDeflate.accept(extensions['permessage-deflate']);

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
        const extensions = extension.parse(
          'permessage-deflate; client_no_context_takeover'
        );

        perMessageDeflate.accept(extensions['permessage-deflate']);

        sender.send('data', { compress: true, fin: false });
        sender.send(Buffer.alloc(0), { compress: true, fin: true });
      });
    });
  });

  describe('#ping', () => {
    it('can send a string as ping payload', (done) => {
      const perMessageDeflate = new PerMessageDeflate();
      let count = 0;
      const mockSocket = new MockSocket({
        write: (data) => {
          if (++count < 3) return;

          if (count === 3) {
            assert.deepStrictEqual(data, Buffer.from([0x89, 0x02]));
          } else {
            assert.strictEqual(data, 'hi');
            done();
          }
        }
      });
      const sender = new Sender(mockSocket, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      sender.send('foo', { compress: true, fin: true });
      sender.ping('hi', false);
    });

    it('can send a `TypedArray` as ping payload', (done) => {
      let count = 0;
      const mockSocket = new MockSocket({
        write: (data) => {
          if (++count === 1) {
            assert.deepStrictEqual(data, Buffer.from([0x89, 0x02]));
          } else {
            assert.deepStrictEqual(data, Buffer.from([0x68, 0x69]));
            done();
          }
        }
      });

      const sender = new Sender(mockSocket);
      const array = new Uint8Array([0x68, 0x69]);

      sender.ping(array, false);
    });

    it('can send an `ArrayBuffer` as ping payload', (done) => {
      let count = 0;
      const mockSocket = new MockSocket({
        write: (data) => {
          if (++count === 1) {
            assert.deepStrictEqual(data, Buffer.from([0x89, 0x02]));
          } else {
            assert.deepStrictEqual(data, Buffer.from([0x68, 0x69]));
            done();
          }
        }
      });

      const sender = new Sender(mockSocket);
      const array = new Uint8Array([0x68, 0x69]);

      sender.ping(array.buffer, false);
    });

    it('can send a `Blob` as ping payload', function (done) {
      if (!hasBlob) return this.skip();

      let count = 0;
      const mockSocket = new MockSocket({
        write: (data) => {
          if (++count % 2) {
            assert.deepStrictEqual(data, Buffer.from([0x89, 0x02]));
          } else {
            assert.deepStrictEqual(data, Buffer.from([0x68, 0x69]));
            if (count === 4) done();
          }
        }
      });

      const sender = new Sender(mockSocket);
      const blob = new Blob(['hi']);

      sender.ping(blob, false);
      sender.ping(blob, false);
    });
  });

  describe('#pong', () => {
    it('can send a string as ping payload', (done) => {
      const perMessageDeflate = new PerMessageDeflate();
      let count = 0;
      const mockSocket = new MockSocket({
        write: (data) => {
          if (++count < 3) return;

          if (count === 3) {
            assert.deepStrictEqual(data, Buffer.from([0x8a, 0x02]));
          } else {
            assert.strictEqual(data, 'hi');
            done();
          }
        }
      });
      const sender = new Sender(mockSocket, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      sender.send('foo', { compress: true, fin: true });
      sender.pong('hi', false);
    });

    it('can send a `TypedArray` as ping payload', (done) => {
      let count = 0;
      const mockSocket = new MockSocket({
        write: (data) => {
          if (++count === 1) {
            assert.deepStrictEqual(data, Buffer.from([0x8a, 0x02]));
          } else {
            assert.deepStrictEqual(data, Buffer.from([0x68, 0x69]));
            done();
          }
        }
      });

      const sender = new Sender(mockSocket);
      const array = new Uint8Array([0x68, 0x69]);

      sender.pong(array, false);
    });

    it('can send an `ArrayBuffer` as ping payload', (done) => {
      let count = 0;
      const mockSocket = new MockSocket({
        write: (data) => {
          if (++count === 1) {
            assert.deepStrictEqual(data, Buffer.from([0x8a, 0x02]));
          } else {
            assert.deepStrictEqual(data, Buffer.from([0x68, 0x69]));
            done();
          }
        }
      });

      const sender = new Sender(mockSocket);
      const array = new Uint8Array([0x68, 0x69]);

      sender.pong(array.buffer, false);
    });

    it('can send a `Blob` as ping payload', function (done) {
      if (!hasBlob) return this.skip();

      let count = 0;
      const mockSocket = new MockSocket({
        write: (data) => {
          if (++count % 2) {
            assert.deepStrictEqual(data, Buffer.from([0x8a, 0x02]));
          } else {
            assert.deepStrictEqual(data, Buffer.from([0x68, 0x69]));
            if (count === 4) done();
          }
        }
      });

      const sender = new Sender(mockSocket);
      const blob = new Blob(['hi']);

      sender.pong(blob, false);
      sender.pong(blob, false);
    });
  });

  describe('#close', () => {
    it('throws an error if the first argument is invalid', () => {
      const mockSocket = new MockSocket();
      const sender = new Sender(mockSocket);

      assert.throws(
        () => sender.close('error'),
        /^TypeError: First argument must be a valid error code number$/
      );

      assert.throws(
        () => sender.close(1004),
        /^TypeError: First argument must be a valid error code number$/
      );
    });

    it('throws an error if the message is greater than 123 bytes', () => {
      const mockSocket = new MockSocket();
      const sender = new Sender(mockSocket);

      assert.throws(
        () => sender.close(1000, 'a'.repeat(124)),
        /^RangeError: The message must not be greater than 123 bytes$/
      );
    });

    it('should consume all data before closing', (done) => {
      const perMessageDeflate = new PerMessageDeflate();

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
