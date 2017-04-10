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

module.exports.getReplies = getReplies;
