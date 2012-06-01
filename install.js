var spawn = require('child_process').spawn
  , exec = require('child_process').exec;

var build_native = process.env['npm_package_config_native'] != null ? process.env['npm_package_config_native'] : 'false';
build_native = build_native == 'true' ? true : false;
if(build_native) {
  process.stdout.write("================================================================================\n");
  process.stdout.write("=                                                                              =\n");
  process.stdout.write("=  Building WS with blazing fast native extensions.                            =\n");
  process.stdout.write("=                                                                              =\n");
  process.stdout.write("================================================================================\n");

  var gyp = exec('node-gyp rebuild', {cwd: __dirname});
  gyp.stdout.on('data', function(data) {
    process.stdout.write(data);
  });
  gyp.stderr.on('data', function(data) {
    process.stdout.write(data);
  });
  gyp.on('exit', function(code) {
    process.exit(code);
  });
}
else {
  process.stdout.write("================================================================================\n");
  process.stdout.write("=                                                                              =\n");
  process.stdout.write("=  To install WS with blazing fast native extensions, use                      =\n");
  process.stdout.write("=       <npm install ws --ws:native>                                           =\n");
  process.stdout.write("=                                                                              =\n");
  process.stdout.write("================================================================================\n");
}