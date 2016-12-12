'use strict';

const assert = require('assert');

const PerMessageDeflate = require('../lib/PerMessageDeflate');
const Sender = require('../lib/Sender');

describe('Sender', function () {
  describe('#ctor', function () {
    it('throws TypeError when called without new', function () {
      assert.throws(Sender, TypeError);
    });
  });

  describe('#frameAndSend', function () {
    it('does not modify a masked binary buffer', function () {
      const sender = new Sender({ write: () => {} });
      const buf = Buffer.from([1, 2, 3, 4, 5]);

      sender.frameAndSend(buf, {
        readOnly: true,
        rsv1: false,
        mask: true,
        opcode: 2,
        fin: true
      });

      assert.ok(buf.equals(Buffer.from([1, 2, 3, 4, 5])));
    });

    it('does not modify a masked text buffer', function () {
      const sender = new Sender({ write: () => {} });
      const text = Buffer.from('hi there');

      sender.frameAndSend(text, {
        readOnly: true,
        rsv1: false,
        mask: true,
        opcode: 1,
        fin: true
      });

      assert.ok(text.equals(Buffer.from('hi there')));
    });

    it('sets RSV1 bit if compressed', function (done) {
      const sender = new Sender({
        write: (data) => {
          assert.strictEqual(data[0] & 0x40, 0x40);
          done();
        }
      });

      sender.frameAndSend(Buffer.from('hi'), {
        readOnly: false,
        mask: false,
        rsv1: true,
        opcode: 1,
        fin: true
      });
    });
  });

  describe('#ping', function () {
    it('works with multiple types of data', function (done) {
      let count = 0;
      const sender = new Sender({
        write: (data) => {
          if (++count < 4) {
            assert.ok(data.equals(Buffer.from([0x89, 0x02, 0x68, 0x69])));
          } else {
            assert.ok(data.equals(Buffer.from([0x89, 0x02, 0x31, 0x30])));
            done();
          }
        }
      });

      const array = new Uint8Array([0x68, 0x69]);
      const options = { mask: false };

      sender.ping(array.buffer, options);
      sender.ping(array, options);
      sender.ping('hi', options);
      sender.ping(10, options);
    });
  });

  describe('#send', function () {
    it('compresses data if compress option is enabled', function (done) {
      const perMessageDeflate = new PerMessageDeflate({ threshold: 0 });
      let count = 0;
      const sender = new Sender({
        write: (data) => {
          assert.strictEqual(data[0] & 0x40, 0x40);
          if (++count === 4) done();
        }
      }, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      const options = { compress: true, fin: true };
      const array = new Uint8Array([0x68, 0x69]);

      sender.send(array.buffer, options);
      sender.send(array, options);
      sender.send('hi', options);
      sender.send(100, options);
    });

    it('does not compress data for small payloads', function (done) {
      const perMessageDeflate = new PerMessageDeflate();
      const sender = new Sender({
        write: (data) => {
          assert.notStrictEqual(data[0] & 0x40, 0x40);
          done();
        }
      }, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      sender.send('hi', { compress: true, fin: true });
    });

    it('compresses all frames in a fragmented message', function (done) {
      const fragments = [];
      const perMessageDeflate = new PerMessageDeflate({ threshold: 3 });
      const sender = new Sender({
        write: (data) => {
          fragments.push(data);
          if (fragments.length !== 2) return;

          assert.strictEqual(fragments[0][0] & 0x40, 0x40);
          assert.strictEqual(fragments[0].length, 11);
          assert.strictEqual(fragments[1][0] & 0x40, 0x00);
          assert.strictEqual(fragments[1].length, 6);
          done();
        }
      }, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      sender.send('123', { compress: true, fin: false });
      sender.send('12', { compress: true, fin: true });
    });

    it('compresses no frames in a fragmented message', function (done) {
      const fragments = [];
      const perMessageDeflate = new PerMessageDeflate({ threshold: 3 });
      const sender = new Sender({
        write: (data) => {
          fragments.push(data);
          if (fragments.length !== 2) return;

          assert.strictEqual(fragments[0][0] & 0x40, 0x00);
          assert.strictEqual(fragments[0].length, 4);
          assert.strictEqual(fragments[1][0] & 0x40, 0x00);
          assert.strictEqual(fragments[1].length, 5);
          done();
        }
      }, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      sender.send('12', { compress: true, fin: false });
      sender.send('123', { compress: true, fin: true });
    });

    it('compresses null as first fragment', function (done) {
      const fragments = [];
      const perMessageDeflate = new PerMessageDeflate({ threshold: 0 });
      const sender = new Sender({
        write: (data) => {
          fragments.push(data);
          if (fragments.length !== 2) return;

          assert.strictEqual(fragments[0][0] & 0x40, 0x40);
          assert.strictEqual(fragments[0].length, 3);
          assert.strictEqual(fragments[1][0] & 0x40, 0x00);
          assert.strictEqual(fragments[1].length, 8);
          done();
        }
      }, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      sender.send(null, { compress: true, fin: false });
      sender.send('data', { compress: true, fin: true });
    });

    it('compresses empty buffer as first fragment', function (done) {
      const fragments = [];
      const perMessageDeflate = new PerMessageDeflate({ threshold: 0 });
      const sender = new Sender({
        write: (data) => {
          fragments.push(data);
          if (fragments.length !== 2) return;

          assert.strictEqual(fragments[0][0] & 0x40, 0x40);
          assert.strictEqual(fragments[0].length, 3);
          assert.strictEqual(fragments[1][0] & 0x40, 0x00);
          assert.strictEqual(fragments[1].length, 8);
          done();
        }
      }, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      sender.send(Buffer.alloc(0), { compress: true, fin: false });
      sender.send('data', { compress: true, fin: true });
    });

    it('compresses null last fragment', function (done) {
      const fragments = [];
      const perMessageDeflate = new PerMessageDeflate({ threshold: 0 });
      const sender = new Sender({
        write: (data) => {
          fragments.push(data);
          if (fragments.length !== 2) return;

          assert.strictEqual(fragments[0][0] & 0x40, 0x40);
          assert.strictEqual(fragments[0].length, 12);
          assert.strictEqual(fragments[1][0] & 0x40, 0x00);
          assert.strictEqual(fragments[1].length, 3);
          done();
        }
      }, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      sender.send('data', { compress: true, fin: false });
      sender.send(null, { compress: true, fin: true });
    });

    it('compresses empty buffer as last fragment', function (done) {
      const fragments = [];
      const perMessageDeflate = new PerMessageDeflate({ threshold: 0 });
      const sender = new Sender({
        write: (data) => {
          fragments.push(data);
          if (fragments.length !== 2) return;

          assert.strictEqual(fragments[0][0] & 0x40, 0x40);
          assert.strictEqual(fragments[0].length, 12);
          assert.strictEqual(fragments[1][0] & 0x40, 0x00);
          assert.strictEqual(fragments[1].length, 3);
          done();
        }
      }, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      sender.send('data', { compress: true, fin: false });
      sender.send(Buffer.alloc(0), { compress: true, fin: true });
    });

    it('handles many send calls while processing without crashing on flush', function (done) {
      let count = 0;
      const perMessageDeflate = new PerMessageDeflate();
      const sender = new Sender({
        write: () => {
          if (++count > 1e4) done();
        }
      }, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      for (let i = 0; i < 1e4; i++) {
        sender.processing = true;
        sender.send('hi', { compress: false, fin: true });
      }

      sender.processing = false;
      sender.send('hi', { compress: false, fin: true });
    });
  });

  describe('#close', function () {
    it('should consume all data before closing', function (done) {
      const perMessageDeflate = new PerMessageDeflate({ threshold: 0 });

      let count = 0;
      const sender = new Sender({
        write: (data, cb) => {
          count++;
          if (cb) cb();
        }
      }, {
        'permessage-deflate': perMessageDeflate
      });

      perMessageDeflate.accept([{}]);

      sender.send('foo', { compress: true, fin: true });
      sender.send('bar', { compress: true, fin: true });
      sender.send('baz', { compress: true, fin: true });

      sender.close(1000, null, false, () => {
        assert.strictEqual(count, 4);
        done();
      });
    });
  });
});
