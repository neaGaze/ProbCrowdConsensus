var util = require('util'),
nconf = require('nconf'),
math = require('mathjs'),
EventEmitter = require('events').EventEmitter;

var minUserThreshold = nconf.get('NUMBER_OF_USERS_TO_ASK'),
 questionThreshold = nconf.get('THRESHOLD');
/*
var QuesInquirer = function(number, isFirstReply){
EventEmitter.call(this);
};
*/
function QuesInquirer(param){
  EventEmitter.call(this);
  this.param = param;
  this.activeUsers = [];
};

util.inherits(QuesInquirer, EventEmitter);

/**
* Schedules the same question to the different users until it satisfies the minimum threshold
**/
QuesInquirer.prototype.scheduleQues = function(){

  if(this.param.object1 === '' || this.param.object2 === '') {
    this.emit('finish', '');
    return;
  }

  minUserThreshold = nconf.get('NUMBER_OF_USERS_TO_ASK');
  console.log('scheduleQues is here baby');
  // repeat the question asking once again if there were no sufficient users at current state
  this.emit('get_users', 'ok');

  /*
  this.intervalRoutine = setInterval(function(){
  }, 6000);
  */

  /*
  while(false) {
  var userid = "hola";

  // let the controller find the active users
  this.emit('get_users');
  if(false) this.emit('ask', 'userid');
}

if(false) this.emit('min_threshold_satisfied', userid);
*/
};

// find the best users
QuesInquirer.prototype.findBestUsers = function() {

  for(var i = 0; i < minUserThreshold; i++) {
    var randomNumber = Math.floor(Math.random() * (this.activeUsers.length - 1) + 1); // random * (high - low) + low
    console.log("users list ->" + this.activeUsers[randomNumber]);
    var id = this.activeUsers[randomNumber].id;
    this.activeUsers.splice(randomNumber, 1);
    this.emit('ask', id);
  }
};

module.exports = QuesInquirer;
