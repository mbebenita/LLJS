const NODE_JS = 1;
const JS_SHELL = 2;

var mode = typeof process === "undefined" ? JS_SHELL : NODE_JS;

if (mode === NODE_JS) {
  var fs = require('fs');
  snarf = fs.readFileSync;
  print = console.log;
  arguments = process.argv.slice(2);
  quit = process.exit;
}

if (mode === NODE_JS) {
  var util = require("./util.js");
  var esprima = require("./esprima.js");
  var escodegen = require("./escodegen.js");
  var compiler = require("./compiler.js");
} else if (mode === JS_SHELL) {
  load("./util.js");
  load("./esprima.js");
  load("./escodegen.js");
  load("./compiler.js");
}

var Option = util.Option;
var OptionSet = util.OptionSet;

var options = new OptionSet("option(s)");
options.register(compiler.options);
var help = options.register(new Option("help", "h", false, "Print compiler options."));

function printUsage() {
  print("*JS Compiler: [option(s)] file");
  options.trace(new util.IndentingWriter());
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

node = compiler.compile(node, name);
print (escodegen.generate(node, {base: "", indent: "  "}));
