
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
  this.paretoOptimalCand = [];
  //  this.combinationList = GreedyApproach.prototype.findPossibleWorlds.call(this);
};

var ENABLE_LOGGING = false;

util.inherits(GreedyApproach, EventEmitter);

/**
* Get Inverse of the sign
**/
var isInverseOf = function(sign1, sign2){
  var lt = "&lt;", gt = "&gt;";
  if(sign1 == lt && sign2 == gt) return true;
  else if(sign1 == gt && sign2 == lt) return true;
  else false;
}


/**
* Find Pareto-Optimal Objects.
* Assumption: "this.paretoOptimalCand" always has "object1" as the dominating object.
* It doesn't matter if the relationship is indifference
**/
GreedyApproach.prototype.findParetoOptimalObjects = function(){
  var pObj = [];
  this.objDominanceCounter  = {};

  // initialization loop with total object counter
  for(var i = 0; i < this.paretoOptimalCand.length; i++){

    var sign = this.paretoOptimalCand[i].sign;

    // we always consider the object1 as possible candidate because the sign is always either > or ~
    if(!(this.paretoOptimalCand[i].object1 in this.objDominanceCounter)){
      this.objDominanceCounter[this.paretoOptimalCand[i].object1] = {
        count : 0,
        isValid : 0
      };
    }

    // there are only 2 cases left in object2: "the right side of >" or "The right side of ~".
    // Ignore if it's "the right side of >" aka the dominated object, because it will never be pareto-optimal
    if(!(this.paretoOptimalCand[i].object2 in this.objDominanceCounter)){
      if(sign == "&#126;") {
        this.objDominanceCounter[this.paretoOptimalCand[i].object2] = {
          count : 0,
          isValid : 0
        };
      }
    }
  }

  if(ENABLE_LOGGING) console.log("_____________________Pareto-Optimal Candidate objects________________________");

  // loop for finding Pareto-Optimal objects
  for(var i = 0; i < this.paretoOptimalCand.length; i++){

    if(ENABLE_LOGGING) console.log(""+this.paretoOptimalCand[i].object1 + " " + this.paretoOptimalCand[i].sign +" "+this.paretoOptimalCand[i].object2);

    // for the first object a.k.a the dominating object
    if(this.paretoOptimalCand[i].object1 in this.objDominanceCounter) {
      this.objDominanceCounter[this.paretoOptimalCand[i].object1].count += 1;

      // this finds the pareto-optimal object if the dominated object count is 1 less than the total objects found
      if((this.paretoOptimalCand[i].sign == "&gt;") && (this.objDominanceCounter[this.paretoOptimalCand[i].object1].isValid >= 0)){
        this.objDominanceCounter[this.paretoOptimalCand[i].object1].isValid = 1;
      }

      // -1 because we don't consider itself
      if(this.objDominanceCounter[this.paretoOptimalCand[i].object1].count == (this.objects.length - 1) &&
      this.objDominanceCounter[this.paretoOptimalCand[i].object1].isValid > 0)
      pObj.push(this.paretoOptimalCand[i].object1);
    }

    // for the second object a.k.a the dominated object
    if(this.paretoOptimalCand[i].object2 in this.objDominanceCounter) {
      this.objDominanceCounter[this.paretoOptimalCand[i].object2].count += 1;

      if(this.paretoOptimalCand[i].sign == "&gt;")
      this.objDominanceCounter[this.paretoOptimalCand[i].object2].isValid = -1;

      if(this.objDominanceCounter[this.paretoOptimalCand[i].object2].count == (this.objects.length - 1) &&
      this.objDominanceCounter[this.paretoOptimalCand[i].object2].isValid > 0)
      pObj.push(this.paretoOptimalCand[i].object2);
    }
  }

  return pObj;
}

/********************************************************************************
* Find the Pareto-Optimal Objects from the list of objects
********************************************************************************/
GreedyApproach.prototype.getParetoOptimalObjs = function(objArr) {
  dominanceCountDict = {};
  this.paretoOptimalCand = [];

  for(var i = 0;i < objArr.length; i++) {

    var o = objArr[i],
    key1 = ""+o.object1+","+o.object2,
    key2 = ""+o.object2+","+o.object1,
    realKey = key1;

    // check to see if the object1 and object2 are found in opposite positions
    if(key1 in dominanceCountDict) realKey = key1;
    else if(key2 in dominanceCountDict) {
      realKey = key2;
      o.object1 = o.object2;
      o.object2 = objArr[i].object1;
      if(o.sign == "&gt;") o.sign = "&lt;";
      else if(o.sign == "&lt;") o.sign = "&gt;";
    }


    // if the realKey is found in the dict, increment its count and also check if it's sign has reversed.
    // If reversed, set its 'isvalid' to false and it is not eligible for dominance check now.
    // Once all the criteria have been reached, we can check object dominance relationship
    if(realKey in dominanceCountDict) {

      // by default the convention is to keep the default sign but later if a different sign
      // appears, we don't consider this set of objects
      if(isInverseOf(dominanceCountDict[realKey].sign, o.sign))
      dominanceCountDict[realKey].isvalid = 0;

      // always set the sign of ~ to lowest priority and replace if found other signs
      if(dominanceCountDict[realKey].sign == "&#126;" || dominanceCountDict[realKey].sign == "~") dominanceCountDict[realKey].sign = o.sign;

      // if the criteria for 2 matched objects are the same, then there must be some error
      // because two same objects can't have the same criteria. The criteria must be different
      for(var k = 0; k < dominanceCountDict[realKey].criteria.length; k++)
      if(dominanceCountDict[realKey].criteria[k] == o.criterion)
      dominanceCountDict[realKey].isvalid = -1;

      dominanceCountDict[realKey].criteria.push(o.criterion);

    } else {
      var crit = [];
      crit.push(o.criterion);
      dominanceCountDict[realKey] = {
        count : 0,
        sign : o.sign,
        isvalid : 1,
        criteria : crit
      };
    }

    dominanceCountDict[realKey].count += 1;

    var splited = realKey.split(",");


    // The following condition is used to filter objects in O_unknown, O_tick or O_cross if found any
    if(dominanceCountDict[realKey].count == this.criteria.length &&
      dominanceCountDict[realKey].isvalid == 1) {

        if(ENABLE_LOGGING) console.log("___objArr["+i+"] -> " + JSON.stringify(o));
        // for '>' case
        var dominatedObj = splited[1], dominatingObj = splited[0];

        // for '<' case
        if(dominanceCountDict[realKey].sign == "&lt;" || ("&lt;".indexOf(dominanceCountDict[realKey].sign) > -1)){
          dominatedObj = splited[0];
          dominatingObj = splited[1];
        }

        if(("&gt;".indexOf(dominanceCountDict[realKey].sign) > -1) ||  ("&lt;".indexOf(dominanceCountDict[realKey].sign) > -1)) {
          // push to the pareto optimal candidate list
          this.paretoOptimalCand.push({
            object1 : dominatingObj,
            object2 : dominatedObj,
            sign : "&gt;"
          });
        }
        // case when all the values are ~ so the final result is also indifference
        else if(dominanceCountDict[realKey].sign == "&#126;"  || dominanceCountDict[realKey].sign == "indiff" || dominanceCountDict[realKey].sign == "~"){
          // push to the pareto optimal candidate list
          this.paretoOptimalCand.push({
            object1 : dominatingObj,
            object2 : dominatedObj,
            sign : "&#126;"
          });
        }
      }
      // this is the case when the case like x ~ y occurs; when an object has both the
      // "better than" as well as "not better than" relationship
      else if(dominanceCountDict[realKey].isvalid == 0) {
        // push to the pareto optimal candidate list
        this.paretoOptimalCand.push({
          object1 : splited[0],
          object2 : splited[1],
          sign : "&#126;"
        });
        //console.log("Indifference found: " + splited[0] + " ~ " + splited[1] + "");
      }
    }

    // find the pareto-optimal objects and add the dominating object to the O_tick class
    var pOptimalObjs = GreedyApproach.prototype.findParetoOptimalObjects.call(this);
    if(ENABLE_LOGGING) console.log("_____ DOMINANCE_COUNT_DICT_______");
    if(ENABLE_LOGGING) console.log(""+JSON.stringify(dominanceCountDict));
    return pOptimalObjs;
  };

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
                  if(relationships[reln] == 'gt') node.data({prob : gt});
                  if(relationships[reln] == 'lt') node.data({prob : lt});
                  if(relationships[reln] == 'indiff') node.data({prob : indiff});
                } else node.data({prob : -1.0});

                //console.log("leafPos -> " + leafNodesArr[pos] + ", id -> " + node.id);
                //console.log("position -> "+node.position() + " and layer -> " + node.layer());
                newLeafNodesArr.push(node.id);
                //console.log("<<<<<<<< The child node is : " + JSON.stringify(node.data()) + " >>>>>>>>>>>>");
              }
            }

            // change the leafNodesArr here
            leafNodesArr = newLeafNodesArr;
          }
        }

        // now find the Pareto-Optimal Objects in every possible worlds and store at the bottommost leaf
        var firstDepthChild = this.tree.depthFirstChild(),
        firstDepthChildId = firstDepthChild.id,
        lastDepthChild = this.tree.depthLastChild(),
        lastDepthChildId = lastDepthChild.id;


        for(var id = firstDepthChildId; id <= lastDepthChildId; id++) {
          var startNode = this.tree.getNode(id);
          var aWorld = [];
          console.log("------- POSSIBLE WORLDS ending @"+id+" ---------");
          while(startNode.layer() > 0) {
            console.log("-----> " +JSON.stringify(startNode.data()));
            aWorld.push(startNode.data());
            startNode = startNode.parent;
          }


          // now find the pareto_Optimal objects here
          var paretoOptimalObjs = GreedyApproach.prototype.getParetoOptimalObjs.call(this, aWorld);

          this.tree.getNode(id).data({POO : paretoOptimalObjs});

          console.log("______ P-OPTIMAL OBJECTS for world@"+id+" _____");
          for(var y = 0; y < paretoOptimalObjs.length; y++) console.log("pObj -> " + paretoOptimalObjs[y]);
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
            var lfNode = this.tree.getNode(id),
            pObjs = lfNode.data("POO");

            if(!pObjs) console.log("Sorry it seems that pareto-optimal objects were not stored at the leaf Nodes");
            else {
              if(pObjs.length == 0) ranks["undefined"] += ((1/childCount) * (totalProb));

              for(var i = 0; i < pObjs.length; i++) {
                ranks[pObjs[i]] += ((1/childCount) * totalProb);
                console.log("pObjs @" + id+" -> " + pObjs[i]);
              }
              console.log("For id -> " + id + " ranks : " + JSON.stringify(ranks));
            }

          // read or generate the pareto-optimal objects by bottom-up traversal
      /*    if(id % 3 == 0) ranks["James"] += ((1/9) * (totalProb));
          else if(id % 5 == 0) ranks["Mark"] += ((1/9) * (totalProb));
          else if(id % 7 == 0) ranks["David"] += ((1/9) * (totalProb));
          else ranks["undefined"] += ((1/9) * (totalProb));
      */
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
        console.log("-------- INDIVIDUAL RANKS ---------");
        for(var id = currFirstChild.id; id <= currLastChild.id; id++) {
          var base = this.tree.getNode(id);
          var newRank = GreedyApproach.prototype.findRanking.call(this, base);
          for(var key in ranks) {
            ranks[key] += newRank[key];
          console.log("Ranks for id " + id + " -> " + newRank[key]);
          }
          console.log("-------------------------");
        }

        console.log("------------ RANKS --------------");
        console.log(JSON.stringify(ranks));
        process.exit(1);
      }


      module.exports = GreedyApproach;
