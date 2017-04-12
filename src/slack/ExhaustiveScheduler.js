var util = require('util'),
nconf = require('nconf'),
math = require('mathjs'),
fs = require('fs'),
uuid = require('uuid/v1'),
Combination = require("../algo/Combination.js"),
CrowdReply = require("../db/CrowdReply.js"),
EventEmitter = require('events').EventEmitter;

var self;

function ExhaustiveScheduler(param){
  EventEmitter.call(this);
  this.param = param;
  this.activeUsers = [];
  this.questionList = [];
  this.usersToAsk = nconf.get('NUMBER_OF_USERS_TO_ASK');
  this.solvedProblemCount = 0;
  this.TOTAL_USERS = 0;
  this.totalPopulation = 5;
  this.STOP_ASKING_QUESTION = false;
};

function create(param){
  if(!self) {
    self = new ExhaustiveScheduler(param);
  }
  return self;
};

function destroy(){
  self = null;
}

util.inherits(ExhaustiveScheduler, EventEmitter);

var getInstance = function(){
  return self;
};

/*****************************************************************
* shuffle an array
*******************************************************************/
function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

/********************************************************************************************
* Assign users with questions
********************************************************************************************/
ExhaustiveScheduler.prototype.scheduleQues = function(cb_id){

  var combn = new Combination(self.param.objects, self.param.criteria);
  self.questionList = combn.getCombination();
  self.TOTAL_USERS = self.activeUsers.length;
  self.minUserThreshold = self.totalPopulation;
  self.userToQuesPairing = {};

  for(var u = 0; u < self.activeUsers.length; u++) {
    self.userToQuesPairing[self.activeUsers[u]] = [];

    // Receive replies from crowd which were saved in db and don't ask those again
    CrowdReply.getRepliesFromUser(cb_id, self.param.objects, self.param.criteria, self.activeUsers[u], function(replies, uid){

      for(var q = 0; q < self.questionList.length; q++) {
        self.userToQuesPairing[uid].push(self.questionList[q]);
      }

      for(var i = 0; i < replies.length; i++) {
        var reply = replies[i];

        // remove the replies if found in the database
        for(var j = 0; j < self.userToQuesPairing[uid].length; j++) {
          if(self.userToQuesPairing[uid][j].object1 == reply.object1 && self.userToQuesPairing[uid][j].object2 == reply.object2 &&
            self.userToQuesPairing[uid][j].criterion == reply.criterion) {
              self.userToQuesPairing[uid].splice(j, 1);
              break;
            }
          }
        }

        if(replies.length > 0) console.log("Pruned questions for " + uid+" : \n" + self.userToQuesPairing[uid].length+", q : " + q);

        // emit if reached the last question
        //if(q == self.questionList.length) {

        var randIndex = Math.floor(Math.random() * self.userToQuesPairing[uid].length);
        if(self.userToQuesPairing[uid].length > 0 && randIndex < self.userToQuesPairing[uid].length) {
          console.log("randIndex updated : " + randIndex);
          self.emit('question_user_paired', self.userToQuesPairing[uid][randIndex], uid, randIndex, uuid());
        } else {
          console.log("the randomly chosen question is out of array bounds");
        }
      });
    }

    console.log("\n********************************************");
  };

  /********************************************************************************************
  * Asks the next question in the List to that user
  ********************************************************************************************/
  ExhaustiveScheduler.prototype.nextQues = function(user, index) {
    var currAnsweredQues = self.userToQuesPairing[user][index];
    self.userToQuesPairing[user].splice(index, 1);

    // when there is no more questions left for that user
    if(self.userToQuesPairing[user].length == 0) {
      self.emit('problem_finish', user);
    } else {
      var randIndex = Math.floor(Math.random() * self.userToQuesPairing[user].length);
      if(randIndex < self.userToQuesPairing[user].length) {
        self.emit('question_user_paired', self.userToQuesPairing[user][randIndex], user, randIndex);
      } else {
        console.log("the randomly chosen question is out of array bounds");
      }
    }
    return currAnsweredQues;
  }

  module.exports = ExhaustiveScheduler;
  module.exports.create = create;
  module.exports.destroy = destroy;
  module.exports.getInstance = getInstance;
