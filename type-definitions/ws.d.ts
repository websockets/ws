
import { EventEmitter } from 'events'
import * as http from 'http'
import * as net from 'net'

export class Server extends EventEmitter {

    constructor( options: ServerOptions, cb?: () => any );

    close();
    handleUpgrade( request: http.ServerRequest, socket: net.Socket, upgradeHead, callback: (webSocket: WebSocket) => any );
    on( event: 'error', handler: (error: Error) => any ): this;
    on( event: 'headers', handler: (headers: any) => any ): this;
    on( event: 'conenction', handler: (socket: WebSocket) => any ): this;
}

interface ServerOptions {
    host?: string;
    port?: number;
    server?: net.Server;
    verifyClient?(info: { origin: string, req: http.ClientRequest, secure: boolean }): boolean;
    verifyClient?(info: { origin: string, req: http.ClientRequest, secure: boolean }, cb: (result: boolean) => any): void;
    handleProtocols?(protocols: string[], cb: (result: boolean, protocol: string) => void): any;
    path?: string;
    noServer?: boolean;
    disableHixie?: boolean;
    clientTracking?: boolean;
    perMessageDeflate?: boolean | PerMessageDeflateOptions;
}

interface PerMessageDeflateOptions {
    serverNoContextTakeover: boolean;
    clientNoContextTakeover: boolean;
    serverMaxWindowBits: number;
    clientMaxWindowBits: number;
    memLevel: number;
}

export class WebSocket {
    
    static CONNECTING;
    static OPEN;
    static CLOSING;
    static CLOSED;
    
    bytesReceived: number;
    readyState: any;
    protocolVersion: any;
    url: string;
    supports: any;
    upgradeReq: http.ClientRequest;

    constructor( address: string, options: WebSocketOptions );
    constructor( address: string, protocols: string[], options: WebSocketOptions );

    close( code?: number, data?: string );
    pause();
    ping( data?, options?: { mask: boolean, binary: boolean }, dontFailWhenClosed?: boolean );
    pong( data?, options?: { mask: boolean, binary: boolean }, dontFailWhenClosed?: boolean );
    resume();
    send( data );
    send( data, callback: () => any );
    send( data, options: { mask: boolean, binary: boolean, compress: boolean }, callback: () => any );
    stream( callback: (data, final: boolean) => any );
    stream( options: { mask: boolean, binary: boolean }, callback: (data, final: boolean) => any );
    terminate();

    onopen( handler: () => any );
    onerror( handler: (error: Error) => any );
    onclose( handler: (code: number, message: string) => any );
    onmessage( handler: (data, flags: { binary: boolean }) => any );

    addEventListener( event: 'open', handler: () => any );
    addEventListener( event: 'error', handler: (error: Error) => any ): this;
    addEventListener( event: 'close', handler: (code: number, message: string) => any );
    addEventListener( event: 'message', handler: (data, flags: { binary: boolean }) => any );
    addEventListener( event: 'ping', handler: (data, flags: { binary: boolean }) => any );
    addEventListener( event: 'pong', handler: (data, flags: { binary: boolean }) => any );
    addEventListener( event: string, listener: () => any );
    
    on( event: 'open', handler: () => any );
    on( event: 'error', handler: (error: Error) => any ): this;
    on( event: 'close', handler: (code: number, message: string) => any );
    on( event: 'message', handler: (data, flags: { binary: boolean }) => any );
    on( event: 'ping', handler: (data, flags: { binary: boolean }) => any );
    on( event: 'pong', handler: (data, flags: { binary: boolean }) => any );
    on( event: string, listener: () => any );
}

interface WebSocketOptions {
    protocol?: string
    agent?: http.Agent;
    headers?: any;
    protocolVersion?: number | string;
    // the following only apply if address is a String
    host?: string;
    origin?: string;
    pfx?: string | Buffer
    key?: string | Buffer;
    passphrase?: string;
    cert?: string | Buffer;
    ca?: any[];
    ciphers?: string;
    rejectUnauthorized?: boolean;
    perMessageDeflate?: boolean | PerMessageDeflateOptions;
    localAddress?: string;
}
