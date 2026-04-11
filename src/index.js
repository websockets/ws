import { createWebSocketStream } from '../lib/stream.js';
import extension from '../lib/extension.js';
import { PerMessageDeflate } from '../lib/permessage-deflate.js';
import { Receiver } from '../lib/receiver.js';
import { Sender } from '../lib/sender.js';
import subprotocol from '../lib/subprotocol.js';
import { WebSocket } from '../lib/websocket.js';
import { WebSocketServer } from '../lib/websocket-server.js';

WebSocket.createWebSocketStream = createWebSocketStream;
WebSocket.extension = extension;
WebSocket.PerMessageDeflate = PerMessageDeflate;
WebSocket.Receiver = Receiver;
WebSocket.Sender = Sender;
WebSocket.Server = WebSocketServer;
WebSocket.subprotocol = subprotocol;
WebSocket.WebSocket = WebSocket;
WebSocket.WebSocketServer = WebSocketServer;

export * from '../lib/stream.js';
export * from '../lib/extension.js';
export * from '../lib/permessage-deflate.js';
export * from '../lib/receiver.js';
export * from '../lib/sender.js';
export * from '../lib/subprotocol.js';
export * from '../lib/websocket.js';
export * from '../lib/websocket-server.js';

export default WebSocket;
