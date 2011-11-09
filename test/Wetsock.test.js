var assert = require('assert');
var Wetsock = require('../');
var server = require('./server');

var port = 20000;

function getArrayBuffer(buf) {
    var l = buf.length;
    var arrayBuf = new ArrayBuffer(l);
    for (var i = 0; i < l; ++i) {
        arrayBuf[i] = buf[i];
    }
    return arrayBuf;
}

function areArraysEqual(x, y) {
    if (x.length != y.length) return false;
    for (var i = 0, l = x.length; i < l; ++i) {
        if (x[i] !== y[i]) return false;
    }
    return true;
}

module.exports = {
    'connects to echo service': function() {
        var ws = new Wetsock('echo.websocket.org');
        ws.on('connected', function() {
            ws.terminate();
        });
    },
    'can disconnect before connection is established': function(done) {
        var ws = new Wetsock('echo.websocket.org');
        ws.terminate();
        ws.on('connected', function() {
            assert.fail('connect shouldnt be raised here');
        });
        ws.on('disconnected', function() {
            done();
        });
    },
    'send before connect should fail': function(done) {
        var ws = new Wetsock('echo.websocket.org');
        try {
            ws.send('hi');
        }
        catch (e) {
            ws.terminate();
            done();
        }
    },
    'send without data should fail': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            try {
                ws.send();
            }
            catch (e) {
                srv.close();
                ws.terminate();
                done();
            }
        });
    },
    'ping before connect should fail': function(done) {
        var ws = new Wetsock('echo.websocket.org');
        try {
            ws.ping();
        }
        catch (e) {
            ws.terminate();
            done();
        }
    },
    'invalid server key is denied': function(done) {
        var srv = server.listen(++port, server.handlers.invalidKey);
        var ws = new Wetsock('localhost', port);
        ws.on('error', function() {
            srv.close();
            done();
        });
    },
    'disconnected event is raised when server closes connection': function(done) {
        var srv = server.listen(++port, server.handlers.closeAfterConnect);
        var ws = new Wetsock('localhost', port);
        ws.on('disconnected', function() {
            srv.close();
            done();
        });
    },
    'send with unencoded message is successfully transmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.send('hi');
        });
        srv.on('message', function(message, flags) {
            assert.equal(false, flags.masked);
            assert.equal('hi', message);
            srv.close();
            ws.terminate();
            done();
        });
    },
    'send with encoded message is successfully transmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.send('hi', {mask: true});
        });
        srv.on('message', function(message, flags) {
            assert.equal(true, flags.masked);
            assert.equal('hi', message);
            srv.close();
            ws.terminate();
            done();
        });
    },
    'send with unencoded binary message is successfully transmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        var array = new Float32Array(5);
        for (var i = 0; i < 5; ++i) array[i] = i / 2;
        ws.on('connected', function() {
            ws.send(array, {binary: true});
        });
        srv.on('message', function(message, flags) {
            assert.equal(true, flags.binary);
            assert.equal(false, flags.masked);
            assert.equal(true, areArraysEqual(array, new Float32Array(getArrayBuffer(message))));
            srv.close();
            ws.terminate();
            done();
        });
    },
    'send with encoded binary message is successfully transmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        var array = new Float32Array(5);
        for (var i = 0; i < 5; ++i) array[i] = i / 2;
        ws.on('connected', function() {
            ws.send(array, {mask: true, binary: true});
        });
        srv.on('message', function(message, flags) {
            assert.equal(true, flags.binary);
            assert.equal(true, flags.masked);
            assert.equal(true, areArraysEqual(array, new Float32Array(getArrayBuffer(message))));
            srv.close();
            ws.terminate();
            done();
        });
    },
    'ping without message is successfully transmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.ping();
        });
        srv.on('ping', function(message) {
            srv.close();
            ws.terminate();
            done();
        });
    },
    'ping with message is successfully transmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.ping('hi');
        });
        srv.on('ping', function(message) {
            assert.equal('hi', message);
            srv.close();
            ws.terminate();
            done();
        });
    },
    'ping with encoded message is successfully transmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.ping('hi', {mask: true});
        });
        srv.on('ping', function(message, flags) {
            assert.equal(true, flags.masked);
            assert.equal('hi', message);
            srv.close();
            ws.terminate();
            done();
        });
    },
    'pong without message is successfully transmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.pong();
        });
        srv.on('pong', function(message) {
            srv.close();
            ws.terminate();
            done();
        });
    },
    'pong with message is successfully transmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.pong('hi');
        });
        srv.on('pong', function(message) {
            assert.equal('hi', message);
            srv.close();
            ws.terminate();
            done();
        });
    },
    'pong with encoded message is successfully transmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.pong('hi', {mask: true});
        });
        srv.on('pong', function(message, flags) {
            assert.equal(true, flags.masked);
            assert.equal('hi', message);
            srv.close();
            ws.terminate();
            done();
        });
    },
    'close without message is successfully transmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.close();
        });
        srv.on('close', function(message, flags) {
            assert.equal(false, flags.masked);
            assert.equal('', message);
            srv.close();
            ws.terminate();
            done();
        });        
    },
    'close with message is successfully transmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.close('some reason');
        });
        srv.on('close', function(message, flags) {
            assert.equal(false, flags.masked);
            assert.equal('some reason', message);
            srv.close();
            ws.terminate();
            done();
        });        
    },
    'close with encoded message is successfully transmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.close('some reason', {mask: true});
        });
        srv.on('close', function(message, flags) {
            assert.equal(true, flags.masked);
            assert.equal('some reason', message);
            srv.close();
            ws.terminate();
            done();
        });        
    },
    'close ends connection to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        var connectedOnce = false;
        ws.on('connected', function() {
            connectedOnce = true;
            ws.close('some reason', {mask: true});
        });
        ws.on('disconnected', function() {
            assert.equal(true, connectedOnce);
            srv.close();
            ws.terminate();
            done();
        });
    },
}