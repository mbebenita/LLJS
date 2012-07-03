var root = newGlobal("new-compartment");
var dbg = new Debugger(root);

dbg.onDebuggerStatement = function(frame) {
  // print("debugger_offset: " + frame.offset);
  // print("debugger_line_number: " + frame.script.getOffsetLine(11));
  // print("caller: " + frame.callee.name);
  // print("caller_url: " + frame.older.script.url);
  // print("caller_line_number: " + frame.older.script.getOffsetLine(frame.older.offset));
};


var file = "test-memcheck.js";
var test_script = read(file);
root.eval(test_script);

