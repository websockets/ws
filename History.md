v0.4.0 - Jan 2nd 2012
=====================

* Windows compatibility [einaros]
* Windows compatible test script [einaros]

v0.3.9 - Jan 1st 2012
======================

* Improved protocol framing performance [einaros]
* WSS support [kazuyukitanimura]
* WSS tests [einaros]
* readyState exposed [justinlatimer, tricknotes]
* url property exposed [justinlatimer]
* Removed old 'state' property [einaros]
* Test cleanups [einaros]

v0.3.8 - Dec 27th 2011
======================

* Made it possible to listen on specific paths, which is especially good to have for precreated http servers [einaros]
* Extensive WebSocket / WebSocketServer cleanup, including changing all internal properties to unconfigurable, unenumerable properties [einaros]
* Receiver modifications to ensure even better performance with fragmented sends [einaros]
* Fixed issue in sender.js, which would cause SlowBuffer instances (such as returned from the crypto library's randomBytes) to be copied (and thus be dead slow) [einaros]
* Removed redundant buffer copy in sender.js, which should improve server performance [einaros]

v0.3.7 - Dec 25nd 2011
======================

* Added a browser based API which uses EventEmitters internally [3rd-Eden]
* Expose request information from upgrade event for websocket server clients [mmalecki]

v0.3.6 - Dec 19th 2011
======================

* Added option to let WebSocket.Server use an already existing http server [mmalecki]
* Migrating various option structures to use options.js module [einaros]
* Added a few more tests, options and handshake verifications to ensure that faulty connections are dealt with [einaros]
* Code cleanups in Sender and Receiver, to ensure even faster parsing [einaros]

v0.3.5 - Dec 13th 2011
======================

* Optimized Sender.js, Receiver.js and bufferutil.cc:
 * Apply loop-unrolling-like small block copies rather than use node.js Buffer#copy() (which is slow).
 * Mask blocks of data using combination of 32bit xor and loop-unrolling, instead of single bytes.
 * Keep pre-made send buffer for small transfers.
* Leak fixes and code cleanups.

v0.3.3 - Dec 12th 2011
======================

* Compile fix for Linux.
* Rewrote parts of WebSocket.js, to avoid try/catch and thus avoid optimizer bailouts.

v0.3.2 - Dec 11th 2011
======================

* Further performance updates, including the additions of a native BufferUtil module, which deals with several of the cpu intensive WebSocket operations.

v0.3.1 - Dec 8th 2011
======================

* Service release, fixing broken tests.

v0.3.0 - Dec 8th 2011
======================

* Node.js v0.4.x compatibility.
* Code cleanups and efficiency improvements.
* WebSocket server added, although this will still mainly be a client library.
* WebSocket server certified to pass the Autobahn test suite.
* Protocol improvements and corrections - such as handling (redundant) masks for empty fragments.
* 'wscat' command line utility added, which can act as either client or server.

v0.2.6 - Dec 3rd 2011
======================

* Renamed to 'ws'. Big woop, right -- but easy-websocket really just doesn't cut it anymore!

v0.2.5 - Dec 3rd 2011
======================

  * Rewrote much of the WebSocket parser, to ensure high speed for highly fragmented messages.
  * Added a BufferPool, as a start to more efficiently deal with allocations for WebSocket connections. More work to come, in that area.
  * Updated the Autobahn report, at http://einaros.github.com/easy-websocket, with comparisons against WebSocket-Node 1.0.2 and Chrome 16.

v0.2.0 - Nov 25th 2011
======================

  * Major rework to make sure all the Autobahn test cases pass. Also updated the internal tests to cover more corner cases.

v0.1.2 - Nov 14th 2011
======================

  * Back and forth, back and forth: now settled on keeping the api (event names, methods) closer to the websocket browser api. This will stick now.
  * Started keeping this history record. Better late than never, right?
