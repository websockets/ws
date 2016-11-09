/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

const benchmark = require('benchmark');
const crypto = require('crypto');

const Sender = require('../').Sender;

const data1 = crypto.randomBytes(64);
const data2 = crypto.randomBytes(16 * 1024);
const data3 = crypto.randomBytes(64 * 1024);
const data4 = crypto.randomBytes(200 * 1024);
const data5 = crypto.randomBytes(1024 * 1024);

const suite = new benchmark.Suite();
var sender = new Sender();
sender._socket = { write () {} };

suite.add('frameAndSend, unmasked (64 B)', () => sender.frameAndSend(0x2, data1, false, true, false));
suite.add('frameAndSend, masked (64 B)', () => sender.frameAndSend(0x2, data1, true, true, true));
suite.add('frameAndSend, unmasked (16 KiB)', () => sender.frameAndSend(0x2, data2, false, true, false));
suite.add('frameAndSend, masked (16 KiB)', () => sender.frameAndSend(0x2, data2, true, true, true));
suite.add('frameAndSend, unmasked (64 KiB)', () => sender.frameAndSend(0x2, data3, false, true, false));
suite.add('frameAndSend, masked (64 KiB)', () => sender.frameAndSend(0x2, data3, true, true, true));
suite.add('frameAndSend, unmasked (200 KiB)', () => sender.frameAndSend(0x2, data4, false, true, false));
suite.add('frameAndSend, masked (200 KiB)', () => sender.frameAndSend(0x2, data4, true, true, true));
suite.add('frameAndSend, unmasked (1 MiB)', () => sender.frameAndSend(0x2, data5, false, true, false));
suite.add('frameAndSend, masked (1 MiB)', () => sender.frameAndSend(0x2, data5, true, true, true));

suite.on('cycle', (e) => console.log(e.target.toString()));

if (require.main === module) {
  suite.run({ async: true });
} else {
  module.exports = suite;
}
