'use strict';

const { createHash } = require('crypto');

const { GUID } = require('./constants');
const { parse } = require('./extension');
const PerMessageDeflate = require('./permessage-deflate');

/**
 * Validates a WebSocket upgrade response. Subclass and override individual
 * methods to customize validation behavior.
 */
class HandshakeValidator {
  /**
   * @param {Object} res The HTTP upgrade response
   * @param {String} key The `Sec-WebSocket-Key` that was sent
   * @param {Set} protocolSet The subprotocols that were offered
   * @param {Object} [perMessageDeflate] The PerMessageDeflate instance, if any
   * @return {{ protocol: String, extensions: Object }}
   */
  validate(res, key, protocolSet, perMessageDeflate) {
    this.validateUpgrade(res);
    this.validateAcceptKey(res.headers['sec-websocket-accept'], key);

    const protocol = this.validateSubprotocol(
      res.headers['sec-websocket-protocol'],
      protocolSet
    );

    const extensions = this.validateExtensions(
      res.headers['sec-websocket-extensions'],
      perMessageDeflate
    );

    return { protocol, extensions };
  }

  validateUpgrade(res) {
    const upgrade = res.headers.upgrade;

    if (upgrade === undefined || upgrade.toLowerCase() !== 'websocket') {
      throw new Error('Invalid Upgrade header');
    }
  }

  validateAcceptKey(actual, key) {
    const expected = createHash('sha1')
      .update(key + GUID)
      .digest('base64');

    if (actual !== expected) {
      throw new Error('Invalid Sec-WebSocket-Accept header');
    }
  }

  validateSubprotocol(serverProt, protocolSet) {
    if (serverProt !== undefined) {
      if (!protocolSet.size) {
        throw new Error('Server sent a subprotocol but none was requested');
      }

      if (!protocolSet.has(serverProt)) {
        throw new Error('Server sent an invalid subprotocol');
      }

      return serverProt;
    }

    if (protocolSet.size) {
      throw new Error('Server sent no subprotocol');
    }

    return '';
  }

  validateExtensions(headerValue, perMessageDeflate) {
    if (headerValue === undefined) return {};

    if (!perMessageDeflate) {
      throw new Error(
        'Server sent a Sec-WebSocket-Extensions header but no extension ' +
          'was requested'
      );
    }

    let extensions;

    try {
      extensions = parse(headerValue);
    } catch (err) {
      throw new Error('Invalid Sec-WebSocket-Extensions header');
    }

    const extensionNames = Object.keys(extensions);

    if (
      extensionNames.length !== 1 ||
      extensionNames[0] !== PerMessageDeflate.extensionName
    ) {
      throw new Error('Server indicated an extension that was not requested');
    }

    try {
      perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
    } catch (err) {
      throw new Error('Invalid Sec-WebSocket-Extensions header');
    }

    return { [PerMessageDeflate.extensionName]: perMessageDeflate };
  }
}

module.exports = HandshakeValidator;
