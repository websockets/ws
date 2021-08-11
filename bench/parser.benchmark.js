'use strict';

const benchmark = require('benchmark');
const crypto = require('crypto');

const WebSocket = require('..');

const Receiver = WebSocket.Receiver;
const Sender = WebSocket.Sender;

const options = {
  fin: true,
  rsv1: false,
  mask: true,
  readOnly: false
};

function createBinaryFrame(length) {
  const list = Sender.frame(crypto.randomBytes(length), {
    opcode: 0x02,
    ...options
  });

  return Buffer.concat(list);
}

const pingFrame1 = Buffer.concat(
  Sender.frame(crypto.randomBytes(5), { opcode: 0x09, ...options })
);

const textFrame = Buffer.from('819461616161' + '61'.repeat(20), 'hex');
const pingFrame2 = Buffer.from('8980146e915a', 'hex');
const binaryFrame1 = createBinaryFrame(125);
const binaryFrame2 = createBinaryFrame(65535);
const binaryFrame3 = createBinaryFrame(200 * 1024);
const binaryFrame4 = createBinaryFrame(1024 * 1024);

const suite = new benchmark.Suite();
const receiver = new Receiver({
  binaryType: 'nodebuffer',
  extensions: {},
  isServer: true,
  skipUTF8Validation: false
});

suite.add('ping frame (5 bytes payload)', {
  defer: true,
  fn: (deferred) => {
    receiver.write(pingFrame1, deferred.resolve.bind(deferred));
  }
});
suite.add('ping frame (no payload)', {
  defer: true,
  fn: (deferred) => {
    receiver.write(pingFrame2, deferred.resolve.bind(deferred));
  }
});
suite.add('text frame (20 bytes payload)', {
  defer: true,
  fn: (deferred) => {
    receiver.write(textFrame, deferred.resolve.bind(deferred));
  }
});
suite.add('binary frame (125 bytes payload)', {
  defer: true,
  fn: (deferred) => {
    receiver.write(binaryFrame1, deferred.resolve.bind(deferred));
  }
});
suite.add('binary frame (65535 bytes payload)', {
  defer: true,
  fn: (deferred) => {
    receiver.write(binaryFrame2, deferred.resolve.bind(deferred));
  }
});
suite.add('binary frame (200 KiB payload)', {
  defer: true,
  fn: (deferred) => {
    receiver.write(binaryFrame3, deferred.resolve.bind(deferred));
  }
});
suite.add('binary frame (1 MiB payload)', {
  defer: true,
  fn: (deferred) => {
    receiver.write(binaryFrame4, deferred.resolve.bind(deferred));
  }
});

suite.on('cycle', (e) => console.log(e.target.toString()));

if (require.main === module) {
  suite.run({ async: true });
} else {
  module.exports = suite;
}
