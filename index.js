/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

'use strict';

const WS = module.exports = require('./lib/WebSocket');

WS.Server = require('./lib/WebSocketServer');
WS.Receiver = require('./lib/Receiver');
WS.Sender = require('./lib/Sender');

/**
 * A factory function, which returns a new `WebSocketServer`.
 *
 * @param {Object} options Configuration options
 * @param {Function} fn A listener for the `connection` event
 * @return {WebSocketServer}
 * @public
 */
WS.createServer = function createServer (options, fn) {
  const server = new WS.Server(options);

  if (fn) server.on('connection', fn);
  return server;
};

/**
 * A factory function, which returns a new `WebSocket` and automatically
 * connectes to the supplied address.
 *
 * @param {String} address The URL to which to connect
 * @param {(String|String[])} protocols The list of subprotocols
 * @param {Object} options Connection options
 * @param {Function} fn A listener for the `open` event
 * @return {WebSocket}
 * @public
 */
WS.connect = WS.createConnection = function connect (address, protocols, options, fn) {
  if (typeof protocols === 'function') {
    fn = protocols;
    protocols = options = null;
  } else if (typeof protocols === 'object' && !Array.isArray(protocols)) {
    fn = options;
    options = protocols;
    protocols = null;
  }

  if (typeof options === 'function') {
    fn = options;
    options = null;
  }

  const client = new WS(address, protocols, options);

  if (fn) client.on('open', fn);
  return client;
};
