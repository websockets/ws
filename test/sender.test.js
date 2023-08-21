'use strict';

const assert = require('assert');

const extension = require('../lib/extension');
const PerMessageDeflate = require('../lib/permessage-deflate');
const Sender = require('../lib/sender');
const { EMPTY_BUFFER } = require('../lib/constants');

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

      assert.deepStrictEqual(list[0], Buffer.from('8103e282ac', 'hex'));
    });
  });

  describe('#send', () => {
    it('compresses data if compress option is enabled', (done) => {
      let count = 0;
      const expected = Buffer.from('c104cac80400', 'hex');
      const mockSocket = new MockSocket({
        write: (chunk) => {
          assert.deepStrictEqual(chunk, expected);
          if (++count === 3) done();
        }
      });
      const perMessageDeflate = new PerMessageDeflate();
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
        const perMessageDeflate = new PerMessageDeflate();
        const mockSocket = new MockSocket({
          write: (chunk) => {
            assert.deepStrictEqual(chunk, Buffer.from('81026869', 'hex'));
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
        let count = 0;
        const mockSocket = new MockSocket({
          write: (chunk) => {
            if (++count === 1) {
              assert.deepStrictEqual(
                chunk,
                Buffer.from('410932343206000000ffff', 'hex')
              );
            } else {
              assert.deepStrictEqual(chunk, Buffer.from('800432340200', 'hex'));
              done();
            }
          }
        });
        const perMessageDeflate = new PerMessageDeflate({ threshold: 3 });
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
        let count = 0;
        const mockSocket = new MockSocket({
          write: (chunk) => {
            if (++count === 1) {
              assert.deepStrictEqual(chunk, Buffer.from('01023132', 'hex'));
            } else {
              assert.deepStrictEqual(chunk, Buffer.from('8003313233', 'hex'));
              done();
            }
          }
        });
        const perMessageDeflate = new PerMessageDeflate({ threshold: 3 });
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
        let count = 0;
        const mockSocket = new MockSocket({
          write: (chunk) => {
            if (++count === 1) {
              assert.deepStrictEqual(
                chunk,
                Buffer.from('4105000000ffff', 'hex')
              );
            } else {
              assert.deepStrictEqual(
                chunk,
                Buffer.from('80064a492c490400', 'hex')
              );
              done();
            }
          }
        });
        const perMessageDeflate = new PerMessageDeflate({ threshold: 0 });
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
        let count = 0;
        const mockSocket = new MockSocket({
          write: (chunk) => {
            if (++count === 1) {
              assert.deepStrictEqual(
                chunk,
                Buffer.from('410a4a492c4904000000ffff', 'hex')
              );
            } else {
              assert.deepStrictEqual(chunk, Buffer.from('800100', 'hex'));
              done();
            }
          }
        });
        const perMessageDeflate = new PerMessageDeflate({ threshold: 0 });
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
    it('works with multiple types of data', (done) => {
      const perMessageDeflate = new PerMessageDeflate();
      let count = 0;
      const mockSocket = new MockSocket({
        write: (data) => {
          if (++count > 1) {
            assert.deepStrictEqual(data, Buffer.from('89026869', 'hex'));
            if (count === 4) done();
          }
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
      const perMessageDeflate = new PerMessageDeflate();
      let count = 0;
      const mockSocket = new MockSocket({
        write: (data) => {
          if (++count === 1) return;

          assert.deepStrictEqual(data, Buffer.from('8a026869', 'hex'));

          if (count === 4) done();
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
        assert.strictEqual(count, 4);
        done();
      });
    });
  });
});
