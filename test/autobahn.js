var WebSocket = require('../');
var currentTest = 1;
var testCount = null;

process.on('SIGINT', function () {
    try {
        var ws = new WebSocket('ws://localhost:9001/updateReports?agent=easy-websocket');
        ws.on('close', function() {
            process.exit();
        });
    }
    catch(e) {
        process.exit();        
    }
});

function nextTest() {
    if (currentTest > testCount) {
        var ws = new WebSocket('ws://localhost:9001/updateReports?agent=easy-websocket');
        ws.on('close', function() {
            process.exit();
        });
        return;
    };
    console.log('== Running test case #' + currentTest + ' ==');
    var ws = new WebSocket('ws://localhost:9001/runCase?case=' + currentTest + '&agent=easy-websocket');
    ws.on('message', function(data, flags) {
        ws.send(flags.buffer, {binary: flags.binary === true, mask: true});
    });
    ws.on('close', function(data) {
        currentTest += 1;
        process.nextTick(nextTest);
    });
    ws.on('error', function() {});
}

var ws = new WebSocket('ws://localhost:9001/getCaseCount');
ws.on('message', function(data, flags) {
    testCount = parseInt(data);
});
ws.on('close', function() {
    if (testCount > 0) {
        nextTest();
    }
});