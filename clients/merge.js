var fs = require('fs');
var lines = fs.readFileSync(process.argv[2], 'utf8');
lines = lines.split('\n').slice(0, -1);
var newLines = fs.readFileSync(process.argv[3], 'utf8').split('\n').slice(0, -1);
var allLines = fs.readFileSync(process.argv[4], 'utf8').split('\n').slice(0, -1);
var file = '';
var inserted = 0;
var current = lines.shift();
for (var i = 0; i < allLines.length; ++i) {
  if (i+1 == parseInt(current)) {
    file += newLines.shift() + '\n';
    current = lines.shift();
  }
  file += allLines[i] + '\n';
}
console.log(file);