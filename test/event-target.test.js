'use strict';

const assert = require('assert');

const {
  CloseEvent,
  ErrorEvent,
  Event,
  MessageEvent
} = require('../lib/event-target');

describe('Event', () => {
  describe('#ctor', () => {
    it('takes a `type` argument', () => {
      const event = new Event('foo');

      assert.strictEqual(event.type, 'foo');
    });
  });

  describe('Properties', () => {
    describe('`target`', () => {
      it('is enumerable and configurable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(
          Event.prototype,
          'target'
        );

        assert.strictEqual(descriptor.configurable, true);
        assert.strictEqual(descriptor.enumerable, true);
        assert.ok(descriptor.get !== undefined);
        assert.ok(descriptor.set === undefined);
      });

      it('defaults to `null`', () => {
        const event = new Event('foo');

        assert.strictEqual(event.target, null);
      });
    });

    describe('`type`', () => {
      it('is enumerable and configurable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(
          Event.prototype,
          'type'
        );

        assert.strictEqual(descriptor.configurable, true);
        assert.strictEqual(descriptor.enumerable, true);
        assert.ok(descriptor.get !== undefined);
        assert.ok(descriptor.set === undefined);
      });
    });
  });
});

describe('CloseEvent', () => {
  it('inherits from `Event`', () => {
    assert.ok(CloseEvent.prototype instanceof Event);
  });

  describe('#ctor', () => {
    it('takes a `type` argument', () => {
      const event = new CloseEvent('foo');

      assert.strictEqual(event.type, 'foo');
    });

    it('takes an optional `options` argument', () => {
      const event = new CloseEvent('close', {
        code: 1000,
        reason: 'foo',
        wasClean: true
      });

      assert.strictEqual(event.type, 'close');
      assert.strictEqual(event.code, 1000);
      assert.strictEqual(event.reason, 'foo');
      assert.strictEqual(event.wasClean, true);
    });
  });

  describe('Properties', () => {
    describe('`code`', () => {
      it('is enumerable and configurable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(
          CloseEvent.prototype,
          'code'
        );

        assert.strictEqual(descriptor.configurable, true);
        assert.strictEqual(descriptor.enumerable, true);
        assert.ok(descriptor.get !== undefined);
        assert.ok(descriptor.set === undefined);
      });

      it('defaults to 0', () => {
        const event = new CloseEvent('close');

        assert.strictEqual(event.code, 0);
      });
    });

    describe('`reason`', () => {
      it('is enumerable and configurable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(
          CloseEvent.prototype,
          'reason'
        );

        assert.strictEqual(descriptor.configurable, true);
        assert.strictEqual(descriptor.enumerable, true);
        assert.ok(descriptor.get !== undefined);
        assert.ok(descriptor.set === undefined);
      });

      it('defaults to an empty string', () => {
        const event = new CloseEvent('close');

        assert.strictEqual(event.reason, '');
      });
    });

    describe('`wasClean`', () => {
      it('is enumerable and configurable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(
          CloseEvent.prototype,
          'wasClean'
        );

        assert.strictEqual(descriptor.configurable, true);
        assert.strictEqual(descriptor.enumerable, true);
        assert.ok(descriptor.get !== undefined);
        assert.ok(descriptor.set === undefined);
      });

      it('defaults to false', () => {
        const event = new CloseEvent('close');

        assert.strictEqual(event.wasClean, false);
      });
    });
  });
});

describe('ErrorEvent', () => {
  it('inherits from `Event`', () => {
    assert.ok(ErrorEvent.prototype instanceof Event);
  });

  describe('#ctor', () => {
    it('takes a `type` argument', () => {
      const event = new ErrorEvent('foo');

      assert.strictEqual(event.type, 'foo');
    });

    it('takes an optional `options` argument', () => {
      const error = new Error('Oops');
      const event = new ErrorEvent('error', { error, message: error.message });

      assert.strictEqual(event.type, 'error');
      assert.strictEqual(event.error, error);
      assert.strictEqual(event.message, error.message);
    });
  });

  describe('Properties', () => {
    describe('`error`', () => {
      it('is enumerable and configurable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(
          ErrorEvent.prototype,
          'error'
        );

        assert.strictEqual(descriptor.configurable, true);
        assert.strictEqual(descriptor.enumerable, true);
        assert.ok(descriptor.get !== undefined);
        assert.ok(descriptor.set === undefined);
      });

      it('defaults to `null`', () => {
        const event = new ErrorEvent('error');

        assert.strictEqual(event.error, null);
      });
    });

    describe('`message`', () => {
      it('is enumerable and configurable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(
          ErrorEvent.prototype,
          'message'
        );

        assert.strictEqual(descriptor.configurable, true);
        assert.strictEqual(descriptor.enumerable, true);
        assert.ok(descriptor.get !== undefined);
        assert.ok(descriptor.set === undefined);
      });

      it('defaults to an empty string', () => {
        const event = new ErrorEvent('error');

        assert.strictEqual(event.message, '');
      });
    });
  });
});

describe('MessageEvent', () => {
  it('inherits from `Event`', () => {
    assert.ok(MessageEvent.prototype instanceof Event);
  });

  describe('#ctor', () => {
    it('takes a `type` argument', () => {
      const event = new MessageEvent('foo');

      assert.strictEqual(event.type, 'foo');
    });

    it('takes an optional `options` argument', () => {
      const event = new MessageEvent('message', { data: 'bar' });

      assert.strictEqual(event.type, 'message');
      assert.strictEqual(event.data, 'bar');
    });
  });

  describe('Properties', () => {
    describe('`data`', () => {
      it('is enumerable and configurable', () => {
        const descriptor = Object.getOwnPropertyDescriptor(
          MessageEvent.prototype,
          'data'
        );

        assert.strictEqual(descriptor.configurable, true);
        assert.strictEqual(descriptor.enumerable, true);
        assert.ok(descriptor.get !== undefined);
        assert.ok(descriptor.set === undefined);
      });

      it('defaults to `null`', () => {
        const event = new MessageEvent('message');

        assert.strictEqual(event.data, null);
      });
    });
  });
});
