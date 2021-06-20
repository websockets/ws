'use strict';

const assert = require('assert');

const { parse } = require('../lib/subprotocol');

describe('subprotocol', () => {
  describe('parse', () => {
    it('parses a single subprotocol', () => {
      assert.deepStrictEqual(parse('foo'), new Set(['foo']));
    });

    it('parses multiple subprotocols', () => {
      assert.deepStrictEqual(
        parse('foo,bar,baz'),
        new Set(['foo', 'bar', 'baz'])
      );
    });

    it('ignores the optional white spaces', () => {
      const header = 'foo , bar\t, \tbaz\t ,  qux\t\t,norf';

      assert.deepStrictEqual(
        parse(header),
        new Set(['foo', 'bar', 'baz', 'qux', 'norf'])
      );
    });

    it('throws an error if a subprotocol is empty', () => {
      [
        [',', 0],
        ['foo,,', 4],
        ['foo,  ,', 6]
      ].forEach((element) => {
        assert.throws(
          () => parse(element[0]),
          new RegExp(
            `^SyntaxError: Unexpected character at index ${element[1]}$`
          )
        );
      });
    });

    it('throws an error if a subprotocol is duplicated', () => {
      ['foo,foo,bar', 'foo,bar,foo'].forEach((header) => {
        assert.throws(
          () => parse(header),
          /^SyntaxError: The "foo" subprotocol is duplicated$/
        );
      });
    });

    it('throws an error if a white space is misplaced', () => {
      [
        ['f oo', 2],
        [' foo', 0]
      ].forEach((element) => {
        assert.throws(
          () => parse(element[0]),
          new RegExp(
            `^SyntaxError: Unexpected character at index ${element[1]}$`
          )
        );
      });
    });

    it('throws an error if a subprotocol contains invalid characters', () => {
      [
        ['f@o', 1],
        ['f\\oo', 1],
        ['foo,b@r', 5]
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
      ['foo ', 'foo, ', 'foo,bar ', 'foo,bar,'].forEach((header) => {
        assert.throws(
          () => parse(header),
          /^SyntaxError: Unexpected end of input$/
        );
      });
    });
  });
});
