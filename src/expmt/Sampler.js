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
  console.log("popn: " + totalPopulation);
  var m = math.square(ttable[totalPopulation+""][normalizedConfidenceLevel+""] / marginOfError) * 0.222;
  var sample = (totalPopulation * m) / (totalPopulation - 1 + m);
  if(sample)
  sample = math.ceil(sample);
  else sample = nconf.get('NUMBER_OF_USERS_TO_ASK');
  console.log("sample size: " + sample);
  return sample;
}

/**
* Find the Confidence Interval for the probabilty of event
**/
function findConfidenceInterval(n, p_gt, p_lt, p_indiff){
  var data = fs.readFileSync(__dirname+'/../../var/t-table.json', 'utf8');
  var ttable = JSON.parse(data);
  var confidenceInterval = nconf.get("CONFIDENCE_INTERVAL");
  var normalizedConfidenceLevel = math.round(((1 - confidenceInterval) / 2) * 1000) / 1000;
  var Z = ttable[n+""][normalizedConfidenceLevel+""];

  // for gt
  var a1 = p_gt * (1 - p_gt),
  meanError1 = math.sqrt(a1 / n.toFixed(1)),
  adjuster_1 = Z * meanError1,
  ci1 = [p_gt - adjuster_1, p_gt + adjuster_1];

  // for lt
  var a2 = p_lt * (1 - p_lt),
  meanError2 = math.sqrt(a2 / n.toFixed(1)),
  adjuster_2 = Z * meanError2,
  ci2 = [p_lt - adjuster_2, p_lt + adjuster_2];

  // for lt
  var a3 = p_indiff * (1 - p_indiff),
  meanError3 = math.sqrt(a3 / n.toFixed(1)),
  adjuster_3 = Z * meanError3,
  ci3 = [p_indiff - adjuster_3, p_indiff + adjuster_3];

  var ciList = [ci1, ci2, ci3];
  // var lowerLimit = p - Z * meanError;
  // var upperLimit = p + Z * meanError;
  return ciList;
}

function Sampler(){
  var parent_cb_id = "58a621fbb55671064acee0f1";   // We use the same cb_id to sample its subset problems
  var sampObjSize = 4;  // minimum objects = 2
  var sampCritSize = 2;  // minimum criteria = 1
  var THRESHOLD = nconf.get("THRESHOLD_FOR_CI"); // threshold margin for selecting our desired confidence interval

  CrowdConsensus.getResponses(parent_cb_id, function(resp){
    var objects = [], criteria = [];

    // you need to select the sampObjSize and sampCritSize less than the actual object and criteria length
    if(sampObjSize > resp.objects.length || sampCritSize > resp.criteria.length) return;

    for(var cr = 0; cr < sampCritSize; cr++) criteria.push(resp.criteria[cr]);
    for(var ob = 0; ob < sampObjSize; ob++) objects.push(resp.objects[ob]);
    resp.responses = []; // we clear all the response because we shall calculate that based on the new objects + criteria

    // also save it
    var wstrm1 = fs.createWriteStream(__dirname + "/input/ip.json");
    wstrm1.write(JSON.stringify(resp));
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
        console.log("\n-------- "+questionList[q].object1 + "(" + questionList[q].criterion+")" + questionList[q].object2+" ----------");
        var toSpliceList = [];
        for(var a = 0; a < replies.length; a++) {
          console.log(""+replies[a].object1 + "(" + replies[a].criterion+") " + replies[a].object2);
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

          // aggregate the response into a probabilistic values and also find the confidence intervals
          for(var q = 0; q < questionList.length; q++) {
            console.log("\n********** "+questionList[q].object1+" ("+questionList[q].criterion+") "+questionList[q].object2+" *******\n");
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
              for(var ri = 0; ri < ciList.length; ri++) {
                // we adjust the values within [0,1]
                for(var i = 0; i < 2; i++) {
                  if(ciList[ri][i] < 0) ciList[ri][i] = 0;
                  if(ciList[ri][i] > 1) ciList[ri][i] = 1;
                }

                // if the range is 0, we can use the rule of 3 (3/n)
                // look at http://www.pmean.com/01/zeroevents.html for more details
                if((ciList[ri][1] - ciList[ri][0] == 0) && (ciList[ri][0] == 0))
                  ciList[ri][1] = 3.0 / questionList[q].sampleSize.toFixed(2);
              //  if((ciList[ri][1] - ciList[ri][0] == 0) && (ciList[ri][0] == 1))
              //    ciList[ri][0] = 1.0 - (3.0 / questionList[q].sampleSize.toFixed(2));

                ranges.push(ciList[ri][1] - ciList[ri][0]);
                //console.log("["+ciList[ri][0] + ", " + ciList[ri][1]+"]");
              }

              console.log(questionList[q].sampleSize + " : " + ranges[0].toFixed(2) + ", " + ranges[1].toFixed(2) + ", " + ranges[2].toFixed(2) + " | " + THRESHOLD);
              if(ranges[0] < THRESHOLD && ranges[1] < THRESHOLD && ranges[2] < THRESHOLD) break;
              questionList[q].sampleSize++;
            }
          }

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
            while(chunkSize > 400000) {
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
