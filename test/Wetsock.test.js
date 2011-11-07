var assert = require('assert');
var Wetsock = require('../');
var server = require('./server');

var port = 20000;

module.exports = {
    'can connect to echo service': function() {
        var ws = new Wetsock('echo.websocket.org');
        ws.on('connect', function() {
            ws.close();
        });
    },
    'can disconnect before connection is established': function(done) {
        var ws = new Wetsock('echo.websocket.org');
        ws.close();
        ws.on('connect', function() {
            assert.fail('connect shouldnt be raised here');
        });
        ws.on('disconnect', function() {
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
    'invalid server key is denied': function(done) {
        var srv = server.listen(++port, server.handlers.invalidKey);
        var ws = new Wetsock('localhost', port);
        ws.on('error', function() {
            srv.close();
            done();
        });
    },    
}