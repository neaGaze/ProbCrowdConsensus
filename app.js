var http = require('http'),
express = require('express'),
bodyParser = require('body-parser'),
path = require('path'),
mongoose = require('mongoose'),
util = require('util'),
nconf = require('nconf'),
https = require('https'),
Botkit = require('botkit'),
fs = require('fs'),
math = require('mathjs'),
request = require('request'),
CrowdCnsusModule = require(__dirname + '/src/db/CrowdCnsusModule.js'),
CrowdConsensus = require(__dirname + "/src/db/CrowdConsensus.js"),
QuesInquirer = require(__dirname + "/src/slack/QuesInquirer.js"),
QuesScheduler = require(__dirname + "/src/slack/QuesScheduler.js"),
ExhaustiveScheduler = require(__dirname + "/src/slack/ExhaustiveScheduler.js"),
async = require('async'),
GreedyApproach = require(__dirname + "/src/algo/GreedyApproach.js"),
GreedyArrayFile = require(__dirname + "/src/algo/GreedyArrayFile.js"),
GreedyArray = require(__dirname + "/src/algo/GreedyArray.js");

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

var greedy;
var startTime, endTime;
var sampleSize = nconf.get("NUMBER_OF_USERS_TO_ASK");
var timeoutInterval = nconf.get("TIMEOUT_INTERVAL");
var EXHAUSTIVE_APPROACH = 0, TIMEOUT_METHOD = 1, DATA_COLLECTION_METHOD = EXHAUSTIVE_APPROACH;

var app = express();

// body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// at the base level
app.get('/', function (req, res) {
  console.log('Welcome to CrowdConsensus-II with Probability');
  res.status(200).send('Welcome to CrowdConsensus-II with Probability!\n');
});


/******************************************************************************************************
* Save the aggregated result into CrowdConsensus module
**************************************************************************************************/
function crowdCollect(cb_id, callback){
  CCReply.aggregate([
    {
      $group  : {
        _id : {
          parent_id : '$parent_id',
          criterion : '$criterion',
          object1 : '$object1',
          object2 : '$object2',
          reply : '$reply'
        },
        count : {$sum : 1}
      }
    },
    {
      $group : {
        _id : {
          criterion : '$_id.criterion',
          parent_id : '$_id.parent_id',
          object1 : '$_id.object1',
          object2 : '$_id.object2'
        },
        total_count : { $sum : '$count' },
        result : {
          $push : {
            'reply' : '$_id.reply',
            'count' : '$count'
          }
        }
      }
    },
    {
      $unwind : '$result'
    },
    {
      $project : {
        _id : {
          criterion : '$_id.criterion',
          parent_id : '$_id.parent_id',
          object1 : '$_id.object1',
          object2 : '$_id.object2'
        },
        gt : {$cond : {if : {'$eq' : ['$result.reply', '&gt;']}, then : {'$divide' : ['$result.count', '$total_count']}, else : '0.0'}},
        lt : {$cond : {if : {'$eq' : ['$result.reply', '&lt;']}, then : {'$divide' : ['$result.count', '$total_count']}, else : '0.0'}},
        indiff : {$cond : {if : {'$eq' : ['$result.reply', '&#126;']}, then : {'$divide' : ['$result.count', '$total_count']}, else : '0.0'}}
      }
    },
    {
      $group  : {
        _id : {
          parent_id : '$_id.parent_id',
          criterion : '$_id.criterion',
          object1 : '$_id.object1',
          object2 : '$_id.object2'
        },
        gt : {$sum : '$gt'},
        lt : {$sum : '$lt'},
        indiff : {$sum : '$indiff'}
      }
    }
  ], function(err, result){
    var retArr = [];
    if(err) console.error(err);
    else {

      //    console.log("__________replies________");
      for(var i = 0; i < result.length; i++){
        if(result[i]._id.parent_id != cb_id) continue;

        //console.log(JSON.stringify(result[i]));

        var returnVal = {};
        var multi = 1;

        returnVal.criterion = result[i]._id.criterion;
        returnVal.parent_id = result[i]._id.parent_id;
        returnVal.object1 = result[i]._id.object1;
        returnVal.object2 = result[i]._id.object2;
        returnVal.gt = result[i].gt;
        returnVal.lt = result[i].lt;
        returnVal.indiff = result[i].indiff

        retArr.push(returnVal);
      }
    }
    callback(retArr);
  });
}

/******************************************************************************************************
* Update or insert into CrowdConsensus collection by aggregating 'CrowdReply' instances
********************************************************************************************************/
var upsert = function(oneReply, callback){

  var ins = function(){
    CCModel.update(
      {
        '_id' : oneReply.parent_id
      },
      {'$push' : {'responses' : {
        'object1' : oneReply.object1,
        'object2' : oneReply.object2,
        'criterion' : oneReply.criterion,
        'gt' : oneReply.gt,
        'lt' : oneReply.lt,
        'indiff' : oneReply.indiff
      }}},
      function(err, model){
        if(err) console.error("Error at CCModel.update: " + err);
        console.log('insert success ');

        callback();
      });
    };


    // try new method separating find and update or find and insert
    CCModel.findOne({
      '_id' : oneReply.parent_id,
      'responses.object1' : oneReply.object1,
      'responses.object2' : oneReply.object2,
      'responses.criterion' : oneReply.criterion
    },
    function(err, model){
      if(err) console.error("Error at CCModel.findOne: " + err);

      if(model != null && model.length != 0){
        // for update
        CCModel.update(
          {
            'responses.object1' : oneReply.object1,
            'responses.object2' : oneReply.object2,
            'responses.criterion' : oneReply.criterion
          },
          {
            '$pull' : {
              'responses' : {
                'object1' : oneReply.object1,
                'object2' : oneReply.object2,
                'criterion' : oneReply.criterion
              }
            }
          },
          function(err, model){
            if(err) console.error("Error at CCModel.update: " + err);
            console.log('remove success ' + oneReply.gt);
            // after delete insert again
            ins();
          });
        } else {
          // for insert
          ins();
        }
      });
    }

    /******************************************************************************************************
    * Save the response from the user into the mongodb
    **************************************************************************************************/
    var saveInDB = function(cb_id, userId, userName, questionParam, returnedVal) {

      CCReply.count({
        'parent_id' : cb_id,
        'object1' : questionParam.object1,
        'object2' : questionParam.object2,
        'criterion' : questionParam.criterion
      }, function(err, count){

        if(count <= sampleSize - 1) {
          var crModel = new CCReply();

          crModel.parent_id = cb_id;
          crModel.member_id = userId;
          crModel.name = userName;
          crModel.object1 = questionParam.object1;
          crModel.object2 = questionParam.object2;
          crModel.criterion = questionParam.criterion;
          crModel.reply = returnedVal;

          // save the record in mongo collection
          crModel.save(function(err, body){
            console.error(err);
            console.log('the new entry is now saved in CrowdReply');

            // aggregate crowd replies into CrowdConsensus collection
            crowdCollect(cb_id, function(replyCrowdCollect){

              // update the response field with the replyCrowdCollect in crowdconsensus collection
              // using async library
              var arr1 = [];
              async.each(replyCrowdCollect, function(file, callback){
                arr1.push(function(callback1){
                  upsert(file, function(){
                    callback1(null, '');
                  });
                });
                console.log("---------NEW PROB VALUES_______");
                console.log(JSON.stringify(file));
                callback();
              }, function(err){
                if(err) console.error(err);

                async.parallel(arr1, function(err, results){
                  if(err) console.error(err);
                  console.log(" results -> " + JSON.stringify(results));
                });
              });
            });
          });
        } else if(count >= sampleSize) {
          console.log("Sorry we can't update your responses for ("+ questionParam.object1 +
          " " + questionParam.criterion + " "+ questionParam.object2 +") into our database because we have saturated our " + sampleSize + " limitation of responses");
        }
      });
    };

    /**************************************
    * For initializing the SlackBot
    **************************************/
    var controller = Botkit.slackbot({
      interactive_replies: true, // tells botkit to send button clicks into conversations
      json_file_store: './db_slackbutton_bot/'
      // rtm_receive_messages: false, // disable rtm_receive_messages if you enable events api
    }).configureSlackApp(
      {
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        scopes: ['bot']
      }
    );

    /*
    controller.spawn({
    token: nconf.get("BOT_ID")
  }).startRTM(function(err) {
  if (err) {
  throw new Error(err);
}
});
*/

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

controller.storage.teams.all(function(err,teams) {
  if (err) {
    throw new Error(err);
  }

  // connect all teams with bots up to slack!
  for (var t  in teams) {
    if (teams[t].bot) {
      controller.spawn(teams[t]).startRTM(function(err, bot) {
        if (err) {
          console.log('Error connecting bot to Slack:',err);
        } else {
          console.log('connected the bot to Slack:',err);
          trackBot(bot);
        }
      });
    }
  }
});


/***
* A Controller to detect the callback from the interactive buttons i.e.
* when the user clicks on one of the interactive buttons this event is triggered
* This however is not used anymore and can be deleted without much effect
***/
controller.on('interactive_message_callback', function(bot, message) {
  console.log("interactive_message_callback is received baby !");
  var reply = {
    text: ' ',
    attachments: [],
  };
  bot.replyInteractive(message, reply);

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
var lookupUserNameFromId = function(userId) {

  return userId;

  var members = [];
  // previous one
  for(var mem in members) {
    if(members[mem].id == userId)
    return members[mem].name;
  }
  return "NAME_NOT_FOUND";
}

/************************************************************************************
* Shows the help text to the user
**************************************************************************************/
var help = function(bot, message, inChannel) {

  CrowdConsensus.getList(function(lists){
    var attachments = [],
    attachment1 = {
      title: 'If you want to create a new Pareto-Optimal Finding Problem, just upload your JSON file into '+
      'any channel and write \'crowdconsensus\' as the comment in the upload',
      color: '#87CEFA',
      fields: []
    },
    attachment2 = {
      title: 'You shall be asked question when someone types [/ask (ID)] in a channel or mentions the bot with text \'Help\' \n ID  |  Description',
      color: '#FFCC99',
      fields: []
    },
    attachment3 = {
      title: 'You can set the timeout interval for a question by typing [/settimeout (time in seconds)]',
      color: '#A9CB7B',
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
    attachments.push(attachment3);

    replyObj.attachments = attachments;

    if(inChannel) bot.replyPrivate(message, replyObj, function(err, resp){console.log(err, resp);});
    else bot.reply(message, replyObj, function(err,resp) {
      console.log(err,resp);
    });
  });
};


/************************************************************************************
* The Exhaustive Framework for Asking questions to the users
**************************************************************************************/
var exhaustiveAskFramework = function(bot, message, cb_id, members, channelId) {
  CrowdConsensus.getResponses(cb_id, function(resp){

    // reset the instance if previously stopped
    if(ExhaustiveScheduler.getInstance() && ExhaustiveScheduler.getInstance().STOP_ASKING_QUESTION)
    ExhaustiveScheduler.self = null;

    ExhaustiveScheduler.create(resp);

    // add members
    for(var member in members) {
      if(!members[member].is_bot && members[member].id !== 'USLACKBOT' && !members[member].deleted  )
      ExhaustiveScheduler.getInstance().activeUsers.push(members[member].id);
    }

    // set the total population count
    ExhaustiveScheduler.getInstance().totalPopulation = ExhaustiveScheduler.getInstance().activeUsers.length;
    ExhaustiveScheduler.getInstance().on('question_user_paired', function(pair, uid, index, ts){

      bot.startPrivateConversation({user : uid}, function(err, convo){

        if(err) {
          console.log(err);
          return;
        }

        convo.ask({
          delete_original : true,
          attachments:[
            {
              title: "In comparing the 2 programming languages : *" + pair.object1 + "* and *" + pair.object2 + "*, which one do you think is better in terms of  *" + pair.criterion+"*",
              fallback : 'You have a new question',
              callback_id: "" + ts +":"+ index,
              attachment_type: 'default',
              actions: [
                {
                  "name": ""+pair.object1 + "," + pair.object2+"," + pair.criterion,
                  "text": ""+pair.object1 + " > " + pair.object2,
                  "type": "button",
                  "value": "gt"
                },
                {
                  "name": ""+pair.object1 + "," + pair.object2+"," + pair.criterion,
                  "text": ""+pair.object1 + " < " + pair.object2,
                  "type": "button",
                  "value": "lt"
                },
                {
                  "name": ""+pair.object1 + "," + pair.object2+"," + pair.criterion,
                  "text": "" + pair.object1 + " ~ " + pair.object2,
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
              var username = lookupUserNameFromId(reply.user);
              console.log("The username is : " + reply.user + ", >");
              //console.log("received response with timestamp : " + reply.callback_id);
              var pr = ExhaustiveScheduler.getInstance().nextQues(reply.user, parseInt(reply.callback_id.split(":")[1], 10));
              if(pr) {
                convo.say('You said  *' + pr.object1 + '* is better than *' + pr.object2 + '* on criteria *' + pr.criterion+'*');
                saveInDB(cb_id, reply.user, reply.user, pr, '&gt;');
              } else convo.say('It looks like you already answered that one');
              convo.next();
            }
          },
          {
            pattern: "lt",
            callback: function(reply, convo) {
              var username = lookupUserNameFromId(reply.user);
              console.log("The username is : " + reply.user + ", <");
              //console.log("received response with timestamp : " + reply.callback_id);
              var pr = ExhaustiveScheduler.getInstance().nextQues(reply.user, parseInt(reply.callback_id.split(":")[1], 10));
              if(pr) {
                convo.say('You said  *' + pr.object2 + '* is better than *' + pr.object1 + '* on criteria *' + pr.criterion+'*');
                saveInDB(cb_id, reply.user, reply.user, pr, '&lt;');
              } else convo.say('It looks like you already answered that one');
              convo.next();
            }
          },
          {
            pattern: "~",
            callback: function(reply, convo) {
              var username = lookupUserNameFromId(reply.user);
              console.log("The username is : " + reply.user + ", ~");
              var pr = ExhaustiveScheduler.getInstance().nextQues(reply.user, parseInt(reply.callback_id.split(":")[1], 10));
              if(pr) {
                convo.say('You said  *' + pr.object1 + '* is indifferent to *' + pr.object2 + '* on criteria *' + pr.criterion+'*');
                saveInDB(cb_id, reply.user, reply.user, pr, '&#126;');
              } else convo.say('It looks like you already answered that one');
              convo.next();
            }
          },
          {
            default: true,
            callback: function(reply, convo) {
              console.log("received response with timestamp : " + reply.callback_id + " which couldnt be located");
            }
          }
        ]);
      });
    });

    ExhaustiveScheduler.getInstance().on('problem_finish', function(a) {
      // Tell the user that the task is done
      bot.api.im.open({user : a}, function(err4, res4) {
        if(res4.channel.id)
        bot.api.chat.postMessage({channel : res4.channel.id, text : "The task is finished. Thank you for your response"}, function(err3, res2) {
          if(err3) console.log(""+err3);
        });
      });
    });

    // start asking users
    if(ExhaustiveScheduler.getInstance().activeUsers.length > 0) ExhaustiveScheduler.getInstance().scheduleQues(cb_id);
    else console.log("The population is zero. Something wrong. Hmmm");
  });
};


/************************************************************************************
* The general timeout Framework for Asking questions to the users
**************************************************************************************/
var quesAskFramework = function(bot, message, cb_id, members, channelId) {

  CrowdConsensus.getResponses(cb_id, function(resp){

    // reset the instance if previously stopped
    if(QuesScheduler.getInstance() && QuesScheduler.getInstance().STOP_ASKING_QUESTION)
    QuesScheduler.self = null;

    QuesScheduler.create(resp);
    console.log(".....STOP_ASKING_QUESTION.... " + QuesScheduler.getInstance().STOP_ASKING_QUESTION);
    QuesScheduler.getInstance().TIMEOUT_FOR_USER_TO_RESPOND = timeoutInterval;
    var popnCount = 0;
    console.log("size -> " + members.length);
    for(var member in members) {
      if(!members[member].is_bot && members[member].id !== 'USLACKBOT' && !members[member].deleted  ) {
        //    && (members[member].id == "U28260VFX" /*|| members[member].id == "U281R5JFJ"*/)) {
        QuesScheduler.getInstance().activeUsers.push(members[member].id);
        popnCount++;
        console.log(members[member].name);
      }
    }

    QuesScheduler.getInstance().totalPopulation = popnCount;

    // Listener that is triggered when a question is paired with suitable candidates and ready to ask them question
    var getQuesUserPairListener = function(pair, uid){
      console.log('**\n The paired users will now be asked questions with uniqueTimeStamp: ' + pair.uniqueTimeStamp + '**\n');

      sampleSize = QuesScheduler.getInstance().minUserThreshold;

      bot.startPrivateConversation({user : uid}, function(err, convo){

        if(err) {
          console.log(err);
          return;
        }

        convo.ask({
          delete_original : true,
          attachments:[
            {
              title: "Between the two objects *" + pair.object1 + "* and *" + pair.object2 + "*, which is better on criteria *" + pair.criterion+"*",
              fallback : 'You have a new question',
              callback_id: "" + pair.uniqueTimeStamp +":"+ uid,
              attachment_type: 'default',
              actions: [
                {
                  "name": ""+pair.object1 + "," + pair.object2+"," + pair.criterion,
                  "text": ""+pair.object1 + " > " + pair.object2,
                  "type": "button",
                  "value": "gt"
                },
                {
                  "name": ""+pair.object1 + "," + pair.object2+"," + pair.criterion,
                  "text": ""+pair.object1 + " < " + pair.object2,
                  "type": "button",
                  "value": "lt"
                },
                {
                  "name": ""+pair.object1 + "," + pair.object2+"," + pair.criterion,
                  "text": "" + pair.object1 + " ~ " + pair.object2,
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
              var username = lookupUserNameFromId(reply.user);
              console.log("The username is : " + reply.user + ", >");
              //console.log("received response with timestamp : " + reply.callback_id);
              var pr = QuesScheduler.getInstance().checkTimeStamp(reply.callback_id);

              if(!pr){
                convo.say("Sorry your response to this question was timed out");
              } else if(QuesScheduler.getInstance().answerRecorded(reply.callback_id, reply.user)) {
                convo.say('You said  *' + pr.object1 +
                '* is better than *' + pr.object2 + '* on criteria *' + pr.criterion+'*');
                saveInDB(cb_id, reply.user, reply.user, pr, '&gt;');

              } else convo.say("Thanks but we already have your input. Sorry!");
              convo.next();
            }
          },
          {
            pattern: "lt",
            callback: function(reply, convo) {
              var username = lookupUserNameFromId(reply.user);
              console.log("The username is : " + reply.user + ", <");
              //console.log("received response with timestamp : " + reply.callback_id);
              var pr = QuesScheduler.getInstance().checkTimeStamp(reply.callback_id);

              if(!pr){
                convo.say("Sorry your response to this question was timed out");
              } else if(QuesScheduler.getInstance().answerRecorded(reply.callback_id, reply.user)) {

                convo.say('You said  *' + pr.object2 +
                '* is better than *' + pr.object1 + '* on criteria *' + pr.criterion+'*');
                saveInDB(cb_id, reply.user, reply.user, pr, '&lt;');

              } else convo.say("Thanks but we already have your input. Sorry!");
              convo.next();
            }
          },
          {
            pattern: "~",
            callback: function(reply, convo) {
              var username = lookupUserNameFromId(reply.user);
              console.log("The username is : " + reply.user + ", ~");
              //console.log("received response with timestamp : " + reply.callback_id);
              var pr = QuesScheduler.getInstance().checkTimeStamp(reply.callback_id);

              if(!pr){
                convo.say("Sorry your response to this question was timed out");
              } else if(QuesScheduler.getInstance().answerRecorded(reply.callback_id, reply.user)) {

                convo.say('You said  *' + pr.object2 +
                '* is indifferent to *' + pr.object1 + '* on criteria *' + pr.criterion+'*');
                saveInDB(cb_id, reply.user, reply.user, pr, '&#126;');

              } else convo.say("Thanks but we already have your input. Sorry! ");
              convo.next();
            }
          },
          {
            default: true,
            callback: function(reply, convo) {
              console.log("default msg recorded");
              console.log("received response with timestamp : " + reply.callback_id + " which couldnt be located");
              // do nothing
              convo.say('Oops! Your message reply duration was timed out. Sorry! ');
              //convo.next();
            }
          }
        ]);

        // add timer for that user to know if he has answered within the specified time limit
        QuesScheduler.getInstance().startTimer(pair.uniqueTimeStamp, uid);
      });
    };

    QuesScheduler.getInstance().on('question_user_paired', getQuesUserPairListener);
    QuesScheduler.getInstance().on('min_threshold_satisfied', function(a){

    });

    QuesScheduler.getInstance().on('problem_finish', function(a){
      console.log("__________THE PROBLEM IS FINISHED_____________");

      var realID = JSON.stringify(cb_id);
      realID = realID.slice(1,-1);

      var totalWorld = math.pow(3, QuesScheduler.getInstance().questionList.length);
      var chunkSize = totalWorld, iter = 1;
      while(chunkSize > 400000) {
        chunkSize = chunkSize / 10;
        chunkSize = chunkSize >> 0;  // convert into integer
        iter *= 10;
      }

      // now pass the data to the algorithm through shell script
      var addr = (process.env.DEST_IP_ADDR) ? process.env.DEST_IP_ADDR : nconf.get("DEST_IP_ADDR");
      request({
        url: addr+'/pinger', //URL to hit
        method: 'POST',
        //Lets post the following key/values as form
        form: {totalWorld : totalWorld, chunkSize : chunkSize, iter : iter, cb_id : realID}
      }, function(error, response, body){
        if(error) {
          console.log(error);
        } else {
          console.log(response.statusCode, body);
        }
      });

      setTimeout(function(){QuesScheduler.destroy();}, 10000); // This wait time is there to allow writing the final input into mongodb

      // Tell the user that the task is done
      if(channelId)
      bot.api.chat.postMessage({channel : channelId, text : "The task is finished. Thank you for your response"}, function(err3, res2) {
        if(err3) console.log(""+err3);
      });
    });

    if(popnCount > 0)
    QuesScheduler.getInstance().scheduleQues();
    else console.log("The population is zero. Something wrong. Hmmm");
  });
};

/*****************************************************************************
* Find the detailed Information of the user from its id
******************************************************************************/
var getUserInfo = function(bot, id, callback) {
  bot.api.users.info({user : id}, function(err2, res2) {
    callback(res2.user);
  });
};

/*********************************************************
* Detect Slash Commands
**********************************************************/
controller.on('slash_command',function(bot,message) {
  console.log("command triggerred -> " + message.command);
  // Perform action for the command 'ask'
  if(message.command === "/ask"){
    console.log("Now performing the 'ask' operation");
    if(message.text === "") {
      //bot.replyPublic(message,'<@' + message.user + '> is cool!');
      //bot.replyPrivate(message,'*nudge nudge wink wink*');
      bot.replyPrivate(message, '<@' + message.user + "> Please enter the valid integer parameter. Type '/helpme' if you need help");

    } else if(parseInt(message.text)) {
      var problemId;
      try{
        problemId = parseInt(message.text);
      } catch(ex){
        console.error("Error converting text");
      }
      console.log("Channel name: " + message.channel);
      if(problemId) {
        CrowdConsensus.findId(problemId, true, function(cb_id){

          var lookAtChannel = true, lookAtGroup = false;

          // a function that triggers the questions. The variable 'membs' can either be the channel members or group members
          var starter = function(membs){
            var usersInChannel = membs;
            var detailUsersInfoList = [];
            for(var i = 0; i < usersInChannel.length; i++) {
              getUserInfo(bot, usersInChannel[i], function(detailUsersInfo){
                detailUsersInfoList.push(detailUsersInfo);
                console.log("detailUsersInfo -> " + detailUsersInfo.name + " and count: " + i)

                // don't ask if previously already asked or the bot details couldb't be found and ask only at the last iterat of this loop
                if(detailUsersInfo && detailUsersInfoList.length == usersInChannel.length) {
                  if(DATA_COLLECTION_METHOD == EXHAUSTIVE_APPROACH && !ExhaustiveScheduler.getInstance())
                  exhaustiveAskFramework(bot, message, cb_id, detailUsersInfoList, message.channel);
                  else if (DATA_COLLECTION_METHOD == TIMEOUT_METHOD && !QuesScheduler.getInstance())
                  quesAskFramework(bot, message, cb_id, detailUsersInfoList, message.channel);
                } else {
                  console.log("Most probably the QuesScheduler instance is not null");
                  //bot.replyPrivate(message, "You need to close previous session of questions. Use \'stopall [id] command");
                }
              });
            }
          };

          if(lookAtChannel) {
            bot.api.channels.info({channel : message.channel}, function(err, res){
              if(err) {
                console.log("Failed to read channels : " + err);
                lookAtChannel = false; lookAtGroup = true;
              }

              if(lookAtGroup) {
                bot.api.groups.info({channel : message.channel}, function(err1, res1){
                  if(err1) {
                    console.log("Failed to read that group :" + err1 +" with id: " + message.channel);
                    lookAtGroup = false, lookAtChannel = false;
                    bot.reply("Sorry", 'Sorry, there has been an error. We couldnot find that channel '+err);
                  }

                  if(!err1) {
                    console.log("Should be asking question to a group");
                    starter(res1.group.members);
                  }
                });
              }

              if(!err) {
                console.log("Should be asking question to a channel");
                starter(res.channel.members);
              }
            });
          }
        });

        bot.replyPrivate(message, "Please take a look at the message sent by the bot");
        //bot.replyPrivate(message,'*nudge nudge wink wink*');
        //bot.replyPublicDelayed(message,'Reply Delayed');
        //console.log("messge channel : " + message.channel);
      } else {
        bot.replyPrivate(message, '<@' + message.user +"> Please enter the valid integer parameter. Type '/helpme' if you need help");
      }
    }
  }
  // Perform action for the slash command 'settimeout'
  else if(message.command === "/settimeout") {
    console.log("Now performing the 'settimeout' operation");

    if(message.text === "") {
      bot.replyPrivate(message, '<@' + message.user + '>' + " You need to pass the parameter in seconds. Type '/helpme' if you need help");
    } else if(parseInt(message.text)){
      var timeoutValue = parseInt(message.text);
      timeoutInterval = timeoutValue * 1000;
      bot.replyPrivate(message, "The timeout for question is now set to " + timeoutValue + " seconds");
    } else {
      bot.replyPrivate(message, '<@' + message.user +"> Please enter the valid integer parameter. Type '/helpme' if you need help");
    }
  }
  // Perform action for the slash command 'helpme'
  else if(message.command == "/helpme") {
    console.log("Now performing the 'helpme' operation");
    //  bot.replyPrivate(message, '<@' + message.user + '>' + " Don\'t worry I\'m here to help you. ");
    help(bot, message, true);

    // Stop asking questions
  } else if(message.command == "/stopall") {
    if(message.text === "") {
      bot.replyPrivate(message, '<@' + message.user + '>' + " You need to pass the id of the problem. Type '/helpme' if you need help");
    } else if(parseInt(message.text)){
      var num = parseInt(message.text);
      var instance;

      if(DATA_COLLECTION_METHOD == EXHAUSTIVE_APPROACH) instance = ExhaustiveScheduler.getInstance();
      else if(DATA_COLLECTION_METHOD == TIMEOUT_METHOD) instance = QuesScheduler.getInstance();

      if(instance) {

        instance.STOP_ASKING_QUESTION = true,
        isFirstReply = true;

        CrowdConsensus.findId(num, isFirstReply, function(cb_id){

          CCModel.update({'_id' : cb_id}, {'$set' : {'responses' : []}}, function(err){
            if(err) console.error(err);
            else {
              console.log("Deleted all entries");
              CCReply.remove({parent_id : cb_id}, function(err){
                if(err) console.error(err);
                else console.log("Deleted all associated the replies");

                if(DATA_COLLECTION_METHOD == TIMEOUT_METHOD)
                setTimeout(function(){QuesScheduler.destroy()}, (instance.TIMEOUT_FOR_USER_TO_RESPOND + 2000));
                else if(DATA_COLLECTION_METHOD == EXHAUSTIVE_APPROACH)
                ExhaustiveScheduler.destroy();

                console.log("secs -> "+(instance.TIMEOUT_FOR_USER_TO_RESPOND / 1000) + 2);
                bot.replyPrivate(message, 'OK all process will be stopped. Please wait for ' +
                ((instance.TIMEOUT_FOR_USER_TO_RESPOND / 1000) + 2) + " secs before asking any questions again");
              });
            }
          });
        });
      } else console.log("QuesScheduler instance is null");
    } else {
      bot.replyPrivate(message, '<@' + message.user +"> Please enter the valid integer parameter. Type '/helpme' if you need help");
    }
  }
  // get the results and show them
  else if(message.command == "/getresults") {
    if(message.text === "") {
      bot.replyPrivate(message, '<@' + message.user + '>' + " You need to pass the id of the problem. Type '/helpme' if you need help");
    } else if(parseInt(message.text)){
      var num = parseInt(message.text),
      isFirstReply = true;

      CrowdConsensus.findId(num, isFirstReply, function(cb_id){
        CCModel.findOne({"_id" : cb_id}, function(err, model){
          var objects = model.objects,
          results = model.subscribers;
          var outputStr = "";
          if(results.length > 0) {
            // we know that the algorithm has run successfully
            for(var i = 0; i < objects.length; i++) {
              outputStr += (""+objects[i]+" : " + results[i]+" \n ");
            }
            bot.replyPrivate(message, outputStr);
          } else {
            bot.replyPrivate(message, "The results are not in yet");
          }
        });
      });
    }
  }
});

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
  else if(QuesScheduler.self) {
    bot.startPrivateConversation(message,function(err,dm) {
      dm.say('You need to wait until all other people have answered the question');
    });
  } else {
    var num = idFromChat[0], isFirstReply = true;

    CrowdConsensus.findId(num, isFirstReply, function(cb_id){

      bot.api.users.list({}, function(err, res){
        if(err) {
          console.log("Failed to read users : " + err);
          bot.reply("Sorry", 'Sorry, there has been an error: '+err);
        }

        if(!err) {
          if(DATA_COLLECTION_METHOD == EXHAUSTIVE_APPROACH)
          exhaustiveAskFramework(bot, message, cb_id, res.members, message.channel);
          else if (DATA_COLLECTION_METHOD == TIMEOUT_METHOD)
          quesAskFramework(bot, message, cb_id, res.members, message.channel);
        }
      });
    });
  }
});

// Show the list of problems upon being asked for help
controller.hears(["Help"],["direct_message","direct_mention","mention","ambient"],function(bot,message) {
  help(bot, message, false);
});


// Show the list of problems upon being asked for help
controller.hears(["halt (.*)"],["direct_message","direct_mention","mention","ambient"],function(bot,message) {
  var all_msg = message.match[0];
  var idFromChat = all_msg.match(/\d+/);

  if(idFromChat == null) bot.reply(message, "You need to add the number as well");
  else if(false && QuesScheduler.getInstance()) {

    QuesScheduler.getInstance().STOP_ASKING_QUESTION = true,
    num = idFromChat[0], isFirstReply = true;

    CrowdConsensus.findId(num, isFirstReply, function(cb_id){

      CCModel.update({'_id' : cb_id}, {'$set' : {'responses' : []}}, function(err){
        if(err) console.error(err);
        else {

          console.log("Deleted all entries");
          CCReply.remove({parent_id : deleteKey}, function(err){
            if(err) console.error(err);
            else {
              console.log("Deleted all associated the replies");
              res.status(200).json({'text' : "All associated replies deleted", 'responseType' : 'in-channel',  'attachments': []});
            }
          });
        }
      });
    });
  } else console.log("QuesScheduler instance is null");
});

// Deletes
controller.hears(["Delete (.*)"],["direct_message","direct_mention","mention","ambient"],function(bot,message) {
  var all_msg = message.match[0];
  console.log("all msgs -> " + all_msg);
  var deleteKey = "58a625567957610aa34ee0f1";
  /*
  CCReply.remove({parent_id : deleteKey}, function(err){
  if(err) console.error(err);
  else{
  console.log("Deleted all the associated replies");
}
});
*/
// bot.api.chat.postMessage({channel : message.channel, text : "Yo doug! Waasup?"+message.channel});
});

controller.hears(["Status"],["direct_message","direct_mention","mention","ambient"],function(bot,message) {
  bot.startPrivateConversation({user : message.user} ,function(err,dm) {
    if(ExhaustiveScheduler.getInstance())
    dm.say('The task is running');
    else dm.say('No tasks running');
  })
});

controller.hears(["killall"],["direct_message","direct_mention","mention","ambient"],function(bot,message) {
  bot.startPrivateConversation({user : message.user} ,function(err,dm) {
    ExhaustiveScheduler.destroy();
    QuesScheduler.destroy();
    dm.say('All tasks killed');
  })
});

controller.hears(["run (.*)"],["direct_message","direct_mention","mention","ambient"],function(bot,message) {
  console.log("Now exit the program bro...");

  var all_msg = message.match[0];
  var idFromChat = all_msg.match(/\d+/);

  if(idFromChat == null) bot.reply(message, "You need to add the number as well");
  else {
    var num = idFromChat[0], isFirstReply = true;
    CrowdConsensus.findId(num, isFirstReply, function(cb_id){
      CrowdConsensus.getResponses(cb_id, function(resp){
        var newCBID =JSON.stringify(cb_id);
        newCBID = newCBID.slice(1,-1);
        console.log("____Voila mongo connected as "+cb_id + ", and "+newCBID);

        // test for sending post request
        // Configure the request
        var totalWorld = math.pow(3, 12);
        var chunkSize = totalWorld, iter = 1;
        while(chunkSize > 400000) {
          chunkSize = chunkSize / 10;
          chunkSize = chunkSize >> 0;  // convert into integer
          iter *= 10;
        }
        //request.post('http://192.168.0.11:3001/pinger').form({totalWorld : totalWorld, chunkSize : chunkSize, iter : iter, cb_id : "58a621fbbe5761064ace4444"});

        request({
          url: nconf.get("DEST_IP_ADDR")+'/pinger', //URL to hit
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-Charset': 'utf-8',
            'User-Agent': 'me'
          },
          //Lets post the following key/values as form
          form: {totalWorld : totalWorld, chunkSize : chunkSize, iter : iter, cb_id : newCBID}
        }, function(error, response, body){
          if(error) {
            console.log(error);
          } else {
            console.log(response.statusCode, body);
          }
        });

      });
    });
  }


  // process.exit(1);
});

/************************************************************
* handles the POST request at his url
**************************************************************/
app.post('/getResults', function(req, res) {
  var data = req.body;
  console.log("The results: " + JSON.stringify(data));
  var id = data.cb_id;
  CCModel.findOne({'_id' : id}, function(err, model){
    if(err) console.log("Error finding the _id");

    if(!err) {
      var objs = model.objects;
      var res = [];
      for(var i = 0; i < objs.length; i++) {
        res.push(data[objs[i]] + "");
      }

      CCModel.update({'_id' : id}, {'$set' : {'subscribers' : res}}, function(err1){
        if(err) console.log("Couldn't update");
        else console.log("Updated successfully");
      });
    }
  });

  res.status(200).send('Data received. Thanks Algorithm!');
});

/**
* Delete the Crowd data and all the replies associated with it
***/
app.get('/delete', function(req, res, next){
  var deleteKey = req.body.deleteKey;

  //  CCModel.remove({_id : deleteKey}, function(err){
  //    if(err) console.error(err);
  //    else{

  console.log("Deleted the problem");
  CCReply.remove({parent_id : deleteKey}, function(err){
    if(err) console.error(err);
    else{
      console.log("Deleted all associated the replies");
      res.status(200).json({'text' : "All associated replies deleted", 'responseType' : 'in-channel',  'attachments': []});
    }
  });
  //    }
  //  });
})

app.listen(3003, function(){
  console.log("Server listening on port 3003...");
});
