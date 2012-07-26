(function (exports) {
  var T, Types;
  if (typeof process !== "undefined") {
    T = require("./estransform.js");
    Types = require("./types.js");
  } else {
    T = estransform;
    Types = this.Types;
  }

  const CastExpression = T.CastExpression;
  const BinaryExpression = T.BinaryExpression;
  const Literal = T.Literal;
  const MemberExpression = T.MemberExpression;


  function realign(expr, lalign) {
    assert(expr.ty instanceof Types.PointerType);
    var ralign = expr.ty.base.align.size;

    if (lalign === ralign) {
      return expr;
    }

    var ratio, op;
    if (lalign < ralign) {
      ratio = ralign / lalign;
      op = "<<";
    } else {
      ratio = lalign / ralign;
      op = ">>";
    }

    return new BinaryExpression(op, expr, new Literal(log2(ratio)), expr.loc);
  }

  function alignAddress(base, byteOffset, ty) {
    var address = realign(base, ty.align.size);
    if (byteOffset !== 0) {
      assert(isAlignedTo(byteOffset, ty.align.size), "unaligned byte offset " + byteOffset +
             " for type " + quote(ty) + " with alignment " + ty.align.size);
      var offset = byteOffset / ty.align.size;
      address = new BinaryExpression("+", address, new Literal(offset), address.loc);
    }
    // Remember (coerce) the type of the address for realign, but *do not* cast.
    address.ty = new Types.PointerType(ty);
    return address;
  }

  function dereference(address, byteOffset, ty, scope, loc) {
    assert(scope);
    address = alignAddress(address, byteOffset, ty);
    var expr;
    if (ty.arraySize) {
      expr = address;
    } else {
      expr = new MemberExpression(scope.getView(ty), address, true, loc);
    }
    // Remember (coerce) the type so we can realign, but *do not* cast.
    expr.ty = ty;
    return expr;
  }


  function isInteger(x) {
    return (parseInt(x) | 0) === Number(x);
  }

  function isPowerOfTwo(x) {
    return x && ((x & (x - 1)) === 0);
  }

  function log2(x) {
    assert (isPowerOfTwo(x), "Value " + x + " is not a power of two.");
    return Math.log(x) / Math.LN2;
  }

  function div4(x) {
    assert (x % 4 === 0, "Value " + x + " is not divisible by four.");
    return x / 4;
  }

  function isAlignedTo(offset, alignment) {
    return offset & ~(alignment - 1);
  }

  function alignTo(offset, alignment) {
    return (offset + (alignment - 1)) & ~(alignment - 1);
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function clone(obj) {
    var o = {};
    for (var key in obj) {
      o[key] = obj[key];
    }
    return o;
  }

  function extend(old, props) {
    var newObj = Object.create(old);
    if (props) {
      for (var key in props) {
        newObj[key] = props[key];
      }
    }
    return newObj;
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

  function cast(node, ty, force) {
    if ((node.ty || force) && node.ty !== ty) {
      node = new CastExpression(undefined, node, node.loc);
      node.force = force;
    }
    node.ty = ty;
    return node;
  }

  var OptParser = (function () {
    function OptParser(flatspec) {
      // ['a', 'arg', default, 'help string']
      var longs = this.longs = {};
      var shorts = this.shorts = {};
      this.spec = flatspec.map(function (s) {
        var o = { name: s[1], short: s[0], default: s[2], help: s[3] };
        if (s[1]) {
          longs[s[1]] = o;
        }
        if (s[0]) {
          shorts[s[0]] = o;
        }
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
      // Count options whose default value is a number, and swallow up
      // following argument of options whose default value is a
      // string.
      //
      // The regexps are lifted from node-optimist [1],
      // Copyright (c) 2010 James Halliday, MIT license.
      //
      // [1] https://github.com/substack/node-optimist
      parse: function (argv) {
        var error = (typeof console === "undefined") ? print : console.error;
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
            var lspec = this.longs[match[1]];
            if (typeof lspec.default === "number") {
              if (!opts[match[1]]) {
                opts[match[1]] = 1;
              } else {
                opts[mathc[1]]++;
              }
            } else if (typeof lspec.default === "string" &&
                     (argv[i + 1] && argv[i + 1].charAt(0) !== "-")) {
              opts[match[1]] = argv[i + 1];
              i++;
            } else {
              opts[match[1]] = true;
            }
          } else if (arg.match(/^-[^-]+/)) {
            var sspec;
            match = arg.match(/^-(.+)/);
            if (sspec = this.shorts[match[1]]) {
              var optname = sspec.name ? sspec.name : match[1];

              if (typeof sspec.default === "number") {
                if (!opts[optname]) {
                  opts[optname] = 1;
                } else {
                  opts[optname]++;
                }
              } else if (typeof sspec.default === "string" &&
                         (argv[i + 1] && argv[i + 1].charAt(0) !== "-")) {
                opts[optname] = argv[i + 1];
                i++;
              } else {
                opts[optname] = true;
              }
            } else {
              var letters = arg.slice(1).split('');
              for (var j = 0, k = letters.length; j < k; j++) {
                var sspec = this.shorts[letters[j]];
                if (!sspec) {
                  error("unknown option -" + letters[j]);
                  return null;
                }
                if (typeof sspec.default === "number") {
                  if (!opts[sspec.name]) {
                    opts[sspec.name] = 1;
                  } else {
                    opts[sspec.name]++;
                  }
                } else {
                  opts[sspec.name] = true;
                }
              }
            }
          }
        }

        finished = i - 1;

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
          str += indent;
          if (s.name) {
            str += flushLeft("-" + s.short, 4) + flushLeft("--" + s.name, 18);
          } else {
            str += flushLeft("-" + s.short, 22);
          }
          str += s.help + "\n";
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

    function Logger(program, name, source, options) {
      this.id = 1;
      this.program = program;
      this.name = name;
      this.options = options;
      this.verbosity = options.trace ? 3 : (options.warn ? 2 : 1);
      this.buffer = [];
      this.context = [];
      if (typeof source !== "string" && !(source instanceof String)) {
        this.source = String(source).split("\n");
      } else {
        this.source = source.split("\n");
      }
    }

    function compareLocations(a, b) {
      var cmp = a.start.line - b.start.line;
      if (cmp === 0) {
        cmp = a.end.line - b.end.line;
        if (cmp === 0) {
          cmp = a.start.column - b.start.column;
          if (cmp === 0) {
            cmp = a.end.column - b.end.column;
          }
        }
      }
      return cmp;
    }

    const severity = { info: 1, warn: 2, error: 3 };

    Logger.prototype = {
      push: function (node) {
        this.context.push(node);
      },

      pop: function () {
        this.context.pop();
      },

      _format: function (prefix, kind, message) {
        if (this.options["simple-log"]) {
          return prefix + " " + kind + " " + message;
        }

        switch (kind) {
        case "info":
          kind = ansi("info:", bold);
          break;
        case "warn":
          kind = ansi("warning:", bold, magenta);
          break;
        case "error":
          kind = ansi("error:", bold, red);
          break;
        }

        return ansi(prefix, bold) + " " + kind + " " + ansi(message, bold);
      },

      _underlinedSnippet: function (loc) {
        const indent = "  ";
        var underline = "";
        var line = this.source[loc.start.line - 1];

        for (var i = 0, j = line.length; i < j; i++) {
          var c;
          if (i === loc.start.column) {
            underline += "^";
          } else if (loc.end.line > loc.start.line ||
                     (i > loc.start.column && i <= loc.end.column - 1 &&
                      !(c = line.charAt(i)).match(/\s/))) {
            underline += "~";
          } else {
            underline += " ";
          }
        }

        return indent + line + "\n" + indent + ansi(underline, bold, green);
      },

      _bufferMessage: function (kind, message, loc) {
        if (!loc) {
          var node = this.context[this.context.length - 1];
          if (node && node.loc) {
            loc = node.loc;
          }
        }
        this.buffer.push({ loc: loc, kind: kind, message: message, id: this.id++ });
      },

      info: function (message, loc) {
        if (this.verbosity >= 3) {
          this._bufferMessage("info", message, loc);
        }
      },

      warn: function (message, loc) {
        if (this.verbosity >= 2) {
          this._bufferMessage("warn", message, loc);
        }
      },

      error: function (message, loc) {
        if (this.verbosity >= 1) {
          this._bufferMessage("error", message, loc);
        }
      },

      flush: function () {
        const humanReadable = !this.options["simple-log"];

        // Sort by location. Messages without location are sorted by the order
        // in which they're added.
        var buf = this.buffer.sort(function (a, b) {
          var aloc = a.loc, bloc = b.loc;

          if (!aloc && !bloc) {
            return a.id - b.id;
          }
          if (!aloc && bloc) {
            return -1;
          }
          if (aloc && !bloc) {
            return 1;
          }

          var cmp = compareLocations(aloc, bloc);
          if (cmp === 0) {
            cmp = severity[a.kind] - severity[b.kind];
          }
          return cmp;
        });

        var prev;
        for (var i = 0, buflen = buf.length; i < buflen; i++) {
          var b = buf[i];
          var loc = b.loc;

          var prefix = this.name + ":";
          if (loc) {
            prefix += loc.start.line + ":" + loc.start.column + ":";

            if (prev && prev.loc && compareLocations(loc, prev.loc) === 0 && humanReadable) {
              var spacer = "";
              for (var j = 0, k = prefix.length; j < k; j++) {
                spacer += " ";
              }
              prefix = spacer;
            }
          }

          var formatted = this._format(prefix, b.kind, b.message);
          switch (b.kind) {
          case "info":
            info(formatted);
            break;
          case "warn":
            warn(formatted);
            break;
          case "error":
            error(formatted);
            break;
          }

          if (loc && humanReadable) {
            var next = buf[i + 1];
            if (!next || (next.loc && compareLocations(loc, next.loc) !== 0)) {
              info(this._underlinedSnippet(loc));
            }
          }

          prev = b;
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
  exports.extend = extend;
  exports.cast = cast;
  exports.isInteger = isInteger;
  exports.isPowerOfTwo = isPowerOfTwo;
  exports.log2 = log2;
  exports.div4 = div4;
  exports.isAlignedTo = isAlignedTo;
  exports.alignTo = alignTo;
  exports.dereference = dereference;
  exports.realign = realign;

}(typeof exports === 'undefined' ? (util = {}) : exports));
