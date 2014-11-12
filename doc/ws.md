# ws

## Class: ws.Server

This class is a WebSocket server. It is an `EventEmitter`.

### new ws.Server([options], [callback])

* `options` Object
  * `host` String
  * `port` Number
  * `server` http.Server
  * `verifyClient` Function
  * `handleProtocols` Function
  * `noServer` Boolean
  * `disableHixie` Boolean
  * `clientTracking` Boolean
* `callback` Function

Construct a new server object.

Either `port` or `server` must be provided, otherwise you might enable
`noServer` if you want to pass the requests directly. Please note that the
`callback` is only used when you supply the a `port` number in the options.

### options.verifyClient

`verifyClient` can be used in two different ways. If it is provided with two arguments then those are:
* `info` Object:
  * `origin` String: The value in the Origin header indicated by the client.
  * `req` http.IncomingMessage: The client HTTP GET request.
  * `secure` Boolean: `true` if `req.connection.authorized` or `req.connection.encypted` is set.
* `cb` Function: A callback that must be called by the user upon inspection of the `info` fields. Arguments in this callback are:
  * `result` Boolean: Whether the user accepts or not the handshake.
  * `code` Number: If `result` is `false` this field determines the HTTP error status code to be sent to the client.
  * `name` String: If `result` is `false` this field determines the HTTP reason phrase.

If `verifyClient` is provided with a single argument then that is:
* `info` Object: Same as above.

In this case the return code (Boolean) of the function determines whether the handshake is accepted or not.

If `verifyClient` is not set then the handshake is automatically accepted.

### options.handleProtocols

`handleProtocols` receives two arguments:
* `protocols` Array: The list of WebSocket sub-protocols indicated by the client in the Sec-WebSocket-Protocol header.
* `cb` Function: A callback that must be called by the user upon inspection of the protocols. Arguments in this callback are:
  * `result` Boolean: Whether the user accepts or not the handshake.
  * `protocol` String: If `result` is `true` then this field sets the value of the Sec-WebSocket-Protocol header in the HTTP 101 response.

If `handleProtocols` is not set then the handshake is accepted regardless the value of Sec-WebSocket-Protocol header. If it is set but the user does not invoke the `cb` callback then the handshake is rejected with error HTTP 501.

### server.close()

Close the server and terminate all clients.

### server.handleUpgrade(request, socket, upgradeHead, callback)

Handles a HTTP Upgrade request. `request` is an instance of `http.ServerRequest`, `socket` is an instance of `net.Socket`.

When the Upgrade was successfully, the `callback` will be called with a `ws.WebSocket` object as parameter.

### Event: 'error'

`function (error) { }`

If the underlying server emits an error, it will be forwarded here.

### Event: 'headers'

`function (headers) { }`

Emitted with the object of HTTP headers that are going to be written to the `Stream` as part of the handshake.

### Event: 'connection'

`function (socket) { }`

When a new WebSocket connection is established. `socket` is an object of type `ws.WebSocket`.


## Class: ws.WebSocket

This class represents a WebSocket connection. It is an `EventEmitter`.

### new ws.WebSocket(address, [options])

* `address` String|Array
* `options` Object
  * `protocol` String
  * `agent` Agent
  * `headers` Object
  * `protocolVersion` Number|String  
    -- the following only apply if `address` is a String
  * `host` String
  * `origin` String
  * `pfx` String|Buffer
  * `key` String|Buffer
  * `passphrase` String
  * `cert` String|Buffer
  * `ca` Array
  * `ciphers` String
  * `rejectUnauthorized` Boolean

Instantiating with an `address` creates a new WebSocket client object. If `address` is an Array (request, socket, rest), it is instantiated as a Server client (e.g. called from the `ws.Server`).

### websocket.bytesReceived

Received bytes count.

### websocket.readyState

Possible states are `WebSocket.CONNECTING`, `WebSocket.OPEN`, `WebSocket.CLOSING`, `WebSocket.CLOSED`.

### websocket.protocolVersion

The WebSocket protocol version used for this connection, `8`, `13` or `hixie-76` (the latter only for server clients).

### websocket.url

The URL of the WebSocket server (only for clients).

### websocket.upgradeReq

The received `http.IncomingMessage` containing the HTTP GET request (only for servers).

### websocket.supports

Describes the feature of the used protocol version. E.g. `supports.binary` is a boolean that describes if the connection supports binary messages.

### websocket.close([code], [data])

Gracefully closes the connection, after sending a description message.

### websocket.pause()

Pause the client stream.

### websocket.ping([data], [options], [dontFailWhenClosed])

Sends a ping. `data` is sent, `options` is an object with members `mask` and `binary`. `dontFailWhenClosed` indicates whether or not to throw if the connection is not open.

### websocket.pong([data], [options], [dontFailWhenClosed])

Sends a pong. `data` is sent, `options` is an object with members `mask` and `binary`. `dontFailWhenClosed` indicates whether or not to throw if the connection is not open.


### websocket.resume()

Resume the client stream.

### websocket.send(data, [options], [callback])

Sends `data` through the connection. `options` can be an object with members `mask` and `binary`. The optional `callback` is executed after the send completes.

### websocket.stream([options], callback)

Streams data through calls to a user supplied function. `options` can be an object with members `mask` and `binary`.  `callback` is executed on successive ticks of which send is `function (data, final)`.

### websocket.terminate()

Immediately shuts down the connection.

### websocket.onopen
### websocket.onerror
### websocket.onclose
### websocket.onmessage

Emulates the W3C Browser based WebSocket interface using function members.

### websocket.addEventListener(method, listener)

Emulates the W3C Browser based WebSocket interface using addEventListener.

### Event: 'error'

`function (error) { }`

If the client emits an error, this event is emitted (errors from the underlying `net.Socket` are forwarded here).

### Event: 'close'

`function (code, message) { }`

Is emitted when the connection is closed. `code` is defined in the WebSocket specification.

The `close` event is also emitted when then underlying `net.Socket` closes the connection (`end` or `close`).

### Event: 'message'

`function (data, flags) { }`

Is emitted when data is received. `flags` is an object with member `binary`.

### Event: 'ping'

`function (data, flags) { }`

Is emitted when a ping is received. `flags` is an object with member `binary`.

### Event: 'pong'

`function (data, flags) { }`

Is emitted when a pong is received. `flags` is an object with member `binary`.

### Event: 'open'

`function () { }`

Emitted when the connection is established.
