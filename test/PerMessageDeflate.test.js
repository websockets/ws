'use strict';

const assert = require('assert');

const PerMessageDeflate = require('../lib/PerMessageDeflate');
const Extensions = require('../lib/Extensions');

describe('PerMessageDeflate', function () {
  describe('#ctor', function () {
    it('throws TypeError when called without new', function () {
      assert.throws(PerMessageDeflate, TypeError);
    });
  });

  describe('#offer', function () {
    it('should create default params', function () {
      const perMessageDeflate = new PerMessageDeflate();

      assert.deepStrictEqual(
        perMessageDeflate.offer(),
        { client_max_window_bits: true }
      );
    });

    it('should create params from options', function () {
      const perMessageDeflate = new PerMessageDeflate({
        serverNoContextTakeover: true,
        clientNoContextTakeover: true,
        serverMaxWindowBits: 10,
        clientMaxWindowBits: 11
      });

      assert.deepStrictEqual(perMessageDeflate.offer(), {
        server_no_context_takeover: true,
        client_no_context_takeover: true,
        server_max_window_bits: 10,
        client_max_window_bits: 11
      });
    });
  });

  describe('#accept', function () {
    describe('as server', function () {
      it('should accept empty offer', function () {
        const perMessageDeflate = new PerMessageDeflate({}, true);

        assert.deepStrictEqual(perMessageDeflate.accept([{}]), {});
      });

      it('should accept offer', function () {
        const perMessageDeflate = new PerMessageDeflate({}, true);
        const extensions = Extensions.parse(
          'permessage-deflate; server_no_context_takeover; ' +
          'client_no_context_takeover; server_max_window_bits=10; ' +
          'client_max_window_bits=11'
        );

        assert.deepStrictEqual(perMessageDeflate.accept(extensions['permessage-deflate']), {
          server_no_context_takeover: true,
          client_no_context_takeover: true,
          server_max_window_bits: 10,
          client_max_window_bits: 11
        });
      });

      it('should prefer configuration than offer', function () {
        const perMessageDeflate = new PerMessageDeflate({
          serverNoContextTakeover: true,
          clientNoContextTakeover: true,
          serverMaxWindowBits: 12,
          clientMaxWindowBits: 11
        }, true);
        const extensions = Extensions.parse(
          'permessage-deflate; server_max_window_bits=14; client_max_window_bits=13'
        );

        assert.deepStrictEqual(perMessageDeflate.accept(extensions['permessage-deflate']), {
          server_no_context_takeover: true,
          client_no_context_takeover: true,
          server_max_window_bits: 12,
          client_max_window_bits: 11
        });
      });

      it('should fallback', function () {
        const perMessageDeflate = new PerMessageDeflate({ serverMaxWindowBits: 11 }, true);
        const extensions = Extensions.parse(
          'permessage-deflate; server_max_window_bits=10, permessage-deflate'
        );

        assert.deepStrictEqual(perMessageDeflate.accept(extensions['permessage-deflate']), {
          server_max_window_bits: 11
        });
      });

      it('should throw an error if server_no_context_takeover is unsupported', function () {
        const perMessageDeflate = new PerMessageDeflate({ serverNoContextTakeover: false }, true);
        const extensions = Extensions.parse('permessage-deflate; server_no_context_takeover');

        assert.throws(() => perMessageDeflate.accept(extensions['permessage-deflate']));
      });

      it('should throw an error if server_max_window_bits is unsupported', function () {
        const perMessageDeflate = new PerMessageDeflate({ serverMaxWindowBits: false }, true);
        const extensions = Extensions.parse('permessage-deflate; server_max_window_bits=10');

        assert.throws(() => perMessageDeflate.accept(extensions['permessage-deflate']));
      });

      it('should throw an error if server_max_window_bits is less than configuration', function () {
        const perMessageDeflate = new PerMessageDeflate({ serverMaxWindowBits: 11 }, true);
        const extensions = Extensions.parse('permessage-deflate; server_max_window_bits=10');

        assert.throws(() => perMessageDeflate.accept(extensions['permessage-deflate']));
      });

      it('should throw an error if client_max_window_bits is unsupported on client', function () {
        const perMessageDeflate = new PerMessageDeflate({ clientMaxWindowBits: 10 }, true);
        const extensions = Extensions.parse('permessage-deflate');

        assert.throws(() => perMessageDeflate.accept(extensions['permessage-deflate']));
      });
    });

    describe('as client', function () {
      it('should accept empty response', function () {
        const perMessageDeflate = new PerMessageDeflate({});

        assert.deepStrictEqual(perMessageDeflate.accept([{}]), {});
      });

      it('should accept response parameter', function () {
        const perMessageDeflate = new PerMessageDeflate({});
        const extensions = Extensions.parse(
          'permessage-deflate; server_no_context_takeover; ' +
          'client_no_context_takeover; server_max_window_bits=10; ' +
          'client_max_window_bits=11'
        );

        assert.deepStrictEqual(perMessageDeflate.accept(extensions['permessage-deflate']), {
          server_no_context_takeover: true,
          client_no_context_takeover: true,
          server_max_window_bits: 10,
          client_max_window_bits: 11
        });
      });

      it('should throw an error if client_no_context_takeover is unsupported', function () {
        const perMessageDeflate = new PerMessageDeflate({ clientNoContextTakeover: false });
        const extensions = Extensions.parse('permessage-deflate; client_no_context_takeover');

        assert.throws(() => perMessageDeflate.accept(extensions['permessage-deflate']));
      });

      it('should throw an error if client_max_window_bits is unsupported', function () {
        const perMessageDeflate = new PerMessageDeflate({ clientMaxWindowBits: false });
        const extensions = Extensions.parse('permessage-deflate; client_max_window_bits=10');

        assert.throws(() => perMessageDeflate.accept(extensions['permessage-deflate']));
      });

      it('should throw an error if client_max_window_bits is greater than configuration', function () {
        const perMessageDeflate = new PerMessageDeflate({ clientMaxWindowBits: 10 });
        const extensions = Extensions.parse('permessage-deflate; client_max_window_bits=11');

        assert.throws(() => perMessageDeflate.accept(extensions['permessage-deflate']));
      });
    });

    describe('validate parameters', function () {
      it('should throw an error if a parameter has multiple values', function () {
        const perMessageDeflate = new PerMessageDeflate();
        const extensions = Extensions.parse(
          'permessage-deflate; server_no_context_takeover; server_no_context_takeover'
        );

        assert.throws(() => perMessageDeflate.accept(extensions['permessage-deflate']));
      });

      it('should throw an error if a parameter is undefined', function () {
        const perMessageDeflate = new PerMessageDeflate();
        const extensions = Extensions.parse('permessage-deflate; foo;');

        assert.throws(() => perMessageDeflate.accept(extensions['permessage-deflate']));
      });

      it('should throw an error if server_no_context_takeover has a value', function () {
        const perMessageDeflate = new PerMessageDeflate();
        const extensions = Extensions.parse('permessage-deflate; server_no_context_takeover=10');

        assert.throws(() => perMessageDeflate.accept(extensions['permessage-deflate']));
      });

      it('should throw an error if client_no_context_takeover has a value', function () {
        const perMessageDeflate = new PerMessageDeflate();
        const extensions = Extensions.parse('permessage-deflate; client_no_context_takeover=10');

        assert.throws(() => perMessageDeflate.accept(extensions['permessage-deflate']));
      });

      it('should throw an error if server_max_window_bits has an invalid value', function () {
        const perMessageDeflate = new PerMessageDeflate();
        const extensions = Extensions.parse('permessage-deflate; server_max_window_bits=7');

        assert.throws(() => perMessageDeflate.accept(extensions['permessage-deflate']));
      });

      it('should throw an error if client_max_window_bits has an invalid value', function () {
        const perMessageDeflate = new PerMessageDeflate();
        const extensions = Extensions.parse('permessage-deflate; client_max_window_bits=16');

        assert.throws(() => perMessageDeflate.accept(extensions['permessage-deflate']));
      });
    });
  });

  describe('#compress/#decompress', function () {
    it('should compress/decompress data', function (done) {
      const perMessageDeflate = new PerMessageDeflate({ threshold: 0 });

      perMessageDeflate.accept([{}]);
      perMessageDeflate.compress(Buffer.from([1, 2, 3]), true, (err, compressed) => {
        if (err) return done(err);

        perMessageDeflate.decompress(compressed, true, (err, data) => {
          if (err) return done(err);

          assert.ok(data.equals(Buffer.from([1, 2, 3])));
          done();
        });
      });
    });

    it('should compress/decompress fragments', function (done) {
      const perMessageDeflate = new PerMessageDeflate({ threshold: 0 });
      const buf = Buffer.from([1, 2, 3, 4]);

      perMessageDeflate.accept([{}]);

      perMessageDeflate.compress(buf.slice(0, 2), false, (err, compressed1) => {
        if (err) return done(err);

        perMessageDeflate.compress(buf.slice(2), true, (err, compressed2) => {
          if (err) return done(err);

          perMessageDeflate.decompress(compressed1, false, (err, data1) => {
            if (err) return done(err);

            perMessageDeflate.decompress(compressed2, true, (err, data2) => {
              if (err) return done(err);

              assert.ok(Buffer.concat([data1, data2]).equals(Buffer.from([1, 2, 3, 4])));
              done();
            });
          });
        });
      });
    });

    it('should compress/decompress data with parameters', function (done) {
      const perMessageDeflate = new PerMessageDeflate({
        threshold: 0,
        memLevel: 5
      });
      const extensions = Extensions.parse(
        'permessage-deflate; server_no_context_takeover; ' +
        'client_no_context_takeover; server_max_window_bits=10; ' +
        'client_max_window_bits=11'
      );

      perMessageDeflate.accept(extensions['permessage-deflate']);

      perMessageDeflate.compress(Buffer.from([1, 2, 3]), true, (err, compressed) => {
        if (err) return done(err);

        perMessageDeflate.decompress(compressed, true, (err, data) => {
          if (err) return done(err);

          assert.ok(data.equals(Buffer.from([1, 2, 3])));
          done();
        });
      });
    });

    it('should compress/decompress data with no context takeover', function (done) {
      const perMessageDeflate = new PerMessageDeflate({ threshold: 0 });
      const extensions = Extensions.parse(
        'permessage-deflate; server_no_context_takeover; client_no_context_takeover'
      );
      const buf = Buffer.from('foofoo');

      perMessageDeflate.accept(extensions['permessage-deflate']);

      perMessageDeflate.compress(buf, true, (err, compressed1) => {
        if (err) return done(err);

        perMessageDeflate.decompress(compressed1, true, (err, data) => {
          if (err) return done(err);

          perMessageDeflate.compress(data, true, (err, compressed2) => {
            if (err) return done(err);

            perMessageDeflate.decompress(compressed2, true, (err, data) => {
              if (err) return done(err);

              assert.strictEqual(compressed2.length, compressed1.length);
              assert.ok(data.equals(buf));
              done();
            });
          });
        });
      });
    });

    it('should compress data between contexts when allowed', function (done) {
      const perMessageDeflate = new PerMessageDeflate({ threshold: 0 });
      const extensions = Extensions.parse('permessage-deflate');
      const buf = Buffer.from('foofoo');

      perMessageDeflate.accept(extensions['permessage-deflate']);

      perMessageDeflate.compress(buf, true, (err, compressed1) => {
        if (err) return done(err);

        perMessageDeflate.decompress(compressed1, true, (err, data) => {
          if (err) return done(err);

          perMessageDeflate.compress(data, true, (err, compressed2) => {
            if (err) return done(err);

            perMessageDeflate.decompress(compressed2, true, (err, data) => {
              if (err) return done(err);

              assert.ok(compressed2.length < compressed1.length);
              assert.ok(data.equals(buf));
              done();
            });
          });
        });
      });
    });
  });
});
