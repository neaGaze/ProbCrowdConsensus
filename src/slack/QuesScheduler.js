var util = require('util'),
nconf = require('nconf'),
math = require('mathjs'),
Combination = require("../algo/Combination.js"),
EventEmitter = require('events').EventEmitter;

var self;

function QuesScheduler(param){
  EventEmitter.call(this);
  this.param = param;
  this.activeUsers = [];
  this.timers = {};
  this.questionList = [];
  this.questionThreshold = nconf.get('THRESHOLD');
  this.usersToAsk = nconf.get('NUMBER_OF_USERS_TO_ASK');
  this.solvedProblemCount = 0;
  this.TOTAL_USERS = 0;
  this.TIMEOUT_FOR_USER_TO_RESPOND = 20000;
};

function create(param){
  if(!self) {
    self = new QuesScheduler(param);
  }
  return self;
};

util.inherits(QuesScheduler, EventEmitter);

var getInstance = function(){
  return self;
};

/********************************************************************************************
* Assign different users with different questions
********************************************************************************************/
QuesScheduler.prototype.scheduleQues = function(){

  var combn = new Combination(self.param.objects, self.param.criteria);
  self.questionList = combn.getCombination();

  self.TOTAL_USERS = self.activeUsers.length;
  for(var p = 0; p < self.TOTAL_USERS; p++) console.log(JSON.stringify(this.activeUsers[p]));

  // TODO right now we're reading from 'nconf' but we need to generate this number using confidence internval.
  // Visit link: https://onlinecourses.science.psu.edu/stat506/node/11 for more details
  self.minUserThreshold = nconf.get('NUMBER_OF_USERS_TO_ASK');

  var noUsersLeft = false;
  // Initialization of Question - to - User pairing
  for(var q = 0; q < self.questionList.length; q++) {

    self.questionList[q].candidates = [];
    self.questionList[q].hasAnsweredList = [];
    self.questionList[q].isValid = true;  //to check if the question has already enough sample users, false if sample sufficient

    if(self.activeUsers.length > 0) {

      for(var r = 0; r < self.minUserThreshold; r++) {
        var user = self.activeUsers.shift();
        self.questionList[q].candidates.push(user);

        console.log("" + self.questionList[q].object1 + "  " + self.questionList[q].criterion + " " +
        self.questionList[q].object2 + " --> " + user + ", " + self.activeUsers.length);

        self.emit('question_user_paired', self.questionList[q], user);

        if(self.activeUsers.length <= 0) break;
      }
    }
  }
  console.log("\n"+JSON.stringify(self.questionList));
  console.log("\n********************************************");
};


/********************************************************************************************
* Reschedule users to questions in a batch (of users)
*********************************************************************************************/
QuesScheduler.prototype.batchDispatchSchedule = function(){


  for(var q = 0; q < self.questionList.length; q++) {
    if(!self.questionList[q].isValid) continue;

    var leftUsers = self.minUserThreshold - self.questionList[q].hasAnsweredList.length;
    var rand = -1, user = null;

    var validCandidates = [];
    for(var p = 0; p < self.activeUsers.length; p++) {
      if(self.questionList[q].hasAnsweredList.indexOf(self.activeUsers[p]) <= -1) validCandidates.push(self.activeUsers[p]);
    }

    rand =  Math.floor(Math.random() * (validCandidates.length - 0) + 0);
    user = validCandidates[rand];

    // TODO there should also be one of the check condition below if the timer for that user-question has ran out
    // But that might not be needed to check because there is a prequisite that the timer is always set to null when this is called
    if(leftUsers > 0 && user /* && (user in self.timers) && self.timers[user] == null*/) {

      self.questionList[q].candidates.push(user);

      var a = self.activeUsers.indexOf(user);
      if(a > -1) self.activeUsers.splice(a, 1);

      console.log("" + self.questionList[q].object1 + "  " + self.questionList[q].criterion + " " +
      self.questionList[q].object2 + " --> " + user + ", " + self.activeUsers.length + ", " + JSON.stringify(validCandidates));

      self.emit('question_user_paired', self.questionList[q], user);
    } else if(leftUsers <= 0) {
      // we know that this question need not be asked to any of the user and minimum #users is satisfied
      self.questionList[q].isValid = false;
      self.solvedProblemCount++;

      self.emit('min_threshold_satisfied','');

      // no more questions to ask
      if(self.solvedProblemCount == self.questionList.length) self.emit('problem_finish','');
    }
  }
  console.log("\n"+JSON.stringify(self.questionList));
  console.log("\n********************************************");
}

/********************************************************************************************
* Reschedule the user to another question
*********************************************************************************************/
QuesScheduler.prototype.reSchedule = function(index){
  // console.log("** Reschedule the question to another user **");
  var leftUsers = self.minUserThreshold - self.questionList[index].hasAnsweredList.length;
  var rand, user;

  if(self.activeUsers.length > 0) {
    rand =  Math.floor(Math.random() * (self.activeUsers.length - 0) + 0);
    // user =  self.activeUsers.pop();
    user = self.activeUsers[rand];

    if(self.questionList[index].hasAnsweredList.indexOf(user) > 0) user = null;

  } else {
    rand =  -1;
    user =  null;
  }

  console.log("** active users count -> " + self.activeUsers.length + ", rand -> " + rand+" **");

  // TODO there should also be one of the check condition below if the timer for that user-question has ran out
  // But that might not be needed to check because there is a prequisite that the timer is always set to null when this is called
  if(leftUsers > 0 && user /* && (user in self.timers) && self.timers[user] == null*/) {
    //  for(var r = 0; r < leftUsers; r++) {
    self.questionList[index].candidates.push(user);
    //  }

    var a = self.activeUsers.indexOf(user);
    if(a > -1) self.activeUsers.splice(a, 1);

    self.emit('question_user_paired', self.questionList[index], user);
  } else if(leftUsers <= 0) {
    // we know that this question need not be asked to any of the user and minimum #users is satisfied
    self.questionList[index].isValid = false;
  }
};


/********************************************************************************************
* called when a question-User pair is timed out becuase user never responeded
*********************************************************************************************/
QuesScheduler.prototype.timedOut = function(pair, user){

  var index;
  // readdress the user to the pool of available users
  for(var i = 0; i < self.questionList.length; i++) {
    if(self.questionList[i].object1 == pair.object1 &&
      self.questionList[i].object2 == pair.object2 &&
      self.questionList[i].criterion == pair.criterion) {

        var index = self.questionList[i].candidates.indexOf(user);
        if(index > -1) self.questionList[i].candidates.splice(index, 1);

        self.activeUsers.push(user);
        index = i;

        clearTimeout(self.timers[user]);
        self.timers[user] = null;
        break;
      }
    }
    return index;
  };

  /********************************************************************************************
  * called when a question is answered by the user
  *********************************************************************************************/
  QuesScheduler.prototype.answerRecorded = function(pair, user){
    console.log("______1. Here the answer is recorded_____ " + self.activeUsers.length);

    // replenish the available users pool and nullify the timer
    var index = QuesScheduler.prototype.timedOut.call(this, pair, user);

    // record the user to the answered list of the question
    self.questionList[index].hasAnsweredList.push(user);

    // now re-schedule the user to another question if the minimum sample size of users for this question isn't yet satisfied
    if(self.activeUsers.length == self.TOTAL_USERS)
    QuesScheduler.prototype.batchDispatchSchedule(this);
    //QuesScheduler.prototype.reSchedule.call(this, index);
  };



  /********************************************************************************************
  * Start the countdown when the user is paired with a question
  *********************************************************************************************/
  QuesScheduler.prototype.startTimer = function(pair, user) {
    self.timers[user] = setTimeout(function() {
      console.log("** Countdown over. The question-user pair is broken so we find the new candidate to ask the question ** ");
      // clearTimeout(self.timers[user]);
      var index = QuesScheduler.prototype.timedOut.call(this, pair, user);
      // QuesScheduler.prototype.reSchedule.call(this, index);
      if(self.activeUsers.length == self.TOTAL_USERS)
      QuesScheduler.prototype.batchDispatchSchedule(this);

    }, self.TIMEOUT_FOR_USER_TO_RESPOND);
  }

  module.exports = QuesScheduler;
  module.exports.create = create;
  module.exports.getInstance = getInstance;