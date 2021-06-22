'use strict';

const assert = require('assert');

const { format, parse } = require('../lib/extension');

describe('extension', () => {
  describe('parse', () => {
    it('parses a single extension', () => {
      assert.deepStrictEqual(parse('foo'), {
        foo: [{ __proto__: null }],
        __proto__: null
      });
    });

    it('parses params', () => {
      assert.deepStrictEqual(parse('foo;bar;baz=1;bar=2'), {
        foo: [{ bar: [true, '2'], baz: ['1'], __proto__: null }],
        __proto__: null
      });
    });

    it('parses multiple extensions', () => {
      assert.deepStrictEqual(parse('foo,bar;baz,foo;baz'), {
        foo: [{ __proto__: null }, { baz: [true], __proto__: null }],
        bar: [{ baz: [true], __proto__: null }],
        __proto__: null
      });
    });

    it('parses quoted params', () => {
      assert.deepStrictEqual(parse('foo;bar="hi"'), {
        foo: [{ bar: ['hi'], __proto__: null }],
        __proto__: null
      });
      assert.deepStrictEqual(parse('foo;bar="\\0"'), {
        foo: [{ bar: ['0'], __proto__: null }],
        __proto__: null
      });
      assert.deepStrictEqual(parse('foo;bar="b\\a\\z"'), {
        foo: [{ bar: ['baz'], __proto__: null }],
        __proto__: null
      });
      assert.deepStrictEqual(parse('foo;bar="b\\az";bar'), {
        foo: [{ bar: ['baz', true], __proto__: null }],
        __proto__: null
      });
      assert.throws(
        () => parse('foo;bar="baz"qux'),
        /^SyntaxError: Unexpected character at index 13$/
      );
      assert.throws(
        () => parse('foo;bar="baz" qux'),
        /^SyntaxError: Unexpected character at index 14$/
      );
    });

    it('works with names that match `Object.prototype` property names', () => {
      assert.deepStrictEqual(parse('hasOwnProperty, toString'), {
        hasOwnProperty: [{ __proto__: null }],
        toString: [{ __proto__: null }],
        __proto__: null
      });
      assert.deepStrictEqual(parse('foo;constructor'), {
        foo: [{ constructor: [true], __proto__: null }],
        __proto__: null
      });
    });

    it('ignores the optional white spaces', () => {
      const header = 'foo; bar\t; \tbaz=1\t ;  bar="1"\t\t, \tqux\t ;norf';

      assert.deepStrictEqual(parse(header), {
        foo: [{ bar: [true, '1'], baz: ['1'], __proto__: null }],
        qux: [{ norf: [true], __proto__: null }],
        __proto__: null
      });
    });

    it('throws an error if a name is empty', () => {
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
          () => parse(element[0]),
          new RegExp(
            `^SyntaxError: Unexpected character at index ${element[1]}$`
          )
        );
      });
    });

    it('throws an error if a white space is misplaced', () => {
      [
        [' foo', 0],
        ['f oo', 2],
        ['foo;ba r', 7],
        ['foo;bar =', 8],
        ['foo;bar= ', 8],
        ['foo;bar=ba z', 11]
      ].forEach((element) => {
        assert.throws(
          () => parse(element[0]),
          new RegExp(
            `^SyntaxError: Unexpected character at index ${element[1]}$`
          )
        );
      });
    });

    it('throws an error if a token contains invalid characters', () => {
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
          () => parse(element[0]),
          new RegExp(
            `^SyntaxError: Unexpected character at index ${element[1]}$`
          )
        );
      });
    });

    it('throws an error if the header value ends prematurely', () => {
      [
        '',
        'foo ',
        'foo\t',
        'foo, ',
        'foo;',
        'foo;bar ',
        'foo;bar,',
        'foo;bar; ',
        'foo;bar=',
        'foo;bar="baz',
        'foo;bar="1\\',
        'foo;bar="baz" '
      ].forEach((header) => {
        assert.throws(
          () => parse(header),
          /^SyntaxError: Unexpected end of input$/
        );
      });
    });
  });

  describe('format', () => {
    it('formats a single extension', () => {
      const extensions = format({ foo: {} });

      assert.strictEqual(extensions, 'foo');
    });

    it('formats params', () => {
      const extensions = format({ foo: { bar: [true, 2], baz: 1 } });

      assert.strictEqual(extensions, 'foo; bar; bar=2; baz=1');
    });

    it('formats multiple extensions', () => {
      const extensions = format({
        foo: [{}, { baz: true }],
        bar: { baz: true }
      });

      assert.strictEqual(extensions, 'foo, foo; baz, bar; baz');
    });
  });
});
