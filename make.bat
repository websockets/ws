@echo off

REM This file hijacks the make command from package.json, so that
REM the solution can be 'built' on Windows.

IF "%1"=="" GOTO Build
IF "%1"=="test" goto Test
GOTO End

:Build
mkdir build\Release
copy /Y lib\ValidationWindows.js build\Release\validation.js
copy /Y lib\BufferUtilWindows.js build\Release\bufferutil.js
GOTO End

:Test
node node_modules/mocha/bin/_mocha -t 2000 test/BufferPool.test.js test/Sender.test.js test/WebSocketServer.test.js test/Receiver.test.js test/Validation.test.js test/WebSocket.test.js

:End

