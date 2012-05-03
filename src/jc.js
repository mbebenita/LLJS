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

var extern = {
  trace: function (x) { print(x); },
  toHex: function (x) {
    return "0x" + Number(x).toString(16);
  }
};

var source = snarf(file, "text");

print ("Compiling");
var com = compile(source, false);
print (com);

var o = new Function (com)();

var start = new Date();

var malloc = extern.malloc;
var free = extern.free;

function time (fn) {
  var start = new Date();
  fn();
  return new Date() - start;
}

var mTotal = 0, fTotal = 0;

var sum = 0;
for (var i = 0; i < 1000; i++) {
  var ptrs = [];
  mTotal += time(function () {
    for (var j = 0; j < 10000; j++) {
      ptrs[j] = malloc(4 + j % 20);
    }
  });

  fTotal += time(function () {
    for (var j = 0; j < 10000; j++) {
      sum += (U4[ptrs[j] - 8 + 4 >> 2]);
      free(ptrs[j]);
    }
  });
}

print("Malloc: " + mTotal + ", Free: " + fTotal);

print("Done in " + (new Date() - start) + " checksum: " + sum);