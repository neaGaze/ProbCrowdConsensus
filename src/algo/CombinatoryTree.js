var Node = require("tree-node"),
util = require('util'),
EventEmitter = require('events').EventEmitter;

function CombinatoryTree(data){
  EventEmitter.call(this);
  this.data = data || {};
}


util.inherits(CombinatoryTree, EventEmitter);

Node.prototype._data = this.data;

/*
CombinatoryTree.prototype.appendChild = function(child){
  Node.prototype.appendChild.call(this, child);
}

CombinatoryTree.prototype.getChild = function(childId){
  Node.prototype.getChild.call(this, childId);
}
*/

module.exports = CombinatoryTree;
