export const BINARY_TYPES = ['nodebuffer', 'arraybuffer', 'fragments'];
export const hasBlob = typeof Blob !== 'undefined';

export const CLOSE_TIMEOUT = 30000;
export const EMPTY_BUFFER = Buffer.alloc(0);
export const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export const kForOnEventAttribute = Symbol('kIsForOnEventAttribute');
export const kListener = Symbol('kListener');
export const kStatusCode = Symbol('status-code');
export const kWebSocket = Symbol('websocket');
export const NOOP = () => {};

if (hasBlob) BINARY_TYPES.push('blob');

export default {
  BINARY_TYPES,
  CLOSE_TIMEOUT,
  EMPTY_BUFFER,
  GUID,
  hasBlob,
  kForOnEventAttribute,
  kListener,
  kStatusCode,
  kWebSocket,
  NOOP
};
