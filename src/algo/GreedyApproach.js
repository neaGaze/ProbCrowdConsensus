
CrowdConsensus = require("../db/CrowdConsensus.js"),
Combination = require("./Combination.js"),
//Node = require("./CombinatoryTree.js"),
Node = require('tree-node'),
util = require('util'),
math = require('mathjs'),
EventEmitter = require('events').EventEmitter;

/****************************************************
* Greedy Approach using Tree data structure.
* Concerns : Takes too long
******************************************************/
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

  /** correct implementation **/
  for(var k = 0; k < this.objects.length; k++) pObj.push(this.objects[k]);
  for(var i = 0; i < this.paretoOptimalCand.length; i++){
    // console.log(""+paretoOptimalCand[i].object1 + " " + paretoOptimalCand[i].sign +" "+paretoOptimalCand[i].object2);
    var sign = this.paretoOptimalCand[i].sign;
    if(sign == "gt") {
      var index = pObj.indexOf(this.paretoOptimalCand[i].object2);
      if(index > -1) pObj.splice(index, 1);
    } else if(sign == "lt") {
      var index = pObj.indexOf(this.paretoOptimalCand[i].object1);
      if(index > -1) pObj.splice(index, 1);
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
  * Get the next question
  ***************************************************************/
  GreedyApproach.prototype.getNextQues = function(){

    var combn = new Combination(this.objects, this.criteria);
    var combination = combn.getCombination();

    for(var i = 0; i < combination.length; i++) {
      for(var j = 0; j < this.responses.length; j++) {
        if(!((combination[i].object1 == this.responses[j].object1 &&
          combination[i].object2 == this.responses[j].object2 &&
          combination[i].criterion == this.responses[j].criterion) ||
          (combination[i].object1 == this.responses[j].object2 &&
            combination[i].object2 == this.responses[j].object1 &&
            combination[i].criterion == this.responses[j].criterion))) {
              return combination[i];
            }
          }
        }
        return {'object1' : '', 'object2' : '', 'criterion' : ''};
      };

      /***
      * Find the ranks using Array data structure
      ***/
      GreedyApproach.prototype.greedyArray = function(){

        if(this.responses == null || this.responses.length == 0) return;

        var combn = new Combination(this.objects, this.criteria);
        var combination = combn.getCombination();
        var baseN = Combinatorics.baseN(['gt', 'lt','indiff'], combination.length);
        var worlds = [];
        var count = 1;
        var knownRes = [
          {
            'object1' : 'Apple', 'object2' : 'Dell', 'criterion' : 'design', 'gt' : 0.5, 'lt' : 0.5, 'indiff' : 0.0
          }
        ];

        var dict = {}, pos = [];

        for(var g = 0; g < combination.length; g++) {
          for(var h = 0; h < this.responses.length; h++) {
            if((combination[g].object1 == this.responses[h].object1 &&
              combination[g].object2 == this.responses[h].object2 &&
              combination[g].criterion == this.responses[h].criterion) ||

              (combination[g].object1 == this.responses[h].object2 &&
                combination[g].object2 == this.responses[h].object1 &&
                combination[g].criterion == this.responses[h].criterion)) {
                  pos.push(g);
                }
              }
            }

            console.log("--------- Ranks of objects based on Probabilistic distribution ----------");
            console.log("Objects: "); for(var u = 0; u < this.objects.length; u++) console.log(this.objects[u]);
            console.log("\nCriteria: "); for(var v = 0; v < this.criteria.length; v++) console.log(this.criteria[v]);
            console.log("------------------------------------");
            console.log("Total number of Possible World = " + baseN.length+"\n");
            console.log("--------------------- "+this.responses.length+" Inputs provided---------------------------");
            for(var kr = 0; kr < this.responses.length; kr++) console.log(this.responses[kr].object1+", "+this.responses[kr].object2+", "+
            this.responses[kr].criterion+", "+this.responses[kr].gt+", "+this.responses[kr].indiff+", "+this.responses[kr].lt + "\n");
            //console.log("------------------------------------\n");
            var counter = {'undefined' : 0, 'Apple' : 0, 'Dell' : 0, 'HP' : 0};

            baseN.forEach(function(a){
              //  console.log(a);
              var world = [];
              var dominanceCountDict = {}, paretoOptimalCand = [];

              var divi = (math.pow(3, this.responses.length)) / (baseN.length);
              var key = "", prob = 1.0;

              for(var al = 0; al < a.length; al++) {
                var w = {
                  'object1' : combination[al].object1,
                  'object2' : combination[al].object2,
                  'criterion' : combination[al].criterion,
                  'sign' : a[al]
                }, v = w;

                if(pos.indexOf(al) > -1) {
                  key += (w.sign +":");
                  for(var n = 0; n < this.responses.length; n++) {
                    if(w.object1 == this.responses[n].object1 &&
                      w.object2 == this.responses[n].object2 &&
                      w.criterion == this.responses[n].criterion) {
                        prob *= this.responses[n][w.sign];
                        break;
                      }
                    }
                  }

                  if(a[al] == 'lt') {
                    var tmp = w.object1;
                    w.object1 = w.object2;
                    w.object2 = tmp;
                    w.sign = 'gt';
                  }

                  /**** Prepare for p-optimal objects ****/
                  var o = w,
                  key1 = ""+w.object1+","+w.object2,
                  key2 = ""+w.object2+","+w.object1,
                  realKey = key1;

                  // check to see if the object1 and object2 are found in opposite positions
                  if(key1 in dominanceCountDict) realKey = key1;
                  else if(key2 in dominanceCountDict) {
                    realKey = key2;
                    o.object1 = o.object2;
                    o.object2 = w.object1;
                    if(o.sign == "gt") o.sign = "lt";
                    else if(o.sign == "lt") o.sign = "gt";
                  }

                  w = o;

                  if(realKey in dominanceCountDict) {

                    // by default the convention is to keep the default sign but later if a different sign
                    // appears, we don't consider this set of objects
                    if(isInverseOf(dominanceCountDict[realKey].sign, o.sign))
                    dominanceCountDict[realKey].isvalid = 0;

                    // always set the sign of ~ to lowest priority and replace if found other signs
                    if(dominanceCountDict[realKey].sign == "indiff" || dominanceCountDict[realKey].sign == "~") dominanceCountDict[realKey].sign = o.sign;

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

                  if(dominanceCountDict[realKey].count == this.criteria.length && dominanceCountDict[realKey].isvalid == 1) {

                    //if(ENABLE_LOGGING) console.log("___objArr["+al+"] -> " + JSON.stringify(o));
                    // for '>' case
                    var dominatedObj = splited[1], dominatingObj = splited[0];

                    // for '<' case
                    if(dominanceCountDict[realKey].sign == "lt"){
                      dominatedObj = splited[0];
                      dominatingObj = splited[1];
                    }

                    if(dominanceCountDict[realKey].sign == "gt" || dominanceCountDict[realKey].sign == "lt") {
                      // push to the pareto optimal candidate list
                      paretoOptimalCand.push({
                        object1 : dominatingObj,
                        object2 : dominatedObj,
                        sign : "gt"
                      });
                    }
                    // case when all the values are ~ so the final result is also indifference
                    else if(dominanceCountDict[realKey].sign == "indiff"){
                      // push to the pareto optimal candidate list
                      paretoOptimalCand.push({
                        object1 : dominatingObj,
                        object2 : dominatedObj,
                        sign : "indiff"
                      });
                    }
                  }
                  // this is the case when the case like x ~ y occurs; when an object has both the
                  // "better than" as well as "not better than" relationship
                  else if(dominanceCountDict[realKey].isvalid == 0) {
                    // push to the pareto optimal candidate list
                    paretoOptimalCand.push({
                      object1 : splited[0],
                      object2 : splited[1],
                      sign : "indiff"
                    });
                    //console.log("Indifference found: " + splited[0] + " ~ " + splited[1] + "");
                  }

                  world.push(v);
                }

                //console.log("\n    Prob:  " + (math.round((prob * divi), 3)) + "  ");
                if(ENABLE_LOGGING) console.log("dominanceCountDict : " + JSON.stringify(dominanceCountDict));

                worlds.push(world);
                var pObjs = findPOptimal(paretoOptimalCand, this.objects, this.criteria);

                // find the probability of p-optimal object
                if(!dict[key]) {
                  dict[key] = {'undefined' : 0.0};
                  for(var t = 0; t < this.objects.length; t++) dict[key][this.objects[t]] = 0.0;
                }


                for(var m = 0; m < pObjs.length; m++) {
                  if(ENABLE_LOGGING) console.log("pObjs : " + m + " -> " +pObjs[m] + " = " + dict[key][pObjs[m]] + " + (" + prob + " * " + divi+")");
                  dict[key][pObjs[m]] += (prob * divi);
                  counter[pObjs[m]] += 1;
                }

                if(pObjs.length == 0) {
                  if(ENABLE_LOGGING) console.log("no pareto optimal objects");
                  dict[key].undefined += (prob * divi);
                  counter['undefined'] += 1;
                }

                var tmpStr = "";
                for(var r = 0; r < pObjs.length; r++) {
                  if(r == (pObjs.length - 1)) tmpStr += (pObjs[r]);
                  else tmpStr += (pObjs[r]+",");
                }
                console.log("----------------- World "+(count)+":"+ (math.round((prob * divi), 3)) + ", "+ tmpStr+ " -----------------");
                for(var al = 0; al < a.length; al++) {
                  var tmpSign = "<";
                  if(a[al] == "gt") tmpSign = ">"; else if(a[al] == "lt") tmpSign = "<"; else tmpSign = "~";

                  console.log(""+combination[al].object1 +", " + combination[al].object2 + ", " + combination[al].criterion+", " + tmpSign +"");
                }

                count++;
              });

              console.log('--------------------------');
              var ranks = {};
              // find the ranks
              for(var each in dict) {
                var indiRank = dict[each];
                for(var ke in indiRank) {
                  if(!ranks[ke]) {
                    ranks[ke] = math.round(indiRank[ke], 3);
                  } else ranks[ke] += math.round(indiRank[ke], 3);
                }
              }

              if(ENABLE_LOGGING) console.log("--------FINAL counter -> " + JSON.stringify(counter));

              var tmprank = "";
              for(var ey in ranks) {
                tmprank += ("'" + ey + "': " + "'" +ranks[ey] + "', ");
              }
              tmprank = tmprank.substring(0, tmprank.length - 1);
              console.log("\n" + tmprank + "\n");

              //process.exit(1);
            }

            /************************************************************
            * Find all the possible worlds
            ***************************************************************/
            GreedyApproach.prototype.findPossibleWorlds = function(){
              if(!this.tree) {
                var relationships = ['gt', 'lt', 'indiff'];
                // console.log("COMO estas 2 -> " + this.objects.length);
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

                          console.log("leafPos -> " + leafNodesArr[pos] + ", id -> " + node.id);
                          console.log("position -> "+node.position() + " and layer -> " + node.layer());
                          newLeafNodesArr.push(node.id);
                          console.log("<<<<<<<< The child node is : " + JSON.stringify(node.data()) + " >>>>>>>>>>>>");
                        }
                      }

                      // change the leafNodesArr here
                      leafNodesArr = newLeafNodesArr;
                    }
                  } else {
                    console.log("Oops ! It seems like there already a tree so just reuse it ");
                  }

                  // now find the Pareto-Optimal Objects in every possible worlds and store at the bottommost leaf
                  var firstDepthChild = this.tree.depthFirstChild(),
                  firstDepthChildId = firstDepthChild.id,
                  lastDepthChild = this.tree.depthLastChild(),
                  lastDepthChildId = lastDepthChild.id;


                  for(var id = firstDepthChildId; id <= lastDepthChildId; id++) {
                    var startNode = this.tree.getNode(id);
                    var aWorld = [];
                    // console.log("------- POSSIBLE WORLDS ending @"+id+" ---------");
                    while(startNode.layer() > 0) {
                      // console.log("-----> " +JSON.stringify(startNode.data()));
                      aWorld.push(startNode.data());
                      startNode = startNode.parent;
                    }


                    // now find the pareto_Optimal objects here
                    //var paretoOptimalObjs = GreedyApproach.prototype.getParetoOptimalObjs.call(this, aWorld);

                    // this.tree.getNode(id).data({POO : paretoOptimalObjs});

                    // console.log("______ P-OPTIMAL OBJECTS for world@"+id+" _____");
                    // for(var y = 0; y < paretoOptimalObjs.length; y++) console.log("pObj -> " + paretoOptimalObjs[y]);
                  }
                  return this.tree;
                };

                /************************************************************
                * Update the probability values at found set
                ***************************************************************/
                GreedyApproach.prototype.changeProbValues = function(param){
                  if(this.tree) {
                    var aNode = this.tree.depthFirstChild(),
                    bNode = this.tree.depthLastChild();

                    while(aNode.layer() != 0) {

                      if((aNode.data("object1") == param.object1 &&
                      aNode.data("object2") == param.object2 &&
                      aNode.data("criterion") == param.criterion) ||
                      (aNode.data("object2") == param.object1 &&
                      aNode.data("object1") == param.object2 &&
                      aNode.data("criterion") == param.criterion)) {
                        console.log("OK our node found");
                        break;
                      }

                      console.log("layer -> " + aNode.layer() +", node -> (" +aNode.data("object1") +
                      " "+aNode.data("sign") + " " + aNode.data("object2") + ") vs param -> (" +
                      param.object1 + " *" + param.gt+", " + param.lt+", " +param.indiff + "* " + param.object2+")");

                      aNode = aNode.parent;
                      bNode = bNode.parent;
                    }

                    console.log("-------UPDATE PROB VALUES IN TREE-------");
                    // now change the prob of all the nodes in the layers between aNode and bNode
                    for(var i = aNode.id; i <= bNode.id; i++) {
                      var cNode = this.tree.getNode(i);
                      if(cNode.data("sign") == "gt") cNode.data({prob : param.gt});
                      else if(cNode.data("sign") == "lt") cNode.data({prob : param.lt});
                      else if(cNode.data("sign") == "indiff") cNode.data({prob : param.indiff});

                      console.log("node in layer "+cNode.layer()+" and id_" + i +"-> " + cNode.data("prob"));
                    }
                    console.log("-------------------------------\n");
                  }
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
                        // console.log("pObjs @" + id+" -> " + pObjs[i]);
                      }
                      // console.log("For id -> " + id + " ranks : " + JSON.stringify(ranks));
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

                  if(!firstChild)
                  console.log("firstChild is null");
                  else console.log("prob -> "+firstChild.data("prob"));

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
                  //process.exit(1);
                }


                module.exports = GreedyApproach;
