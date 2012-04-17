load("util.js");
load("peg.js");

var options = new OptionSet("option(s)");
var disassemble = options.register(new Option("disassemble", "d", false, "disassemble"));

if (arguments.length === 0) {
  printUsage();
  quit();
}

function printUsage() {
  print("avm: [option(s)] file");
//  options.trace(new IndentingWriter());
}

var file = arguments[arguments.length - 1];
options.parse(arguments.slice(0, arguments.length - 1));

if (help.value) {
  printUsage();
  quit();
}

const IDENTIFIER = 0;


var parser = P.buildParser(snarf("jc.peg", "text"));

var ast = parser.parse(snarf(file, "text"));


// print (parser.toSource());

print (JSON.stringify(ast));
