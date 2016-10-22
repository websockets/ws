/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

const benchmark = require('benchmark');

const Sender = require('../').Sender;

const data1 = Buffer.alloc(200 * 1024, 99);
const data2 = Buffer.alloc(1024 * 1024, 99);

const suite = new benchmark.Suite();
var sender = new Sender();
sender._socket = { write () {} };

suite.add('frameAndSend, unmasked (200 KiB)', () => sender.frameAndSend(0x2, data1, true, false));
suite.add('frameAndSend, masked (200 KiB)', () => sender.frameAndSend(0x2, data1, true, true));
suite.add('frameAndSend, unmasked (1 MiB)', () => sender.frameAndSend(0x2, data2, true, false));
suite.add('frameAndSend, masked (1 MiB)', () => sender.frameAndSend(0x2, data2, true, true));
suite.on('cycle', (e) => {
  console.log(e.target.toString());
  sender = new Sender();
  sender._socket = { write () {} };
});

if (require.main === module) {
  suite.run({ async: true });
} else {
  module.exports = suite;
}
