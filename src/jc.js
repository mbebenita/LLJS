load("util.js");
load("peg.js");
load("compiler.js");
load("memory.js");

var options = new OptionSet("option(s)");

if (arguments.length === 0) {
  printUsage();
  quit();
}

function printUsage() {
  print("avm: [option(s)] file");
}

var file = arguments[arguments.length - 1];
options.parse(arguments.slice(0, arguments.length - 1));

var generateParser = options.register(new Option("p", "p", false, "Generate Parser"));

var execute = options.register(new Option("x", "x", false, "Execute"));
var output = options.register(new Option("o", "o", false, "Output"));

if (help.value) {
  printUsage();
  quit();
}

var file = arguments[arguments.length - 1];
options.parse(arguments.slice(0, arguments.length - 1));


if (generateParser.value) {
  var parser = P.buildParser(snarf("jc.peg", "text"), { trackLineAndColumn: true});
  print("var parser = " + parser.toSource() + ";");
  if (!execute.value) {
    quit();
  }
} else {
  load("parser.js");
}



var source = snarf(file, "text");

var code = compile(source, false);

if (output.value) {
  print ("load(\"memory.js\");");
  print (code);
}
if (execute.value) {

}

/*
var fn = new Function (com);
var o = fn();


var start = new Date();
function time (fn) {
  var start = new Date();
  fn();
  return new Date() - start;
}
var mTotal = 0, fTotal = 0;
var sum = 0;
for (var i = 0; i < 1000; i++) {
  var ptrs = new Uint32Array(10000);
  mTotal += time(function () {
    for (var j = 0; j < 10000; j++) {
      ptrs[j] = malloc(32);
      // print(ptrs[j]);
    }
  });

  fTotal += time(function () {
    for (var j = 0; j < 10000; j++) {
      // sum += (U4[ptrs[j] - 8 + 4 >> 2]);
      free(ptrs[j]);
    }
  });
}

print("Malloc: " + mTotal + ", Free: " + fTotal);
print("Done in " + (new Date() - start) + " checksum: " + sum);
*/
