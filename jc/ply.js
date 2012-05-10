function trace(s) {
  print(s);
}

load("util.js")
load("modules.js")
load("memory.js")

var memory = require("memory");

trace(memory.malloc(123));
