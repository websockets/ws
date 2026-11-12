'use strict';

const assert = require('assert');
const vm = require('vm');

const { concat, toBuffer } = require('../lib/buffer-util');

describe('bufferUtil', () => {
  describe('concat', () => {
    it('never returns uninitialized data', () => {
      const buf = concat([Buffer.from([1, 2]), Buffer.from([3, 4])], 6);

      assert.ok(buf.equals(Buffer.from([1, 2, 3, 4])));
    });
  });

  describe('toBuffer', () => {
    it('sets `readOnly` to `false` if the data is copied', () => {
      for (const data of ['foo', [1, 2, 3]]) {
        const buf = toBuffer(data);

        assert.ok(buf.equals(Buffer.from(data)));
        assert.strictEqual(toBuffer.readOnly, false);
      }
    });

    it('sets `readOnly` to `true` if the data might be shared', () => {
      const arrayBuffer = new ArrayBuffer(4);

      for (const data of [
        Buffer.alloc(4),
        arrayBuffer,
        new Uint16Array(arrayBuffer),
        new SharedArrayBuffer(4),
        vm.runInNewContext('new ArrayBuffer(4)'),
        { valueOf: () => arrayBuffer }
      ]) {
        const buf = toBuffer(data);

        assert.strictEqual(buf.length, 4);
        assert.strictEqual(toBuffer.readOnly, true);
      }
    });
  });
});
