var Combinatorics = require('js-combinatorics'),
math = require('mathjs'),
fs = require('fs'),
util = require('util'),
stream = require('stream')
es = require('event-stream'),
readline = require('readline'),
Combination = require("./Combination.js");

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

/**
* Check for zero probabilites at the inputs
**/
var checkForZeroProbInInputs = function(knownRes){
  var size = knownRes.length;
  if(knownRes[size - 1].gt <= 0 || knownRes[size - 1].lt <= 0 || knownRes[size - 1].indiff <= 0) {
    return true;
  }
  return false;
}

var GreedyArrayFile = function(startIndex, fName, iter){

  var objects = ['Apple','Dell','HP','Toshiba'], criteria = ['design','performance','speed'];
  var combn = new Combination(objects, criteria);
  var combination = combn.getCombination();
  var baseN = Combinatorics.baseN(['gt', 'lt','indiff'], combination.length);
  var count = 1;
  var knownRes = [
    {
      'object1' : 'Apple', 'object2' : 'Dell', 'criterion' : 'design', 'gt' : 0.5, 'lt' : 0.5, 'indiff' : 0.0
    },
    {
      'object1' : 'Apple', 'object2' : 'Dell', 'criterion' : 'performance', 'gt' : 1.0, 'lt' : 0.0, 'indiff' : 0.0
    },
    {
      'object1' : 'Apple', 'object2' : 'HP', 'criterion' : 'design', 'gt' : 0.8, 'lt' : 0.2, 'indiff' : 0.0
    }
  ];

  var dict = {}, pos = [], pos2 = [];

  for(var g = 0; g < combination.length; g++) {
    for(var h = 0; h < knownRes.length; h++) {
      if(combination[g].object1 == knownRes[h].object1 &&
        combination[g].object2 == knownRes[h].object2 &&
        combination[g].criterion == knownRes[h].criterion) {
          pos.push(g);
          pos2.push(h);
        }
      }
    }

    console.log("--------- Ranks of objects based on Probabilistic distribution ----------");
    console.log("Objects: "); for(var u = 0; u < objects.length; u++) console.log(objects[u]);
    console.log("\nCriteria: "); for(var v = 0; v < criteria.length; v++) console.log(criteria[v]);
    console.log("------------------------------------");
    console.log("Total number of Possible World = " + baseN.length+"\n");
    console.log("--------------------- "+knownRes.length+" Inputs provided---------------------------");
    var kr = knownRes.length - 1;//for(var kr = 0; kr < knownRes.length; kr++)
    console.log(knownRes[kr].object1+", "+knownRes[kr].object2+", "+
    knownRes[kr].criterion+", "+knownRes[kr].gt+", "+knownRes[kr].indiff+", "+knownRes[kr].lt + "\n");
    //console.log("------------------------------------\n");
    var counter = {'undefined' : 0, 'Apple' : 0, 'Dell' : 0, 'HP' : 0, 'Toshiba' : 0};
    var zeroWorldCount = 0,
    longStr = "",
    fileName = ""+objects.toString()+","+criteria.toString()+"",
    divi = (math.pow(3, knownRes.length)) / (baseN.length),
    key = "", prob = 1.0;

    // loop through all the possible worlds
    var subWorldLength = math.round(baseN.length),
    oldRankFile, oldFileName = 'ranks_'+(startIndex - 1)+".json";


    // now read data from the combined pareto-Optimal objects list inside the 'data' folder
    console.log("** Reading " + fName + " ***");
    var tmpCntr = 0, zeroWorldCount = 0;
    var lineReader = readline.createInterface({
      input: fs.createReadStream(fName)
    });

    var startTime = new Date().getTime();

    lineReader.on('line', function (line) {

      var isWorldProbZero = false;

      var splitted = line.split("->");
      var combinatn = splitted[0], pObjStr = splitted[1];

      // Combination part
      var c = combinatn ? combinatn.split(",") : [];
      key = "";
      prob = 1.0;

      for(var al = 0; al < c.length; al++) {

        // multiply the probability of only known results
        var index = pos.indexOf(al);
        if(index > -1) {
          key += (c[al] +":");
          prob *= knownRes[pos2[index]][c[al]];
          if(knownRes[pos2[index]][c[al]] <= 0) {
            isWorldProbZero = true;
            zeroWorldCount++;
            break;
          }
        }
      }

      if(!isWorldProbZero) {
        // Pareto-Optimal part
        var pObjs = [];
        if(pObjStr) pObjs = pObjStr.split(",");

        // find the probability of p-optimal object
        if(!dict[key]) {
          dict[key] = {'undefined' : 0.0};
          for(var t = 0; t < objects.length; t++) dict[key][objects[t]] = 0.0;
        }

        for(var m = 0; m < pObjs.length; m++) {
          dict[key][pObjs[m]] += (math.exp(math.log(prob) + math.log(divi))); // or alternatively, (prob * divi);
          counter[pObjs[m]] += 1;
        }

        if(pObjs.length == 0) {
          dict[key].undefined += (math.exp(math.log(prob) + math.log(divi))); // or alternatively, (prob * divi);
          counter['undefined'] += 1;
        }

        count++;
        tmpCntr++;

        if(false && checkForZeroProbInInputs(knownRes)) {
          var wstream = fs.createWriteStream("data/newdata"+knownRes.length+".dat", {'flags': 'a', 'encoding': null, 'mode': 0666});
          wstream.write(line + "\n");
          wstream.end();
        }

        if(tmpCntr % 10022040 == 0){
          var endTime = new Date().getTime();
          console.log("--------------- Working: " + ((endTime - startTime) / 1000) + " secs -----------");
        }
      }
      // if(tmpCntr == 238022040)

    });

    // detect the end of line reader
    lineReader.on('close', function () {

      console.log('Read entire file.');
      if(startIndex > 0) {
        var oFileName = 'ranks_'+(startIndex - 1)+".json";
        oldRankFile = fs.readFileSync(oFileName);
        var oldDict;
        if(oldRankFile){
          try{
            oldDict = JSON.parse(oldRankFile);
            dict = mergeObject(dict, oldDict);
            fs.unlink(oFileName, function(err){});
          } catch(e){
            console.log("Invalid JSON file :(");
          }
        } else
        console.log("Looks like something tampered with the file and now its empty :(");
      }

      var wstrm = fs.createWriteStream("ranks_" + startIndex + ".json");
      wstrm.write("Something not necessary");
      wstrm.end();

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

      var tmprank = "";
      for(var ey in ranks) {
        tmprank += ("'" + ey + "': " + "'" + math.round(ranks[ey], 4) + "', ");
      }
      tmprank = tmprank.substring(0, tmprank.length - 1);
      console.log("\n" + tmprank + "\n");
      console.log("number of data: " + tmpCntr);
      console.log("number of zero world: " + zeroWorldCount);
    });
  }

  module.exports = GreedyArrayFile;
