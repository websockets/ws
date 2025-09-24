'use strict';

const path = require('path');
const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('../..'); 

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

// Create HTTP server and attach WebSocket server to it
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', function connection(ws, request) {
  console.log('Client connected');

  ws.on('message', function message(data) {
    const text = data.toString();
    console.log('Received:', text);

    // Broadcast to everyone
    wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(text);
      }
    });
  });

  ws.on('close', function () {
    console.log('Client disconnected');
  });

  ws.on('error', console.error);
});

server.listen(8080, function () {
  console.log('Listening on http://localhost:8080');
});
