(function (exports) {

  function assert(condition, message) {
    if (!condition) {
      error(message);
    }
  }

  function clone(obj) {
    var o = {};
    for (var key in obj) {
      o[key] = obj[key];
    }
    return o;
  }

  function quote(s) {
    return "`" + s + "'";
  }

  function paren(s) {
    return "(" + s + ")";
  }

  function unparen(s) {
    if (s[0] === "(" && s[s.length - 1] === ")") {
      return s.substring(1, s.length - 1);
    }
    return s;
  }

  var OptParser = (function () {
    function OptParser(flatspec) {
      // ['a', 'arg', default, 'help string']
      var longs = this.longs = {};
      var shorts = this.shorts = {};
      this.spec = flatspec.map(function (s) {
        var o = { name: s[1], short: s[0], default: s[2], help: s[3] };
        longs[s[1]] = shorts[s[0]] = o;
        return o;
      });
    }

    function flushLeft(s, width) {
      var str = s;
      for (var i = 0, j = width - str.length; i < j; i++) {
        str += " ";
      }
      return str;
    }

    OptParser.prototype = {
      // The regexps are lifted from node-optimist [1],
      // Copyright (c) 2010 James Halliday, MIT license.
      //
      // [1] https://github.com/substack/node-optimist
      parse: function (argv) {
        var spec = this.spec;
        var opts = {};
        var argc = argv.length;
        var finished = 0;

        for (var i = 0; i < argc; i++) {
          var arg = argv[i];
          var match;

          if (arg.charAt(0) === "-" && finished > 0) {
            error("malformed options");
            return null;
          }

          if (arg.match(/^--.+=/)) {
            match = arg.match(/^--([^=]+)=(.*)/);
            if (!this.longs[match[1]]) {
              error("unknown option --" + match[1]);
              return null;
            }
            opts[match[1]] = match[2];
          } else if (arg.match(/^--.+/)) {
            match = arg.match(/^--(.+)/);
            if (!this.longs[match[1]]) {
              error("unknown option --" + match[1]);
              return null;
            }
            if (argv[i + 1] && argv[i + 1].charAt(0) !== "-") {
              opts[match[1]] = argv[i + 1];
              i++;
            } else {
              if (!opts[match[1]]) {
                opts[match[1]] = 1;
              }
              opts[match[1]]++;
            }
          } else if (arg.match(/^-[^-]+/)) {
            var letters = arg.slice(1).split('');
            for (var j = 0, k = letters.length; j < k; j++) {
              var sspec = this.shorts[letters[j]];
              if (!sspec) {
                error("unknown option -" + letters[j]);
                return null;
              }
              if (!opts[sspec.name]) {
                opts[sspec.name] = 1;
              }
              opts[sspec.name]++;
            }
          } else {
            finished = i;
          }
        }

        for (var i = 0, j = spec.length; i < j; i++) {
          var s = spec[i];
          if (!(s.name in opts)) {
            opts[s.name] = s.default;
          }
        }

        return { options: opts, rest: argv.slice(finished) };
      },

      usage: function () {
        var spec = this.spec;
        var str = "\nOptions:\n";
        var indent = "  ";
        for (var i = 0, j = spec.length; i < j; i++) {
          var s = spec[i];
          str += indent + flushLeft("-" + s.short, 4) + flushLeft("--" + s.name, 18) + s.help + "\n";
        }
        return str;
      }
    }

    return OptParser;
  })();

  /**
   * Logger
   */

  var Logger = (function () {
    var info, warn, error;
    if (typeof console === "undefined") {
      info = warn = error = print;
    } else {
      info = console.info;
      warn = console.warn;
      error = console.error;
    }

    const black   = 0;
    const red     = 1;
    const green   = 2;
    const yellow  = 3;
    const blue    = 4;
    const magenta = 5;
    const cyan    = 6;
    const white   = 7;

    const normal  = 0;
    const bold    = 1;

    const startANSI = '\033[';
    const clearANSI = startANSI + '0m';

    function ansi(s, style, fg, bg) {
      var a = '\033[';

      var modifiers = []
      if (style) {
        modifiers.push(style);
      }
      if (fg) {
        modifiers.push("3" + fg);
      }
      if (bg) {
        modifiers.push("4" + fg);
      }
      return startANSI + modifiers.join(";") + 'm' + s + clearANSI;
    }

    function Logger(program, name, source, verbosity) {
      this.program = program;
      this.name = name;
      this.verbosity = verbosity;
      this.context = [];
      if (typeof source !== "string" && !(source instanceof String)) {
        this.source = String(source).split("\n");
      } else {
        this.source = source.split("\n");
      }
    }

    Logger.prototype = {
      push: function (node) {
        this.context.push(node);
      },

      pop: function () {
        this.context.pop();
      },

      format: function (loc, kind, kcolor, message) {
        var prefix = this.name;
        if (loc) {
          prefix += ":" + loc.start.line + ":" + loc.start.column;
        }

        var header = ansi(prefix + ": ", bold) + ansi(kind + ": ", bold, kcolor) + ansi(message, bold);

        if (loc) {
          const indent = "  ";
          var underline = "";
          var line = this.source[loc.start.line - 1];

          for (var i = 0, j = line.length; i < j; i++) {
            var c;
            if (i === loc.start.column) {
              underline += "^";
            } else if (i > loc.start.column && i <= loc.end.column - 1 &&
                       !(c = line.charAt(i)).match(/\s/)) {
              underline += "~";
            } else {
              underline += " ";
            }
          }

          return header + "\n" + indent + line + "\n" + indent + ansi(underline, bold, green);
        }

        return header;
      },

      info: function (message, loc) {
        if (this.verbosity >= 3) {
          if (!loc) {
            var node = this.context[this.context.length - 1];
            if (node) {
              loc = node.loc;
            }
          }
          info(this.format(loc, "info", undefined, message));
        }
      },

      warn: function (message, loc) {
        if (this.verbosity >= 2) {
          if (!loc) {
            var node = this.context[this.context.length - 1];
            if (node) {
              loc = node.loc;
            }
          }
          warn(this.format(loc, "warning", magenta, message));
        }
      },

      error: function (message, loc) {
        if (this.verbosity >= 1) {
          if (!loc) {
            var node = this.context[this.context.length - 1];
            if (node) {
              loc = node.loc;
            }
          }
          error(this.format(loc, "error", red, message));
        }
      }
    };

    return Logger;
  })();

  exports.OptParser = OptParser;
  exports.Logger = Logger;
  exports.assert = assert;
  exports.quote = quote;
  exports.clone = clone;

}(typeof exports === 'undefined' ? (util = {}) : exports));
