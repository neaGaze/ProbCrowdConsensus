var mongoose = require('mongoose'),
path = require('path');

var CrowdResponseSchema = new mongoose.Schema({
  parent_id : String,
  member_id : String,
  name : String,
  object1 : String,
  object2 : String,
  criterion : String,
  reply : String
});

var CrowdCollectSchema = new mongoose.Schema({
  object1 : String,
  object2 : String,
  criterion : String,
  gt : Number,
  lt : Number,
  indiff : Number
});

var CrowdConsensusSchema = new mongoose.Schema({
  id : String,
  description : String,
  objects : [String],
  criteria : [String],
  subscribers : [String],
  responses : [CrowdCollectSchema]
});

var CCReply = mongoose.model('CrowdReply', CrowdResponseSchema),
CCModel = mongoose.model('CrowdConsensus', CrowdConsensusSchema);

module.exports.CCReply = CCReply;
module.exports.CCModel = CCModel;
