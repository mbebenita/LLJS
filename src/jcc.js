load("util.js");
load("esprima.js");
load("escodegen.js");
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

var output = options.register(new Option("o", "o", false, "Output"));

if (help.value) {
  printUsage();
  quit();
}

var file = arguments[arguments.length - 1];
options.parse(arguments.slice(0, arguments.length - 1));

// print (snarf(file));

var source = snarf(file);
// var node = esprima.parse(source);
var node = esprima.parse(source);

compile(node);

print (escodegen.generate(node, {base: "", indent: "  "}));



