/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^ws$" }] */

'use strict';

const WebSocket = require('..');


describe('WebSocketServer', () => { 
  it('successfully rejects a connection via error heders in on headers handler', (done) => {
  const wss = new WebSocket.Server(
    {
      port: 0
    },
    () => {
      const ws = new WebSocket(`ws://localhost:${wss.address().port}`);
      wss.on('connection', (ws) => {
        done(new Error("WSS: on connection?! We should not be here!"));
        ws.close();
        wss.close();
      });
      wss.on('headers', (headers,req)=>{
        headers.length=0;
        headers.push('HTTP/1.1 418 I\'m a teapot');
        headers.push('Connection: close');
      });

      ws.on('open', () => {
       done(new Error("WS: on connection?! We should not be here!"));
       ws.close();
       wss.close();
      });
      ws.on('error',(err)=>{
        if (err instanceof Error) {
          if (err.message.endsWith(' 418')) {
            //end with no error
            done();
            ws.close();
            wss.close();
          } else {
            done(new Error("WS: on err but err is not as expected!"));
            ws.close();
            wss.close();
          }
        } else {
          done(new Error("WS: on err but err is not instance of Error!"));
          ws.close();
          wss.close();
        }
      });
    }
  );

})});
