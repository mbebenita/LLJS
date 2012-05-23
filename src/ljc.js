(function (exports) {

  const NODE_JS = 1;
  const JS_SHELL = 2;
  const BROWSER = 3;

  var mode;
  if (typeof process !== "undefined") {
    mode = NODE_JS;
  } else if (typeof snarf !== "undefined") {
    mode = JS_SHELL;
  } else {
    mode = BROWSER;
  }

  var argv;
  if (mode === NODE_JS) {
    var util = require("./util.js");
    var esprima = require("./esprima.js");
    var escodegen = require("./escodegen.js");
    var estransform = require("./estransform.js");
    var compiler = require("./compiler.js");

    snarf = require('fs').readFileSync;
    argv = process.argv.slice(2);
    print = console.log;
    quit = process.exit;
  } else if (mode === JS_SHELL) {
    load("./util.js");
    load("./esprima.js");
    load("./escodegen.js");
    load("./estransform.js");
    load("./compiler.js");

    argv = arguments;
  }

  function cli() {
    var optparser = new util.OptParser([
      ["E", "only-parse",   false, "Only parse"],
      ["A", "emit-ast",     false, "Do not generate JS, emit AST"],
      ["P", "pretty-print", false, "Pretty-print AST instead of emitting JSON (with -A)"],
      ["b", "bare",         false, "Do not wrap in a module"],
      ["W", "warn",         true,  "Print warnings (enabled by default)"],
      ["t", "trace",        false, "Trace compiler execution"],
      ["h", "help",         false, "Print this message"]
    ]);

    var p = optparser.parse(argv);
    if (!p) {
      quit();
    }

    var options = p.options;
    var files = p.rest;

    if (!files.length || options.help) {
      print("ljc: [option(s)] file");
      print(optparser.usage());
      quit();
    }

    var filename = files[0];
    var basename = filename.substr(0, filename.lastIndexOf('.')) || filename;
    var source = snarf(filename);
    var code = compile(basename, source, options);

    // SpiderMonkey has no way to write to a file, but if we're on node we can
    // emit .js.
    if (mode === NODE_JS) {
      var suffix = options["emit-ast"] ? ".json" : ".js";
      require('fs').writeFileSync(basename + suffix, code);
    } else {
      print(code);
    }
  }

  function compile(name, source, options) {
    var logger = new util.Logger("ljc", name, source, options.trace ? 3 : (options.warn ? 2 : 1));
    try {
      var code;
      var node = esprima.parse(source, { loc: true });
      if (options["only-parse"]) {
        // TODO
        code = node;
      } else {
        node = compiler.compile(node, name, logger, options);
        if (options["emit-ast"]) {
          // TODO
          code = node;
        } else {
          code = escodegen.generate(node, { base: "", indent: "  " });
        }
      }
      return code;
    } catch (e) {
      if (e.lineNumber) {
        // Esprima error, make a loc out of it.
        var lc = { line: e.lineNumber, column: e.column };
        logger.error(e.message, { start: lc, end: lc });
        quit();
      }

      if (e.logged) {
        // Compiler error thta has already been logged, so just quit.
        quit();
      }

      throw e;
    }
  }

  exports.cli = cli;
  exports.compile = compile;

}).call(this, typeof exports === "undefined" ? (LJC = {}) : exports);
