var http = require('http'),
express = require('express'),
bodyParser = require('body-parser'),
path = require('path'),
mongoose = require('mongoose'),
nconf = require('nconf'),
https = require('https'),
dateformat = require('dateformat'),
Botkit = require('botkit'),
fs = require('fs'),
math = require('mathjs'),
CrowdCnsusModule = require(__dirname + '/src/db/CrowdCnsusModule.js'),
CrowdConsensus = require(__dirname + "/src/db/CrowdConsensus.js");

var schema = require(__dirname + "/src/db/Schema.js"),
CCReply = schema.CCReply,
CCModel = schema.CCModel;

nconf.argv()
.env()
.file({ file: __dirname + '/config.json' });

var port = process.env.PORT || 3000,
mongodb_url = nconf.get('CROWD_CONSENSUS_MONGO_URL'),
crowdconsensus_token = nconf.get('UNIVERSAL_TOKEN');

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

// at the base level
app.get('/', function (req, res) {
  console.log('Welcome to CrowdConsensus-II with Probability');
  res.status(200).send('Welcome to CrowdConsensus-II with Probability!\n');
});

/**************************************
* For initializing the SlackBot
**************************************/
var controller = Botkit.slackbot({
  interactive_replies: true // tells botkit to send button clicks into conversations
    // interactive_replies: true,
  //json_file_store: './db_slackbutton_bot/',
  // rtm_receive_messages: false, // disable rtm_receive_messages if you enable events api
}).configureSlackApp(
  {
    clientId: nconf.get("CLIENT_ID"),
    clientSecret: nconf.get("CLIENT_SECRET"),
    scopes: ['bot']
  }
);

controller.spawn({
  token: nconf.get("BOT_ID")
}).startRTM(function(err) {
  if (err) {
    throw new Error(err);
  }
});

controller.setupWebserver(port, function(err,webserver) {
  controller.createWebhookEndpoints(controller.webserver);

  controller.createOauthEndpoints(controller.webserver,function(err,req,res) {
    if (err) {
      console.log("oauth failure: " + err);
      res.status(500).send('ERROR: ' + err);
    } else {
      console.log("oauth sucess");
      res.send('Success!');
    }
  });
});


// just a simple way to make sure we don't
// connect to the RTM twice for the same team
var _bots = {};
function trackBot(bot) {
  _bots[bot.config.token] = bot;
}


/**************************************************
* For requesting the poll to be created by the bot
**************************************************/
controller.on('file_share', function(bot, message) {
  var id = message.file.id;

  // file.info
  bot.api.files.info({
    file: id
  }, function(err,res) {
    if (err) {
      console.log("Failed to read file : "+err);
      bot.reply(message, 'Sorry, there has been an error: '+err);
    } else {

      var comment = '';
      if(res.comments.length > 0) comment = res.comments[0].comment;

      if(comment == "crowdconsensus"){
        var ccm = CrowdCnsusModule.createCrowdCnsusModule(res.content);
        var replyMsg = CrowdConsensus.createCrowdConsensus(ccm);
        bot.reply(message, replyMsg, function(err,resp) {
          if(err) console.error(err);
        });
      }
    }
  });
});

http.createServer(function (request, response) {
  // Send the HTTP header
  // HTTP Status: 200 : OK
  // Content Type: text/plain
  response.writeHead(200, {'Content-Type': 'text/plain'});

  // Send the response body as "Hello World"
  response.end('Hello World\n');
}).listen(8081);

// Console will print the message
console.log('Server running at http://127.0.0.1:8081/');
