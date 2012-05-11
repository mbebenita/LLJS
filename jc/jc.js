load("util.js");
var options = new OptionSet("option(s)");
var help = options.register(new Option("help", "h", false, "Print compiler options."));
// var output = options.register(new Option("o", "o", false, "Output file name."));

load("esprima.js");
load("escodegen.js");
load("compiler.js");

function printUsage() {
  print("*JS Compiler: [option(s)] file");
  options.trace(new IndentingWriter());
}

if (arguments.length > 0) {
  options.parse(arguments.slice(0, arguments.length - 1));
}

if (arguments.length === 0 || help.value) {
  printUsage();
  quit();
}

var file = arguments[arguments.length - 1];
var source = snarf(file);

var node = esprima.parse(source, {loc: true});
var name = file.substr(0, file.lastIndexOf('.')) || file;

node = compile(node, name);
print (escodegen.generate(node, {base: "", indent: "  "}));
