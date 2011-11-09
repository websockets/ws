# easy-websocket #

`easy-websocket` aims to be an easy to use websocket client for node.js, up-to-date against current HyBi protocol versions.

## Usage ##

### Installing ###

`npm install easy-websocket`

### Sending and receiving text data ###

```js
var WebSocket = require('easy-websocket');
var ws = new WebSocket('ws://www.host.com/path');
ws.on('connected', function() {
    ws.send('something');
});
ws.on('message', function(message, flags) {
    // flags.binary will be set if a binary message is received
    // flags.masked will be set if the message was masked
});
```
    
### Sending binary data ###

```js
var WebSocket = require('easy-websocket');
var ws = new WebSocket('ws://www.host.com/path');
ws.on('connected', function() {
    var array = new Float32Array(5);
    for (var i = 0; i < array.length; ++i) array[i] = i / 2;
    ws.send(array, {binary: true, mask: true});
});
```

Setting `mask`, as done for the send options above, will cause the message to be masked according to the websocket protocol. The same option applies for text messages.

### Other examples ###

See the test cases.

### Running the tests ###

`make test`

## Yet to be done ##

- While the receiver does support fragmentation, the sender does currently not do fragmentation -- even for large data pieces. Ideally streams can be transmitted using fragmentation.
- More tests should be written for the receiving bits, such as for `close`; although these are implicitly tested already since the testserver shares the same receiver.

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