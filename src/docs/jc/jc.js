load("util.js");
load("peg.js");
load("compiler.js");

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

if (help.value) {
  printUsage();
  quit();
}

var file = arguments[arguments.length - 1];
options.parse(arguments.slice(0, arguments.length - 1));


if (generateParser.value) {
  var parser = P.buildParser(snarf("jc.peg", "text"), { trackLineAndColumn: true});
  print("var parser = " + parser.toSource() + ";");
  quit();
} else {
  load("parser.js");
}

var source = snarf(file, "text");

print (compile(source));