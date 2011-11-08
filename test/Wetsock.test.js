var assert = require('assert');
var Wetsock = require('../');
var server = require('./server');

var port = 20000;

module.exports = {
    'connects to echo service': function() {
        var ws = new Wetsock('echo.websocket.org');
        ws.on('connected', function() {
            ws.close();
        });
    },
    'can disconnect before connection is established': function(done) {
        var ws = new Wetsock('echo.websocket.org');
        ws.close();
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
            ws.close();
            done();
        }
    },
    'ping before connect should fail': function(done) {
        var ws = new Wetsock('echo.websocket.org');
        try {
            ws.ping();
        }
        catch (e) {
            ws.close();
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
    'send with unencoded message is successfully tarnsmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.send('hi');
        });
        srv.on('message', function(message, flags) {
            assert.equal(false, flags.masked);
            assert.equal('hi', message);
            srv.close();
            ws.close();
            done();
        });
    },
    'send with encoded message is successfully tarnsmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.send('hi', {mask: true});
        });
        srv.on('message', function(message, flags) {
            assert.equal(true, flags.masked);
            assert.equal('hi', message);
            srv.close();
            ws.close();
            done();
        });
    },
    'ping without message is successfully tarnsmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.ping();
        });
        srv.on('ping', function(message) {
            srv.close();
            ws.close();
            done();
        });
    },
    'ping with message is successfully tarnsmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.ping('hi');
        });
        srv.on('ping', function(message) {
            assert.equal('hi', message);
            srv.close();
            ws.close();
            done();
        });
    },
    'ping with encoded message is successfully tarnsmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.ping('hi', {mask: true});
        });
        srv.on('ping', function(message, flags) {
            assert.equal(true, flags.masked);
            assert.equal('hi', message);
            srv.close();
            ws.close();
            done();
        });
    },
    'pong without message is successfully tarnsmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.pong();
        });
        srv.on('pong', function(message) {
            srv.close();
            ws.close();
            done();
        });
    },
    'pong with message is successfully tarnsmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.pong('hi');
        });
        srv.on('pong', function(message) {
            assert.equal('hi', message);
            srv.close();
            ws.close();
            done();
        });
    },
    'pong with encoded message is successfully tarnsmitted to the server': function(done) {
        var srv = server.listen(++port);
        var ws = new Wetsock('localhost', port);
        ws.on('connected', function() {
            ws.pong('hi', {mask: true});
        });
        srv.on('pong', function(message, flags) {
            assert.equal(true, flags.masked);
            assert.equal('hi', message);
            srv.close();
            ws.close();
            done();
        });
    },
}