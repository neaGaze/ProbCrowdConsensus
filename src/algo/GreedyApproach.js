
CrowdConsensus = require("../db/CrowdConsensus.js"),
Combination = require("./Combination.js"),
//Node = require("./CombinatoryTree.js"),
Node = require('tree-node'),
util = require('util'),
EventEmitter = require('events').EventEmitter;

var GreedyApproach = function(cb_id)  {
  EventEmitter.call(this);
  this.cb_id = cb_id;
  GreedyApproach.prototype.getData.call(this);
  // this.tree = new Node();
  this.self = this;
  //  this.combinationList = GreedyApproach.prototype.findPossibleWorlds.call(this);
};


util.inherits(GreedyApproach, EventEmitter);

/************************************************************
* Get the data from database
***************************************************************/
GreedyApproach.prototype.getData = function(){

  var emitter1 = (function(data){
    this.objects = data.objects;
    this.criteria = data.criteria;
    this.responses = data.responses;
    this.emit('dataRetrieved', '');
  }).bind(this);

  CrowdConsensus.getResponses(this.cb_id, function(data){
    emitter1(data);
  });
};


/************************************************************
* Find all the possible worlds
***************************************************************/
GreedyApproach.prototype.findPossibleWorlds = function(){
  var possibleWorlds = [], relationships = ['gt', 'lt', 'indiff'];
  console.log("COMO estas 2 -> " + this.objects.length);
  var combn = new Combination(this.objects, this.criteria);
  var combination = combn.getCombination();

  var index = 0;
  this.tree = new Node(index);
  var leafNodesArr = [];
  leafNodesArr.push(index++);

  for(var comb1 in combination) {
    //console.log("comb " + comb1 + " -> " + JSON.stringify(combination[comb1]));

    var isProbDefined = false, lt, gt, indiff;
    for(var resp = 0; resp < this.responses.length; resp++){
      console.log("<<<<<<<<<<< BAAT MAAN >>>>>>>>>>>>> " + this.responses[resp].object1);
      if((this.responses[resp].object1 == combination[comb1].object1 &&
        this.responses[resp].object2 == combination[comb1].object2 &&
         this.responses[resp].criterion == combination[comb1].criterion) ||
       (this.responses[resp].object2 == combination[comb1].object1 &&
         this.responses[resp].object1 == combination[comb1].object2 &&
          this.responses[resp].criterion == combination[comb1].criterion)) {
           isProbDefined = true;
           lt = this.responses[resp].lt;
           gt = this.responses[resp].gt;
           indiff = this.responses[resp].indiff;
           break;
         }
    }

    var newLeafNodesArr = [];
    for(var pos = 0; pos < leafNodesArr.length; pos++){
      var leafNode = this.tree.getNode(leafNodesArr[pos]);

      for(var reln in relationships){

        var node = leafNode.createChild(index++);
        node.data({
          object1 : combination[comb1].object1,
          object2 : combination[comb1].object2,
          criterion : combination[comb1].criterion,
          sign : relationships[reln]
        });

        if(isProbDefined) {
          console.log("% Prob is Defined and relation : " + relationships[reln]);
          if(relationships[reln] == 'gt') node.data({prob : gt});
          if(relationships[reln] == 'lt') node.data({prob : lt});
          if(relationships[reln] == 'indiff') node.data({prob : indiff});
        } else node.data({prob : 0.0});

        console.log("leafPos -> " + leafNodesArr[pos] + ", id -> " + node.id);
        console.log("position -> "+node.position() + " and layer -> " + node.layer());
        newLeafNodesArr.push(node.id);
        console.log("<<<<<<<< The child node is : " + JSON.stringify(node.data()) + " >>>>>>>>>>>>");
      }
    }

    // change the leafNodesArr here
    leafNodesArr = newLeafNodesArr;
  }

  return possibleWorlds;
};


module.exports = GreedyApproach;
