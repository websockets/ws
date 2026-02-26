'use strict';

const { randomBytes } = require('crypto');
const { URL } = require('url');

const subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;

/**
 * Builds the HTTP request for a WebSocket handshake.
 * Individual methods can be subclassed to customize behavior.
 */
class HandshakeRequest {
  /**
   * @param {(String|URL)} address The URL to connect to
   * @param {Array} protocols The subprotocols
   * @param {Object} opts Options object
   * @param {String} [extensionOfferHeader] The Sec-WebSocket-Extensions value
   * @return {Object} An object with `parsedUrl`, `key`, `protocolSet`, and
   *     fields suitable for `http.request()` / `https.request()`
   */
  build(address, protocols, opts, extensionOfferHeader) {
    const parsedUrl = this.parseUrl(address);
    this.validateUrl(parsedUrl);

    const key = this.generateKey();
    const protocolSet = this.buildProtocolSet(protocols);

    const headers = {};

    //
    // User headers first, then WS protocol headers (which take precedence).
    //
    if (opts.headers) {
      Object.assign(headers, opts.headers);
    }

    headers['Sec-WebSocket-Version'] = String(opts.protocolVersion);
    headers['Sec-WebSocket-Key'] = key;
    headers['Connection'] = 'Upgrade';
    headers['Upgrade'] = 'websocket';

    if (extensionOfferHeader) {
      headers['Sec-WebSocket-Extensions'] = extensionOfferHeader;
    }
    if (protocolSet.size) {
      headers['Sec-WebSocket-Protocol'] = protocols.join(',');
    }
    if (opts.origin) {
      if (opts.protocolVersion < 13) {
        headers['Sec-WebSocket-Origin'] = opts.origin;
      } else {
        headers['Origin'] = opts.origin;
      }
    }

    const isSecure = parsedUrl.protocol === 'wss:';
    const isIpcUrl = parsedUrl.protocol === 'ws+unix:';
    const defaultPort = isSecure ? 443 : 80;

    const host = parsedUrl.hostname.startsWith('[')
      ? parsedUrl.hostname.slice(1, -1)
      : parsedUrl.hostname;

    const path = parsedUrl.pathname + parsedUrl.search;

    const result = {
      parsedUrl,
      key,
      protocolSet,
      host,
      port: parsedUrl.port || defaultPort,
      path,
      defaultPort,
      timeout: opts.handshakeTimeout,
      headers
    };

    //
    // Handle auth. URL credentials take precedence over opts.auth.
    // Node.js http.request() generates the Authorization header from
    // opts.auth.
    //
    if (parsedUrl.username || parsedUrl.password) {
      result.auth = `${parsedUrl.username}:${parsedUrl.password}`;
    } else if (opts.auth) {
      result.auth = opts.auth;
    }

    if (isIpcUrl) {
      const parts = path.split(':');

      result.socketPath = parts[0];
      result.path = parts[1];
    }

    return result;
  }

  parseUrl(address) {
    let parsedUrl;

    if (address instanceof URL) {
      parsedUrl = address;
    } else {
      try {
        parsedUrl = new URL(address);
      } catch (e) {
        throw new SyntaxError(`Invalid URL: ${address}`);
      }
    }

    if (parsedUrl.protocol === 'http:') {
      parsedUrl.protocol = 'ws:';
    } else if (parsedUrl.protocol === 'https:') {
      parsedUrl.protocol = 'wss:';
    }

    return parsedUrl;
  }

  validateUrl(parsedUrl) {
    const isSecure = parsedUrl.protocol === 'wss:';
    const isIpcUrl = parsedUrl.protocol === 'ws+unix:';
    let message;

    if (parsedUrl.protocol !== 'ws:' && !isSecure && !isIpcUrl) {
      message =
        'The URL\'s protocol must be one of "ws:", "wss:", ' +
        '"http:", "https:", or "ws+unix:"';
    } else if (isIpcUrl && !parsedUrl.pathname) {
      message = "The URL's pathname is empty";
    } else if (parsedUrl.hash) {
      message = 'The URL contains a fragment identifier';
    }

    if (message) throw new SyntaxError(message);
  }

  generateKey() {
    return randomBytes(16).toString('base64');
  }

  initRedirectOptions(options) {
    //
    // Shallow copy the user provided options so that headers can be changed
    // without mutating the original object.
    //
    const headers = options.headers;
    options = { ...options, headers: {} };

    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        options.headers[key.toLowerCase()] = value;
      }
    }

    return options;
  }

  stripRedirectAuth(opts, isSameHost) {
    //
    // Match curl 7.77.0 behavior and drop the following headers. These
    // headers are also dropped when following a redirect to a subdomain.
    //
    delete opts.headers.authorization;
    delete opts.headers.cookie;

    if (!isSameHost) delete opts.headers.host;

    opts.auth = undefined;
  }

  injectAuthHeader(headers, auth) {
    //
    // Match curl 7.77.0 behavior and make the first `Authorization` header win.
    // If the `Authorization` header is set, then there is nothing to do as it
    // will take precedence.
    //
    if (auth && !headers.authorization) {
      headers.authorization = 'Basic ' + Buffer.from(auth).toString('base64');
    }
  }

  buildProtocolSet(protocols) {
    const protocolSet = new Set();

    for (const protocol of protocols) {
      if (
        typeof protocol !== 'string' ||
        !subprotocolRegex.test(protocol) ||
        protocolSet.has(protocol)
      ) {
        throw new SyntaxError(
          'An invalid or duplicated subprotocol was specified'
        );
      }

      protocolSet.add(protocol);
    }

    return protocolSet;
  }
}

module.exports = HandshakeRequest;
