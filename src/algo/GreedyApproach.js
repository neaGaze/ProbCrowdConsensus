
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
  if(!this.tree) {
    var relationships = ['gt', 'lt', 'indiff'];
    console.log("COMO estas 2 -> " + this.objects.length);
    var combn = new Combination(this.objects, this.criteria);
    var combination = combn.getCombination();

    var index = 0;
    this.tree = new Node(index);
    this.tree.data({prob : -1.0});
    var leafNodesArr = [];
    leafNodesArr.push(index++);

    for(var comb1 in combination) {
      //console.log("comb " + comb1 + " -> " + JSON.stringify(combination[comb1]));

      var isProbDefined = false, lt, gt, indiff;
      for(var resp = 0; resp < this.responses.length; resp++){
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
              } else node.data({prob : -1.0});

              console.log("leafPos -> " + leafNodesArr[pos] + ", id -> " + node.id);
              console.log("position -> "+node.position() + " and layer -> " + node.layer());
              newLeafNodesArr.push(node.id);
              console.log("<<<<<<<< The child node is : " + JSON.stringify(node.data()) + " >>>>>>>>>>>>");
            }
          }

          // change the leafNodesArr here
          leafNodesArr = newLeafNodesArr;
        }
      }
      return this.tree;
    };

    /************************************************************
    * Update the probability values at found set
    ***************************************************************/
    GreedyApproach.prototype.changeProbValues = function(){

    }


    /************************************************************
    * Find the ranking of objects
    ***************************************************************/
    GreedyApproach.prototype.findRanking = function(node){
      var firstDepthChild = node.depthFirstChild(),
      firstDepthChildId = firstDepthChild.id,
      lastDepthChild = node.depthLastChild(),
      lastDepthChildId = lastDepthChild.id,
      layer = node.layer(),
      totalProb = 1.0,
      thisNode = node,
      childCount = lastDepthChildId - firstDepthChildId + 1;

      while(layer > 0 && thisNode) {
        totalProb *= thisNode.data("prob");
        layer--;
        thisNode = thisNode.parent;
      }

      var ranks = {'undefined' : 0};
      for(var key = 0; key < this.objects.length; key++) {
        ranks[this.objects[key]] = 0;
      }

      for(var id = firstDepthChildId; id <= lastDepthChildId; id++) {
        // read or generate the pareto-optimal objects by bottom-up traversal

        if(id % 3 == 0) ranks["James"] += ((1/9) * (totalProb));
        else if(id % 5 == 0) ranks["Mark"] += ((1/9) * (totalProb));
        else if(id % 7 == 0) ranks["David"] += ((1/9) * (totalProb));
        else ranks["undefined"] += ((1/9) * (totalProb));
      }

      return ranks;
    }

    /************************************************************
    * Find all the ranking of objects based on the tree
    ***************************************************************/
    GreedyApproach.prototype.traverseTree = function(){
      // find which layer at the depth of the tree has the probability value and begin from there
      var layer = 0, currFirstChild, currLastChild,
      firstChild = this.tree.firstChild(),
      lastChild = this.tree.lastChild();

      while(firstChild && firstChild.data("prob") >= 0.0){
        layer++;
        //if(!firstChild.hasChild()) break;
        currFirstChild = firstChild;
        currLastChild = lastChild;
        firstChild = firstChild.firstChild();
        lastChild = lastChild.lastChild();
      }

      // initialize the ranks object
      var ranks = {'undefined' : 0};
      for(var key = 0; key < this.objects.length; key++) {
        ranks[this.objects[key]] = 0;
      }

      // find all the siblings of currentChild
      for(var id = currFirstChild.id; id <= currLastChild.id; id++) {
        var base = this.tree.getNode(id);
        var newRank = GreedyApproach.prototype.findRanking.call(this, base);
        for(var key in ranks) {
          ranks[key] += newRank[key];
        }
      }

      console.log("------------ RANKS --------------");
      console.log(JSON.stringify(ranks));
      process.exit(1);
    }


    module.exports = GreedyApproach;
