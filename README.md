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

### WebSocket

`supports.binary`

> Returns true or false based on whether the underlying protocol (hixie, hybi, etc) has binary support.
Example:

```js
var wss = new WebSocketServer({port: 8080});
wss.on('connection', function(client) {
  if (client.supports.binary) ...
});
```

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
