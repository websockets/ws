REM This file hijacks the make command from package.json, so that
REM the solution can be 'built' on Windows.
mkdir build\Release
xcopy /Y lib\ValidationWindows.js build\Release\validation.js
xcopy /Y lib\BufferUtilWindows.js build\Release\bufferutil.js
