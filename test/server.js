var http = require('http');
var crypto = require('crypto');
var Parser = require('./parser');

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

    var parser = new Parser();
    parser.on('data', function (message, flags) {
        server.emit('message', message, flags);
    });
    parser.on('ping', function (message, flags) {
        server.emit('ping', message, flags);
    });
    parser.on('pong', function (message, flags) {
        server.emit('pong', message, flags);
    });
    socket.on('data', function (data) {
        parser.add(data);
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
    // socket.on('data', function (data) {
    //     self.parser.add(data);
    // });
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
    // socket.on('data', function (data) {
    //     self.parser.add(data);
    // });
}

module.exports = {
    handlers: {
        valid: validRequestHandler,
        invalidKey: invalidRequestHandler,
        closeAfterConnect: closeAfterConnectHandler      
    },
    listen: function(port, handler) {
        var srv = http.createServer(function (req, res) {
            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.end('okay');
        });
        srv.on('upgrade', (handler || validRequestHandler).bind(null, srv));
        srv.listen(port, '127.0.0.1');
        return srv;
    }
};