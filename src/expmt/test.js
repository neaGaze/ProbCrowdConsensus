var util = require('util'),
nconf = require('nconf'),
math = require('mathjs'),
http = require('http'),
bodyParser = require('body-parser'),
fs = require('fs'),
express = require('express'),
child_process = require('child_process');

var app = express();

// body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

var inputFileName = "/input/4o2c.json";
var ls = child_process.spawn(__dirname+"/./expe_run.sh", [729, 72, 10, inputFileName], {shell : true});
ls.stdout.on('data', function (data) {
  console.log('stdout: '+data);
});

ls.stderr.on('data', function (data) {
  console.log('stderr: ' + data);
});

ls.on('close', function(code) {
  console.log('child process exited with code ' + code);
});
