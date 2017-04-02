/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

const safeBuffer = require('safe-buffer');

const Buffer = safeBuffer.Buffer;

/**
 * Performs hybi07+ type masking.
 */
function mask (buf, maskString) {
  const _mask = Buffer.from(maskString || '3483a868', 'hex');

  buf = Buffer.from(buf);

  for (let i = 0; i < buf.length; ++i) {
    buf[i] ^= _mask[i % 4];
  }

  return buf;
}

/**
 * Left pads the string `s` to a total length of `n` with char `c`.
 */
function padl (s, n, c) {
  return c.repeat(n - s.length) + s;
}

/**
 * Returns a hex string, representing a specific byte count `length`, from a number.
 */
function pack (length, number) {
  return padl(number.toString(16), length, '0');
}

/**
 * Returns a hex string representing the length of a message.
 */
function getHybiLengthAsHexString (len, masked) {
  let s;

  masked = masked ? 0x80 : 0;

  if (len < 126) {
    s = pack(2, masked | len);
  } else if (len < 65536) {
    s = pack(2, masked | 126) + pack(4, len);
  } else {
    s = pack(2, masked | 127) + pack(16, len);
  }

  return s;
}

/**
 * Split a buffer in two.
 */
function splitBuffer (buf) {
  const i = Math.floor(buf.length / 2);
  return [buf.slice(0, i), buf.slice(i)];
}

module.exports = {
  getHybiLengthAsHexString,
  splitBuffer,
  mask,
  pack
};
