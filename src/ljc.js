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

  var util, esprima, escodegen, estransform, compiler;
  var argv;

  if (mode === NODE_JS) {
    util = require("./util.js");
    esprima = require("./esprima.js");
    escodegen = require("./escodegen.js");
    estransform = require("./estransform.js");
    compiler = require("./compiler.js");

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

    argv = this.arguments;
  }

  if (mode !== NODE_JS) {
    util = this.util;
    esprima = this.esprima;
    escodegen = this.escodegen;
    estransform = this.estransform;
    compiler = this.compiler;
  }

  const assert = util.assert;
  const lang = estransform.lang;
  const allFields = estransform.allFields;

  function pretty(node, indent) {
    if (typeof indent === "undefined") {
      indent = "";
    }

    var s = "";

    if (node instanceof Array) {
      for (var i = 0, j = node.length; i < j; i++) {
        s += pretty(node[i], indent);
      }
      return s;
    }

    s += indent + node.type;

    var spec = lang[node.type];
    if (!spec) {
      s += " ???\n";
      return;
    }

    var fields = allFields(spec);
    var children = [];
    var values = [];
    // We do loc manually.
    fields.pop();
    for (var i = 0, j = fields.length; i < j; i++) {
      var fname = fields[i];
      if (fname.charAt(0) === "@") {
        fname = fname.substr(1);
        if (node[fname]) {
          children.push(pretty(node[fname], indent + "  "));
        }
      } else {
        if (typeof node[fname] !== "undefined") {
          values.push(node[fname]);
        }
      }
    }

    if (values.length) {
      s += " '" + values.join("' '") + "'";
    }

    var loc = node.loc;
    if (loc) {
      s += (" (" + loc.start.line + ":" + loc.start.column + "-" +
            loc.end.line + ":" + loc.end.column + ")");
    }

    s += "\n" + children.join("");

    return s;
  }

  function cli() {
    var optparser = new util.OptParser([
      ["E",           "only-parse",   false, "Only parse"],
      ["A",           "emit-ast",     false, "Do not generate JS, emit AST"],
      ["P",           "pretty-print", false, "Pretty-print AST instead of emitting JSON (with -A)"],
      ["b",           "bare",         false, "Do not wrap in a module"],
      ["l",           "load-instead", false, "Emit load('memory') instead of require('memory')"],
      ["W",           "warn",         true,  "Print warnings (enabled by default)"],
      ["Wconversion",  null,          false, "Print intra-integer and pointer conversion warnings"],
      ["0",           "simple-log",   false, "Log simple messages. No colors and snippets."],
      ["t",           "trace",        false, "Trace compiler execution"],
      ["m",           "memcheck",     false, "Compile with memcheck instrumentation"],
      ["h",           "help",         false, "Print this message"]
    ]);

    var p = optparser.parse(argv);
    if (!p) {
      quit(1);
    }

    var options = p.options;
    var files = p.rest;

    print(options);

    if (!files.length || options.help) {
      print("ljc: [option(s)] file");
      print(optparser.usage());
      quit();
    }

    var filename = files[0];
    var path = filename.split("/");
    var basename = path.pop();
    var dir = path.join("/");
    basename = basename.substr(0, basename.lastIndexOf(".")) || basename;

    var source = snarf(filename);
    var code = compile(basename, filename, source, options);

    if (options["pretty-print"]) {
      print(pretty(code));
    } else {
      // SpiderMonkey has no way to write to a file, but if we're on node we can
      // emit .js.
      if (mode === NODE_JS && !options["only-parse"]) {
        var outname = (dir ? dir + "/" : "") + basename;
        if (options["emit-ast"]) {
          require('fs').writeFileSync(outname + ".json", JSON.stringify(code, null, 2));
        } else {
          // Escodegen doesn't emit a final newline for some reason, so add one.
          require('fs').writeFileSync(outname + ".js", code + "\n");
        }
      } else {
        print(code);
      }
    }
  }

  function compile(name, logName, source, options) {
    // -W anything infers -W.
    for (var p in options) {
      if (p.charAt(0) === "W") {
        options.warn = true;
        break;
      }
    }

    var logger = new util.Logger("ljc", logName, source, options);
    var code;

    try {
      var node = esprima.parse(source, { loc: true, comment: true, range: true, tokens: true });

      node = escodegen.attachComments(node, node.comments, node.tokens);

      if (options["only-parse"]) {
        code = node;
      } else {
        node = compiler.compile(node, name, logger, options);
        if (options["emit-ast"]) {
          code = node;
        } else {
          code = escodegen.generate(node, { base: "", indent: "  ", comment: true });
        }
      }
    } catch (e) {
      if (mode === BROWSER) {
        throw e;
      }

      if (e.index) {
        // Esprima error, make a loc out of it.
        var lc = { line: e.lineNumber, column: e.column - 1 };
        e.loc = { start: lc, end: lc };
        logger.error(e.message, { start: lc, end: lc });
        logger.flush();
        quit(1);
      }

      if (e.logged && mode !== BROWSER) {
        // Compiler error that has already been logged, so just flush and
        // quit.
        logger.flush();
        quit(1);
      }

      throw e;
    }

    logger.flush();
    return code;
  }

  exports.cli = cli;
  exports.compile = compile;

  if (mode === JS_SHELL) {
    cli();
  }

}).call(this, typeof exports === "undefined" ? (LJC = {}) : exports);
