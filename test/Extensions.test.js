'use strict';

const assert = require('assert');

const Extensions = require('../lib/Extensions');

describe('Extensions', function () {
  describe('parse', function () {
    it('should parse', function () {
      const extensions = Extensions.parse('foo');

      assert.deepStrictEqual(extensions, { foo: [{}] });
    });

    it('should parse params', function () {
      const extensions = Extensions.parse('foo; bar; baz=1; bar=2');

      assert.deepStrictEqual(extensions, {
        foo: [{ bar: [true, '2'], baz: ['1'] }]
      });
    });

    it('should parse multiple extensions', function () {
      const extensions = Extensions.parse('foo, bar; baz, foo; baz');

      assert.deepStrictEqual(extensions, {
        foo: [{}, { baz: [true] }],
        bar: [{ baz: [true] }]
      });
    });

    it('should parse quoted params', function () {
      const extensions = Extensions.parse('foo; bar="hi"');

      assert.deepStrictEqual(extensions, {
        foo: [{ bar: ['hi'] }]
      });
    });
  });

  describe('format', function () {
    it('should format', function () {
      const extensions = Extensions.format({ foo: {} });

      assert.strictEqual(extensions, 'foo');
    });

    it('should format params', function () {
      const extensions = Extensions.format({ foo: { bar: [true, 2], baz: 1 } });

      assert.strictEqual(extensions, 'foo; bar; bar=2; baz=1');
    });

    it('should format multiple extensions', function () {
      const extensions = Extensions.format({
        foo: [{}, { baz: true }],
        bar: { baz: true }
      });

      assert.strictEqual(extensions, 'foo, foo; baz, bar; baz');
    });
  });
});
