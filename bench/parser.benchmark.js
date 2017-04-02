/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

const safeBuffer = require('safe-buffer');
const benchmark = require('benchmark');
const crypto = require('crypto');

const util = require('../test/hybi-util');
const WebSocket = require('..');

const Receiver = WebSocket.Receiver;
const Buffer = safeBuffer.Buffer;

//
// Override the `cleanup` method to make the "close message" test work as
// expected.
//
Receiver.prototype.cleanup = function () {
  this.state = 0;
};

function createBinaryPacket (length) {
  const message = crypto.randomBytes(length);

  return Buffer.from('82' + util.getHybiLengthAsHexString(length, true) +
    '3483a868' + util.mask(message, '3483a868').toString('hex'), 'hex');
}

const pingMessage = 'Hello';
const pingPacket1 = Buffer.from('89' + util.pack(2, 0x80 | pingMessage.length) +
  '3483a868' + util.mask(pingMessage, '3483a868').toString('hex'), 'hex');

const textMessage = 'a'.repeat(20);
const maskedTextPacket = Buffer.from('81' + util.pack(2, 0x80 | textMessage.length) +
  '61616161' + util.mask(textMessage, '61616161').toString('hex'), 'hex');

const pingPacket2 = Buffer.from('8900', 'hex');
const closePacket = Buffer.from('8800', 'hex');
const binaryDataPacket = createBinaryPacket(125);
const binaryDataPacket2 = createBinaryPacket(65535);
const binaryDataPacket3 = createBinaryPacket(200 * 1024);
const binaryDataPacket4 = createBinaryPacket(1024 * 1024);

const suite = new benchmark.Suite();
const receiver = new Receiver();

receiver.onmessage = receiver.onclose = receiver.onping = () => {};

suite.add('ping message', () => receiver.add(pingPacket1));
suite.add('ping with no data', () => receiver.add(pingPacket2));
suite.add('close message', () => receiver.add(closePacket));
suite.add('masked text message (20 bytes)', () => receiver.add(maskedTextPacket));
suite.add('binary data (125 bytes)', () => receiver.add(binaryDataPacket));
suite.add('binary data (65535 bytes)', () => receiver.add(binaryDataPacket2));
suite.add('binary data (200 KiB)', () => receiver.add(binaryDataPacket3));
suite.add('binary data (1 MiB)', () => receiver.add(binaryDataPacket4));

suite.on('cycle', (e) => console.log(e.target.toString()));

if (require.main === module) {
  suite.run({ async: true });
} else {
  module.exports = suite;
}
