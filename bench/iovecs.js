var cluster = require('cluster')
  , WebSocket = require('../')
  , WebSocketServer = WebSocket.Server
  , crypto = require('crypto')
  , util = require('util')
  , ansi = require('ansi');
require('tinycolor');

function roundPrec(num, prec) {
  var mul = Math.pow(10, prec);
  return Math.round(num * mul) / mul;
}

function humanSize(bytes) {
  if (bytes >= 1048576) return roundPrec(bytes / 1048576, 2) + ' MB';
  if (bytes >= 1024) return roundPrec(bytes / 1024, 2) + ' kB';
  return roundPrec(bytes, 2) + ' B';
}

if (cluster.isMaster) {
  var wss = new WebSocketServer({port: 8181}, function() {
    cluster.fork();
  });
  wss.on('connection', function(ws) {
    ws.on('message', function(data, flags) {
      ws.send('ack');
    });
    ws.on('close', function() {});
  });
  cluster.on('exit', function(worker) {
    wss.close();
  });
}
else {
  var cursor = ansi(process.stdout);

  var configs = [{
    bufCount: 1,
    bufSize: 8 * 1024,
    options: {
      compress: false,
      mask: false
    }
  }, {
    bufCount: 8,
    bufSize: 1 * 1024,
    options: {
      compress: false,
      mask: false
    }
  }, {
    bufCount: 1,
    bufSize: 128 * 1024,
    options: {
      compress: false,
      mask: false
    }
  }, {
    bufCount: 8,
    bufSize: 16 * 1024,
    options: {
      compress: false,
      mask: false
    }
  }, {
    bufCount: 1,
    bufSize: 1024 * 1024,
    options: {
      compress: false,
      mask: false
    }
  }, {
    bufCount: 8,
    bufSize: 128 * 1024,
    options: {
      compress: false,
      mask: false
    }
  }, {
    bufCount: 1,
    bufSize: 128 * 1024,
    options: {
      compress: false,
      mask: true
    }
  }, {
    bufCount: 1,
    bufSize: 128 * 1024,
    options: {
      compress: true,
      mask: true
    }
  }];


  function testConfig(conf, cb) {
    var client = new WebSocket('ws://localhost:' + '8181');
    var startTime;
    var printTime;
    var bytes = 0;
    var randomBuf = crypto.pseudoRandomBytes(conf.bufSize);
    function send() {
      // in each message we send a header json to provide info about the incoming buffers
      var header = {
        protocolVersion: '0.1.0',
        time: Date.now(),
        buffersInfo: []
      };
      var buffers = [
        // the first 4 bytes of the message contain the length of the header so the receiver can decode it
        new Buffer(4),
        // the second buffer will be the json of the header
        null
      ];
      var size = 0;
      for (var i=0; i<conf.bufCount; ++i) {
          size += conf.bufSize;
          buffers.push(randomBuf);
          header.buffersInfo[i] = {
              size: conf.bufSize
          };
      }
      // set the header buffer and set the first 4 bytes to the length of the header
      buffers[1] = new Buffer(JSON.stringify(header));
      buffers[0].writeUInt32BE(buffers[1].length, 0);
      size += buffers[0].length + buffers[1].length;
      bytes += size;
      if (conf.iovecs) {
        client.sendv(buffers, conf.options);
      } else {
        client.send(Buffer.concat(buffers), conf.options);
      }
    }
    client.on('error', function(e) {
      console.error(e);
      process.exit();
    });
    client.on('open', function() {
      startTime = printTime = Date.now();
      send();
    });
    client.on('message', function(data, flags) {
      var now = Date.now();
      if (now - printTime >= 1000) {
        var elapsed = now - startTime;
        printTime = now;
        cursor.up();
        console.log('%s:\t%ss\t%s'
          , conf.iovecs ? conf.prefix.green : conf.prefix.cyan
          , roundPrec(elapsed / 1000, 1).toString().green.bold
          , (humanSize(bytes / elapsed * 1000) + '/s').blue.bold);
        if (elapsed >= 9000) {
          client.close();
          cb();
          return;
        }
      }
      process.nextTick(send);
    });
  }

  (function testNext() {
    if (!configs.length) {
      console.log('done.');
      process.exit();
    }
    console.log(' '); // newline
    var conf = configs.shift();
    console.log('Sending messages with %s buffers of %s (options %s)',
      conf.bufCount, humanSize(conf.bufSize), JSON.stringify(conf.options));
    conf.prefix = 'without iovecs';
    console.log(conf.prefix);
    testConfig(conf, function() {
      delete conf.options.fin;
      conf.iovecs = true;
      conf.prefix = 'with    iovecs';
      console.log(conf.prefix);
      testConfig(conf, testNext);
    });
  })();
}
