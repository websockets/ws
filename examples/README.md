# How To

These examples have an up-folder dependency, as well as their own in-folder dependences. To get the examples working, you may need to:
- open a terminal at this folder (repositoryRoot/examples)
- run the command: npm install ultron@1.1.0
- cd to each example subdirectory in turn, e.g. run the command: cd serverstats
- run the command: express@4.14.0

You will then be able to run and test each example this way:
- from /serverstats directory, run the command: node server.js
- and then point a web browser to: localhost:8080 OR 127.0.0.1:8080 OR yourLocalNetworkAddress:8080
- from /fileapi directory, run the command: node server.js
- and refresh a web browser pointed at that same address.