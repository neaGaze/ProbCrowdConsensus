var util = require('util'),
nconf = require('nconf'),
math = require('mathjs'),
http = require('http'),
bodyParser = require('body-parser'),
fs = require('fs'),
mongoose = require('mongoose'),
CrowdConsensus = require("../db/CrowdConsensus.js"),
CrowdReply = require("../db/CrowdReply.js"),
Combination = require("../algo/Combination.js"),
express = require('express'),
child_process = require('child_process'),
schema = require("../db/Schema.js"),
CCReply = schema.CCReply,
CCModel = schema.CCModel;

nconf.argv()
.env()
.file({ file: __dirname + '/../../config.json' });

var mongodb_url = nconf.get('CROWD_CONSENSUS_MONGO_URL');
var CI_THRESHOLD = nconf.get("THRESHOLD_FOR_CI");

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

function generateSampleSize(totalPopulation) {
  var data = fs.readFileSync(__dirname+'/../../var/t-table.json', 'utf8');
  var ttable = JSON.parse(data);
  var confidenceInterval = nconf.get("CONFIDENCE_INTERVAL"),
  marginOfError = nconf.get("MARGIN_OF_ERROR");
  // assuming p = 1/3 or conservative guess
  var normalizedConfidenceLevel = math.round(((1 - confidenceInterval) / 2) * 1000) / 1000;
  console.log("Total Population: " + totalPopulation);
  var m = math.square(ttable[totalPopulation+""][normalizedConfidenceLevel+""] / marginOfError) * 0.222;
  var sample = (totalPopulation * m) / (totalPopulation - 1 + m);
  if(sample)
  sample = math.ceil(sample);
  else sample = nconf.get('NUMBER_OF_USERS_TO_ASK');
  console.log("Minimal Sample Size: " + sample+"\n");
  console.log("Confidence Level: "+confidenceInterval);
  console.log("Threshold for Margin of Error: " + marginOfError);
  return sample;
}

/**
* calculate the Confidence Interval for the probabilty of event
**/
function calculateCI(p, n) {

  var data = fs.readFileSync(__dirname+'/../../var/t-table.json', 'utf8');
  var ttable = JSON.parse(data);
  var confidenceInterval = nconf.get("CONFIDENCE_INTERVAL");
  var normalizedConfidenceLevel = math.round(((1 - confidenceInterval) / 2) * 1000) / 1000;
  var Z = ttable[n+""][normalizedConfidenceLevel+""];

  var a = p * (1 - p),
  meanError = math.sqrt(a / n.toFixed(1)),
  adjuster = Z * meanError,
  ci = [p - adjuster, p + adjuster];
  return ci;
}

/**
* Find the Confidence Interval for the probabilty of event
**/
function findConfidenceInterval(n, p_gt, p_lt, p_indiff) {
  // for gt
  ci1 = calculateCI(p_gt, n);

  // for lt
  ci2 = calculateCI(p_lt, n);

  // for lt
  ci3 = calculateCI(p_indiff, n);

  var ciList = [ci1, ci2, ci3];
  // var lowerLimit = p - Z * meanError;
  // var upperLimit = p + Z * meanError;
  return ciList;
}

function Sampler(){
  var parent_cb_id = "58ed20c122e5a90520c3a1f7";   // We use the same cb_id to sample its subset problems
  var sampObjSize = 5;  // minimum objects = 2
  var sampCritSize = 1;  // minimum criteria = 1
  var THRESHOLD = nconf.get("THRESHOLD_FOR_CI"); // threshold margin for selecting our desired confidence interval

  CrowdConsensus.getResponses(parent_cb_id, function(resp){
    var objects = [], criteria = [];

    // you need to select the sampObjSize and sampCritSize less than the actual object and criteria length
    if(sampObjSize > resp.objects.length || sampCritSize > resp.criteria.length) return;

    for(var cr = 0; cr < sampCritSize; cr++) criteria.push(resp.criteria[cr]);
    for(var ob = 0; ob < sampObjSize; ob++) objects.push(resp.objects[ob]);
    resp.responses = []; // we clear all the response because we shall calculate that based on the new objects + criteria
    // objects = ["R", "Scala","Javascript","C","Python"];
    // criteria = ["Easiness in learning"];
    // also save it
    var wstrm1 = fs.createWriteStream(__dirname + "/input/ip.json");
    wstrm1.write(JSON.stringify({"responses" : [], "objects" : objects, "criteria" : criteria}));
    wstrm1.end();

    // get the corresponding Crowd replies
    CrowdReply.getReplies(parent_cb_id, objects, criteria, function(replies) {
      var combn = new Combination(objects, criteria);
      var questionList = combn.getCombination();

      // now find the minimal sample size (assuming that for each question there will be equal number of responses)
      var popnSize = replies.length / questionList.length;

      // now find the minimal sample Size given the total Population
      var minimalSampleSize =  generateSampleSize(popnSize);

      // initialize the questionList array, associate questionList with replies
      for(var q = 0; q < questionList.length; q++) {
        questionList[q].candidates = [];
        questionList[q].sampleSize = minimalSampleSize;
        //      console.log("\n-------- "+questionList[q].object1 + "(" + questionList[q].criterion+")" + questionList[q].object2+" ----------");
        var toSpliceList = [];
        for(var a = 0; a < replies.length; a++) {
          //        console.log(""+replies[a].object1 + "(" + replies[a].criterion+") " + replies[a].object2);
          if((questionList[q].object1 == replies[a].object1 &&
            questionList[q].object2 == replies[a].object2 &&
            questionList[q].criterion == replies[a].criterion) ||
            (questionList[q].object1 == replies[a].object2 &&
              questionList[q].object2 == replies[a].object1 &&
              questionList[q].criterion == replies[a].criterion)) {

                questionList[q].candidates.push(replies[a]);

                toSpliceList.push(a);
              }
            }

            // now remove the indexed from toSpliceList in the Replies array. We do this to optimize the loop performance because
            // one reply can only be associated with one questionList
            for(var i = 0; i < toSpliceList.length; i++) {
              replies.splice(toSpliceList[i] - i, 1);
            }
          }

          // for the recording the pruned questionList
          var prunedList = [];

          // aggregate the response into a probabilistic values and also find the confidence intervals
          for(var q = 0; q < questionList.length; q++) {
            console.log("\n********** "+questionList[q].object1+" ("+questionList[q].criterion+") "+questionList[q].object2+" *******\n");
            console.log("sampleSize    :   (CI_for_>  CI_for_<  CI_for~)   ?   threshold");
            // repeat until the confidence intervals for all 3 outcomes {>,~,<} are less than THRESHOLD value
            while(questionList[q].sampleSize <= popnSize) {

              // aggregate replies
              questionList[q].lt = 0, questionList[q].gt = 0, questionList[q].indiff = 0;

              for(var b = 0; b < questionList[q].candidates.length; b++) {
                if(b == questionList[q].sampleSize) break;

                if(questionList[q].candidates[b].reply == "&lt;") questionList[q].lt++;
                if(questionList[q].candidates[b].reply == "&gt;") questionList[q].gt++;
                if(questionList[q].candidates[b].reply == "&#126;") questionList[q].indiff++;
              }

              questionList[q].lt = questionList[q].lt / questionList[q].sampleSize.toFixed(1);
              questionList[q].gt = questionList[q].gt / questionList[q].sampleSize.toFixed(1);
              questionList[q].indiff = questionList[q].indiff / questionList[q].sampleSize.toFixed(1);

              // find the confidence interval for all 3 outputs
              var ciList = findConfidenceInterval(questionList[q].sampleSize, questionList[q].gt, questionList[q].lt, questionList[q].indiff)
              var ranges = [];

                // if divisor < 30, use 0.3 as divisor because using 3 would result in big interval
                // which is not what we want for a zero interval
              var divisor = 0.3;
              if(questionList[q].sampleSize > 30) divisor = 3;
              divisor = divisor.toFixed(1);

              for(var ri = 0; ri < ciList.length; ri++) {
                // we adjust the values within [0,1]
                for(var i = 0; i < 2; i++) {
                  if(ciList[ri][i] < 0) ciList[ri][i] = 0;
                  if(ciList[ri][i] > 1) ciList[ri][i] = 1;
                }

                // if the range is 0, we can use the rule of 3 (3/n)
                // look at http://www.pmean.com/01/zeroevents.html for more details
                if((ciList[ri][1] - ciList[ri][0] == 0) && (ciList[ri][0] == 0))
                ciList[ri][1] = divisor / questionList[q].sampleSize.toFixed(2);
                //  if((ciList[ri][1] - ciList[ri][0] == 0) && (ciList[ri][0] == 1))
                //    ciList[ri][0] = 1.0 - (3.0 / questionList[q].sampleSize.toFixed(2));

                ranges.push(ciList[ri][1] - ciList[ri][0]);
                //console.log("["+ciList[ri][0] + ", " + ciList[ri][1]+"]");
              }

              console.log(questionList[q].sampleSize + "            :     (" + ranges[0].toFixed(2) +
               "       " + ranges[1].toFixed(2) + "      " + ranges[2].toFixed(2) + ")   " +
              ((ranges[0] < THRESHOLD && ranges[1] < THRESHOLD && ranges[2] < THRESHOLD) ? "<" : ">") + "   " + THRESHOLD);
              if(ranges[0] < THRESHOLD && ranges[1] < THRESHOLD && ranges[2] < THRESHOLD) break;
              questionList[q].sampleSize++;
            }
            // now find the CI of the pruning threshold too. For Eg: if we want to decide prob below 0.05 as 0,
            // find the CI of 0.05 too
            var pruningThres = nconf.get("PRUNING_THRESHOLD"),
            pruningCI = calculateCI(pruningThres, questionList[q].sampleSize);
            if(pruningCI[1] > 1) pruningCI[1] = 1; // to make sure that it doesn't go beyond 1
            if(pruningCI[1] <= 0) pruningCI[1] = divisor / questionList[q].sampleSize.toFixed(2);
            var pruneRange = pruningCI[1] - 0; // 0 because we assume the lower limit will always be zero for small prob

            console.log("\n Accepted CI:");
            console.log("-------------------------------------");
            console.log("sign       CI              prune(upperLimit <= "+pruneRange.toFixed(2)+" and lowerLimit <= 0)?");
            console.log(">        ["+ciList[0][0].toFixed(2)+", "+ciList[0][1].toFixed(2)+"]        " + ((ciList[0][0] == 0 && ranges[0] <= pruneRange) ? true : false));
            console.log("~        ["+ciList[1][0].toFixed(2)+", "+ciList[1][1].toFixed(2)+"]        " + ((ciList[1][0] == 0 && ranges[1] <= pruneRange) ? true : false));
            console.log("<        ["+ciList[2][0].toFixed(2)+", "+ciList[2][1].toFixed(2)+"]        " + ((ciList[2][0] == 0 && ranges[2] <= pruneRange) ? true : false));
            console.log("-------------------------------------");

            // also add the pruned ones in the list
            var pruneCount = 0;
            if(ciList[0][0] == 0 && ranges[0] <= pruneRange) pruneCount++;
            if(ciList[1][0] == 0 && ranges[1] <= pruneRange) pruneCount++;
            if(ciList[2][0] == 0 && ranges[2] <= pruneRange) pruneCount++;
            prunedList.push(pruneCount);
          }

          // sort the prunedList in descending order and calculate the total number of possible worlds
          prunedList.sort(function(a,b){b-a});
          var numQues = questionList.length;
          var multipliend =  math.pow(3, numQues);
          var curVal = 0;
          for(var p = 0; p < prunedList.length; p++) {
            curVal += prunedList[p] * (multipliend / 3);
            multipliend = math.pow(3, numQues) - curVal;
          }
          console.log("Calculated Zero worlds : "+curVal);
          console.log("  worlds : "+curVal);

          // write inputs into file
          var inputFileName = "/input/"+sampObjSize+"o"+sampCritSize+"c"+".json";
          var ws1 = fs.createWriteStream(__dirname + inputFileName);
          ws1.write(JSON.stringify(questionList));
          ws1.end();

          ws1.on('finish', function(){
            console.log("Input writtern successfully")
            // now call the algorithm
            var totalWorld = math.pow(3, questionList.length);
            var chunkSize = totalWorld, iter = 1;
            while(chunkSize > 600000) {
              chunkSize = chunkSize / 10;
              chunkSize = chunkSize >> 0;  // convert into integer
              iter *= 10;
            }

            var ls = child_process.spawn(__dirname+"/./expe_run.sh", [totalWorld, chunkSize, iter, inputFileName], {shell : true});
            ls.stdout.on('data', function (data) {
              console.log('stdout: '+data);
            });

            ls.stderr.on('data', function (data) {
              console.log('stderr: ' + data);
            });

            ls.on('close', function(code) {
              console.log('child process exited with code ' + code);
            });
          });
        });

      });
    }

    Sampler();

    // at the base level
    app.get('/', function (req, res) {
      console.log('Welcome to CrowdConsensus-II with Probability');
      res.status(200).send('Welcome to CrowdConsensus-II with Probability!\n');
    });

    app.listen(3004, function(){
      console.log("Server listening on port 3004...");
    });
