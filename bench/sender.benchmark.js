'use strict';

const benchmark = require('benchmark');
const crypto = require('crypto');

const Sender = require('../').Sender;

const data1 = crypto.randomBytes(64);
const data2 = crypto.randomBytes(16 * 1024);
const data3 = crypto.randomBytes(64 * 1024);
const data4 = crypto.randomBytes(200 * 1024);
const data5 = crypto.randomBytes(1024 * 1024);

const opts1 = {
  readOnly: false,
  mask: false,
  rsv1: false,
  opcode: 2,
  fin: true
};
const opts2 = {
  readOnly: true,
  rsv1: false,
  mask: true,
  opcode: 2,
  fin: true
};

const suite = new benchmark.Suite();

suite.add('frame, unmasked (64 B)', () => Sender.frame(data1, opts1));
suite.add('frame, masked (64 B)', () => Sender.frame(data1, opts2));
suite.add('frame, unmasked (16 KiB)', () => Sender.frame(data2, opts1));
suite.add('frame, masked (16 KiB)', () => Sender.frame(data2, opts2));
suite.add('frame, unmasked (64 KiB)', () => Sender.frame(data3, opts1));
suite.add('frame, masked (64 KiB)', () => Sender.frame(data3, opts2));
suite.add('frame, unmasked (200 KiB)', () => Sender.frame(data4, opts1));
suite.add('frame, masked (200 KiB)', () => Sender.frame(data4, opts2));
suite.add('frame, unmasked (1 MiB)', () => Sender.frame(data5, opts1));
suite.add('frame, masked (1 MiB)', () => Sender.frame(data5, opts2));

suite.on('cycle', (e) => console.log(e.target.toString()));

if (require.main === module) {
  suite.run({ async: true });
} else {
  module.exports = suite;
}
