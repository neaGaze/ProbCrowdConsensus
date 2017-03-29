var http = require('http'),
express = require('express'),
bodyParser = require('body-parser'),
child_process = require('child_process'),
exec = require('exec');

var app = express();

// body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.post('/pinger', function (req, res) {
  console.log('Welcome to the universe');

  var totalWorld = req.body.totalWorld,
  chunkSize = req.body.chunkSize,
  iter = req.body.iter,
  cb_id = req.body.cb_id;

  child_process.execFile('./run.sh ', [totalWorld, chunkSize, iter, cb_id], function (error, stdout, stderr) {
    console.log('stdout: ' + stdout);
    console.log('stderr: ' + stderr);
    if (error !== null) {
      console.log('exec error: ' + error);
    }

    res.status(200).send('\nProgram ran successfully in destination machine\n');
  });
});

app.listen(3001, function(){
  console.log("Server listening....");
});
