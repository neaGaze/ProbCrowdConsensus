
var http = require('http'),
express = require('express'),
bodyParser = require('body-parser'),
path = require('path'),
nconf = require('nconf'),
https = require('https'),
fs = require('fs'),
math = require('mathjs'),
mongoose = require('mongoose'),
GreedyArray = require(__dirname + "/src/algo/GreedyArray.js");

var schema = require(__dirname + "/src/db/Schema.js"),
CCReply = schema.CCReply,
CCModel = schema.CCModel;

var startTime, endTime;

nconf.argv()
.env()
.file({ file: __dirname + '/config.json' });

var mongodb_url = nconf.get('CROWD_CONSENSUS_MONGO_URL');

// Connect mongodb
mongoose.Promise = global.Promise;
mongoose.connect(mongodb_url, function (error) {
  if (error) console.error(error);
  else console.log('mongo connected');
});

var app = express();

// body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));



startTime = new Date().getTime();
var gree = new GreedyArray(process.env.ID, process.env.START_INDEX, process.env.SUBWORLD_SIZE, process.env.iter);
endTime = new Date().getTime();
console.log("--------------- " + ((endTime - startTime) / 1000) + " secs -----------");

var pastTime = 0;
if(fs.existsSync('timemachine.txt')) {
  var pastTimeStr = fs.readFileSync('timemachine.txt');
  pastTime = Number(pastTimeStr);
}
var wstream = fs.createWriteStream("timemachine.txt", {'flags': 'w', 'encoding': null, 'mode': 0666});
var writeVal = pastTime + ((endTime - startTime) / 1000);
wstream.write(writeVal+"");
wstream.end();

app.listen(process.env.PORT, function(){
  console.log("Server listening....");
});
