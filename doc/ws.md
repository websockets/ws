# ws

## Class: WebSocket.Server

This class represents a WebSocket server. It extends the `EventEmitter`.

### new WebSocket.Server(options[, callback])

- `options` {Object}
  - `host` {String} The hostname where to bind the server.
  - `port` {Number} The port where to bind the server.
  - `backlog` {Number} The maximum length of the queue of pending connections.
  - `server` {http.Server|https.Server} A pre-created Node.js HTTP server.
  - `verifyClient` {Function} A function which can be used to validate incoming
    connections. See description below.
  - `handleProtocols` {Function} A function which can be used to handle the
    WebSocket subprotocols. See description below.
  - `path` {String} Accept only connections matching this path.
  - `noServer` {Boolean} Enable no server mode.
  - `clientTracking` {Boolean} Specifies whether or not to track clients.
  - `perMessageDeflate` {Boolean|Object} Enable/disable permessage-deflate.
  - `maxPayload` {Number} The maximum allowed message size in bytes.
- `callback` {Function}

Create a new server instance. One of `port`, `server` or `noServer` must be
provided or an error is thrown.


If `verifyClient` is not set then the handshake is automatically accepted. If
it is is provided with a single argument then that is:

- `info` {Object}
  - `origin` {String} The value in the Origin header indicated by the client.
  - `req` {http.IncomingMessage} The client HTTP GET request.
  - `secure` {Boolean} `true` if `req.connection.authorized` or
    `req.connection.encrypted` is set.

The return value (Boolean) of the function determines whether or not to accept
the handshake.

if `verifyClient` is provided with two arguments then those are:

- `info` {Object} Same as above.
- `cb` {Function} A callback that must be called by the user upon inspection
  of the `info` fields. Arguments in this callback are:
  - `result` {Boolean} Whether or not to accept the handshake.
  - `code` {Number} When `result` is `false` this field determines the HTTP
    error status code to be sent to the client.
  - `name` {String} When `result` is `false` this field determines the HTTP
    reason phrase.


If `handleProtocols` is not set then the handshake is automatically accepted,
otherwise the function takes two arguments:

- `protocols` {Array} The list of WebSocket subprotocols indicated by the
  client in the `Sec-WebSocket-Protocol` header.
- `request` {http.IncomingMessage} The client HTTP GET request.

If returned value is `false` then the handshake is rejected with the HTTP 401
status code, otherwise the returned value sets the value of the
`Sec-WebSocket-Protocol` header in the HTTP 101 response.

`perMessageDeflate` can be used to control the behavior of
[permessage-deflate extension][permessage-deflate].
The extension is disabled when `false` (default value). If an object is
provided then that is extension parameters:

- `serverNoContextTakeover` {Boolean} Whether to use context takeover or not.
- `clientNoContextTakeover` {Boolean} Acknowledge disabling of client context
  takeover.
- `serverMaxWindowBits` {Number} The value of `windowBits`.
- `clientMaxWindowBits` {Number} Request a custom client window size.
- `level` {Number} The value of zlib's `level` param (0-9, default 8).
- `memLevel` {Number} The value of zlib's `memLevel` param (1-9, default 8).
- `threshold` {Number} Payloads smaller than this will not be compressed.
  Defaults to 1024 bytes.
- `concurrencyLimit` {Number} The number of concurrent calls to zlib.
  Calls above this limit will be queued. Default 10. You usually won't
  need to touch this option. See [this issue][concurrency-limit] for more
  details.

If a property is empty then either an offered configuration or a default value
is used.
When sending a fragmented message the length of the first fragment is compared
to the threshold. This determines if compression is used for the entire message.


`callback` will be added as a listener for the `listening` event when the
HTTP server is created internally and that is when the `port` option is
provided.

### Event: 'connection'

- `socket` {WebSocket}
- `request` {http.IncomingMessage}

Emitted when the handshake is complete. `request` is the http GET request sent
by the client. Useful for parsing authority headers, cookie headers, and other
information.

### Event: 'error'

- `error` {Error}

Emitted when an error occurs on the underlying server.

### Event: 'headers'

- `headers` {Array}
- `request` {http.IncomingMessage}

Emitted before the response headers are written to the socket as part of the
handshake. This allows you to inspect/modify the headers before they are sent.

### Event: 'listening'

Emitted when the underlying server has been bound.

### server.clients

- {Set}

A set that stores all connected clients. Please note that this property is only
added when the `clientTracking` is truthy.

### server.close([callback])

Close the server and terminate all clients, calls callback when done.

### server.handleUpgrade(request, socket, head, callback)

- `request` {http.IncomingMessage} The client HTTP GET request.
- `socket` {net.Socket} The network socket between the server and client.
- `head` {Buffer} The first packet of the upgraded stream.
- `callback` {Function}.

Handle a HTTP upgrade request. When the HTTP server is created internally or
when the HTTP server is passed via the `server` option, this method is called
automatically. When operating in "noServer" mode, this method must be called
manually.

If the upgrade is successful, the `callback` is called with a `WebSocket`
object as parameter.

### server.shouldHandle(request)

- `request` {http.IncomingMessage} The client HTTP GET request.

See if a given request should be handled by this server.
By default this method validates the pathname of the request, matching it
against the `path` option if provided.
The return value, `true` or `false`, determines whether or not to accept the
handshake.

This method can be overridden when a custom handling logic is required.

## Class: WebSocket

This class represents a WebSocket. It extends the `EventEmitter`.

### Ready state constants

|Constant   | Value | Description                                      |
|-----------|-------|--------------------------------------------------|
|CONNECTING | 0     | The connection is not yet open.                  |
|OPEN       | 1     | The connection is open and ready to communicate. |
|CLOSING    | 2     | The connection is in the process of closing.     |
|CLOSED     | 3     | The connection is closed.                        |

### new WebSocket(address[, protocols][, options])

- `address` {String} The URL to which to connect.
- `protocols` {String|Array} The list of subprotocols.
- `options` {Object}
  - `protocol` {String} Value of the `Sec-WebSocket-Protocol` header.
  - `handshakeTimeout` {Number} Timeout in milliseconds for the handshake request.
  - `perMessageDeflate` {Boolean|Object} Enable/disable permessage-deflate.
  - `localAddress` {String} Local interface to bind for network connections.
  - `protocolVersion` {Number} Value of the `Sec-WebSocket-Version` header.
  - `headers` {Object} An object with custom headers to send along with the
    request.
  - `origin` {String} Value of the `Origin` or `Sec-WebSocket-Origin` header
    depending on the `protocolVersion`.
  - `agent` {http.Agent|https.Agent} Use the specified Agent.
  - `host` {String} Value of the `Host` header.
  - `family` {Number} IP address family to use during hostname lookup (4 or 6).
  - `checkServerIdentity` {Function} A function to validate the server hostname.
  - `rejectUnauthorized` {Boolean} Verify or not the server certificate.
  - `passphrase` {String} The passphrase for the private key or pfx.
  - `ecdhCurve` {String} A named curve or a colon separated list of curve NIDs
    or names to use for ECDH key agreement.
  - `ciphers` {String} The ciphers to use or exclude
  - `cert` {String|Array|Buffer} The certificate key.
  - `key` {String|Array|Buffer} The private key.
  - `pfx` {String|Buffer} The private key, certificate, and CA certs.
  - `ca` {Array} Trusted certificates.

`perMessageDeflate` default value is `true`. When using an object, parameters
are the same of the server. The only difference is the direction of requests.
For example, `serverNoContextTakeover` can be used to ask the server to
disable context takeover.

Create a new WebSocket instance.

#### UNIX Domain Sockets

`ws` supports making requests to UNIX domain sockets. To make one, use the
following URL scheme:

```
ws+unix:///absolute/path/to/uds_socket:/pathname?search_params
```

Note that `:` is the separator between the socket path and the URL path. If
the URL path is omitted

```
ws+unix:///absolute/path/to/uds_socket
```

it defaults to `/`.

### Event: 'close'

- `code` {Number}
- `reason` {String}

Emitted when the connection is closed. `code` is a numeric value indicating the
status code explaining why the connection has been closed. `reason` is a
human-readable string explaining why the connection has been closed.

### Event: 'error'

- `error` {Error}

Emitted when an error occurs. Errors from the underlying `net.Socket` are
forwarded here.

### Event: 'headers'

- `headers` {Object}
- `response` {http.IncomingMessage}

Emitted when response headers are received from the server as part of the
handshake.  This allows you to read headers from the server, for example
'set-cookie' headers.

### Event: 'message'

- `data` {String|Buffer|ArrayBuffer|Buffer[]}

Emitted when a message is received from the server.

### Event: 'open'

Emitted when the connection is established.

### Event: 'ping'

- `data` {Buffer}

Emitted when a ping is received from the server.

### Event: 'pong'

- `data` {Buffer}

Emitted when a pong is received from the server.

### Event: 'unexpected-response'

- `request` {http.ClientRequest}
- `response` {http.IncomingMessage}

Emitted when the server response is not the expected one, for example a 401
response. This event gives the ability to read the response in order to extract
useful information. If the server sends an invalid response and there isn't a
listener for this event, an error is emitted.

### websocket.addEventListener(type, listener)

- `type` {String} A string representing the event type to listen for.
- `listener` {Function} The listener to add.

Register an event listener emulating the `EventTarget` interface.

### websocket.binaryType

- {String}

A string indicating the type of binary data being transmitted by the connection.
This should be one of "nodebuffer", "arraybuffer" or "fragments". Defaults to
"nodebuffer". Type "fragments" will emit the array of fragments as received from
the sender, without copyfull concatenation, which is useful for the performance
of binary protocols transferring large messages with multiple fragments.

### websocket.bufferedAmount

- {Number}

The number of bytes of data that have been queued using calls to `send()` but
not yet transmitted to the network.

### websocket.bytesReceived

- {Number}

Received bytes count.

### websocket.close([code][, reason])

- `code` {Number} A numeric value indicating the status code explaining why
  the connection is being closed.
- `reason` {String} A human-readable string explaining why the connection is
  closing.

Initiate a closing handshake.

### websocket.extensions

- {Object}

An object containing the negotiated extensions.

### websocket.onclose

- {Function}

An event listener to be called when connection is closed. The listener receives
a `CloseEvent` named "close".

### websocket.onerror

- {Function}

An event listener to be called when an error occurs. The listener receives
an `Error` instance.

### websocket.onmessage

- {Function}

An event listener to be called when a message is received from the server. The
listener receives a `MessageEvent` named "message".

### websocket.onopen

- {Function}

An event listener to be called when the connection is established. The listener
receives an `OpenEvent` named "open".

### websocket.pause()

Pause the socket.

### websocket.ping([data[, mask[, failSilently]]])

- `data` {Any} The data to send in the ping frame.
- `mask` {Boolean} Specifies whether `data` should be masked or not. Defaults
  to `true` when `websocket` is not a server client.
- `failSilently` {Boolean} Specifies whether or not to throw an error if the
  connection is not open.

Send a ping.

### websocket.pong([data[, mask[, failSilently]]])

- `data` {Any} The data to send in the pong frame.
- `mask` {Boolean} Specifies whether `data` should be masked or not. Defaults
  to `true` when `websocket` is not a server client.
- `failSilently` {Boolean} Specifies whether or not to throw an error if the
  connection is not open.

Send a pong.

### websocket.protocol

- {String}

The subprotocol selected by the server.

### websocket.protocolVersion

- {Number}

The WebSocket protocol version used for this connection, 8 or 13.

### websocket.readyState

- {Number}

The current state of the connection. This is one of the ready state constants.

### websocket.removeEventListener(type, listener)

- `type` {String} A string representing the event type to remove.
- `listener` {Function} The listener to remove.

Removes an event listener emulating the `EventTarget` interface.

### websocket.resume()

Resume the socket.

### websocket.send(data, [options][, callback])

- `data` {Any} The data to send.
- `options` {Object}
  - `compress` {Boolean} Specifies whether `data` should be compressed or not.
    Defaults to `true` when permessage-deflate is enabled.
  - `binary` {Boolean} Specifies whether `data` should be sent as a binary or not.
    Default is autodetected.
  - `mask` {Boolean} Specifies whether `data` should be masked or not. Defaults
    to `true` when `websocket` is not a server client.
  - `fin` {Boolean} Specifies whether `data` is the last fragment of a message or
    not. Defaults to `true`.
- `callback` {Function} An optional callback which is invoked when `data` is
  written out.

Send `data` through the connection.

### websocket.terminate()

Forcibly close the connection.

### websocket.url

- {String}

The URL of the WebSocket server. Server clients don't have this attribute.

[concurrency-limit]: https://github.com/websockets/ws/issues/1202
[permessage-deflate]: https://tools.ietf.org/html/draft-ietf-hybi-permessage-compression-19
