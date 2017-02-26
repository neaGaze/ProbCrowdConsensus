var util = require('util'),
math = require('mathjs'),
EventEmitter = require('events').EventEmitter;

/**
* Find the Combination of objects and criteria possible
**/
var findCombination = function(objects, criteria){

  var arr = [];
  var maxArrLength = math.combinations(objects.length, 2) * criteria.length;

  for(var k = 0; k < criteria.length; k++){
    for(var i = 0; i < objects.length; i++) {
      for(var j = 0; j < objects.length; j++){

        if(objects[i] == objects[j]) continue;

        var makeCombination = true;
        for(var l = 0; l < arr.length; l++){
          if(objects[i] == arr[l]['object2'] && objects[j] == arr[l]['object1'] && arr[l]['criterion'] == criteria[k]){
            makeCombination = false;
            break;
          }
        }

        if(!makeCombination) continue;

        arr.push({
          'object1' : objects[i],
          'object2' : objects[j],
          'criterion' : criteria[k]
        });

        if(arr.length == maxArrLength) return arr;
      }
    }
  }

  return arr;
};

function Combination(objects, criteria){
  this.arr = [];
  var self = this;

  this.arr = findCombination(objects, criteria);
};

util.inherits(Combination, EventEmitter);

Combination.prototype.getCombination = function(){
  return this.arr;
};


module.exports = Combination;
