'use strict';

const assert = require('assert');

const Limiter = require('../lib/limiter');

describe('Limiter', () => {
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
