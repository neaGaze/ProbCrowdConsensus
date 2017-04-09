var util = require('util'),
nconf = require('nconf'),
math = require('mathjs'),
fs = require('fs'),
uuid = require('uuid/v1'),
Combination = require("../algo/Combination.js"),
EventEmitter = require('events').EventEmitter;

var self;

function QuesScheduler(param){
  EventEmitter.call(this);
  this.param = param;
  this.activeUsers = [];
  this.timers = {};
  this.questionList = [];
  this.usersToAsk = nconf.get('NUMBER_OF_USERS_TO_ASK');
  this.solvedProblemCount = 0;
  this.TOTAL_USERS = 0;
  this.TIMEOUT_FOR_USER_TO_RESPOND = nconf.get("TIMEOUT_INTERVAL");
  this.confidenceInterval = nconf.get("CONFIDENCE_INTERVAL");
  this.marginOfError = nconf.get("MARGIN_OF_ERROR");
  this.totalPopulation = 5;
  this.STOP_ASKING_QUESTION = false;
};

function create(param){
  if(!self) {
    self = new QuesScheduler(param);
  }
  return self;
};

function destroy(){
  self = null;
}

util.inherits(QuesScheduler, EventEmitter);

var getInstance = function(){
  return self;
};

/**************************************************************************************************
* Generate sample size given the population size(N), confidence interval(z) and margin of error(d)
***************************************************************************************************/
QuesScheduler.prototype.generateSampleSize = function(callback) {
  fs.readFile(__dirname+'/../../var/t-table.json', 'utf8', function(err, data){
    if (err) throw err;
    var ttable = JSON.parse(data);
    // assuming p = 1/3 or conservative guess
    var normalizedConfidenceLevel = math.round(((1 - self.confidenceInterval) / 2) * 1000) / 1000;
    console.log("popn: " + self.totalPopulation);
    var m = math.square(ttable[self.totalPopulation+""][normalizedConfidenceLevel+""] / self.marginOfError) * 0.222;
    var sample = (self.totalPopulation * m) / (self.totalPopulation - 1 + m);
    if(sample)
    sample = math.ceil(sample);
    else sample = nconf.get('NUMBER_OF_USERS_TO_ASK');
    console.log("sample size: " + sample);
    callback(sample);
  });

}

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
* Assign different users with different questions
********************************************************************************************/
QuesScheduler.prototype.scheduleQues = function(){

  var combn = new Combination(self.param.objects, self.param.criteria);
  self.questionList = combn.getCombination();

  self.TOTAL_USERS = self.activeUsers.length;
  // for(var p = 0; p < self.TOTAL_USERS; p++) console.log(JSON.stringify(this.activeUsers[p]));

  // Visit link: https://onlinecourses.science.psu.edu/stat506/node/11
  // and https://onlinecourses.science.psu.edu/stat414/node/264 for more details on confidence interval
  QuesScheduler.prototype.generateSampleSize.call(this, function(sampleSize){
    self.minUserThreshold = sampleSize;

    var noUsersLeft = false;
    // Initialization of Question - to - User pairing
    for(var q = 0; q < self.questionList.length; q++) {

      self.questionList[q].uniqueTimeStamp = uuid();//Date.now() + ""; //create a new unique timestamp
      self.questionList[q].candidates = [];
      self.questionList[q].hasAnsweredList = [];
      self.questionList[q].isValid = true;  //to check if the question has already enough sample users, false if sample sufficient
      //console.log("min thres: " + self.minUserThreshold);
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
  });
};


/********************************************************************************************
* Reschedule users to questions in a batch (of users)
*********************************************************************************************/
QuesScheduler.prototype.batchDispatchSchedule = function(){

  // don't keep asking question if Stop sign is seen
  if(self.STOP_ASKING_QUESTION) return;

  for(var q = 0; q < self.questionList.length; q++) {
    if(!self.questionList[q].isValid) continue;

    self.questionList[q].uniqueTimeStamp = uuid(); //Date.now() + "";
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

  self.questionList[index].uniqueTimeStamp = uuid();//Date.now();
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
QuesScheduler.prototype.timedOut = function(uniqueId, user){

  var index;
  // readdress the user to the pool of available users
  //console.log("\nBefore shuffle:"); console.log(JSON.stringify(self.questionList));
  self.questionList = shuffle(self.questionList);
  //console.log("After shuffle:"); console.log(JSON.stringify(self.questionList));
  //console.log("ts: " + uniqueId+ ", user : "+user+"\n");

  for(var i = 0; i < self.questionList.length; i++) {

    if(self.questionList[i].uniqueTimeStamp == uniqueId) {

      var index = self.questionList[i].candidates.indexOf(user);
      if(index > -1) self.questionList[i].candidates.splice(index, 1);
      else return -1;

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
QuesScheduler.prototype.answerRecorded = function(uniqueId, user){
  console.log("______1. Here the answer is recorded_____ " + self.activeUsers.length);

  // replenish the available users pool and nullify the timer
  var index = QuesScheduler.prototype.timedOut.call(this, uniqueId.split(":")[0], user);
  if(index < 0) return false;

  // record the user to the answered list of the question
  self.questionList[index].hasAnsweredList.push(user);

  // now re-schedule the user to another question if the minimum sample size of users for this question isn't yet satisfied
  if(self.activeUsers.length == self.TOTAL_USERS)
  QuesScheduler.prototype.batchDispatchSchedule(this);
  //QuesScheduler.prototype.reSchedule.call(this, index);

  return true;
};



/********************************************************************************************
* Start the countdown when the user is paired with a question
*********************************************************************************************/
QuesScheduler.prototype.startTimer = function(ts, user) {
  console.log("The timeout will occur after " + self.TIMEOUT_FOR_USER_TO_RESPOND + " milli secs ");
  self.timers[user] = setTimeout(function() {
    console.log("** Countdown over. The question-user pair is broken so we find the new candidate to ask the question ** ");
    // clearTimeout(self.timers[user]);
    var index = QuesScheduler.prototype.timedOut.call(this, ts, user);
    // QuesScheduler.prototype.reSchedule.call(this, index);
    if(self.activeUsers.length == self.TOTAL_USERS)
    QuesScheduler.prototype.batchDispatchSchedule(this);

  }, self.TIMEOUT_FOR_USER_TO_RESPOND);
}

/********************************************************************************************
* Check the timestamp
*********************************************************************************************/
QuesScheduler.prototype.checkTimeStamp = function(ts){
  var ts_minus_user = ts.split(":")[0];
  for(var i = 0; i < self.questionList.length; i++) {
    if(self.questionList[i].uniqueTimeStamp == ts_minus_user) return self.questionList[i];
  }
  return null;
}

module.exports = QuesScheduler;
module.exports.create = create;
module.exports.destroy = destroy;
module.exports.getInstance = getInstance;
