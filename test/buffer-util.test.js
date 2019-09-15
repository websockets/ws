'use strict';

const assert = require('assert');

const { concat } = require('../lib/buffer-util');

describe('bufferUtil', () => {
  describe('concat', () => {
    it('never returns uninitialized data', () => {
      const buf = concat([Buffer.from([1, 2]), Buffer.from([3, 4])], 6);

      assert.ok(buf.equals(Buffer.from([1, 2, 3, 4])));
    });
  });
});
