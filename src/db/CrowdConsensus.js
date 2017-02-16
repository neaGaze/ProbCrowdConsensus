var mongoose = require('mongoose'),
path = require('path'),
Schema = require(__dirname + "/Schema.js"),
CCModel = Schema.CCModel;

var CrowdConsensus = function(){
  //return CrowdConsensus.prototype.getInstance.call(this);
  this.ccModel = new CCModel();
  return this.ccModel;
}

/**
* Note: This might not be required because we don't use Singleton I guess.
* Get the singleton instance of this Model
**/
CrowdConsensus.prototype.getInstance = function(){
  if(!this.ccModel)
  this.ccModel = new CCModel();
  return this.ccModel;
}

/*********************************************
* get the list of Pareto-Optimality problems
**********************************************/
var getList = function(callback){
  var list = [];
  CCModel.find(function(err, data){
    if(err) console.error(err);

    if(data != null && data.length > 0) {
      for(var i = 0; i < data.length; i++) {
        var problem = {
          id : data[i]._id,
          desc : data[i].description
        };

        list.push(problem);
      }
    }
    callback(list);
  });
}

/**
* Save in the CrowdConsensus collection
**/
var createCrowdConsensus = function(crowdCnsusModule){

  var status = {
    'text' : '',
    'responseType' : 'in-channel',
    'attachments' : []
  };

  // creates a new Collection in MongoDB named Crowdconsensus
  var ccModel = new CCModel();
  ccModel.description = crowdCnsusModule.desc;

  status.text += crowdCnsusModule.desc;

  console.log("crowdCnsusModule: " + JSON.stringify(crowdCnsusModule));

  for(var i = 0; i < crowdCnsusModule.obj.length; i++){
    status.attachments.push({
      'title' : 'Object: ' + i,
      'text'  : ''+crowdCnsusModule.obj[i]
    });

    ccModel.objects.push(crowdCnsusModule.obj[i]);
  }

  for(var j = 0; j < crowdCnsusModule.criteria.length; j++){
    status.attachments.push({
      'title' : 'Criteria: ' + j,
      'text'  : ''+crowdCnsusModule.criteria[j]
    });

    ccModel.criteria.push(crowdCnsusModule.criteria[j]);
  }

  // save the record in mongo collection
  ccModel.save(function(err, body){
    console.error(err);
  });

  return status;
}


/**
* Find the corresponding CrowdConsensus record id for the given temp id
**/
var findId = function(id, isFirstReply, callback){
  CCModel.find(function(err, data){
    if(err) console.error(err);

  //  console.log("___firstReply: " + isFirstReply+", id: " + id);

    if(!isFirstReply) {
      callback(id);
    } else {
      var recordId = "";
      if(data){
        for(var i = 0; i < data.length; i++){
          //console.log("_____data: _____\n" + JSON.stringify(data[i]));
          if(id == (i + 1)) {
            recordId = data[i]['_id'];
            break;
          }
        }
      }
      callback(recordId);
    }
  });
};

module.exports.getList = getList;
module.exports.createCrowdConsensus = createCrowdConsensus;
module.exports.findId = findId;
