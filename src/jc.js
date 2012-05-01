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

var extern = {trace: function (x) { print(x); }};

var source = snarf(file, "text");

var com = compile(source, false);
print (com);

var o = new Function (com)();

print("RESULT: " + extern.malloc(10));