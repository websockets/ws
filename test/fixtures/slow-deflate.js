const PerMessageDeflate = require('../../lib/permessage-deflate');

// Wrap a PerMessageDeflate, making its compress & decompress methods slow so that
// can reliably test race conditions.
exports.makeDeflateSlow = (ws, delayMs) => {
  const perMessageDeflateInstance =
    ws._extensions[PerMessageDeflate.extensionName];

  const compress = perMessageDeflateInstance.compress;
  const decompress = perMessageDeflateInstance.decompress;

  const slowDeflate = Object.assign(perMessageDeflateInstance, {
    compress() {
      setTimeout(
        () => compress.apply(perMessageDeflateInstance, arguments),
        delayMs
      );
    },
    decompress() {
      setTimeout(
        () => decompress.apply(perMessageDeflateInstance, arguments),
        delayMs
      );
    }
  });

  ws._extensions[PerMessageDeflate.extensionName] = slowDeflate;
};
