var mongoose = require('mongoose'),
path = require('path'),
Schema = require(__dirname + "/Schema.js"),
CCReply = Schema.CCReply;

/*********************************************
* get the list of responses to a problem
**********************************************/
var getReplies = function(cb_id, objects, criteria, callback){
  CCReply.find({
    "parent_id" : cb_id,
    "object1" : { "$in" : objects},
    "object2" : { "$in" : objects },
    "criterion" : { "$in" : criteria }
  }, function(err, data){
    if(err) console.error(err);
    callback(data);
  });
}

/*********************************************
* get the list of responses to a problem
**********************************************/
var getRepliesFromUser = function(cb_id, objects, criteria, name, callback){
  CCReply.find({
    "parent_id" : cb_id,
    "name" : name,
    "object1" : { "$in" : objects },
    "object2" : { "$in" : objects },
    "criterion" : { "$in" : criteria }
  }, function(err, data){
    if(err) console.error(err);
    callback(data, name);
  });
}

module.exports.getReplies = getReplies;
module.exports.getRepliesFromUser = getRepliesFromUser;
