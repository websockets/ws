'use strict';

const assert = require('assert');

const { isValidUTF8 } = require('../lib/validation');

describe('extension', () => {
  describe('isValidUTF8', () => {
    it('returns false if it finds invalid bytes', () => {
      assert.strictEqual(isValidUTF8(Buffer.from([0xf8])), false);
    });

    it('returns false for overlong encodings', () => {
      assert.strictEqual(isValidUTF8(Buffer.from([0xc0, 0xa0])), false);
      assert.strictEqual(isValidUTF8(Buffer.from([0xe0, 0x80, 0xa0])), false);
      assert.strictEqual(
        isValidUTF8(Buffer.from([0xf0, 0x80, 0x80, 0xa0])),
        false
      );
    });

    it('returns false for code points in the range U+D800 - U+DFFF', () => {
      for (let i = 0xa0; i < 0xc0; i++) {
        for (let j = 0x80; j < 0xc0; j++) {
          assert.strictEqual(isValidUTF8(Buffer.from([0xed, i, j])), false);
        }
      }
    });

    it('returns false for code points greater than U+10FFFF', () => {
      assert.strictEqual(
        isValidUTF8(Buffer.from([0xf4, 0x90, 0x80, 0x80])),
        false
      );
      assert.strictEqual(
        isValidUTF8(Buffer.from([0xf5, 0x80, 0x80, 0x80])),
        false
      );
    });

    it('returns true for a well-formed UTF-8 byte sequence', () => {
      // prettier-ignore
      const buf = Buffer.from([
        0xe2, 0x82, 0xAC, // €
        0xf0, 0x90, 0x8c, 0x88, // 𐍈
        0x24 // $
      ]);

      assert.strictEqual(isValidUTF8(buf), true);
    });
  });
});
