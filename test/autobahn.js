'use strict';

const WebSocket = require('../');

let currentTest = 1;
let testCount;

function nextTest() {
  let ws;

  if (currentTest > testCount) {
    ws = new WebSocket('ws://localhost:9001/updateReports?agent=ws');
    return;
  }

  console.log(`Running test case ${currentTest}/${testCount}`);

  ws = new WebSocket(
    `ws://localhost:9001/runCase?case=${currentTest}&agent=ws`
  );
  ws.on('message', (data, isBinary) => {
    ws.send(data, { binary: isBinary });
  });
  ws.on('close', () => {
    currentTest++;
    process.nextTick(nextTest);
  });
  ws.on('error', (e) => console.error(e));
}

const ws = new WebSocket('ws://localhost:9001/getCaseCount');
ws.on('message', (data) => {
  testCount = parseInt(data);
});
ws.on('close', () => {
  if (testCount > 0) {
    nextTest();
  }
});
