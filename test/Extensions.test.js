'use strict';

const assert = require('assert');

const Extensions = require('../lib/Extensions');

describe('Extensions', function () {
  describe('parse', function () {
    it('parses a single extension', function () {
      const extensions = Extensions.parse('foo');

      assert.deepStrictEqual(extensions, { foo: [{}] });
    });

    it('parses params', function () {
      const extensions = Extensions.parse('foo; bar; baz=1; bar=2');

      assert.deepStrictEqual(extensions, {
        foo: [{ bar: [true, '2'], baz: ['1'] }]
      });
    });

    it('parse multiple extensions', function () {
      const extensions = Extensions.parse('foo, bar; baz, foo; baz');

      assert.deepStrictEqual(extensions, {
        foo: [{}, { baz: [true] }],
        bar: [{ baz: [true] }]
      });
    });

    it('parses quoted params', function () {
      const extensions = Extensions.parse('foo; bar="hi"');

      assert.deepStrictEqual(extensions, {
        foo: [{ bar: ['hi'] }]
      });
    });

    it('ignores names that match Object.prototype properties', function () {
      const parse = Extensions.parse;

      assert.deepStrictEqual(parse('hasOwnProperty, toString'), {});
      assert.deepStrictEqual(parse('foo; constructor'), { foo: [{}] });
    });
  });

  describe('format', function () {
    it('formats a single extension', function () {
      const extensions = Extensions.format({ foo: {} });

      assert.strictEqual(extensions, 'foo');
    });

    it('formats params', function () {
      const extensions = Extensions.format({ foo: { bar: [true, 2], baz: 1 } });

      assert.strictEqual(extensions, 'foo; bar; bar=2; baz=1');
    });

    it('formats multiple extensions', function () {
      const extensions = Extensions.format({
        foo: [{}, { baz: true }],
        bar: { baz: true }
      });

      assert.strictEqual(extensions, 'foo, foo; baz, bar; baz');
    });
  });
});
