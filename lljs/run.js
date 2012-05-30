load("util.js");
load("viz.js");
load("mvm.js");

if (arguments.length == 0) {
  printUsage();
  quit();
}

function printUsage() {
  print("run: [-d | -c | -x | -v] file");
  print("    -d = Disassemble .abc file.");
}

var file = arguments[arguments.length - 1];
var options = arguments.slice(0, arguments.length - 1);

function parse(str, fn) {
  var lines = str.split("\n");
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf("->") >= 0) {
      var line = lines[i].trim(); 
      fn(line.substr(0, line.length - 1).split(" -> "));
    }
  }  
}

var graph = new Graph();
var blocks = {};

parse(snarf(file), function (edge) {
  edge.forEach(function (blockName) {
    if (!(blockName in blocks)) {
      var block = new Block();
      block.last = new Branch();
      blocks[blockName] = block;
      graph.register(block);
    }
  });
});

parse(snarf(file), 
  function (edge) {
    blocks[edge[0]].successors.push(blocks[edge[1]]);
  }
);

// graph.computePredecessors();
// graph.computeIntervals();

var writer = new IndentingWriter();
// graph.traceGraphViz(writer);

var g = new Graph();

var b = [];
for (var i = 0; i < 16; i++) {
  var block = new Block();
  block.last = new Branch();
  g.register(block);
  b.push(block);
}


function build(blocks, str) {
  str.split("|").forEach(function (tmp) {
    var src = tmp.split("-")[0];
    var dst = tmp.split("-")[1].split(",");
    blocks[src].successors = dst.map(function (i) { return blocks[i]; }); 
  });
}

build(b, "0-1|1-2,5|2-3,4|3-5|4-5|5-6|6-7,12|7-8,9|8-9,10|9-10|10-11|12-13|13-14|14-13,15|15-6");

g.traceGraphViz(writer);
g.computePredecessors();
g.computeIntervals(true);
g.traceGraphViz(writer);
