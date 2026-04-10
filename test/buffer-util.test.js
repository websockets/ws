import assert from 'node:assert';

import { concat } from '../lib/buffer-util.js';

describe('bufferUtil', () => {
  describe('concat', () => {
    it('never returns uninitialized data', () => {
      const buf = concat([Buffer.from([1, 2]), Buffer.from([3, 4])], 6);

      assert.ok(buf.equals(Buffer.from([1, 2, 3, 4])));
    });
  });
});
