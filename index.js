'use strict';

const WebSocket = require('./lib/websocket');
const { CloseEvent, ErrorEvent, MessageEvent } = require('./lib/event-target');

WebSocket.createWebSocketStream = require('./lib/stream');
WebSocket.Server = require('./lib/websocket-server');
WebSocket.Receiver = require('./lib/receiver');
WebSocket.Sender = require('./lib/sender');

WebSocket.CloseEvent = CloseEvent
WebSocket.ErrorEvent = ErrorEvent
WebSocket.MessageEvent = MessageEvent

WebSocket.WebSocket = WebSocket;
WebSocket.WebSocketServer = WebSocket.Server;

module.exports = WebSocket;
