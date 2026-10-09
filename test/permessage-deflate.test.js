'use strict';

const assert = require('assert');
const zlib = require('zlib');

const PerMessageDeflate = require('../lib/permessage-deflate');
const extension = require('../lib/extension');

describe('PerMessageDeflate', () => {
  describe('#offer', () => {
    it('creates an offer', () => {
      const perMessageDeflate = new PerMessageDeflate();

      assert.deepStrictEqual(perMessageDeflate.offer(), {
        client_max_window_bits: true
      });
    });

    it('uses the configuration options', () => {
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

  describe('#accept', () => {
    it('throws an error if a parameter has multiple values', () => {
      const perMessageDeflate = new PerMessageDeflate();
      const extensions = extension.parse(
        'permessage-deflate; server_no_context_takeover; server_no_context_takeover'
      );

      assert.throws(
        () => perMessageDeflate.accept(extensions['permessage-deflate']),
        /^Error: Parameter "server_no_context_takeover" must have only a single value$/
      );
    });

    it('throws an error if a parameter has an invalid name', () => {
      const perMessageDeflate = new PerMessageDeflate();
      const extensions = extension.parse('permessage-deflate;foo');

      assert.throws(
        () => perMessageDeflate.accept(extensions['permessage-deflate']),
        /^Error: Unknown parameter "foo"$/
      );
    });

    it('throws an error if client_no_context_takeover has a value', () => {
      const perMessageDeflate = new PerMessageDeflate();
      const extensions = extension.parse(
        'permessage-deflate; client_no_context_takeover=10'
      );

      assert.throws(
        () => perMessageDeflate.accept(extensions['permessage-deflate']),
        /^TypeError: Invalid value for parameter "client_no_context_takeover": 10$/
      );
    });

    it('throws an error if server_no_context_takeover has a value', () => {
      const perMessageDeflate = new PerMessageDeflate();
      const extensions = extension.parse(
        'permessage-deflate; server_no_context_takeover=10'
      );

      assert.throws(
        () => perMessageDeflate.accept(extensions['permessage-deflate']),
        /^TypeError: Invalid value for parameter "server_no_context_takeover": 10$/
      );
    });

    it('throws an error if server_max_window_bits has an invalid value', () => {
      const perMessageDeflate = new PerMessageDeflate();

      let extensions = extension.parse(
        'permessage-deflate; server_max_window_bits=7'
      );
      assert.throws(
        () => perMessageDeflate.accept(extensions['permessage-deflate']),
        /^TypeError: Invalid value for parameter "server_max_window_bits": 7$/
      );

      extensions = extension.parse(
        'permessage-deflate; server_max_window_bits'
      );
      assert.throws(
        () => perMessageDeflate.accept(extensions['permessage-deflate']),
        /^TypeError: Invalid value for parameter "server_max_window_bits": true$/
      );
    });

    describe('As server', () => {
      it('accepts an offer with no parameters', () => {
        const perMessageDeflate = new PerMessageDeflate({ isServer: true });

        assert.deepStrictEqual(perMessageDeflate.accept([{}]), {});
      });

      it('accepts an offer with parameters', () => {
        const perMessageDeflate = new PerMessageDeflate({ isServer: true });
        const extensions = extension.parse(
          'permessage-deflate; server_no_context_takeover; ' +
            'client_no_context_takeover; server_max_window_bits=10; ' +
            'client_max_window_bits=11'
        );

        assert.deepStrictEqual(
          perMessageDeflate.accept(extensions['permessage-deflate']),
          {
            server_no_context_takeover: true,
            client_no_context_takeover: true,
            server_max_window_bits: 10,
            client_max_window_bits: 11,
            __proto__: null
          }
        );
      });

      it('prefers the configuration options', () => {
        const perMessageDeflate = new PerMessageDeflate({
          serverNoContextTakeover: true,
          clientNoContextTakeover: true,
          serverMaxWindowBits: 12,
          clientMaxWindowBits: 11,
          isServer: true
        });
        const extensions = extension.parse(
          'permessage-deflate; server_max_window_bits=14; client_max_window_bits=13'
        );

        assert.deepStrictEqual(
          perMessageDeflate.accept(extensions['permessage-deflate']),
          {
            server_no_context_takeover: true,
            client_no_context_takeover: true,
            server_max_window_bits: 12,
            client_max_window_bits: 11,
            __proto__: null
          }
        );
      });

      it('accepts the first supported offer', () => {
        const perMessageDeflate = new PerMessageDeflate({
          isServer: true,
          serverMaxWindowBits: 11
        });
        const extensions = extension.parse(
          'permessage-deflate; server_max_window_bits=10, permessage-deflate'
        );

        assert.deepStrictEqual(
          perMessageDeflate.accept(extensions['permessage-deflate']),
          {
            server_max_window_bits: 11,
            __proto__: null
          }
        );
      });

      it('throws an error if server_no_context_takeover is unsupported', () => {
        const perMessageDeflate = new PerMessageDeflate({
          isServer: true,
          serverNoContextTakeover: false
        });
        const extensions = extension.parse(
          'permessage-deflate; server_no_context_takeover'
        );

        assert.throws(
          () => perMessageDeflate.accept(extensions['permessage-deflate']),
          /^Error: None of the extension offers can be accepted$/
        );
      });

      it('throws an error if server_max_window_bits is unsupported', () => {
        const perMessageDeflate = new PerMessageDeflate({
          isServer: true,
          serverMaxWindowBits: false
        });
        const extensions = extension.parse(
          'permessage-deflate; server_max_window_bits=10'
        );

        assert.throws(
          () => perMessageDeflate.accept(extensions['permessage-deflate']),
          /^Error: None of the extension offers can be accepted$/
        );
      });

      it('throws an error if server_max_window_bits is less than configuration', () => {
        const perMessageDeflate = new PerMessageDeflate({
          isServer: true,
          serverMaxWindowBits: 11
        });
        const extensions = extension.parse(
          'permessage-deflate; server_max_window_bits=10'
        );

        assert.throws(
          () => perMessageDeflate.accept(extensions['permessage-deflate']),
          /^Error: None of the extension offers can be accepted$/
        );
      });

      it('throws an error if client_max_window_bits is less than configuration', () => {
        const perMessageDeflate = new PerMessageDeflate({
          isServer: true,
          clientMaxWindowBits: 11
        });
        const extensions = extension.parse(
          'permessage-deflate; client_max_window_bits=10'
        );

        assert.throws(
          () => perMessageDeflate.accept(extensions['permessage-deflate']),
          /^Error: None of the extension offers can be accepted$/
        );
      });

      it('throws an error if client_max_window_bits is unsupported on client', () => {
        const perMessageDeflate = new PerMessageDeflate({
          isServer: true,
          clientMaxWindowBits: 10
        });
        const extensions = extension.parse('permessage-deflate');

        assert.throws(
          () => perMessageDeflate.accept(extensions['permessage-deflate']),
          /^Error: None of the extension offers can be accepted$/
        );
      });

      it('throws an error if client_max_window_bits has an invalid value', () => {
        const perMessageDeflate = new PerMessageDeflate({ isServer: true });

        const extensions = extension.parse(
          'permessage-deflate; client_max_window_bits=16'
        );
        assert.throws(
          () => perMessageDeflate.accept(extensions['permessage-deflate']),
          /^TypeError: Invalid value for parameter "client_max_window_bits": 16$/
        );
      });
    });

    describe('As client', () => {
      it('accepts a response with no parameters', () => {
        const perMessageDeflate = new PerMessageDeflate({});

        assert.deepStrictEqual(perMessageDeflate.accept([{}]), {});
      });

      it('accepts a response with parameters', () => {
        const perMessageDeflate = new PerMessageDeflate({});
        const extensions = extension.parse(
          'permessage-deflate; server_no_context_takeover; ' +
            'client_no_context_takeover; server_max_window_bits=10; ' +
            'client_max_window_bits=11'
        );

        assert.deepStrictEqual(
          perMessageDeflate.accept(extensions['permessage-deflate']),
          {
            server_no_context_takeover: true,
            client_no_context_takeover: true,
            server_max_window_bits: 10,
            client_max_window_bits: 11,
            __proto__: null
          }
        );
      });

      it('throws an error if client_no_context_takeover is unsupported', () => {
        const perMessageDeflate = new PerMessageDeflate({
          clientNoContextTakeover: false
        });
        const extensions = extension.parse(
          'permessage-deflate; client_no_context_takeover'
        );

        assert.throws(
          () => perMessageDeflate.accept(extensions['permessage-deflate']),
          /^Error: Unexpected parameter "client_no_context_takeover"$/
        );
      });

      it('throws an error if client_max_window_bits is unsupported', () => {
        const perMessageDeflate = new PerMessageDeflate({
          clientMaxWindowBits: false
        });
        const extensions = extension.parse(
          'permessage-deflate; client_max_window_bits=10'
        );

        assert.throws(
          () => perMessageDeflate.accept(extensions['permessage-deflate']),
          /^Error: Unexpected or invalid parameter "client_max_window_bits"$/
        );
      });

      it('throws an error if client_max_window_bits is greater than configuration', () => {
        const perMessageDeflate = new PerMessageDeflate({
          clientMaxWindowBits: 10
        });
        const extensions = extension.parse(
          'permessage-deflate; client_max_window_bits=11'
        );

        assert.throws(
          () => perMessageDeflate.accept(extensions['permessage-deflate']),
          /^Error: Unexpected or invalid parameter "client_max_window_bits"$/
        );
      });

      it('throws an error if client_max_window_bits has an invalid value', () => {
        const perMessageDeflate = new PerMessageDeflate();

        let extensions = extension.parse(
          'permessage-deflate; client_max_window_bits=16'
        );
        assert.throws(
          () => perMessageDeflate.accept(extensions['permessage-deflate']),
          /^TypeError: Invalid value for parameter "client_max_window_bits": 16$/
        );

        extensions = extension.parse(
          'permessage-deflate; client_max_window_bits'
        );
        assert.throws(
          () => perMessageDeflate.accept(extensions['permessage-deflate']),
          /^TypeError: Invalid value for parameter "client_max_window_bits": true$/
        );
      });

      it('uses the config value if client_max_window_bits is not specified', () => {
        const perMessageDeflate = new PerMessageDeflate({
          clientMaxWindowBits: 10
        });

        assert.deepStrictEqual(perMessageDeflate.accept([{}]), {
          client_max_window_bits: 10
        });
      });
    });
  });

  describe('#compress and #decompress', () => {
    it('works with unfragmented messages', (done) => {
      const perMessageDeflate = new PerMessageDeflate();
      const buf = Buffer.from([1, 2, 3]);

      perMessageDeflate.accept([{}]);
      perMessageDeflate.compress(buf, true, (err, data) => {
        if (err) return done(err);

        perMessageDeflate.decompress(data, true, (err, data) => {
          if (err) return done(err);

          assert.ok(data.equals(buf));
          done();
        });
      });
    });

    it('works with fragmented messages', (done) => {
      const perMessageDeflate = new PerMessageDeflate();
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

              assert.ok(Buffer.concat([data1, data2]).equals(buf));
              done();
            });
          });
        });
      });
    });

    it('works with the negotiated parameters', (done) => {
      const perMessageDeflate = new PerMessageDeflate({
        zlibDeflateOptions: {
          memLevel: 5,
          level: 9
        }
      });
      const extensions = extension.parse(
        'permessage-deflate; server_no_context_takeover; ' +
          'client_no_context_takeover; server_max_window_bits=10; ' +
          'client_max_window_bits=11'
      );
      const buf = Buffer.from("Some compressible data, it's compressible.");

      perMessageDeflate.accept(extensions['permessage-deflate']);

      perMessageDeflate.compress(buf, true, (err, data) => {
        if (err) return done(err);

        perMessageDeflate.decompress(data, true, (err, data) => {
          if (err) return done(err);

          assert.ok(data.equals(buf));
          done();
        });
      });
    });

    it('honors the `level` option', (done) => {
      const lev0 = new PerMessageDeflate({
        zlibDeflateOptions: { level: 0 }
      });
      const lev9 = new PerMessageDeflate({
        zlibDeflateOptions: { level: 9 }
      });
      const extensionStr =
        'permessage-deflate; server_no_context_takeover; ' +
        'client_no_context_takeover; server_max_window_bits=10; ' +
        'client_max_window_bits=11';
      const buf = Buffer.from("Some compressible data, it's compressible.");

      lev0.accept(extension.parse(extensionStr)['permessage-deflate']);
      lev9.accept(extension.parse(extensionStr)['permessage-deflate']);

      lev0.compress(buf, true, (err, compressed1) => {
        if (err) return done(err);

        lev0.decompress(compressed1, true, (err, decompressed1) => {
          if (err) return done(err);

          lev9.compress(buf, true, (err, compressed2) => {
            if (err) return done(err);

            lev9.decompress(compressed2, true, (err, decompressed2) => {
              if (err) return done(err);

              // Level 0 compression actually adds a few bytes due to headers.
              assert.ok(compressed1.length > buf.length);
              // Level 9 should not, of course.
              assert.ok(compressed2.length < buf.length);
              // Ensure they both decompress back properly.
              assert.ok(decompressed1.equals(buf));
              assert.ok(decompressed2.equals(buf));
              done();
            });
          });
        });
      });
    });

    it('honors the `zlib{Deflate,Inflate}Options` option', (done) => {
      const lev0 = new PerMessageDeflate({
        zlibDeflateOptions: {
          level: 0,
          chunkSize: 256
        },
        zlibInflateOptions: {
          chunkSize: 2048
        }
      });
      const lev9 = new PerMessageDeflate({
        zlibDeflateOptions: {
          level: 9,
          chunkSize: 128
        },
        zlibInflateOptions: {
          chunkSize: 1024
        }
      });

      // Note no context takeover so we can get a hold of the raw streams after
      // we do the dance.
      const extensionStr =
        'permessage-deflate; server_max_window_bits=10; ' +
        'client_max_window_bits=11';
      const buf = Buffer.from("Some compressible data, it's compressible.");

      lev0.accept(extension.parse(extensionStr)['permessage-deflate']);
      lev9.accept(extension.parse(extensionStr)['permessage-deflate']);

      lev0.compress(buf, true, (err, compressed1) => {
        if (err) return done(err);

        lev0.decompress(compressed1, true, (err, decompressed1) => {
          if (err) return done(err);

          lev9.compress(buf, true, (err, compressed2) => {
            if (err) return done(err);

            lev9.decompress(compressed2, true, (err, decompressed2) => {
              if (err) return done(err);
              // Level 0 compression actually adds a few bytes due to headers.
              assert.ok(compressed1.length > buf.length);
              // Level 9 should not, of course.
              assert.ok(compressed2.length < buf.length);
              // Ensure they both decompress back properly.
              assert.ok(decompressed1.equals(buf));
              assert.ok(decompressed2.equals(buf));

              // Assert options were set.
              assert.ok(lev0._deflate._level === 0);
              assert.ok(lev9._deflate._level === 9);
              assert.ok(lev0._deflate._chunkSize === 256);
              assert.ok(lev9._deflate._chunkSize === 128);
              assert.ok(lev0._inflate._chunkSize === 2048);
              assert.ok(lev9._inflate._chunkSize === 1024);
              done();
            });
          });
        });
      });
    });

    it("doesn't use contex takeover if not allowed", (done) => {
      const perMessageDeflate = new PerMessageDeflate({ isServer: true });
      const extensions = extension.parse(
        'permessage-deflate;server_no_context_takeover'
      );
      const buf = Buffer.from('foofoo');

      perMessageDeflate.accept(extensions['permessage-deflate']);

      perMessageDeflate.compress(buf, true, (err, compressed1) => {
        if (err) return done(err);

        perMessageDeflate.decompress(compressed1, true, (err, data) => {
          if (err) return done(err);

          assert.ok(data.equals(buf));
          perMessageDeflate.compress(data, true, (err, compressed2) => {
            if (err) return done(err);

            assert.strictEqual(compressed2.length, compressed1.length);
            perMessageDeflate.decompress(compressed2, true, (err, data) => {
              if (err) return done(err);

              assert.ok(data.equals(buf));
              done();
            });
          });
        });
      });
    });

    it('uses contex takeover if allowed', (done) => {
      const perMessageDeflate = new PerMessageDeflate({ isServer: true });
      const extensions = extension.parse('permessage-deflate');
      const buf = Buffer.from('foofoo');

      perMessageDeflate.accept(extensions['permessage-deflate']);

      perMessageDeflate.compress(buf, true, (err, compressed1) => {
        if (err) return done(err);

        perMessageDeflate.decompress(compressed1, true, (err, data) => {
          if (err) return done(err);

          assert.ok(data.equals(buf));
          perMessageDeflate.compress(data, true, (err, compressed2) => {
            if (err) return done(err);

            assert.ok(compressed2.length < compressed1.length);
            perMessageDeflate.decompress(compressed2, true, (err, data) => {
              if (err) return done(err);

              assert.ok(data.equals(buf));
              done();
            });
          });
        });
      });
    });

    it('calls the callback when an error occurs (inflate)', (done) => {
      const perMessageDeflate = new PerMessageDeflate();
      const data = Buffer.from('something invalid');

      perMessageDeflate.accept([{}]);
      perMessageDeflate.decompress(data, true, (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.code, 'Z_DATA_ERROR');
        assert.strictEqual(err.errno, -3);
        done();
      });
    });

    it('calls the callback when `maxPayload` is exceeded (1/2)', (done) => {
      const perMessageDeflate = new PerMessageDeflate({
        isServer: false,
        maxPayload: 25
      });
      const buf = Buffer.alloc(50, 'A');

      perMessageDeflate.accept([{}]);
      perMessageDeflate.compress(buf, true, (err, data) => {
        if (err) return done(err);

        perMessageDeflate.decompress(data, true, (err) => {
          assert.ok(err instanceof RangeError);
          assert.strictEqual(err.message, 'Max payload size exceeded');
          done();
        });
      });
    });

    it('calls the callback when `maxPayload` is exceeded (2/2)', (done) => {
      // A copy of the previous test but with a larger input. See
      // https://github.com/websockets/ws/pull/2285.
      const perMessageDeflate = new PerMessageDeflate({
        isServer: false,
        maxPayload: 25
      });
      const buf = Buffer.alloc(1024 * 1024, 'A');

      perMessageDeflate.accept([{}]);
      perMessageDeflate.compress(buf, true, (err, data) => {
        if (err) return done(err);

        perMessageDeflate.decompress(data, true, (err) => {
          assert.ok(err instanceof RangeError);
          assert.strictEqual(err.message, 'Max payload size exceeded');
          done();
        });
      });
    });

    it('calls the callback if the deflate stream is closed prematurely', (done) => {
      const perMessageDeflate = new PerMessageDeflate();
      const buf = Buffer.from('A'.repeat(50));

      perMessageDeflate.accept([{}]);
      perMessageDeflate.compress(buf, true, (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'The deflate stream was closed while data was being processed'
        );
        done();
      });

      process.nextTick(() => perMessageDeflate.cleanup());
    });

    it('recreates the inflate stream if it ends', (done) => {
      const perMessageDeflate = new PerMessageDeflate();
      const extensions = extension.parse(
        'permessage-deflate; client_no_context_takeover; ' +
          'server_no_context_takeover'
      );
      const buf = Buffer.from('33343236313533b7000000', 'hex');
      const expected = Buffer.from('12345678');

      perMessageDeflate.accept(extensions['permessage-deflate']);

      perMessageDeflate.decompress(buf, true, (err, data) => {
        assert.ok(data.equals(expected));

        perMessageDeflate.decompress(buf, true, (err, data) => {
          assert.ok(data.equals(expected));
          done();
        });
      });
    });

    describe('Without context takeover', () => {
      const offer =
        'permessage-deflate; server_no_context_takeover; ' +
        'client_no_context_takeover';

      //
      // Like `WebSocketServer`, create one instance per connection from a copy
      // of the same options.
      //
      function create(options) {
        const perMessageDeflate = new PerMessageDeflate({
          ...options,
          isServer: true
        });

        perMessageDeflate.accept(extension.parse(offer)['permessage-deflate']);
        return perMessageDeflate;
      }

      it('shares the zlib streams between instances', (done) => {
        const options = { zlibDeflateOptions: {}, zlibInflateOptions: {} };
        const a = create(options);
        const b = create(options);
        const buf = Buffer.from("Some compressible data, it's compressible.");

        a.compress(buf, true, (err, compressed) => {
          if (err) return done(err);

          assert.strictEqual(a._deflate, null);

          b.compress(buf, true, (err, data) => {
            if (err) return done(err);

            assert.ok(data.equals(compressed));
            assert.strictEqual(b._deflate, null);

            a.decompress(compressed, true, (err, data) => {
              if (err) return done(err);

              assert.ok(data.equals(buf));
              assert.strictEqual(a._inflate, null);

              b.decompress(compressed, true, (err, data) => {
                if (err) return done(err);

                assert.ok(data.equals(buf));
                assert.strictEqual(b._inflate, null);
                done();
              });

              assert.strictEqual(b._inflate, inflate);
            });

            const inflate = a._inflate;

            assert.ok(inflate instanceof zlib.InflateRaw);
          });

          assert.strictEqual(b._deflate, deflate);
        });

        const deflate = a._deflate;

        assert.ok(deflate instanceof zlib.DeflateRaw);
      });

      it('compresses as a new zlib stream does', (done) => {
        const options = { zlibDeflateOptions: { level: 1, memLevel: 8 } };
        const a = create(options);
        const b = create(options);
        const messages = [
          Buffer.alloc(2048, 'Some compressible data. '),
          Buffer.from('abcdefghijklmnopqrstuvwxyz'.repeat(3000)),
          Buffer.alloc(512, 'More data. ')
        ];
        let i = 0;

        (function next() {
          if (i === messages.length) return done();

          const buf = messages[i++];
          const expected = zlib
            .deflateRawSync(buf, {
              level: 1,
              memLevel: 8,
              finishFlush: zlib.constants.Z_SYNC_FLUSH
            })
            .slice(0, -4);

          (i % 2 ? a : b).compress(buf, true, (err, data) => {
            if (err) return done(err);

            assert.ok(data.equals(expected));
            next();
          });
        })();
      });

      it('does not share the zlib streams if the options differ', (done) => {
        const a = create({ zlibDeflateOptions: { level: 1 } });
        const b = create({ zlibDeflateOptions: { level: 1 } });
        const buf = Buffer.from('foofoo');

        a.compress(buf, true, (err) => {
          if (err) return done(err);

          b.compress(buf, true, (err) => {
            if (err) return done(err);

            done();
          });

          assert.notStrictEqual(b._deflate, deflate);
        });

        const deflate = a._deflate;
      });

      it('keeps the zlib stream until the last fragment', (done) => {
        const options = { zlibDeflateOptions: {} };
        const a = create(options);
        const b = create(options);
        const buf = Buffer.from('abcdefgh');

        a.compress(buf.slice(0, 4), false, (err, compressed1) => {
          if (err) return done(err);

          assert.strictEqual(a._deflate, deflate);

          b.compress(buf, true, (err) => {
            if (err) return done(err);

            a.compress(buf.slice(4), true, (err, compressed2) => {
              if (err) return done(err);

              assert.strictEqual(a._deflate, null);

              a.decompress(compressed1, false, (err, data1) => {
                if (err) return done(err);

                a.decompress(compressed2, true, (err, data2) => {
                  if (err) return done(err);

                  assert.ok(Buffer.concat([data1, data2]).equals(buf));
                  done();
                });
              });
            });
          });

          assert.notStrictEqual(b._deflate, deflate);
        });

        const deflate = a._deflate;
      });

      it('does not reuse a zlib stream that failed', (done) => {
        const options = { zlibInflateOptions: {} };
        const a = create({ ...options, maxPayload: 25 });
        const b = create(options);
        const buf = Buffer.alloc(50, 'A');
        const compressed = zlib
          .deflateRawSync(buf, { finishFlush: zlib.constants.Z_SYNC_FLUSH })
          .slice(0, -4);

        a.decompress(compressed, true, (err) => {
          assert.ok(err instanceof RangeError);

          b.decompress(compressed, true, (err, data) => {
            if (err) return done(err);

            assert.ok(data.equals(buf));
            done();
          });

          assert.notStrictEqual(b._inflate, inflate);
        });

        const inflate = a._inflate;
      });

      it('closes a zlib stream if its pool is full', (done) => {
        const options = { zlibDeflateOptions: {}, concurrencyLimit: 1 };
        const a = create(options);
        const b = create(options);
        const buf = Buffer.from('foofoo');

        a.compress(buf, false, (err) => {
          if (err) return done(err);

          b.compress(buf, false, (err) => {
            if (err) return done(err);

            a.compress(buf, true, (err) => {
              if (err) return done(err);

              b.compress(buf, true, (err) => {
                if (err) return done(err);

                assert.strictEqual(deflateA.destroyed, false);
                assert.strictEqual(deflateB.destroyed, true);
                done();
              });
            });
          });

          const deflateB = b._deflate;

          assert.notStrictEqual(deflateB, deflateA);
        });

        const deflateA = a._deflate;
      });

      it("does not let a message refer to the previous message's data", (done) => {
        const options = { zlibInflateOptions: {} };
        const a = create(options);
        const b = create(options);
        const secret = Buffer.from('The previous connection sent this.');
        const compressed = zlib
          .deflateRawSync(secret, { finishFlush: zlib.constants.Z_SYNC_FLUSH })
          .slice(0, -4);

        //
        // Back-references into `secret`, as if it were still in the window.
        //
        const crafted = zlib
          .deflateRawSync(secret, {
            dictionary: secret,
            finishFlush: zlib.constants.Z_SYNC_FLUSH
          })
          .slice(0, -4);

        a.decompress(compressed, true, (err, data) => {
          if (err) return done(err);

          assert.ok(data.equals(secret));

          b.decompress(crafted, true, (err) => {
            assert.ok(err instanceof Error);
            assert.strictEqual(err.code, 'Z_DATA_ERROR');
            done();
          });

          assert.strictEqual(b._inflate, inflate);
        });

        const inflate = a._inflate;
      });
    });
  });
});
