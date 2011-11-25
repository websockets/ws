var WebSocket = require('../');
var currentTest = 53;
var testCount = null;

function nextTest(skipReports) {
    if (currentTest > testCount) return;
    if (!skipReports && currentTest % 2 == 0) {
        updateReports();
        return;
    }
    console.log('== Running test case #' + currentTest + ' ==');
    var ws = new WebSocket('ws://localhost:9001/runCase?case=' + currentTest + '&agent=easy-websocket');
    ws.on('message', function(data, flags) {
        // console.log(arguments, {binary: flags.binary === true, mask: flags.masked === true});
        ws.send(data, {binary: flags.binary === true, mask: true});
    });
    ws.on('close', function(data) {
        currentTest += 1;
        process.nextTick(nextTest);
    });
    ws.on('error', function() {
        console.log('Error', arguments);
    });
}

function updateReports() {
    var ws = new WebSocket('ws://localhost:9001/updateReports?agent=easy-websocket');
    ws.on('close', function() {
        process.nextTick(nextTest.bind(this, true));
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