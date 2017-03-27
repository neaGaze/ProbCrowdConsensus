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
QuesInquirer = require(__dirname + "/src/slack/QuesInquirer.js"),
QuesScheduler = require(__dirname + "/src/slack/QuesScheduler.js"),
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

        if(count <= nconf.get('THRESHOLD') - 1) {
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
          });
        } else if(count >= nconf.get('THRESHOLD')) {
          console.log("Sorry we can't update your responses for ("+ questionParam.object1 +
          " " + questionParam.criterion + " "+ questionParam.object2 +") into our database because we have saturated our " + nconf.get('THRESHOLD') + " limitation of responses");
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
        clientId: nconf.get("CLIENT_ID"),
        clientSecret: nconf.get("CLIENT_SECRET"),
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

/******************************************************************************************
* Runs the algorithm to find the new question, then asks users to answer them, repeat until Pareto-Optimal objects found
********************************************************************************************/
var questionLooper = function(cb_id, bot, message){
  console.log("_____________NEW QUESTION____________");
  // run the algorithm and find the question first
  var replyParam = greedy.getNextQues();

  QuesInquirer.create(replyParam);

  var askListener = function(userid){
    // bot.startPrivateConversation(...);
  };
  QuesInquirer.getInstance().on('ask', askListener);

  // find the active users list
  var getUsersListener = function(tmp){
    console.log('**\n Delegated the responsibility to find users to the controller \n**');

    bot.api.users.list({}, function(err, res){
      if(err) {
        console.log("Failed to read users : " + err);
        bot.reply("Sorry", 'Sorry, there has been an error: '+err);
      }

      if(!err) {
        QuesInquirer.getInstance().activeUsers = [];
        for(var member in res.members){
          if(!res.members[member].is_bot && res.members[member].id !== 'USLACKBOT') {
            QuesInquirer.getInstance().activeUsers.push(res.members[member]);
          }
        }
        QuesInquirer.getInstance().findBestUsers();
      }
    });
  };
  QuesInquirer.getInstance().on('get_users', getUsersListener);

  // detect when the pareto-optimal objects have been found
  var finishListener = function(paretoOptimalObjects){
    console.log('**\n The pareto-optimal objects are found \n**');
    bot.reply(message, "You have not more questions left to answer");
  };
  QuesInquirer.getInstance().on('finish', finishListener);

  // detect when the minimum threshold for a particular category is satisfied
  var minThresholdSatisfiedListener = function(userid){
    console.log('**\n Threshold of number of users to ask is reached. Time to ask new question \n**');
    QuesInquirer.getInstance().removeListener('finish', finishListener);
    QuesInquirer.getInstance().removeListener('get_users', getUsersListener);
    QuesInquirer.getInstance().removeListener('ask', askListener);
    QuesInquirer.getInstance().removeListener('min_threshold_satisfied', minThresholdSatisfiedListener);
    QuesInquirer.getInstance() == null;

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
        greedy.changeProbValues(file);
        callback();
      }, function(err){
        if(err) console.error(err);

        async.parallel(arr1, function(err, results){
          if(err) console.error(err);

          console.log(" results -> " + JSON.stringify(results));
          // now ask new question
          // repeat the loop again to generate new question
          console.log("You will be asked a new question as we have the minimum number of crowdsourcers answering to the previous question");
          greedy.traverseTree();
          questionLooper(cb_id, bot, message);
        });
      });
    });

  };
  QuesInquirer.getInstance().on('min_threshold_satisfied', minThresholdSatisfiedListener);

  QuesInquirer.getInstance().scheduleQues();

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

      bot.api.users.list({}, function(err, res){
        if(err) {
          console.log("Failed to read users : " + err);
          bot.reply("Sorry", 'Sorry, there has been an error: '+err);
        }

        if(!err) {
          CrowdConsensus.getResponses(cb_id, function(resp){

            QuesScheduler.create(resp);

            for(var member in res.members) {
              if(!res.members[member].is_bot && res.members[member].id !== 'USLACKBOT') {
                QuesScheduler.getInstance().activeUsers.push(res.members[member].id);
              }
            }

            // Listener that is triggered when a question is paired with suitable candidates and ready to ask them question
            var getQuesUserPairListener = function(pair, uid){
              // console.log('**\n The paired users will now be asked questions \n**');

              //for(var i = 0; i < pair.candidates.length; i++)
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
                      callback_id: "12345",
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
                      console.log("> replied recorded");
                      convo.say('You said  *' + pair.object1 +
                      '* is better than *' + pair.object2 + '* on criteria *' + pair.criterion+'*');
                      convo.next();
                      var username = lookupUserNameFromId(reply.user);
                      console.log("The username is : " + reply.user);
                      QuesScheduler.getInstance().answerRecorded(pair, reply.user);
                //      saveInDB(cb_id, reply.user, reply.user, pair, '&gt;');
                    }
                  },
                  {
                    pattern: "lt",
                    callback: function(reply, convo) {
                      console.log("< replied recorded");
                      convo.say('You said  *' + pair.object2 +
                      '* is better than *' + pair.object1 + '* on criteria *' + pair.criterion+'*');
                      convo.next();
                      var username = lookupUserNameFromId(reply.user);
                      console.log("The username is : " + reply.user);
                      QuesScheduler.getInstance().answerRecorded(pair, reply.user);
              //        saveInDB(cb_id, reply.user, reply.user, pair, '&lt;');
                    }
                  },
                  {
                    pattern: "~",
                    callback: function(reply, convo) {
                      console.log("~ replied recorded");
                      convo.say('You said  *' + pair.object2 +
                      '* is indifferent to *' + pair.object1 + '* on criteria *' + pair.criterion+'*');
                      convo.next();
                      var username = lookupUserNameFromId(reply.user);
                      console.log("The username is : " + reply.user);
                      QuesScheduler.getInstance().answerRecorded(pair, reply.user);
              //        saveInDB(cb_id, reply.user, reply.user, pair, '&#126;');
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

                // add timer for that user to know if he has answered within the specified time limit
                QuesScheduler.getInstance().startTimer(pair, uid);
              });
            };

            QuesScheduler.getInstance().on('question_user_paired', getQuesUserPairListener);
            QuesScheduler.getInstance().on('problem_finish', function(a){
              console.log("__________THE PROBLEM IS FINISHED_____________");
              
            });
            QuesScheduler.getInstance().scheduleQues();
          });
        }
      });
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


controller.hears(["exit"],["direct_message","direct_mention","mention","ambient"],function(bot,message) {
  /*
  crowdCollect('58a621fbbe5761064acee0f1', function(arr){
  console.log('crowdCollect success');
});
*/

  process.exit(1);

var greedy = new GreedyApproach("58a621fbbe5761064ace4444").on("dataRetrieved", function(){
  console.log("data retreived caught");
  startTime = new Date().getTime();

  var gree = new GreedyArray(process.env.START_INDEX, process.env.SUBWORLD_SIZE, process.env.iter);

  endTime = new Date().getTime();
  console.log("--------------- " + ((endTime - startTime) / 1000) + " secs-----------");
});

});
