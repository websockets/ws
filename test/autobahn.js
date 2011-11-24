var WebSocket = require('../');
var currentTest = 1;
var testCount = null;

function nextTest() {
    if (currentTest > testCount) return;
    console.log('Running test case #' + currentTest);
    var ws = new WebSocket('ws://localhost:9001/runCase?case=' + currentTest + '&agent=easy-websocket');
    ws.on('message', function(data, flags) {
        ws.send(data, {binary: flags.binary === true, mask: flags.masked === true});
    });
    ws.on('close', function() {
        currentTest += 1;
        process.nextTick(nextTest);
    });
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