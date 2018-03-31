module.exports = function () {
  throw new Error('ws only supports Node.js! Please consider to use `isomorphic-ws` for both Node.js & Browser support! (See issue #1344 at https://github.com/websockets/ws/issues/1344 for more information.');
};
