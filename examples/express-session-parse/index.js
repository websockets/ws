const WebSocketServer = require('../../').Server;
const http = require('http');
const express = require('express');
const session = require('express-session');
const uuid = require('node-uuid');

const SERVICE_PORT = 3000;

const app = express();

// We will need the same instance of the session parser in express and web socket server.
const sessionParser = session({
  secret: '$eCuRiTy',
  resave: false,
  saveUninitialized: false
});

// Give static contents from the 'public' folder for free
app.use('/', express.static('public'));

app.use(sessionParser);
app.get('/session', (request, response) => {
  // "Log in" user and set userId to session
  const {session} = request;
  session.userId = uuid.v4();
  console.log(`New session is created for user ${session.userId}`);
  response
    .json({
      result: 'OK',
      message: 'User session is created'
    })
    .end();
});

app.delete('/session', (request, response) => {
  const {session} = request;
  if (session.userId) {
    console.log(`Session is destroying for user ${session.userId}`);
    request.session.destroy();
    response
      .json({
        result: 'OK',
        message: 'User session is destroyed'
      })
      .end();
  } else {
    console.log('Requested to destroy an empty session.');
    response
      .json({
        result: 'error',
        message: 'No user session'
      })
      .end();
  }
});

// Create HTTP server by ourselves
const httpServer = http.createServer();

var wss = new WebSocketServer({
  server: httpServer,
  verifyClient: function (info, done) {
    const request = info.req;
    console.log('Parsing session from request...');
    sessionParser(request, {}, () => {
      console.log('Session is parsed!');
      const {session} = request;
      // We can reject the connection by returning false to done(). For example, reject here if user is unknown.
      done(session && session.userId);
    });
  }
});

wss.on('connection', function (ws) {
  ws.on('message', function (message) {
    const session = ws.upgradeReq.session;
    // Here we can now use session parameters.
    console.log(`WS message ${message} from user ${session.userId}`);
  });
});

// Add express handlers to our HTTP server
httpServer.on('request', app);

// And start the service at last
httpServer.listen(SERVICE_PORT, () => {
  const host = httpServer.address().address;
  const port = httpServer.address().port;
  console.log(`Server is listening on ${host}:${port}`);
});
