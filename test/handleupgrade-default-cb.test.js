/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^ws$" }] */

'use strict';

const WebSocket = require('..');
const http= require('http'); 

describe('WebSocketServer.handleUpgrade', () => { 
  it('successfully triggers connection event with default callback', (done) => {
  let ws;
  const server = http.createServer();
  const wss = new WebSocket.Server({ noServer: true });
  wss.on('connection', function (ws) {
    done();
    server.close();
    if (ws) ws.close();
  });
  wss.on('error',(err)=>{
    done(new Error("WSS: got error event"));
    if (ws) ws.close();
    server.close();
  });

  server.on('upgrade', function upgrade(request, socket, head) {
    wss.handleUpgrade(request, socket, head);
  });

  server.listen(0,function(){
    const ws = new WebSocket(`ws://localhost:${server.address().port}`);
    ws.on('error',(err)=>{
      done(new Error("WS: got error event"));
      ws.close();
      server.close();
    });
});

})});