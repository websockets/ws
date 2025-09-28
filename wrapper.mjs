// Our SRC is CJS so we need to import default named
import { default as createWebSocketStream } from './lib/stream.js';
import { default as Receiver } from './lib/receiver.js';
import { default as Sender } from './lib/sender.js';
import { default as WebSocket } from './lib/websocket.js';
import { default as WebSocketServer } from './lib/websocket-server.js';

export { createWebSocketStream, Receiver, Sender, WebSocket, WebSocketServer };
// import * as WS from 'ws' => works
// import { WebSocket } from 'ws'; => works
export default { createWebSocketStream, Receiver, Sender, WebSocket, WebSocketServer };
// import WS from 'ws' => Works
