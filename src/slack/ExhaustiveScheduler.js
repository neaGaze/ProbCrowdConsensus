var util = require('util'),
nconf = require('nconf'),
math = require('mathjs'),
fs = require('fs'),
uuid = require('uuid/v1'),
Combination = require("../algo/Combination.js"),
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
ExhaustiveScheduler.prototype.scheduleQues = function(){

  var combn = new Combination(self.param.objects, self.param.criteria);
  self.questionList = combn.getCombination();
  self.TOTAL_USERS = self.activeUsers.length;
  self.minUserThreshold = self.totalPopulation;
  self.userToQuesPairing = {};

  for(var u = 0; u < self.activeUsers.length; u++) {
    self.userToQuesPairing[self.activeUsers[u]] = [];
    for(var q = 0; q < self.questionList.length; q++) {
      // TODO check in the CrowdReply module and push only if that user hasn't responded on those questions
      self.userToQuesPairing[self.activeUsers[u]].push(self.questionList[q]);
    }
    var randIndex = Math.floor(Math.random() * self.questionList.length);
    if(randIndex < self.questionList.length) {
      self.emit('question_user_paired', self.userToQuesPairing[self.activeUsers[u]][randIndex], self.activeUsers[u], randIndex, uuid());
    } else {
      console.log("the randomly chosen question is out of array bounds");
    }
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
  }
  else {
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
