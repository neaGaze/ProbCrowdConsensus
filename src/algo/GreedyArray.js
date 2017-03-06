var Combinatorics = require('js-combinatorics'),
CrowdConsensus = require("../db/CrowdConsensus.js"),
math = require('mathjs'),
fs = require('fs'),
util = require('util'),
Combination = require("./Combination.js");
/*
var log_file = fs.createWriteStream('../../testcases/debug.log', {flags : 'w'});
var log_stdout = process.stdout;

console.log = function(d) { //
  log_file.write(util.format(d) + '\n');
  log_stdout.write(util.format(d) + '\n');
};
*/

var ENABLE_LOGGING = false;
/**
* Get Inverse of the sign
**/
var isInverseOf = function(sign1, sign2){
  var lt = "lt", gt = "gt";
  if(sign1 == lt && sign2 == gt) return true;
  else if(sign1 == gt && sign2 == lt) return true;
  else false;
}

var findPOptimal = function(world, paretoOptimalCand, objects, criteria){
  var pObj = [];
  var objDominanceCounter  = {};

  /** correct implementation **/
  for(var k = 0; k < objects.length; k++) pObj.push(objects[k]);
  for(var i = 0; i < paretoOptimalCand.length; i++){
    // console.log(""+paretoOptimalCand[i].object1 + " " + paretoOptimalCand[i].sign +" "+paretoOptimalCand[i].object2);
    var sign = paretoOptimalCand[i].sign;
    if(sign == "gt") {
      var index = pObj.indexOf(paretoOptimalCand[i].object2);
      if(index > -1) pObj.splice(index, 1);
    } else if(sign == "lt") {
      var index = pObj.indexOf(paretoOptimalCand[i].object1);
      if(index > -1) pObj.splice(index, 1);
    }
  }
  return pObj;

  // initialization loop with total object counter
  for(var i = 0; i < paretoOptimalCand.length; i++){
    var sign = paretoOptimalCand[i].sign;

    // we always consider the object1 as possible candidate because the sign is always either > or ~
    if(!(paretoOptimalCand[i].object1 in objDominanceCounter)){
      objDominanceCounter[paretoOptimalCand[i].object1] = {
        count : 0,
        isValid : 0
      };
    }

    // there are only 2 cases left in object2: "the right side of >" or "The right side of ~".
    // Ignore if it's "the right side of >" aka the dominated object, because it will never be pareto-optimal
    if(!(paretoOptimalCand[i].object2 in objDominanceCounter)){
      if(sign == "indiff") {
        objDominanceCounter[paretoOptimalCand[i].object2] = {
          count : 0,
          isValid : 0
        };
      }
    }
  }

  if(ENABLE_LOGGING) console.log("_____________________Pareto-Optimal Candidate objects________________________");

  // loop for finding Pareto-Optimal objects
  for(var i = 0; i < paretoOptimalCand.length; i++){

    if(ENABLE_LOGGING) console.log(""+paretoOptimalCand[i].object1 + " " + paretoOptimalCand[i].sign +" "+paretoOptimalCand[i].object2);

    // for the first object a.k.a the dominating object
    if(paretoOptimalCand[i].object1 in objDominanceCounter) {
      objDominanceCounter[paretoOptimalCand[i].object1].count += 1;

      // this finds the pareto-optimal object if the dominated object count is 1 less than the total objects found
      if((paretoOptimalCand[i].sign == "gt") /* && (objDominanceCounter[paretoOptimalCand[i].object1].isValid >= 0) */){
        objDominanceCounter[paretoOptimalCand[i].object1].isValid = 1;
      }

      // -1 because we don't consider itself
      if(objDominanceCounter[paretoOptimalCand[i].object1].count == (objects.length - 1) &&
      objDominanceCounter[paretoOptimalCand[i].object1].isValid > 0)
      pObj.push(paretoOptimalCand[i].object1);
    }

    // for the second object a.k.a the dominated object
    if(paretoOptimalCand[i].object2 in objDominanceCounter) {
      objDominanceCounter[paretoOptimalCand[i].object2].count += 1;
      /*
      if(paretoOptimalCand[i].sign == "gt")
      objDominanceCounter[paretoOptimalCand[i].object2].isValid = -1;

      if(objDominanceCounter[paretoOptimalCand[i].object2].count == (objects.length - 1) &&
      objDominanceCounter[paretoOptimalCand[i].object2].isValid > 0)
      pObj.push(paretoOptimalCand[i].object2);
      */
    }
  }

  return pObj;
}


var GreedyArray = function(){

  var objects = ['Apple','Dell','HP'], criteria = ['design', 'performance'];
  var combn = new Combination(objects, criteria);
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
    for(var h = 0; h < knownRes.length; h++) {
      if(combination[g].object1 == knownRes[h].object1 &&
        combination[g].object2 == knownRes[h].object2 &&
        combination[g].criterion == knownRes[h].criterion) {
          pos.push(g);
        }
      }
    }

    console.log("--------- Ranks of objects based on Probabilistic distribution ----------");
    console.log("Objects: "); for(var u = 0; u < objects.length; u++) console.log(objects[u]);
    console.log("\nCriteria: "); for(var v = 0; v < criteria.length; v++) console.log(criteria[v]);
    console.log("------------------------------------");
    console.log("Total number of Possible World = " + baseN.length+"\n");
    console.log("--------------------- "+knownRes.length+" Inputs provided---------------------------");
    for(var kr = 0; kr < knownRes.length; kr++) console.log(knownRes[kr].object1+", "+knownRes[kr].object2+", "+
    knownRes[kr].criterion+", "+knownRes[kr].gt+", "+knownRes[kr].indiff+", "+knownRes[kr].lt + "\n");
    //console.log("------------------------------------\n");
var counter = {'undefined' : 0, 'Apple' : 0, 'Dell' : 0, 'HP' : 0};
    baseN.forEach(function(a){
      //  console.log(a);
      var world = [];
      var dominanceCountDict = {}, paretoOptimalCand = [];

      var divi = (math.pow(3, knownRes.length)) / (baseN.length);
      var key = "", prob = 1.0

      for(var al = 0; al < a.length; al++) {
        var w = {
          'object1' : combination[al].object1,
          'object2' : combination[al].object2,
          'criterion' : combination[al].criterion,
          'sign' : a[al]
        }, v = w;

        if(pos.indexOf(al) > -1) {
          key += (w.sign +":");
          for(var n = 0; n < knownRes.length; n++) {
            if(w.object1 == knownRes[n].object1 &&
              w.object2 == knownRes[n].object2 &&
              w.criterion == knownRes[n].criterion) {
                prob *= knownRes[n][w.sign];
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

          if(dominanceCountDict[realKey].count == criteria.length && dominanceCountDict[realKey].isvalid == 1) {

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
        var pObjs = findPOptimal(world, paretoOptimalCand, objects, criteria);

        // find the probability of p-optimal object
        if(!dict[key]) {
          dict[key] = {'undefined' : 0.0};
          for(var t = 0; t < objects.length; t++) dict[key][objects[t]] = 0.0;
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

    module.exports = GreedyArray;
