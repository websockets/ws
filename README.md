# ws: a Node.js WebSocket library

[![Version npm](https://img.shields.io/npm/v/ws.svg)](https://www.npmjs.com/package/ws)
[![Linux Build](https://img.shields.io/travis/websockets/ws/master.svg)](https://travis-ci.org/websockets/ws)
[![Windows Build](https://ci.appveyor.com/api/projects/status/github/websockets/ws?branch=master&svg=true)](https://ci.appveyor.com/project/lpinca/ws)
[![Coverage Status](https://img.shields.io/coveralls/websockets/ws/master.svg)](https://coveralls.io/r/websockets/ws?branch=master)

`ws` is a simple to use, blazing fast, and thoroughly tested WebSocket client
and server implementation.

Passes the quite extensive Autobahn test suite. See http://websockets.github.io/ws/
for the full reports.

## Protocol support

* **HyBi drafts 07-12** (Use the option `protocolVersion: 8`)
* **HyBi drafts 13-17** (Current default, alternatively option `protocolVersion: 13`)

## Installing

```
npm install --save ws
```

### Opt-in for performance

There are 2 optional modules that can be installed along side with the `ws`
module. These modules are binary addons which improve certain operations, but as
they are binary addons they require compilation which can fail if no c++
compiler is installed on the host system.

- `npm install --save bufferutil`: Improves internal buffer operations which
  allows for faster processing of masked WebSocket frames and general buffer
  operations.
- `npm install --save utf-8-validate`: The specification requires validation of
  invalid UTF-8 chars, some of these validations could not be done in JavaScript
  hence the need for a binary addon. In most cases you will already be
  validating the input that you receive for security purposes leading to double
  validation. But if you want to be 100% spec-conforming and have fast
  validation of UTF-8 then this module is a must.

## API Docs

See [`/doc/ws.md`](https://github.com/websockets/ws/blob/master/doc/ws.md)
for Node.js-like docs for the ws classes.

## WebSocket compression

`ws` supports the [permessage-deflate extension][permessage-deflate] extension
which enables the client and server to negotiate a compression algorithm and
its parameters, and then selectively apply it to the data payloads of each
WebSocket message.

The extension is enabled by default but adds a significant overhead in terms of
performance and memory comsumption. We suggest to use WebSocket compression
only if it is really needed.

To disable the extension you can set the `perMessageDeflate` option to `false`.
On the server:

```js
const WebSocket = require('ws');

const wss = new WebSocket.Server({
  perMessageDeflate: false,
  port: 8080
});
```

On the client:

```js
const WebSocket = require('ws');

const ws = new WebSocket('ws://www.host.com/path', {
  perMessageDeflate: false
});
```

## Usage examples

### Sending and receiving text data

```js
const WebSocket = require('ws');

const ws = new WebSocket('ws://www.host.com/path');

ws.on('open', function open() {
  ws.send('something');
});

ws.on('message', function incoming(data, flags) {
  // flags.binary will be set if a binary data is received.
  // flags.masked will be set if the data was masked.
});
```

### Sending binary data

```js
const WebSocket = require('ws');

const ws = new WebSocket('ws://www.host.com/path');

ws.on('open', function open() {
  const array = new Float32Array(5);

  for (var i = 0; i < array.length; ++i) {
    array[i] = i / 2;
  }

  ws.send(array);
});
```

### Server example

```js
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(message) {
    console.log('received: %s', message);
  });

  ws.send('something');
});
```

### Broadcast example

```js
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

// Broadcast to all.
wss.broadcast = function broadcast(data) {
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(data) {
    // Broadcast to everyone else.
    wss.clients.forEach(function each(client) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  });
});
```

### ExpressJS example

```js
const express = require('express');
const http = require('http');
const url = require('url');
const WebSocket = require('ws');

const app = express();

app.use(function (req, res) {
  res.send({ msg: "hello" });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', function connection(ws) {
  const location = url.parse(ws.upgradeReq.url, true);
  // You might use location.query.access_token to authenticate or share sessions
  // or ws.upgradeReq.headers.cookie (see http://stackoverflow.com/a/16395220/151312)

  ws.on('message', function incoming(message) {
    console.log('received: %s', message);
  });

  ws.send('something');
});

server.listen(8080, function listening() {
  console.log('Listening on %d', server.address().port);
});
```

### echo.websocket.org demo

```js
const WebSocket = require('ws');

const ws = new WebSocket('wss://echo.websocket.org/', {
  origin: 'https://websocket.org'
});

ws.on('open', function open() {
  console.log('connected');
  ws.send(Date.now());
});

ws.on('close', function close() {
  console.log('disconnected');
});

ws.on('message', function incoming(data, flags) {
  console.log(`Roundtrip time: ${Date.now() - data} ms`, flags);

  setTimeout(function timeout() {
    ws.send(Date.now());
  }, 500);
});
```

### Other examples

For a full example with a browser client communicating with a ws server, see the
examples folder.

Otherwise, see the test cases.

## Error handling best practices

```js
// If the WebSocket is closed before the following send is attempted
ws.send('something');

// Errors (both immediate and async write errors) can be detected in an optional
// callback. The callback is also the only way of being notified that data has
// actually been sent.
ws.send('something', function ack(error) {
  // If error is not defined, the send has been completed, otherwise the error
  // object will indicate what failed.
});

// Immediate errors can also be handled with `try...catch`, but **note** that
// since sends are inherently asynchronous, socket write failures will *not* be
// captured when this technique is used.
try { ws.send('something'); }
catch (e) { /* handle error */ }
```

## Changelog

We're using the GitHub [`releases`](https://github.com/websockets/ws/releases)
for changelog entries.

## License

[MIT](LICENSE)

[permessage-deflate]: https://tools.ietf.org/html/rfc7692
