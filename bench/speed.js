'use strict';

const cluster = require('cluster');

const WebSocket = require('../');

const port = 8181;

function roundPrec (num, prec) {
  const mul = Math.pow(10, prec);
  return Math.round(num * mul) / mul;
}

function humanSize (bytes) {
  if (bytes >= 1048576) return roundPrec(bytes / 1048576, 2) + ' MiB';
  if (bytes >= 1024) return roundPrec(bytes / 1024, 2) + ' KiB';
  return roundPrec(bytes, 2) + ' B';
}

function generateRandomData (size) {
  const buffer = Buffer.alloc(size);
  for (var i = 0; i < size; ++i) {
    buffer[i] = ~~(Math.random() * 127);
  }
  return buffer;
}

function runConfig (useBinary, roundtrips, size, randomBytes, cb) {
  const data = randomBytes.slice(0, size);
  const client = new WebSocket(`ws://localhost:${port}`);
  var roundtrip = 0;
  var time;

  client.on('error', (err) => {
    console.error(err.stack);
    cluster.worker.kill();
  });
  client.on('open', () => {
    time = process.hrtime();
    client.send(data, { binary: useBinary });
  });
  client.on('message', () => {
    if (++roundtrip !== roundtrips) return client.send(data, { binary: useBinary });

    var elapsed = process.hrtime(time);
    elapsed = elapsed[0] * 1e9 + elapsed[1];

    console.log(
      '%d roundtrips of %s %s data:\t%ss\t%s',
      roundtrips,
      humanSize(size),
      useBinary ? 'binary' : 'text',
      roundPrec(elapsed / 1e9, 1),
      humanSize(size * roundtrips / elapsed * 1e9) + '/s'
    );

    client.close();
    cb();
  });
}

if (cluster.isMaster) {
  const wss = new WebSocket.Server({
    maxPayload: 600 * 1024 * 1024,
    perMessageDeflate: false,
    clientTracking: false,
    port
  }, () => cluster.fork());

  wss.on('connection', (ws) => {
    ws.on('message', (data, flags) => ws.send(data, { binary: flags.binary || false }));
  });

  cluster.on('exit', () => wss.close());
} else {
  const configs = [
    [true, 10000, 64],
    [true, 5000, 16 * 1024],
    [true, 1000, 128 * 1024],
    [true, 100, 1024 * 1024],
    [true, 1, 500 * 1024 * 1024],
    [false, 10000, 64],
    [false, 5000, 16 * 1024],
    [false, 1000, 128 * 1024],
    [false, 100, 1024 * 1024]
  ];

  const largest = configs.reduce((prev, curr) => curr[2] > prev ? curr[2] : prev, 0);
  console.log('Generating %s of test data...', humanSize(largest));
  const randomBytes = generateRandomData(largest);

  (function run () {
    if (configs.length === 0) return cluster.worker.kill();
    var config = configs.shift();
    config.push(randomBytes, run);
    runConfig.apply(null, config);
  })();
}
