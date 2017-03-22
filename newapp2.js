
var http = require('http'),
express = require('express'),
bodyParser = require('body-parser'),
path = require('path'),
nconf = require('nconf'),
https = require('https'),
fs = require('fs'),
math = require('mathjs'),
GreedyArrayFile = require(__dirname + "/src/algo/GreedyArrayFile.js");


var port = process.env.PORT || 3000;

var startTime, endTime;

var app = express();

// body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

startTime = new Date().getTime();
var gree = new GreedyArrayFile(process.env.START_INDEX, process.env.SUBWORLD_SIZE, process.env.iter);
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
