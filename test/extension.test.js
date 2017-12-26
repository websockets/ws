'use strict';

const assert = require('assert');

const extension = require('../lib/extension');

describe('extension', function () {
  describe('parse', function () {
    it('returns an empty object if the argument is `undefined`', function () {
      assert.deepStrictEqual(extension.parse(), {});
      assert.deepStrictEqual(extension.parse(''), {});
    });

    it('parses a single extension', function () {
      const extensions = extension.parse('foo');

      assert.deepStrictEqual(extensions, { foo: [{}] });
    });

    it('parses params', function () {
      const extensions = extension.parse('foo;bar;baz=1;bar=2');

      assert.deepStrictEqual(extensions, {
        foo: [{ bar: [true, '2'], baz: ['1'] }]
      });
    });

    it('parses multiple extensions', function () {
      const extensions = extension.parse('foo,bar;baz,foo;baz');

      assert.deepStrictEqual(extensions, {
        foo: [{}, { baz: [true] }],
        bar: [{ baz: [true] }]
      });
    });

    it('parses quoted params', function () {
      assert.deepStrictEqual(extension.parse('foo;bar="hi"'), {
        foo: [{ bar: ['hi'] }]
      });
      assert.deepStrictEqual(extension.parse('foo;bar="\\0"'), {
        foo: [{ bar: ['0'] }]
      });
      assert.deepStrictEqual(extension.parse('foo;bar="b\\a\\z"'), {
        foo: [{ bar: ['baz'] }]
      });
      assert.deepStrictEqual(extension.parse('foo;bar="b\\az";bar'), {
        foo: [{ bar: ['baz', true] }]
      });
      assert.throws(
        () => extension.parse('foo;bar="baz"qux'),
        /^SyntaxError: Unexpected character at index 13$/
      );
      assert.throws(
        () => extension.parse('foo;bar="baz" qux'),
        /^SyntaxError: Unexpected character at index 14$/
      );
    });

    it('works with names that match `Object.prototype` property names', function () {
      const parse = extension.parse;

      assert.deepStrictEqual(parse('hasOwnProperty, toString'), {
        hasOwnProperty: [{}],
        toString: [{}]
      });
      assert.deepStrictEqual(parse('foo;constructor'), {
        foo: [{ constructor: [true] }]
      });
    });

    it('ignores the optional white spaces', function () {
      const header = 'foo; bar\t; \tbaz=1\t ;  bar="1"\t\t, \tqux\t ;norf ';

      assert.deepStrictEqual(extension.parse(header), {
        foo: [{ bar: [true, '1'], baz: ['1'] }],
        qux: [{ norf: [true] }]
      });
    });

    it('throws an error if a name is empty', function () {
      [
        [',', 0],
        ['foo,,', 4],
        ['foo,  ,', 6],
        ['foo;=', 4],
        ['foo; =', 5],
        ['foo;;', 4],
        ['foo; ;', 5],
        ['foo;bar=,', 8],
        ['foo;bar=""', 9]
      ].forEach((element) => {
        assert.throws(
          () => extension.parse(element[0]),
          new RegExp(`^SyntaxError: Unexpected character at index ${element[1]}$`)
        );
      });
    });

    it('throws an error if a white space is misplaced', function () {
      [
        ['f oo', 2],
        ['foo;ba r', 7],
        ['foo;bar =', 8],
        ['foo;bar= ', 8]
      ].forEach((element) => {
        assert.throws(
          () => extension.parse(element[0]),
          new RegExp(`^SyntaxError: Unexpected character at index ${element[1]}$`)
        );
      });
    });

    it('throws an error if a token contains invalid characters', function () {
      [
        ['f@o', 1],
        ['f\\oo', 1],
        ['"foo"', 0],
        ['f"oo"', 1],
        ['foo;b@r', 5],
        ['foo;b\\ar', 5],
        ['foo;"bar"', 4],
        ['foo;b"ar"', 5],
        ['foo;bar=b@z', 9],
        ['foo;bar=b\\az ', 9],
        ['foo;bar="b@z"', 10],
        ['foo;bar="baz;"', 12],
        ['foo;bar=b"az"', 9],
        ['foo;bar="\\\\"', 10]
      ].forEach((element) => {
        assert.throws(
          () => extension.parse(element[0]),
          new RegExp(`^SyntaxError: Unexpected character at index ${element[1]}$`)
        );
      });
    });

    it('throws an error if the header value ends prematurely', function () {
      [
        'foo, ',
        'foo;',
        'foo;bar,',
        'foo;bar; ',
        'foo;bar=',
        'foo;bar="baz',
        'foo;bar="1\\'
      ].forEach((header) => {
        assert.throws(
          () => extension.parse(header),
          /^SyntaxError: Unexpected end of input$/
        );
      });
    });
  });

  describe('format', function () {
    it('formats a single extension', function () {
      const extensions = extension.format({ foo: {} });

      assert.strictEqual(extensions, 'foo');
    });

    it('formats params', function () {
      const extensions = extension.format({ foo: { bar: [true, 2], baz: 1 } });

      assert.strictEqual(extensions, 'foo; bar; bar=2; baz=1');
    });

    it('formats multiple extensions', function () {
      const extensions = extension.format({
        foo: [{}, { baz: true }],
        bar: { baz: true }
      });

      assert.strictEqual(extensions, 'foo, foo; baz, bar; baz');
    });
  });
});
