var WebSocketServer = require('../../').Server;
var http = require('http');
var express = require('express');
var session = require('express-session');

var app = express();

var bodyParser=require('body-parser');
var session=require('express-session');
var sessionParser=session({

    secret: 'there is no spoon',
    cookie: { maxAge: null },
    // store: sessionStore,
    resave: true,
    saveUninitializes: true
});

app.use(sessionParser);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

var server = http.createServer(app);
var wss = new WebSocketServer({
    server: server,
    verifyClient: function (info, done){

        sessionParser(info.req, {}, function(){

            console.log('VERIFY', info.req.session);
            // allow connection only if session is valid and a user is logged in
            done(info.req.session && info.req.session.user && info.req.session.user.id);
        });
    }
});

wss.on('connection', function(ws) {

    ws.on('message', function(message) {

        console.log(message, ws.upgradeReq.session);
        if(message.type && canUserDo(ws.upgradeReq.session.user, message.type)){

            // do stuff here and reply to the message
        }
    });
});
