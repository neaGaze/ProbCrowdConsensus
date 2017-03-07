var util = require('util'),
nconf = require('nconf'),
math = require('mathjs'),
EventEmitter = require('events').EventEmitter;

/*
var QuesInquirer = function(number, isFirstReply){
EventEmitter.call(self);
};
*/

var self;

function QuesInquirer(param){
  EventEmitter.call(this);
  this.param = param;
  this.activeUsers = [];
  //return this;
  this.questionThreshold = nconf.get('THRESHOLD');
  this.usersToAsk = nconf.get('NUMBER_OF_USERS_TO_ASK');
};

function create(param){
  if(!self) {
    self = new QuesInquirer(param);
  }
  return self;
};

util.inherits(QuesInquirer, EventEmitter);

var getInstance = function(){
  return self;
};

/********************************************************************************************
* Schedules the same question to the different users until it satisfies the minimum threshold
********************************************************************************************/
QuesInquirer.prototype.scheduleQues = function(){

  if(self.param.object1 === '' ||self.param.object2 === '') {
    self.emit('finish', '');
    return;
  }

  self.minUserThreshold = nconf.get('NUMBER_OF_USERS_TO_ASK');
  console.log('scheduleQues is here ');
  // repeat the question asking once again if there were no sufficient users at current state
  self.emit('get_users', 'ok');
};

/********************************************************************************************
* find the best users
********************************************************************************************/
QuesInquirer.prototype.findBestUsers = function() {

  var waitTimeIfPitchedQuesUnanswered = 10000, waitTimeIfRanOutOfUsers = 12000;

  var iteration = 0;

  self.timedIntervalForNextSetOfUsers = setInterval(function(){
    console.log("inside interval : " + self.minUserThreshold + ", and iteration: " + iteration++);
    for(var i = 0; i < self.minUserThreshold; i++) {

      if(self.activeUsers.length <= 0) {
        console.log("*** No more users left to ask. So start all over again after "+(waitTimeIfRanOutOfUsers % 1000)+" seconds ***");
        clearInterval(self.timedIntervalForNextSetOfUsers);
        self.timeoutToRepeat = setTimeout(function(){ self.scheduleQues();}, waitTimeIfRanOutOfUsers);
        return;
      }

      console.log('___The number of active users: ' + self.activeUsers.length);
      var randomNumber = Math.floor(Math.random() * (self.activeUsers.length - 0) + 0); // random * (high - low) + low
      //console.log("users list ->" + self.activeUsers[randomNumber].toString());
      var id = self.activeUsers[randomNumber].id;
      self.activeUsers.splice(randomNumber, 1);
      self.emit('ask', id);
    }
  }, waitTimeIfPitchedQuesUnanswered);
};

/********************************************************************************************
* called when a question is answered by the user
*********************************************************************************************/
QuesInquirer.prototype.answerRecorded = function(){
  console.log("______1. Here the answer is recorded_____" + self.usersToAsk + ", " + self.questionThreshold+ ", "+self.minUserThreshold + ", " + self.activeUsers.length);
  self.minUserThreshold--;
  // minimum number of users for that question is satisfied
  if((self.usersToAsk - self.minUserThreshold) == self.questionThreshold) {
    console.log("*****\n All timeouts cleared \n******");
    if(self.timeoutToRepeat) clearTimeout(self.timeoutToRepeat);
    clearInterval(self.timedIntervalForNextSetOfUsers);
    self.emit('min_threshold_satisfied','');
  }
};

module.exports = QuesInquirer;
module.exports.create = create;
module.exports.getInstance = getInstance;
