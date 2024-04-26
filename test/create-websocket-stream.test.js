'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const { createServer } = require('http');
const { Duplex, getDefaultHighWaterMark } = require('stream');
const { randomBytes } = require('crypto');

const createWebSocketStream = require('../lib/stream');
const Sender = require('../lib/sender');
const WebSocket = require('..');
const { EMPTY_BUFFER } = require('../lib/constants');

const highWaterMark = getDefaultHighWaterMark
  ? getDefaultHighWaterMark(false)
  : 16 * 1024;

describe('createWebSocketStream', () => {
  it('is exposed as a property of the `WebSocket` class', () => {
    assert.strictEqual(WebSocket.createWebSocketStream, createWebSocketStream);
  });

  it('returns a `Duplex` stream', () => {
    const duplex = createWebSocketStream(new EventEmitter());

    assert.ok(duplex instanceof Duplex);
  });

  it('passes the options object to the `Duplex` constructor', (done) => {
    const wss = new WebSocket.Server({ port: 0 }, () => {
      const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
      const duplex = createWebSocketStream(ws, {
        allowHalfOpen: false,
        encoding: 'utf8'
      });

      duplex.on('data', (chunk) => {
        assert.strictEqual(chunk, 'hi');

        duplex.on('close', () => {
          wss.close(done);
        });
      });
    });

    wss.on('connection', (ws) => {
      ws.send(Buffer.from('hi'));
      ws.close();
    });
  });

  describe('The returned stream', () => {
    it('buffers writes if `readyState` is `CONNECTING`', (done) => {
      const chunk = randomBytes(1024);
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        assert.strictEqual(ws.readyState, WebSocket.CONNECTING);

        const duplex = createWebSocketStream(ws);

        duplex.write(chunk);
      });

      wss.on('connection', (ws) => {
        ws.on('message', (message, isBinary) => {
          ws.on('close', (code, reason) => {
            assert.deepStrictEqual(message, chunk);
            assert.ok(isBinary);
            assert.strictEqual(code, 1005);
            assert.strictEqual(reason, EMPTY_BUFFER);
            wss.close(done);
          });
        });

        ws.close();
      });
    });

    it('errors if a write occurs when `readyState` is `CLOSING`', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
        const duplex = createWebSocketStream(ws);

        duplex.on('error', (err) => {
          assert.ok(duplex.destroyed);
          assert.ok(err instanceof Error);
          assert.strictEqual(
            err.message,
            'WebSocket is not open: readyState 2 (CLOSING)'
          );

          duplex.on('close', () => {
            wss.close(done);
          });
        });

        ws.on('open', () => {
          ws._receiver.on('conclude', () => {
            duplex.write('hi');
          });
        });
      });

      wss.on('connection', (ws) => {
        ws.close();
      });
    });

    it('errors if a write occurs when `readyState` is `CLOSED`', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
        const duplex = createWebSocketStream(ws);

        duplex.on('error', (err) => {
          assert.ok(duplex.destroyed);
          assert.ok(err instanceof Error);
          assert.strictEqual(
            err.message,
            'WebSocket is not open: readyState 3 (CLOSED)'
          );

          duplex.on('close', () => {
            wss.close(done);
          });
        });

        ws.on('close', () => {
          duplex.write('hi');
        });
      });

      wss.on('connection', (ws) => {
        ws.close();
      });
    });

    it('does not error if `_final()` is called while connecting', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);

        assert.strictEqual(ws.readyState, WebSocket.CONNECTING);

        const duplex = createWebSocketStream(ws);

        duplex.on('close', () => {
          wss.close(done);
        });

        duplex.resume();
        duplex.end();
      });
    });

    it('makes `_final()` a noop if no socket is assigned', (done) => {
      const server = createServer();

      server.on('upgrade', (request, socket) => {
        socket.on('end', socket.end);

        const headers = [
          'HTTP/1.1 101 Switching Protocols',
          'Upgrade: websocket',
          'Connection: Upgrade',
          'Sec-WebSocket-Accept: foo'
        ];

        socket.write(headers.concat('\r\n').join('\r\n'));
      });

      server.listen(() => {
        const called = [];
        const ws = new WebSocket(`ws://localhost:${server.address().port}`);
        const duplex = WebSocket.createWebSocketStream(ws);
        const final = duplex._final;

        duplex._final = (callback) => {
          called.push('final');
          assert.strictEqual(ws.readyState, WebSocket.CLOSING);
          assert.strictEqual(ws._socket, null);

          final(callback);
        };

        duplex.on('error', (err) => {
          called.push('error');
          assert.ok(err instanceof Error);
          assert.strictEqual(
            err.message,
            'Invalid Sec-WebSocket-Accept header'
          );
        });

        duplex.on('finish', () => {
          called.push('finish');
        });

        duplex.on('close', () => {
          assert.deepStrictEqual(called, ['final', 'error']);
          server.close(done);
        });

        ws.on('upgrade', () => {
          process.nextTick(() => {
            duplex.end();
          });
        });
      });
    });

    it('reemits errors', (done) => {
      let duplexCloseEventEmitted = false;
      let serverClientCloseEventEmitted = false;

      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
        const duplex = createWebSocketStream(ws);

        duplex.on('error', (err) => {
          assert.ok(err instanceof RangeError);
          assert.strictEqual(err.code, 'WS_ERR_INVALID_OPCODE');
          assert.strictEqual(
            err.message,
            'Invalid WebSocket frame: invalid opcode 5'
          );

          duplex.on('close', () => {
            duplexCloseEventEmitted = true;
            if (serverClientCloseEventEmitted) wss.close(done);
          });
        });
      });

      wss.on('connection', (ws) => {
        ws._socket.write(Buffer.from([0x85, 0x00]));
        ws.on('close', (code, reason) => {
          assert.strictEqual(code, 1002);
          assert.deepStrictEqual(reason, EMPTY_BUFFER);

          serverClientCloseEventEmitted = true;
          if (duplexCloseEventEmitted) wss.close(done);
        });
      });
    });

    it('does not swallow errors that may occur while destroying', (done) => {
      const frame = Buffer.concat(
        Sender.frame(Buffer.from([0x22, 0xfa, 0xec, 0x78]), {
          fin: true,
          rsv1: true,
          opcode: 0x02,
          mask: false,
          readOnly: false
        })
      );

      const wss = new WebSocket.Server(
        {
          perMessageDeflate: true,
          port: 0
        },
        () => {
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
          const duplex = createWebSocketStream(ws);

          duplex.on('error', (err) => {
            assert.ok(err instanceof Error);
            assert.strictEqual(err.code, 'Z_DATA_ERROR');
            assert.strictEqual(err.errno, -3);

            duplex.on('close', () => {
              wss.close(done);
            });
          });

          let bytesRead = 0;

          ws.on('open', () => {
            ws._socket.on('data', (chunk) => {
              bytesRead += chunk.length;
              if (bytesRead === frame.length) duplex.destroy();
            });
          });
        }
      );

      wss.on('connection', (ws) => {
        ws._socket.write(frame);
      });
    });

    it("does not suppress the throwing behavior of 'error' events", (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
        createWebSocketStream(ws);
      });

      wss.on('connection', (ws) => {
        ws._socket.write(Buffer.from([0x85, 0x00]));
      });

      assert.strictEqual(
        process.listenerCount('uncaughtException'),
        EventEmitter.usingDomains ? 2 : 1
      );

      const listener = process.listeners('uncaughtException').pop();

      process.removeListener('uncaughtException', listener);
      process.once('uncaughtException', (err) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(
          err.message,
          'Invalid WebSocket frame: invalid opcode 5'
        );

        process.on('uncaughtException', listener);
        wss.close(done);
      });
    });

    it("is destroyed after 'end' and 'finish' are emitted (1/2)", (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const events = [];
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
        const duplex = createWebSocketStream(ws);

        duplex.on('end', () => {
          events.push('end');
          assert.ok(duplex.destroyed);
        });

        duplex.on('close', () => {
          assert.deepStrictEqual(events, ['finish', 'end']);
          wss.close(done);
        });

        duplex.on('finish', () => {
          events.push('finish');
          assert.ok(!duplex.destroyed);
          assert.ok(duplex.readable);

          duplex.resume();
        });

        ws.on('close', () => {
          duplex.end();
        });
      });

      wss.on('connection', (ws) => {
        ws.send('foo');
        ws.close();
      });
    });

    it("is destroyed after 'end' and 'finish' are emitted (2/2)", (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const events = [];
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
        const duplex = createWebSocketStream(ws);

        duplex.on('end', () => {
          events.push('end');
          assert.ok(!duplex.destroyed);
          assert.ok(duplex.writable);

          duplex.end();
        });

        duplex.on('close', () => {
          assert.deepStrictEqual(events, ['end', 'finish']);
          wss.close(done);
        });

        duplex.on('finish', () => {
          events.push('finish');
        });

        duplex.resume();
      });

      wss.on('connection', (ws) => {
        ws.close();
      });
    });

    it('handles backpressure (1/3)', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        // eslint-disable-next-line no-unused-vars
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
      });

      wss.on('connection', (ws) => {
        const duplex = createWebSocketStream(ws);

        duplex.resume();

        duplex.on('drain', () => {
          duplex.on('close', () => {
            wss.close(done);
          });

          duplex.end();
        });

        const chunk = randomBytes(1024);
        let ret;

        do {
          ret = duplex.write(chunk);
        } while (ret !== false);
      });
    });

    it('handles backpressure (2/3)', (done) => {
      const wss = new WebSocket.Server(
        { port: 0, perMessageDeflate: true },
        () => {
          const called = [];
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
          const duplex = createWebSocketStream(ws);
          const read = duplex._read;

          duplex._read = () => {
            duplex._read = read;
            called.push('read');
            assert.ok(ws._receiver._writableState.needDrain);
            read();
            assert.ok(ws._socket.isPaused());
          };

          ws.on('open', () => {
            ws._socket.on('pause', () => {
              duplex.resume();
            });

            ws._receiver.on('drain', () => {
              called.push('drain');
              assert.ok(!ws._socket.isPaused());
              duplex.end();
            });

            const opts = {
              fin: true,
              opcode: 0x02,
              mask: false,
              readOnly: false
            };

            const list = [
              ...Sender.frame(randomBytes(highWaterMark), {
                rsv1: false,
                ...opts
              }),
              ...Sender.frame(Buffer.alloc(1), { rsv1: true, ...opts })
            ];

            // This hack is used because there is no guarantee that more than
            // `highWaterMark` bytes will be sent as a single TCP packet.
            ws._socket.push(Buffer.concat(list));
          });

          duplex.on('close', () => {
            assert.deepStrictEqual(called, ['read', 'drain']);
            wss.close(done);
          });
        }
      );
    });

    it('handles backpressure (3/3)', (done) => {
      const wss = new WebSocket.Server(
        { port: 0, perMessageDeflate: true },
        () => {
          const called = [];
          const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
          const duplex = createWebSocketStream(ws);
          const read = duplex._read;

          duplex._read = () => {
            called.push('read');
            assert.ok(!ws._receiver._writableState.needDrain);
            read();
            assert.ok(!ws._socket.isPaused());
            duplex.end();
          };

          ws.on('open', () => {
            ws._receiver.on('drain', () => {
              called.push('drain');
              assert.ok(ws._socket.isPaused());
              duplex.resume();
            });

            const opts = {
              fin: true,
              opcode: 0x02,
              mask: false,
              readOnly: false
            };

            const list = [
              ...Sender.frame(randomBytes(highWaterMark), {
                rsv1: false,
                ...opts
              }),
              ...Sender.frame(Buffer.alloc(1), { rsv1: true, ...opts })
            ];

            ws._socket.push(Buffer.concat(list));
          });

          duplex.on('close', () => {
            assert.deepStrictEqual(called, ['drain', 'read']);
            wss.close(done);
          });
        }
      );
    });

    it('can be destroyed (1/2)', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const error = new Error('Oops');
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
        const duplex = createWebSocketStream(ws);

        duplex.on('error', (err) => {
          assert.strictEqual(err, error);

          duplex.on('close', () => {
            wss.close(done);
          });
        });

        ws.on('open', () => {
          duplex.destroy(error);
        });
      });
    });

    it('can be destroyed (2/2)', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
        const duplex = createWebSocketStream(ws);

        duplex.on('close', () => {
          wss.close(done);
        });

        ws.on('open', () => {
          duplex.destroy();
        });
      });
    });

    it('converts text messages to strings in readable object mode', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const events = [];
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
        const duplex = createWebSocketStream(ws, { readableObjectMode: true });

        duplex.on('data', (data) => {
          events.push('data');
          assert.strictEqual(data, 'foo');
        });

        duplex.on('end', () => {
          events.push('end');
          duplex.end();
        });

        duplex.on('close', () => {
          assert.deepStrictEqual(events, ['data', 'end']);
          wss.close(done);
        });
      });

      wss.on('connection', (ws) => {
        ws.send('foo');
        ws.close();
      });
    });

    it('resumes the socket if `readyState` is `CLOSING`', (done) => {
      const wss = new WebSocket.Server({ port: 0 }, () => {
        const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
        const duplex = createWebSocketStream(ws);

        ws.on('message', () => {
          assert.ok(ws._socket.isPaused());

          duplex.on('close', () => {
            wss.close(done);
          });

          duplex.end();

          process.nextTick(() => {
            assert.strictEqual(ws.readyState, WebSocket.CLOSING);
            duplex.resume();
          });
        });
      });

      wss.on('connection', (ws) => {
        ws.send(randomBytes(highWaterMark));
      });
    });
  });
});
