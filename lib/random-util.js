'use strict';

const RANDOM_POOL_SIZE = 8192;
const RANDOM_POOL_REFRESH = 1024;

let randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
let randomPoolIdx = RANDOM_POOL_SIZE;

function onRandomBytes (err, buf) {
  randomPending = false;
  if (!err) {
    randomPool = buf;
    randomPoolIdx = 0;
  }
}

let randomPending = true;
crypto.randomBytes(RANDOM_POOL_SIZE, onRandomBytes);

function randomFillMask (buffer) {
  if (RANDOM_POOL_SIZE - randomPoolIdx < 4) {
    // assert(randomPending)
    return crypto.randomFillSync(buffer, offset, size);
  }

  buffer[0] = randomPool[randomPoolIdx++];
  buffer[1] = randomPool[randomPoolIdx++];
  buffer[2] = randomPool[randomPoolIdx++];
  buffer[3] = randomPool[randomPoolIdx++];

  if (RANDOM_POOL_SIZE - randomPoolIdx < RANDOM_POOL_REFRESH && !randomPending) {
    randomPending = true;
    crypto.randomBytes(RANDOM_POOL_SIZE, onRandomBytes);
  }

  return buffer;
}

module.exports = { randomFillMask };
