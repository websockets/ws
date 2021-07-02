'use strict';

const cluster = require('cluster');
const http = require('http');

const WebSocket = require('..');

const port = 8181;
const path = '';
// const path = '/tmp/wss.sock';

if (cluster.isMaster) {
  const server = http.createServer();
  const wss = new WebSocket.Server({
    maxPayload: 600 * 1024 * 1024,
    perMessageDeflate: false,
    clientTracking: false,
    server
  });

  wss.on('connection', (ws) => {
    ws.on('message', (data, isBinary) => {
      ws.send(data, { binary: isBinary });
    });
  });

  server.listen(path ? { path } : { port }, () => cluster.fork());

  cluster.on('exit', () => {
    wss.close();
    server.close();
  });
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

  const roundPrec = (num, prec) => {
    const mul = Math.pow(10, prec);
    return Math.round(num * mul) / mul;
  };

  const humanSize = (bytes) => {
    if (bytes >= 1073741824) return roundPrec(bytes / 1073741824, 2) + ' GiB';
    if (bytes >= 1048576) return roundPrec(bytes / 1048576, 2) + ' MiB';
    if (bytes >= 1024) return roundPrec(bytes / 1024, 2) + ' KiB';
    return roundPrec(bytes, 2) + ' B';
  };

  const largest = configs.reduce(
    (prev, curr) => (curr[2] > prev ? curr[2] : prev),
    0
  );
  console.log('Generating %s of test data...', humanSize(largest));
  const randomBytes = Buffer.allocUnsafe(largest);

  for (let i = 0; i < largest; ++i) {
    randomBytes[i] = ~~(Math.random() * 127);
  }

  console.log(`Testing ws on ${path || '[::]:' + port}`);

  const runConfig = (useBinary, roundtrips, size, cb) => {
    const data = randomBytes.slice(0, size);
    const url = path ? `ws+unix://${path}` : `ws://localhost:${port}`;
    const ws = new WebSocket(url, {
      maxPayload: 600 * 1024 * 1024
    });
    let roundtrip = 0;
    let time;

    ws.on('error', (err) => {
      console.error(err.stack);
      cluster.worker.disconnect();
    });
    ws.on('open', () => {
      time = process.hrtime();
      ws.send(data, { binary: useBinary });
    });
    ws.on('message', () => {
      if (++roundtrip !== roundtrips)
        return ws.send(data, { binary: useBinary });

      let elapsed = process.hrtime(time);
      elapsed = elapsed[0] * 1e9 + elapsed[1];

      console.log(
        '%d roundtrips of %s %s data:\t%ss\t%s',
        roundtrips,
        humanSize(size),
        useBinary ? 'binary' : 'text',
        roundPrec(elapsed / 1e9, 1),
        humanSize(((size * 2 * roundtrips) / elapsed) * 1e9) + '/s'
      );

      ws.close();
      cb();
    });
  };

  (function run() {
    if (configs.length === 0) return cluster.worker.disconnect();
    const config = configs.shift();
    config.push(run);
    runConfig.apply(null, config);
  })();
}
