var http = require('http'),
express = require('express'),
nconf = require('nconf'),
fs = require('fs'),
request = require('request'),
bodyParser = require('body-parser'),
child_process = require('child_process'),
exec = require('exec');

nconf.argv()
.env()
.file({ file: __dirname + '/config.json' });

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

  console.log("-> " + totalWorld +", " + chunkSize + ", " + iter + ", "+cb_id);

  var ls = child_process.spawn("./run.sh", [totalWorld, chunkSize, iter, cb_id], {shell : true});
  ls.stdout.on('data', function (data) {
    console.log('stdout: '+data);
  });

  ls.stderr.on('data', function (data) {
    console.log('stderr: ' + data);
  });

  ls.on('close', function(code) {
    console.log('child process exited with code ' + code);
  });
});

// if we see the results, send it to the host machine running Slack
if(process.env.RESULT) {
  try {
    console.log("" + process.env.RESULT);
    var file = fs.readFileSync(process.env.RESULT);
    console.log("file -> " + file);
    var resJson = JSON.parse(file);
    request({
      url: nconf.get("HOST_IP_ADDR")+'/getResults', //URL to hit
      method: 'POST',
      //Lets post the following key/values as form
      form: resJson
    }, function(error, response, body){
      if(error) {
        console.log(error);
      } else {
        console.log(response.statusCode, body);
      }
    });
  } catch(e1){ console.error(e1); }
}

app.listen(3001, function(){
  console.log("Server listening on port 3001....");
});
