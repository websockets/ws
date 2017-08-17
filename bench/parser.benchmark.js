/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

const safeBuffer = require('safe-buffer');
const benchmark = require('benchmark');
const crypto = require('crypto');

const WebSocket = require('..');

const Receiver = WebSocket.Receiver;
const Sender = WebSocket.Sender;
const Buffer = safeBuffer.Buffer;

//
// Override the `cleanup` method to make the "close message" test work as
// expected.
//
Receiver.prototype.cleanup = function () {
  this._state = 0;
};

const options = {
  fin: true,
  rsv1: false,
  mask: true,
  readOnly: false
};

function createBinaryFrame (length) {
  const list = Sender.frame(
    crypto.randomBytes(length),
    Object.assign({ opcode: 0x02 }, options)
  );

  return Buffer.concat(list);
}

const pingFrame1 = Buffer.concat(Sender.frame(
  crypto.randomBytes(5),
  Object.assign({ opcode: 0x09 }, options)
));

const textFrame = Buffer.from('819461616161' + '61'.repeat(20), 'hex');
const pingFrame2 = Buffer.from('8900', 'hex');
const closeFrame = Buffer.from('8800', 'hex');
const binaryFrame1 = createBinaryFrame(125);
const binaryFrame2 = createBinaryFrame(65535);
const binaryFrame3 = createBinaryFrame(200 * 1024);
const binaryFrame4 = createBinaryFrame(1024 * 1024);

const suite = new benchmark.Suite();
const receiver = new Receiver();

receiver.onmessage = receiver.onclose = receiver.onping = () => {};

suite.add('ping frame (5 bytes payload)', () => receiver.add(pingFrame1));
suite.add('ping frame (no payload)', () => receiver.add(pingFrame2));
suite.add('close frame (no payload)', () => receiver.add(closeFrame));
suite.add('text frame (20 bytes payload)', () => receiver.add(textFrame));
suite.add('binary frame (125 bytes payload)', () => receiver.add(binaryFrame1));
suite.add('binary frame (65535 bytes payload)', () => receiver.add(binaryFrame2));
suite.add('binary frame (200 KiB payload)', () => receiver.add(binaryFrame3));
suite.add('binary frame (1 MiB payload)', () => receiver.add(binaryFrame4));

suite.on('cycle', (e) => console.log(e.target.toString()));

if (require.main === module) {
  suite.run({ async: true });
} else {
  module.exports = suite;
}
