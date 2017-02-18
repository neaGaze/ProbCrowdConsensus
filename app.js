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
CrowdConsensus = require(__dirname + "/src/db/CrowdConsensus.js"),
QuesInquirer = require(__dirname + "/src/slack/QuesInquirer.js");

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


/***
* A Controller to detect the callback from the interactive buttons i.e.
* when the user clicks on one of the interactive buttons this event is triggered
* This however is not used anymore and can be deleted without much effect
***/
controller.on('interactive_message_callback', function(bot, message) {
  console.log("interactive_message_callback is received baby !");
});


/**************************************************************************************
* controller to detect when the bot is created
**************************************************************************************/
controller.on('create_bot',function(bot,config) {

  if (_bots[bot.config.token]) {
    // already online! do nothing.
  } else {
    bot.startRTM(function(err) {

      if (!err) {
        trackBot(bot);
      }

      bot.startPrivateConversation({user: config.createdBy},function(err,convo) {
        if (err) {
          console.log(err);
        } else {
          convo.say('I am a bot that has just joined your team');
          convo.say('You must now /invite me to a channel so that I can be of use!');
        }
      });

    });
  }
});


// Handle events related to the websocket connection to Slack
controller.on('rtm_open',function(bot) {
  console.log('** The RTM api just connected!');
});

controller.on('rtm_close',function(bot) {
  console.log('** The RTM api just closed');
  // you may want to attempt to re-open
});

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

/******************************************************************************
* Find the name of the user from the given Id
*********************************************************************************/
var lookupUserNameFromId = function(userId, members) {
  for(var mem in members) {
    if(members[mem].id == userId)
    return members[mem].name;
  }
  return "NAME_NOT_FOUND";
}

/******************************************************************************************
* Runs the algorithm to find the new question, then asks users to answer them, repeat until Pareto-Optimal objects found
********************************************************************************************/
var questionLooper = function(cb_id, bot, message){
  // run the algorithm and find the question first

  /* <<<<<<<  Starts Dummy question  >>>>>>>>>>>>> */
  var replyParam = {
    object1 : 'Bond',
    object2 : 'Hunt',
    criterion : 'action'
  };
  /* <<<<<<<< Ends Dummy Question >>>>>>>>>>>>>> */

  // schedule the questions to the different users and gather their responses
  var quesInquirer = new QuesInquirer(replyParam);
  quesInquirer.on('ask', function(userid){

    console.log('__userid to ask question____' + userid);

    bot.startPrivateConversation({user : userid}, function(err, convo){

      if(err) {
        console.log(err);
        return;
      }
      
      convo.ask({
        delete_original : true,
        attachments:[
          {
            title: "Between the two objects *" + replyParam.object1 + "* and *" + replyParam.object2 + "*, which is better on criteria *" + replyParam.criterion+"*",
            fallback : 'You have a new question',
            callback_id: "12345",
            attachment_type: 'default',
            actions: [
              {
                "name": ""+replyParam.object1 + "," + replyParam.object2+"," + replyParam.criterion,
                "text": ""+replyParam.object1 + " > " + replyParam.object2,
                "type": "button",
                "value": "gt"
              },
              {
                "name": ""+replyParam.object1 + "," + replyParam.object2+"," + replyParam.criterion,
                "text": ""+replyParam.object1 + " < " + replyParam.object2,
                "type": "button",
                "value": "lt"
              },
              {
                "name": ""+replyParam.object1 + "," + replyParam.object2+"," + replyParam.criterion,
                "text": "" + replyParam.object1 + " ~ " + replyParam.object2,
                "type": "button",
                "value": "~",
              }
            ]
          }
        ]
      },[
        {
          pattern: "gt",
          callback: function(reply, convo) {
            console.log("> replied recorded");
            convo.say('You said  *' + replyParam.object1 +
            '* is better than *' + replyParam.object2 + '* on criteria *' + replyParam.criterion+'*');
            convo.next();

            var username = lookupUserNameFromId(reply.user, members);
            console.log("The username is : " + username);
            //saveInDB(bot, cb_id, reply.user, username, replyParam, '&gt;', timerQues, timeoutDelay);
          }
        },
        {
          pattern: "lt",
          callback: function(reply, convo) {
            console.log("< replied recorded");
            convo.say('You said  *' + replyParam.object2 +
            '* is better than *' + replyParam.object1 + '* on criteria *' + replyParam.criterion+'*');
            convo.next();
            var username = lookupUserNameFromId(reply.user, members);
            console.log("The username is : " + username);
            //saveInDB(bot, cb_id, reply.user, username, replyParam, '&lt;', timerQues, timeoutDelay);
          }
        },
        {
          pattern: "~",
          callback: function(reply, convo) {
            console.log("~ replied recorded");
            convo.say('You said  *' + replyParam.object2 +
            '* is indifferent to *' + replyParam.object1 + '* on criteria *' + replyParam.criterion+'*');
            convo.next();
            var username = lookupUserNameFromId(reply.user, members);
            console.log("The username is : " + username);

            //process.exit(1);
            //saveInDB(bot, cb_id, reply.user, username, replyParam, '&#126;', timerQues, timeoutDelay);
          }
        },
        {
          default: true,
          callback: function(reply, convo) {
            console.log("default msg recorded");
            // do nothing
            convo.say('Your message reply duration was timed out. Sorry ');
            convo.next();
          }
        }
      ]);
    });
  });

  quesInquirer.on('get_users', function(tmp){
    console.log('Delegated the responsibilitiy to find users to the controller');

    bot.api.users.list({}, function(err, res){
      if(err) {
        console.log("Failed to read users : " + err);
        bot.reply("Sorry", 'Sorry, there has been an error: '+err);
      }

      if(!err) {
        for(var member in res.members){
          if(!res.members[member].is_bot)
            quesInquirer.activeUsers.push(res.members[member]);
        }
        console.log('___The number of active users: ' + res.members.length);
        quesInquirer.findBestUsers();
      }
    });
  });


  quesInquirer.on('min_threshold_satisfied', function(userid){
    console.log('threshold of number of users to ask is reached. Time to ask new question');
    //questionLooper(cb_id, bot, message);
  });

  quesInquirer.on('finish', function(paretoOptimalObjects){
    console.log('The pareto-optimal objects are found ');
    bot.reply(message, "You have not more questions left to answer");
  });

  quesInquirer.scheduleQues();
};

/************************************************************
* To start asking questions to all the users visible
**************************************************************/
controller.hears(["ask (.*)"],["direct_message", "direct_mention","mention","ambient"], function (bot, message){
  var all_msg = message.match[0],
  param = {
    'object1' : '',
    'object2' : '',
    'criterion' : '',
    'isFinished' : false
  };
  console.log("Controller is hearing stuffs. Msg -> " + all_msg.match(/\d+/)[0]);
  var idFromChat = all_msg.match(/\d+/);

  if(idFromChat == null) bot.reply(message, "You need to add the number as well");
  else {
    var num = idFromChat[0], isFirstReply = true;

    CrowdConsensus.findId(num, isFirstReply, function(cb_id){
      questionLooper(cb_id, bot, message);
    });
  }
});

// Show the list of problems upon being asked for help
controller.hears(["Help"],["direct_message","direct_mention","mention","ambient"],function(bot,message) {

  CrowdConsensus.getList(function(lists){
    var attachments = [],
    attachment1 = {
      title: 'If you want to create a new Pareto-Optimal Finding Problem, just upload your JSON file into '+
      'any channel and write \'crowdconsensus\' as the comment in the upload',
      color: '#87CEFA',
      fields: []
    },
    attachment2 = {
      title: 'Please use this ID to reply to the Problem you want to participate \n ID  |  Description',
      color: '#FFCC99',
      fields: []
    },
    replyObj = {
      text: 'Hello, Seems like you need some help. Don\'t worry. I\'m here to help. Take a look into some of my suggestions below:\n'
    };

    for(var i = 0; i < lists.length; i++){
      attachment2.fields.push({
        id: lists[i].id,
        title: (i + 1) + "  |  " + lists[i].desc
      });
    }

    attachments.push(attachment1);
    if(lists.length > 0)
    attachments.push(attachment2);

    replyObj.attachments = attachments;

    bot.reply(message, replyObj, function(err,resp) {
      console.log(err,resp);
    });
  });
});
