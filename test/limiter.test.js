'use strict';

const assert = require('assert');

const Limiter = require('../lib/limiter');

describe('Limiter', () => {
  describe('#ctor', () => {
    it('takes a `concurrency` argument', () => {
      const limiter = new Limiter(0);

      assert.strictEqual(limiter.concurrency, Infinity);
    });
  });

  describe('#kRun', () => {
    it('limits the number of jobs allowed to run concurrently', (done) => {
      const limiter = new Limiter(1);

      limiter.add((callback) => {
        setImmediate(() => {
          callback();

          assert.strictEqual(limiter.jobs.length, 0);
          assert.strictEqual(limiter.pending, 1);
        });
      });

      limiter.add((callback) => {
        setImmediate(() => {
          callback();

          assert.strictEqual(limiter.pending, 0);
          done();
        });
      });

      assert.strictEqual(limiter.jobs.length, 1);
    });
  });
});
