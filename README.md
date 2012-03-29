[![Build Status](https://secure.travis-ci.org/einaros/ws.png)](http://travis-ci.org/einaros/ws)

# ws: a node.js websocket library #

`ws` is a simple to use websocket implementation, up-to-date against RFC-6455, and [probably the fastest WebSocket library for node.js](http://hobbycoding.posterous.com/the-fastest-websocket-module-for-nodejs).

Passes the quite extensible Autobahn test suite. See http://einaros.github.com/ws for the full reports.

Comes with a command line utility, `wscat`, which can either act as a server (--listen), or client (--connect); Use it to debug simple websocket services.

## Protocol support ##

* **Hixie draft 76** (Old and deprecated, but still in use by Safari and Opera. Added to ws version 0.4.2, but server only. Can be disabled by setting the `disableHixie` option to true.)
* **HyBi drafts 07-12** (Use the option `protocolVersion: 8`, or argument `-p 8` for wscat)
* **HyBi drafts 13-17** (Current default, alternatively option `protocolVersion: 13`, or argument `-p 13` for wscat)

_See the echo.websocket.org example below for how to use the `protocolVersion` option._

## Usage ##

### Installing ###

`npm install ws`

### Sending and receiving text data ###

```js
var WebSocket = require('ws');
var ws = new WebSocket('ws://www.host.com/path');
ws.on('open', function() {
    ws.send('something');
});
ws.on('message', function(data, flags) {
    // flags.binary will be set if a binary data is received
    // flags.masked will be set if the data was masked
});
```

### Sending binary data ###

```js
var WebSocket = require('ws');
var ws = new WebSocket('ws://www.host.com/path');
ws.on('open', function() {
    var array = new Float32Array(5);
    for (var i = 0; i < array.length; ++i) array[i] = i / 2;
    ws.send(array, {binary: true, mask: true});
});
```

Setting `mask`, as done for the send options above, will cause the data to be masked according to the websocket protocol. The same option applies for text data.

### Server example ###

```js
var WebSocketServer = require('ws').Server
  , wss = new WebSocketServer({port: 8080});
wss.on('connection', function(ws) {
    ws.on('message', function(message) {
        console.log('received: %s', message);
    });
    ws.send('something');
});
```

### echo.websocket.org demo ###

```js
var WebSocket = require('ws');
var ws = new WebSocket('ws://echo.websocket.org/', {protocolVersion: 8, origin: 'http://websocket.org'});
ws.on('open', function() {
    console.log('connected');
    ws.send(Date.now().toString(), {mask: true});
});
ws.on('close', function() {
    console.log('disconnected');
});
ws.on('message', function(data, flags) {
    console.log('Roundtrip time: ' + (Date.now() - parseInt(data)) + 'ms', flags);
    setTimeout(function() {
        ws.send(Date.now().toString(), {mask: true});
    }, 500);
});
```

### wscat against echo.websocket.org ###

    $ npm install -g ws
    $ wscat -c ws://echo.websocket.org -p 8
    connected (press CTRL+C to quit)
    > hi there
    < hi there
    > are you a happy parrot?
    < are you a happy parrot?

### Other examples ###

For a full example with a browser client communicating with a ws server, see the examples folder.

Otherwise, see the test cases.

### Running the tests ###

`make test`

## API Docs ##

_Note: This api documentation is currently incomplete. For a better understanding of the api, see the test set._


### Class: ws.Server

This class is a WebSocket server. It is an `EventEmitter`.

#### new ws.Server([options], [callback])

Construct a new server object.

`options` is an object with the following defaults:

```js
{
  host: '127.0.0.1',
  port: null,
  server: null,
  verifyClient: null,
  path: null,
  noServer: false,
  disableHixie: false,
  clientTracking: true
}
```

Either `port` or `server` must be provided, otherwise you might enable `noServer` if you want to pass the requests directly.

#### server.close([code], [data])

Close the server and terminate all clients

#### server.handleUpgrade(request, socket, upgradeHead, callback)

Handles a HTTP Upgrade request. `request` is an instance of `http.ServerRequest`, `socket` is an instance of `net.Socket`.

When the Upgrade was successfully, the `callback` will be called with a `ws.WebSocket` object as parameter.

#### Event: 'error'

`function(error) { }`

If the underlying server emits an error, it will be forwarded here.

#### Event: 'connection'

`function(socket) { }`

When a new WebSocket connection is established. `socket` is an object of type `ws.WebSocket`.


### Class: ws.WebSocket

This class represents a WebSocket connection. It is an `EventEmitter`.

#### new ws.WebSocket(address, [options])

Instantiating with an `address` creates a new WebSocket client object. If `address` is an Array (request, socket, rest), it is instantiated as a Server client (e.g. called from the `ws.Server`).

#### websocket.bytesReceived

Received bytes count.

#### websocket.readyState

Possible states are `WebSocket.CONNECTING`, `WebSocket.OPEN`, `WebSocket.CLOSING`, `WebSocket.CLOSED`.

#### websocket.protocolVersion

The WebSocket protocol version used for this connection, `8`, `13` or `hixie-76` (the latter only for server clients).

#### websocket.url

The URL of the WebSocket server (only for clients)

#### websocket.supports

Describes the feature of the used protocol version. E.g. `supports.binary` is a boolean that describes if the connection supports binary messages.

#### websocket.close([code], [data])

Gracefully closes the connection, after sending a description message

#### websocket.pause()

Pause the client stream

#### websocket.ping([data], [options], [dontFailWhenClosed])

Sends a ping. `data` is sent, `options` is an object with members `mask` and `binary`. `dontFailWhenClosed` indicates whether or not to throw if the connection isnt open.

#### websocket.pong([data], [options], [dontFailWhenClosed])

Sends a pong. `data` is sent, `options` is an object with members `mask` and `binary`. `dontFailWhenClosed` indicates whether or not to throw if the connection isnt open.


#### websocket.resume()

Resume the client stream

#### websocket.send(data, [options], [callback])

Sends `data` through the connection. `options` can be an object with members `mask` and `binary`. The optional `callback` is executed after the send completes.

#### websocket.stream([options], callback)

Streams data through calls to a user supplied function. `options` can be an object with members `mask` and `binary`.  `callback` is executed on successive ticks of which send is `function (data, final)`.

#### websocket.terminate()

Immediately shuts down the connection


#### websocket.onopen

Emulates the W3C Browser based WebSocket interface using function members.

#### websocket.onerror

Emulates the W3C Browser based WebSocket interface using function members.

#### websocket.onclose

Emulates the W3C Browser based WebSocket interface using function members.

#### websocket.onmessage

Emulates the W3C Browser based WebSocket interface using function members.

#### websocket.addEventListener(method, listener)

Emulates the W3C Browser based WebSocket interface using addEventListener.

#### Event: 'error'

`function (error) { }`

If the client emits an error, this event is emitted (errors from the underlying `net.Socket` are forwarded here).

#### Event: 'close'

`function (code, message) { }`

Is emitted when the connection is closed. `code` is defined in the WebSocket specification.

The `close` event is also emitted when then underlying `net.Socket` closes the connection (`end` or `close`).

#### Event: 'message'

`function (data, flags) { }`

Is emitted when data is received. `flags` is an object with member `binary`.

#### Event: 'ping'

`function (data, flags) { }`

Is emitted when a ping is received. `flags` is an object with member `binary`.

#### Event: 'pong'

`function (data, flags) { }`

Is emitted when a pong is received. `flags` is an object with member `binary`.

#### Event: 'open'

`function () { }`

Emitted when the connection is established.



## Todos ##

* Expose Sender and Receiver configuration options through WebSocket, and test that properly.
* Cleanup configuration for Sender, and add similar bits to Receiver.
* Either expose a configurable setting indicating favoring speed or memory use, or do a timer based shrink of Receiver's pools.
* Make necessary changes to also support the even older hixie-75? Or at least write a few more tests for Hixie-76 to verify that fragmented nonce transfers really work.

## License ##

(The MIT License)

Copyright (c) 2011 Einar Otto Stangvik &lt;einaros@gmail.com&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
