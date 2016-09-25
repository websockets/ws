/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

const benchmark = require('benchmark')

const Sender = require('../').Sender

const framePacket = Buffer.alloc(200 * 1024).fill(99);

const suite = new benchmark.Suite();
var sender = new Sender();
sender._socket = { write() {} };

suite.add('frameAndSend, unmasked (200 kB)', () => sender.frameAndSend(0x2, framePacket, true, false));
suite.add('frameAndSend, masked (200 kB)', () => sender.frameAndSend(0x2, framePacket, true, true));
suite.on('cycle', (e) => {
  console.log(e.target.toString());
  sender = new Sender();
  sender._socket = { write() {} };
});

if (require.main === module) {
  suite.run({ async: true });
} else {
  module.exports = suite;
}
