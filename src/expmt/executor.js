var http = require('http'),
express = require('express'),
bodyParser = require('body-parser'),
path = require('path'),
nconf = require('nconf'),
https = require('https'),
util = require('util'),
Combinatorics = require('js-combinatorics'),
CrowdConsensus = require("../db/CrowdConsensus.js"),
fs = require('fs'),
math = require('mathjs'),
Combination = require("../algo/Combination.js");
mongoose = require('mongoose');

nconf.argv()
.env()
.file({ file: __dirname + '/../../config.json' });

var mongodb_url = nconf.get('CROWD_CONSENSUS_MONGO_URL');

// Connect mongodb
mongoose.Promise = global.Promise;
mongoose.connect(mongodb_url, function (error) {
  if (error) console.error(error);
  else console.log('mongo connected');
});

var app = express();

// body parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

console.log("Now reading " + process.env.ID+", " +process.env.START_INDEX +", "+ process.env.SUBWORLD_SIZE+", "+ process.env.iter);


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

/**
* Merge the 2 JSON objects and add the values if same key
***/
var mergeObject = function(dict, oldDict){
  var newDict = {};
  for(var key in dict)
  newDict[key] = dict[key];

  for(var key in oldDict) {
    if(key in newDict) {
      var rank = newDict[key];
      for(var k2 in rank)
      newDict[key][k2] += oldDict[key][k2];
    } else {
      newDict[key] = oldDict[key];
    }
  }
  return newDict;
}

var findPOptimal = function(paretoOptimalCand, objects, criteria){
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
  objDominanceCounter = null;
  return pObj;
}


var GreedyArray = function(cb_id, startIndex, subWorldSize, iter){

  console.log("The cb_id: " + cb_id);

  fs.readFile(__dirname + cb_id, 'utf8', function(err, d1){
    var resp = JSON.parse(d1);

    var objsCrits = fs.readFileSync(__dirname+"/input/ip.json");
    var ocParsed = JSON.parse(objsCrits);
    var objects = ocParsed.objects, criteria = ocParsed.criteria;

    var combn = new Combination(objects, criteria);
    var combination = combn.getCombination();
    var baseN = Combinatorics.baseN(['gt', 'lt','indiff'], combination.length);
    var worlds = [];
    var count = 1;

    var dict = {}, pos = [];

    for(var g = 0; g < combination.length; g++) {
      for(var h = 0; h < resp.length; h++) {
        if(combination[g].object1 == resp[h].object1 &&
          combination[g].object2 == resp[h].object2 &&
          combination[g].criterion == resp[h].criterion) {
            pos.push(g);
          }
        }
      }

      console.log("--------- Ranks of objects based on Probabilistic distribution ----------");
      console.log("Objects: "); for(var u = 0; u < objects.length; u++) console.log(objects[u]);
      console.log("\nCriteria: "); for(var v = 0; v < criteria.length; v++) console.log(criteria[v]);
      console.log("------------------------------------");
      console.log("Total number of Possible World = " + baseN.length+"\n");
      console.log("--------------------- "+resp.length+" Inputs provided---------------------------");
      var kr = resp.length - 1;
      console.log(resp[kr].object1+", "+resp[kr].object2+", "+
      resp[kr].criterion+", "+resp[kr].gt+", "+resp[kr].indiff+", "+resp[kr].lt + "\n");
      var counter = {'undefined' : 0, 'Apple' : 0, 'Dell' : 0, 'HP' : 0, 'Toshiba' : 0};
      var zeroWorldCount = 0,
      longStr = "",
      fileName = ""+objects.toString()+","+criteria.toString()+"",
      chunkNumber = subWorldSize, oldRankFile,
      oldFileName = __dirname+'/ranks_'+((startIndex / chunkNumber) - 1)+".json";

      // loop through all the possible worlds
      var subWorldLength = math.round(baseN.length);

      startIndex = parseInt(startIndex, 10);
      var abc = parseInt(process.env.SUBWORLD_SIZE, 10) + startIndex;
      var z;

      for(z = startIndex; z < abc; z++){
        // stop the loop when the last element is reached
        if(z >= subWorldLength - 1)  break;

        var a = baseN.nth(z);
        var world = [];
        var dominanceCountDict = {}, paretoOptimalCand = [];

        var divi = (math.pow(3, resp.length)) / (baseN.length);
        var key = "", prob = 1.0;
        var isWorldProbZero = false;

        for(var al = 0; al < a.length; al++) {
          var w = {
            'object1' : combination[al].object1,
            'object2' : combination[al].object2,
            'criterion' : combination[al].criterion,
            'sign' : a[al]
          }, v = w;

          // multiply the probability of only known results
          if(pos.indexOf(al) > -1) {
            key += (w.sign +":");
            for(var n = 0; n < resp.length; n++) {
              if(w.object1 == resp[n].object1 &&
                w.object2 == resp[n].object2 &&
                w.criterion == resp[n].criterion) {
                  prob *= resp[n][w.sign];

                  if(resp[n][w.sign] <= 0) isWorldProbZero = true;
                  break;
                }
              }
            }

            // the probability of the current world is zero anyway so no point in calculating Pareto-Optimal and all
            if(isWorldProbZero) {
              zeroWorldCount++;
              break;
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

            // trying to free up some memory
            v = null, w = null;
          }

          var pObjs = [], fileString = "";

          if(!isWorldProbZero) {
            worlds.push(world);
            pObjs = findPOptimal(paretoOptimalCand, objects, criteria);

            longStr += (a.toString()+"->"+pObjs.toString()+"\n");
          }

          // find the probability of p-optimal object
          if(!dict[key]) {
            dict[key] = {'undefined' : 0.0};
            for(var t = 0; t < objects.length; t++) dict[key][objects[t]] = 0.0;
          }

          for(var m = 0; m < pObjs.length; m++) {
            dict[key][pObjs[m]] += (math.exp(math.log(prob) + math.log(divi))); // or alternatively, (prob * divi);
            counter[pObjs[m]] += 1;
          }

          if(pObjs.length == 0 && !isWorldProbZero) {
            dict[key].undefined += (math.exp(math.log(prob) + math.log(divi))); // or alternatively, (prob * divi);
            counter['undefined'] += 1;
          }

          // Just for formatting
          var tmpStr = "";
          for(var r = 0; r < pObjs.length; r++) {
            if(r == (pObjs.length - 1)) tmpStr += (pObjs[r]);
            else tmpStr += (pObjs[r]+",");
          }
          //  console.log("----------------- World "+(count)+":"+ (math.round((prob * divi), 3)) + ", "+ tmpStr+ " -----------------");
          for(var al = 0; al < a.length; al++) {
            var tmpSign = "<";
            if(a[al] == "gt") tmpSign = ">"; else if(a[al] == "lt") tmpSign = "<"; else tmpSign = "~";
          }

          count++;
        }
        // write a progress snapshot
        console.log("Progress: " + math.round(((z * 100) / baseN.length)) +"% ...." + " @"+z);

        // save the intermediate data into files
        var wstream = fs.createWriteStream(__dirname+"/data/"+startIndex+".dat", {'flags': 'a', 'encoding': null, 'mode': 0666});
        wstream.write(longStr);
        wstream.end();

        if(startIndex > 0) {
          var oFileName = __dirname + '/ranks_'+((startIndex / chunkNumber) - 1)+".json";
          oldRankFile = fs.readFileSync(oFileName);
          var oldDict;
          if(oldRankFile){
            try{
              oldDict = JSON.parse(oldRankFile);
            } catch(e){
              console.log("Invalid JSON file :(");
            }
          } else {
            console.log("Looks like something tampered with the file and now its empty :(");
          }
          dict = mergeObject(dict, oldDict);
          fs.unlink(oFileName, function(err){});
        }

        var wstrm = fs.createWriteStream(__dirname+"/ranks_"+(startIndex / chunkNumber)+".json");
        wstrm.write(JSON.stringify(dict));
        wstrm.end();

        console.log('--------------------------');
        console.log(' 0 prob world count : ' + zeroWorldCount);
        console.log('--------------------------');
        var ranks = {};
        // find the ranks
        for(var each in dict) {
          var indiRank = dict[each];
          for(var ke in indiRank) {
            if(!ranks[ke]) {
              ranks[ke] = indiRank[ke]; // previously this was rounded off to 3 digits
            } else ranks[ke] += indiRank[ke];
          }
        }

        // Begin formatting output
        var tmprank = "";
        for(var ey in ranks) {
          tmprank += ("'" + ey + "': " + "'" + math.round(ranks[ey], 4) + "', ");
          ranks[ey] = math.round(ranks[ey], 4);
        }
        tmprank = tmprank.substring(0, tmprank.length - 1);
        // End formatting output

        console.log("\n" + tmprank + "\n");

        var ws1 = fs.createWriteStream(__dirname+"/output/"+objects.length+"o"+criteria.length+"c.json");
        ws1.write(JSON.stringify(ranks));
        ws1.end();

      });

      //process.exit(1);
    }


    var gree = new GreedyArray(process.env.ID, process.env.START_INDEX, process.env.SUBWORLD_SIZE, process.env.iter);

    app.listen(process.env.PORT, function(){
      console.log("Server listening....");
    });
