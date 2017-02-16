function CrowdCnsusModule(rawtext){
  var slices = rawtext.split('$$');
  console.log('\n\nslices: \n' + slices.length);

  this.obj = [];
  this.criteria = [];

  if(CrowdCnsusModule.prototype.check.call(this, slices)){
    this.isValid = true;
  } else{
    this.isValid = false;
  }
};

function CrowdCnsusModule(){
  this.obj = [];
  this.criteria = [];
  this.desc = '';
  this.isValid = false;
}

/**
* A Factory Design Pattern to create an object given the JSON string
**/
var createCrowdCnsusModule = function(obj1){

  var obj = JSON.parse(obj1);
  var crowdCnsusMod = new CrowdCnsusModule();
  crowdCnsusMod.desc = obj.title;
  console.log("obje1 : " + obj1);
  for(var i = 0; i < obj.objects.length; i++)
    crowdCnsusMod.obj.push(obj.objects[i]);

  for(var j = 0; j < obj.criteria.length; j++)
    crowdCnsusMod.criteria.push(obj.criteria[j]);
  crowdCnsusMod.isValid = true;

  return crowdCnsusMod;
}

CrowdCnsusModule.prototype.check = function (slices) {
  if(slices.length != 3) return false;

  // for parsing desecription
  this.desc = slices[0];

  // for parsing objects
  var params = slices[1].split('\"');
  //console.log('param length : '+ params.length + ", " + params);
  if(params.length % 2 == 0) return false;

  for(var i = 1; i < params.length; i = i + 2){
    this.obj.push(params[i]);
  }

  // for parsing criterias
  var crtra = slices[2].split('\"');
  if(crtra.length % 2 == 0) return false;

  for(var i = 1; i < crtra.length; i = i + 2){
    this.criteria.push(crtra[i]);
  }

  return true;
};


module.exports = CrowdCnsusModule;
module.exports.createCrowdCnsusModule = createCrowdCnsusModule;
