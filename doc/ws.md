# ws

## Table of Contents

- [Class: WebSocketServer](#class-websocketserver)
  - [new WebSocketServer(options[, callback])](#new-websocketserveroptions-callback)
  - [Event: 'close'](#event-close)
  - [Event: 'connection'](#event-connection)
  - [Event: 'error'](#event-error)
  - [Event: 'headers'](#event-headers)
  - [Event: 'listening'](#event-listening)
  - [Event: 'wsClientError'](#event-wsclienterror)
  - [server.address()](#serveraddress)
  - [server.clients](#serverclients)
  - [server.close([callback])](#serverclosecallback)
  - [server.handleUpgrade(request, socket, head, callback)](#serverhandleupgraderequest-socket-head-callback)
  - [server.shouldHandle(request)](#servershouldhandlerequest)
- [Class: WebSocket](#class-websocket)
  - [Ready state constants](#ready-state-constants)
  - [new WebSocket(address[, protocols][, options])](#new-websocketaddress-protocols-options)
    - [UNIX Domain Sockets](#unix-domain-sockets)
  - [Event: 'close'](#event-close-1)
  - [Event: 'error'](#event-error-1)
  - [Event: 'message'](#event-message)
  - [Event: 'open'](#event-open)
  - [Event: 'ping'](#event-ping)
  - [Event: 'pong'](#event-pong)
  - [Event: 'redirect'](#event-redirect)
  - [Event: 'unexpected-response'](#event-unexpected-response)
  - [Event: 'upgrade'](#event-upgrade)
  - [websocket.addEventListener(type, listener[, options])](#websocketaddeventlistenertype-listener-options)
  - [websocket.binaryType](#websocketbinarytype)
  - [websocket.bufferedAmount](#websocketbufferedamount)
  - [websocket.close([code[, reason]])](#websocketclosecode-reason)
  - [websocket.extensions](#websocketextensions)
  - [websocket.isPaused](#websocketispaused)
  - [websocket.onclose](#websocketonclose)
  - [websocket.onerror](#websocketonerror)
  - [websocket.onmessage](#websocketonmessage)
  - [websocket.onopen](#websocketonopen)
  - [websocket.pause()](#websocketpause)
  - [websocket.ping([data[, mask]][, callback])](#websocketpingdata-mask-callback)
  - [websocket.pong([data[, mask]][, callback])](#websocketpongdata-mask-callback)
  - [websocket.protocol](#websocketprotocol)
  - [websocket.readyState](#websocketreadystate)
  - [websocket.removeEventListener(type, listener)](#websocketremoveeventlistenertype-listener)
  - [websocket.resume()](#websocketresume)
  - [websocket.send(data[, options][, callback])](#websocketsenddata-options-callback)
  - [websocket.terminate()](#websocketterminate)
  - [websocket.url](#websocketurl)
- [createWebSocketStream(websocket[, options])](#createwebsocketstreamwebsocket-options)
- [Environment variables](#environment-variables)
  - [WS_NO_BUFFER_UTIL](#ws_no_buffer_util)
  - [WS_NO_UTF_8_VALIDATE](#ws_no_utf_8_validate)
- [Error codes](#error-codes)
  - [WS_ERR_EXPECTED_FIN](#ws_err_expected_fin)
  - [WS_ERR_EXPECTED_MASK](#ws_err_expected_mask)
  - [WS_ERR_INVALID_CLOSE_CODE](#ws_err_invalid_close_code)
  - [WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH](#ws_err_invalid_control_payload_length)
  - [WS_ERR_INVALID_OPCODE](#ws_err_invalid_opcode)
  - [WS_ERR_INVALID_UTF8](#ws_err_invalid_utf8)
  - [WS_ERR_UNEXPECTED_MASK](#ws_err_unexpected_mask)
  - [WS_ERR_UNEXPECTED_RSV_1](#ws_err_unexpected_rsv_1)
  - [WS_ERR_UNEXPECTED_RSV_2_3](#ws_err_unexpected_rsv_2_3)
  - [WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH](#ws_err_unsupported_data_payload_length)
  - [WS_ERR_UNSUPPORTED_MESSAGE_LENGTH](#ws_err_unsupported_message_length)

## Class: WebSocketServer

This class represents a WebSocket server. It extends the `EventEmitter`.

### new WebSocketServer(options[, callback])

- `options` {Object}
  - `backlog` {Number} The maximum length of the queue of pending connections.
  - `clientTracking` {Boolean} Specifies whether or not to track clients.
  - `handleProtocols` {Function} A function which can be used to handle the
    WebSocket subprotocols. See description below.
  - `host` {String} The hostname where to bind the server.
  - `maxPayload` {Number} The maximum allowed message size in bytes. Defaults to
    100 MiB (104857600 bytes).
  - `noServer` {Boolean} Enable no server mode.
  - `path` {String} Accept only connections matching this path.
  - `perMessageDeflate` {Boolean|Object} Enable/disable permessage-deflate.
  - `port` {Number} The port where to bind the server.
  - `server` {http.Server|https.Server} A pre-created Node.js HTTP/S server.
  - `skipUTF8Validation` {Boolean} Specifies whether or not to skip UTF-8
    validation for text and close messages. Defaults to `false`. Set to `true`
    only if clients are trusted.
  - `verifyClient` {Function} A function which can be used to validate incoming
    connections. See description below. (Usage is discouraged: see
    [Issue #337](https://github.com/websockets/ws/issues/377#issuecomment-462152231))
  - `WebSocket` {Function} Specifies the `WebSocket` class to be used. It must
    be extended from the original `WebSocket`. Defaults to `WebSocket`.
- `callback` {Function}

Create a new server instance. One and only one of `port`, `server` or `noServer`
must be provided or an error is thrown. An HTTP server is automatically created,
started, and used if `port` is set. To use an external HTTP/S server instead,
specify only `server` or `noServer`. In this case the HTTP/S server must be
started manually. The "noServer" mode allows the WebSocket server to be
completely detached from the HTTP/S server. This makes it possible, for example,
to share a single HTTP/S server between multiple WebSocket servers.

> **NOTE:** Use of `verifyClient` is discouraged. Rather handle client
> authentication in the `upgrade` event of the HTTP server. See examples for
> more details.

If `verifyClient` is not set then the handshake is automatically accepted. If it
has a single parameter then `ws` will invoke it with the following argument:

- `info` {Object}
  - `origin` {String} The value in the Origin header indicated by the client.
  - `req` {http.IncomingMessage} The client HTTP GET request.
  - `secure` {Boolean} `true` if `req.socket.authorized` or
    `req.socket.encrypted` is set.

The return value (`Boolean`) of the function determines whether or not to accept
the handshake.

If `verifyClient` has two parameters then `ws` will invoke it with the following
arguments:

- `info` {Object} Same as above.
- `cb` {Function} A callback that must be called by the user upon inspection of
  the `info` fields. Arguments in this callback are:
  - `result` {Boolean} Whether or not to accept the handshake.
  - `code` {Number} When `result` is `false` this field determines the HTTP
    error status code to be sent to the client.
  - `name` {String} When `result` is `false` this field determines the HTTP
    reason phrase.
  - `headers` {Object} When `result` is `false` this field determines additional
    HTTP headers to be sent to the client. For example,
    `{ 'Retry-After': 120 }`.

`handleProtocols` takes two arguments:

- `protocols` {Set} The list of WebSocket subprotocols indicated by the client
  in the `Sec-WebSocket-Protocol` header.
- `request` {http.IncomingMessage} The client HTTP GET request.

The returned value sets the value of the `Sec-WebSocket-Protocol` header in the
HTTP 101 response. If returned value is `false` the header is not added in the
response.

If `handleProtocols` is not set then the first of the client's requested
subprotocols is used.

`perMessageDeflate` can be used to control the behavior of [permessage-deflate
extension][permessage-deflate]. The extension is disabled when `false` (default
value). If an object is provided then that is extension parameters:

- `serverNoContextTakeover` {Boolean} Whether to use context takeover or not.
- `clientNoContextTakeover` {Boolean} Acknowledge disabling of client context
  takeover.
- `serverMaxWindowBits` {Number} The value of `windowBits`.
- `clientMaxWindowBits` {Number} Request a custom client window size.
- `zlibDeflateOptions` {Object} [Additional options][zlib-options] to pass to
  zlib on deflate.
- `zlibInflateOptions` {Object} [Additional options][zlib-options] to pass to
  zlib on inflate.
- `threshold` {Number} Payloads smaller than this will not be compressed if
  context takeover is disabled. Defaults to 1024 bytes.
- `concurrencyLimit` {Number} The number of concurrent calls to zlib. Calls
  above this limit will be queued. Default 10. You usually won't need to touch
  this option. See [this issue][concurrency-limit] for more details.

If a property is empty then either an offered configuration or a default value
is used. When sending a fragmented message the length of the first fragment is
compared to the threshold. This determines if compression is used for the entire
message.

`callback` will be added as a listener for the `listening` event on the HTTP
server when not operating in "noServer" mode.

### Event: 'close'

Emitted when the server closes. This event depends on the `'close'` event of
HTTP server only when it is created internally. In all other cases, the event is
emitted independently.

### Event: 'connection'

- `websocket` {WebSocket}
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

### Event: 'wsClientError'

- `error` {Error}
- `socket` {net.Socket|tls.Socket}
- `request` {http.IncomingMessage}

Emitted when an error occurs before the WebSocket connection is established.
`socket` and `request` are respectively the socket and the HTTP request from
which the error originated. The listener of this event is responsible for
closing the socket. When the `'wsClientError'` event is emitted there is no
`http.ServerResponse` object, so any HTTP response, including the response
headers and body, must be written directly to the `socket`. If there is no
listener for this event, the socket is closed with a default 4xx response
containing a descriptive error message.

### server.address()

Returns an object with `port`, `family`, and `address` properties specifying the
bound address, the address family name, and port of the server as reported by
the operating system if listening on an IP socket. If the server is listening on
a pipe or UNIX domain socket, the name is returned as a string.

### server.clients

- {Set}

A set that stores all connected clients. Please note that this property is only
added when the `clientTracking` is truthy.

### server.close([callback])

Prevent the server from accepting new connections and close the HTTP server if
created internally. If an external HTTP server is used via the `server` or
`noServer` constructor options, it must be closed manually. Existing connections
are not closed automatically. The server emits a `'close'` event when all
connections are closed unless an external HTTP server is used and client
tracking is disabled. In this case the `'close'` event is emitted in the next
tick. The optional callback is called when the `'close'` event occurs and
receives an `Error` if the server is already closed.

### server.handleUpgrade(request, socket, head, callback)

- `request` {http.IncomingMessage} The client HTTP GET request.
- `socket` {net.Socket|tls.Socket} The network socket between the server and
  client.
- `head` {Buffer} The first packet of the upgraded stream.
- `callback` {Function}.

Handle a HTTP upgrade request. When the HTTP server is created internally or
when the HTTP server is passed via the `server` option, this method is called
automatically. When operating in "noServer" mode, this method must be called
manually.

If the upgrade is successful, the `callback` is called with two arguments:

- `websocket` {WebSocket} A `WebSocket` object.
- `request` {http.IncomingMessage} The client HTTP GET request.

### server.shouldHandle(request)

- `request` {http.IncomingMessage} The client HTTP GET request.

See if a given request should be handled by this server. By default this method
validates the pathname of the request, matching it against the `path` option if
provided. The return value, `true` or `false`, determines whether or not to
accept the handshake.

This method can be overridden when a custom handling logic is required.

## Class: WebSocket

This class represents a WebSocket. It extends the `EventEmitter`.

### Ready state constants

| Constant   | Value | Description                                      |
| ---------- | ----- | ------------------------------------------------ |
| CONNECTING | 0     | The connection is not yet open.                  |
| OPEN       | 1     | The connection is open and ready to communicate. |
| CLOSING    | 2     | The connection is in the process of closing.     |
| CLOSED     | 3     | The connection is closed.                        |

### new WebSocket(address[, protocols][, options])

- `address` {String|url.URL} The URL to which to connect.
- `protocols` {String|Array} The list of subprotocols.
- `options` {Object}
  - `followRedirects` {Boolean} Whether or not to follow redirects. Defaults to
    `false`.
  - `generateMask` {Function} The function used to generate the masking key. It
    takes a `Buffer` that must be filled synchronously and is called before a
    message is sent, for each message. By default the buffer is filled with
    cryptographically strong random bytes.
  - `handshakeTimeout` {Number} Timeout in milliseconds for the handshake
    request. This is reset after every redirection.
  - `maxPayload` {Number} The maximum allowed message size in bytes. Defaults to
    100 MiB (104857600 bytes).
  - `maxRedirects` {Number} The maximum number of redirects allowed. Defaults
    to 10.
  - `origin` {String} Value of the `Origin` or `Sec-WebSocket-Origin` header
    depending on the `protocolVersion`.
  - `perMessageDeflate` {Boolean|Object} Enable/disable permessage-deflate.
  - `protocolVersion` {Number} Value of the `Sec-WebSocket-Version` header.
  - `skipUTF8Validation` {Boolean} Specifies whether or not to skip UTF-8
    validation for text and close messages. Defaults to `false`. Set to `true`
    only if the server is trusted.
  - Any other option allowed in [`http.request()`][] or [`https.request()`][].
    Options given do not have any effect if parsed from the URL given with the
    `address` parameter.

`perMessageDeflate` default value is `true`. When using an object, parameters
are the same of the server. The only difference is the direction of requests.
For example, `serverNoContextTakeover` can be used to ask the server to disable
context takeover.

Create a new WebSocket instance.

#### UNIX Domain Sockets

`ws` supports making requests to UNIX domain sockets. To make one, use the
following URL scheme:

```
ws+unix:///absolute/path/to/uds_socket:/pathname?search_params
```

Note that `:` is the separator between the socket path and the URL path. If the
URL path is omitted

```
ws+unix:///absolute/path/to/uds_socket
```

it defaults to `/`.

### Event: 'close'

- `code` {Number}
- `reason` {Buffer}

Emitted when the connection is closed. `code` is a numeric value indicating the
status code explaining why the connection has been closed. `reason` is a
`Buffer` containing a human-readable string explaining why the connection has
been closed.

### Event: 'error'

- `error` {Error}

Emitted when an error occurs. Errors may have a `.code` property, matching one
of the string values defined below under [Error codes](#error-codes).

### Event: 'message'

- `data` {Buffer|ArrayBuffer|Buffer[]}
- `isBinary` {Boolean}

Emitted when a message is received. `data` is the message content. `isBinary`
specifies whether the message is binary or not.

### Event: 'open'

Emitted when the connection is established.

### Event: 'ping'

- `data` {Buffer}

Emitted when a ping is received from the server.

### Event: 'pong'

- `data` {Buffer}

Emitted when a pong is received from the server.

### Event: 'redirect'

- `url` {String}
- `request` {http.ClientRequest}

Emitted before a redirect is followed. `url` is the redirect URL. `request` is
the HTTP GET request with the headers queued. This event gives the ability to
inspect confidential headers and remove them on a per-redirect basis using the
[`request.getHeader()`][] and [`request.removeHeader()`][] API. The `request`
object should be used only for this purpose. When there is at least one listener
for this event, no header is removed by default, even if the redirect is to a
different domain.

### Event: 'unexpected-response'

- `request` {http.ClientRequest}
- `response` {http.IncomingMessage}

Emitted when the server response is not the expected one, for example a 401
response. This event gives the ability to read the response in order to extract
useful information. If the server sends an invalid response and there isn't a
listener for this event, an error is emitted.

### Event: 'upgrade'

- `response` {http.IncomingMessage}

Emitted when response headers are received from the server as part of the
handshake. This allows you to read headers from the server, for example
'set-cookie' headers.

### websocket.addEventListener(type, listener[, options])

- `type` {String} A string representing the event type to listen for.
- `listener` {Function} The listener to add.
- `options` {Object}
  - `once` {Boolean} A `Boolean` indicating that the listener should be invoked
    at most once after being added. If `true`, the listener would be
    automatically removed when invoked.

Register an event listener emulating the `EventTarget` interface. This method
does nothing if `type` is not one of `'close'`, `'error'`, `'message'`, or
`'open'`.

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
not yet transmitted to the network. This deviates from the HTML standard in the
following ways:

1. If the data is immediately sent the value is `0`.
1. All framing bytes are included.

### websocket.close([code[, reason]])

- `code` {Number} A numeric value indicating the status code explaining why the
  connection is being closed.
- `reason` {String|Buffer} The reason why the connection is closing.

Initiate a closing handshake.

### websocket.isPaused

- {Boolean}

Indicates whether the websocket is paused.

### websocket.extensions

- {Object}

An object containing the negotiated extensions.

### websocket.onclose

- {Function}

An event listener to be called when connection is closed. The listener receives
a `CloseEvent` named "close".

### websocket.onerror

- {Function}

An event listener to be called when an error occurs. The listener receives an
`ErrorEvent` named "error".

### websocket.onmessage

- {Function}

An event listener to be called when a message is received from the server. The
listener receives a `MessageEvent` named "message".

### websocket.onopen

- {Function}

An event listener to be called when the connection is established. The listener
receives an `OpenEvent` named "open".

### websocket.pause()

Pause the websocket causing it to stop emitting events. Some events can still be
emitted after this is called, until all buffered data is consumed. This method
is a noop if the ready state is `CONNECTING` or `CLOSED`.

### websocket.ping([data[, mask]][, callback])

- `data` {Array|Number|Object|String|ArrayBuffer|Buffer|DataView|TypedArray} The
  data to send in the ping frame.
- `mask` {Boolean} Specifies whether `data` should be masked or not. Defaults to
  `true` when `websocket` is not a server client.
- `callback` {Function} An optional callback which is invoked when the ping
  frame is written out. If an error occurs, the callback is called with the
  error as its first argument.

Send a ping. This method throws an error if the ready state is `CONNECTING`.

### websocket.pong([data[, mask]][, callback])

- `data` {Array|Number|Object|String|ArrayBuffer|Buffer|DataView|TypedArray} The
  data to send in the pong frame.
- `mask` {Boolean} Specifies whether `data` should be masked or not. Defaults to
  `true` when `websocket` is not a server client.
- `callback` {Function} An optional callback which is invoked when the pong
  frame is written out. If an error occurs, the callback is called with the
  error as its first argument.

Send a pong. This method throws an error if the ready state is `CONNECTING`.

### websocket.protocol

- {String}

The subprotocol selected by the server.

### websocket.resume()

Make a paused socket resume emitting events. This method is a noop if the ready
state is `CONNECTING` or `CLOSED`.

### websocket.readyState

- {Number}

The current state of the connection. This is one of the ready state constants.

### websocket.removeEventListener(type, listener)

- `type` {String} A string representing the event type to remove.
- `listener` {Function} The listener to remove.

Removes an event listener emulating the `EventTarget` interface. This method
only removes listeners added with
[`websocket.addEventListener()`](#websocketaddeventlistenertype-listener-options).

### websocket.send(data[, options][, callback])

- `data` {Array|Number|Object|String|ArrayBuffer|Buffer|DataView|TypedArray} The
  data to send.
- `options` {Object}
  - `binary` {Boolean} Specifies whether `data` should be sent as a binary or
    not. Default is autodetected.
  - `compress` {Boolean} Specifies whether `data` should be compressed or not.
    Defaults to `true` when permessage-deflate is enabled.
  - `fin` {Boolean} Specifies whether `data` is the last fragment of a message
    or not. Defaults to `true`.
  - `mask` {Boolean} Specifies whether `data` should be masked or not. Defaults
    to `true` when `websocket` is not a server client.
- `callback` {Function} An optional callback which is invoked when `data` is
  written out. If an error occurs, the callback is called with the error as its
  first argument.

Send `data` through the connection. This method throws an error if the ready
state is `CONNECTING`.

### websocket.terminate()

Forcibly close the connection. Internally this calls [`socket.destroy()`][].

### websocket.url

- {String}

The URL of the WebSocket server. Server clients don't have this attribute.

## createWebSocketStream(websocket[, options])

- `websocket` {WebSocket} A `WebSocket` object.
- `options` {Object} [Options][duplex-options] to pass to the `Duplex`
  constructor.

Returns a `Duplex` stream that allows to use the Node.js streams API on top of a
given `WebSocket`.

## Environment variables

### WS_NO_BUFFER_UTIL

When set to a non empty value, prevents the optional `bufferutil` dependency
from being required.

### WS_NO_UTF_8_VALIDATE

When set to a non empty value, prevents the optional `utf-8-validate` dependency
from being required.

## Error codes

Errors emitted by the websocket may have a `.code` property, describing the
specific type of error that has occurred:

### WS_ERR_EXPECTED_FIN

A WebSocket frame was received with the FIN bit not set when it was expected.

### WS_ERR_EXPECTED_MASK

An unmasked WebSocket frame was received by a WebSocket server.

### WS_ERR_INVALID_CLOSE_CODE

A WebSocket close frame was received with an invalid close code.

### WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH

A control frame with an invalid payload length was received.

### WS_ERR_INVALID_OPCODE

A WebSocket frame was received with an invalid opcode.

### WS_ERR_INVALID_UTF8

A text or close frame was received containing invalid UTF-8 data.

### WS_ERR_UNEXPECTED_MASK

A masked WebSocket frame was received by a WebSocket client.

### WS_ERR_UNEXPECTED_RSV_1

A WebSocket frame was received with the RSV1 bit set unexpectedly.

### WS_ERR_UNEXPECTED_RSV_2_3

A WebSocket frame was received with the RSV2 or RSV3 bit set unexpectedly.

### WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH

A data frame was received with a length longer than the max supported length
(2^53 - 1, due to JavaScript language limitations).

### WS_ERR_UNSUPPORTED_MESSAGE_LENGTH

A message was received with a length longer than the maximum supported length,
as configured by the `maxPayload` option.

[concurrency-limit]: https://github.com/websockets/ws/issues/1202
[duplex-options]:
  https://nodejs.org/api/stream.html#stream_new_stream_duplex_options
[`http.request()`]:
  https://nodejs.org/api/http.html#http_http_request_options_callback
[`https.request()`]:
  https://nodejs.org/api/https.html#https_https_request_options_callback
[permessage-deflate]:
  https://tools.ietf.org/html/draft-ietf-hybi-permessage-compression-19
[`request.getheader()`]: https://nodejs.org/api/http.html#requestgetheadername
[`request.removeheader()`]:
  https://nodejs.org/api/http.html#requestremoveheadername
[`socket.destroy()`]: https://nodejs.org/api/net.html#net_socket_destroy_error
[zlib-options]: https://nodejs.org/api/zlib.html#zlib_class_options
