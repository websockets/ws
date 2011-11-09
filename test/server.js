var http = require('http')
  , util = require('util')
  , crypto = require('crypto')
  , events = require('events')
  , Receiver = require('../lib/Receiver');

module.exports = {
    handlers: {
        valid: validRequestHandler,
        invalidKey: invalidRequestHandler,
        closeAfterConnect: closeAfterConnectHandler      
    },
    listen: function(port, handler) {
        var webServer = http.createServer(function (req, res) {
            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.end('okay');
        });
        var srv = new Server(webServer);
        webServer.on('upgrade', (handler || validRequestHandler).bind(null, srv));
        webServer.listen(port, '127.0.0.1');
        return srv;
    }
};

/**
 * Test strategies
 */

function validRequestHandler(server, req, socket) {
    if (typeof req.headers.upgrade === 'undefined' || 
        req.headers.upgrade.toLowerCase() !== 'websocket') {
        throw 'invalid headers';
        return;
    }

    if (!req.headers['sec-websocket-key']) {
        socket.end();
        throw 'websocket key is missing';
    }
        
    // calc key
    var key = req.headers['sec-websocket-key'];    
    var shasum = crypto.createHash('sha1');    
    shasum.update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");    
    key = shasum.digest('base64');

    var headers = [
          'HTTP/1.1 101 Switching Protocols'
        , 'Upgrade: websocket'
        , 'Connection: Upgrade'
        , 'Sec-WebSocket-Accept: ' + key
    ];

    socket.write(headers.concat('', '').join('\r\n'));
    socket.setTimeout(0);
    socket.setNoDelay(true);

    var receiver = new Receiver();
    receiver.on('text', function (message, flags) {
        server.emit('message', message, flags);
    });
    receiver.on('binary', function (message, flags) {
        flags = flags || {};
        flags.binary = true;
        server.emit('message', message, flags);
    });
    receiver.on('ping', function (message, flags) {
        server.emit('ping', message, flags);
    });
    receiver.on('pong', function (message, flags) {
        server.emit('pong', message, flags);
    });
    receiver.on('close', function (message, flags) {
        server.emit('close', message, flags);
    });
    socket.on('data', function (data) {
        receiver.add(data);
    });
    socket.on('end', function() {
        socket.end();
    });
}

function invalidRequestHandler(server, req, socket) {
    if (typeof req.headers.upgrade === 'undefined' || 
        req.headers.upgrade.toLowerCase() !== 'websocket') {
        throw 'invalid headers';
        return;
    }

    if (!req.headers['sec-websocket-key']) {
        socket.end();
        throw 'websocket key is missing';
    }
        
    // calc key
    var key = req.headers['sec-websocket-key'];    
    var shasum = crypto.createHash('sha1');    
    shasum.update(key + "bogus");    
    key = shasum.digest('base64');

    var headers = [
          'HTTP/1.1 101 Switching Protocols'
        , 'Upgrade: websocket'
        , 'Connection: Upgrade'
        , 'Sec-WebSocket-Accept: ' + key
    ];

    socket.write(headers.concat('', '').join('\r\n'));
    socket.end();
}

function closeAfterConnectHandler(server, req, socket) {
    if (typeof req.headers.upgrade === 'undefined' || 
        req.headers.upgrade.toLowerCase() !== 'websocket') {
        throw 'invalid headers';
        return;
    }

    if (!req.headers['sec-websocket-key']) {
        socket.end();
        throw 'websocket key is missing';
    }
        
    // calc key
    var key = req.headers['sec-websocket-key'];    
    var shasum = crypto.createHash('sha1');    
    shasum.update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");    
    key = shasum.digest('base64');

    var headers = [
          'HTTP/1.1 101 Switching Protocols'
        , 'Upgrade: websocket'
        , 'Connection: Upgrade'
        , 'Sec-WebSocket-Accept: ' + key
    ];

    socket.write(headers.concat('', '').join('\r\n'));
    socket.end();
}

/**
 * Server object, which will do the actual emitting
 */

function Server(webServer) {
    this.webServer = webServer;
}

util.inherits(Server, events.EventEmitter);

Server.prototype.close = function() {
    this.webServer.close();
}
