var http = require('http');
var crypto = require('crypto');

function validRequestHandler(req, socket) {
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

function invalidRequestHandler(req, socket) {
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

module.exports = {
    handlers: {
        valid: validRequestHandler,
        invalidKey: invalidRequestHandler,        
    },
    listen: function(port, handler) {
        var srv = http.createServer(function (req, res) {
            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.end('okay');
        });
        srv.on('upgrade', handler || validRequestHandler);
        srv.listen(port, '127.0.0.1');
        return srv;
    }
};