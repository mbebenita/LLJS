(function (exports) {

  // Extend as needed.
  var lang = exports.lang = {
    Node: {
    },

    Program: {
      extends: "Node",
      fields:  ["@body"]
    },

    Statement: {
      extends: "Node"
    },

    EmptyStatement: {
      extends: "Statement"
    },

    BlockStatement: {
      extends: "Statement",
      fields:  ["@body"]
    },

    ExpressionStatement: {
      extends: "Statement",
      fields:  ["@expression"]
    },

    IfStatement: {
      extends: "Statement",
      fields:  ["@test", "@consequent", "@alternate"]
    },

    LabeledStatement: {
      extends: "Statement",
      fields:  ["@label", "@body"]
    },

    BreakStatement: {
      extends: "Statement",
      fields:  ["@label"]
    },

    ContinueStatement: {
      extends: "Statement",
      fields:  ["@label"]
    },

    WithStatement: {
      extends: "Statement",
      fields:  ["@object", "@body"]
    },

    SwitchStatement: {
      extends: "Statement",
      fields:  ["@discriminant", "@cases", "lexical"],
    },

    ReturnStatement: {
      extends: "Statement",
      fields:  ["@argument"]
    },

    ThrowStatement: {
      extends: "Statement",
      fields:  ["@argument"]
    },

    TryStatement: {
      extends: "Statement",
      fields:  ["@block", "@handlers", "@finalizer"]
    },

    WhileStatement: {
      extends: "Statement",
      fields:  ["@test", "@body"]
    },

    DoWhileStatement: {
      extends: "Statement",
      fields:  ["@body", "@test"]
    },

    ForStatement: {
      extends: "Statement",
      fields:  ["@init", "@test", "@update", "@body"]
    },

    ForInStatement: {
      extends: "Statement",
      fields:  ["@left", "@right", "@body", "each"]
    },

    LetStatement: {
      extends: "Statement",
      fields:  ["@head", "@body"]
    },

    DebuggerStatement: {
      extends: "Statement"
    },

    Declaration: {
      extends: "Statement"
    },

    FunctionDeclaration: {
      extends: "Declaration",
      fields:  ["@id", "@params", "@body", "@decltype", "generator", "expression"]
    },

    VariableDeclaration: {
      extends: "Declaration",
      fields:  ["kind", "@declarations"]
    },

    VariableDeclarator: {
      extends: "Node",
      fields:  ["@id", "@init", "@decltype", "@arguments"]
    },

    Expression: {
      extends: "Pattern"
    },

    ThisExpression: {
      extends: "Expression"
    },

    ArrayExpression: {
      extends: "Expression",
      fields:  ["elements"]
    },

    ObjectExpression: {
      extends: "Expression",
      fields:  ["@properties"]
    },

    Property: {
      extends: "Node",
      fields:  ["@key", "@value", "kind"],
    },

    FunctionExpression: {
      extends: "Expression",
      fields:  ["@id", "@params", "@body", "@decltype", "generator", "expression"]
    },

    SequenceExpression: {
      extends: "Expression",
      fields:  ["@expressions"]
    },

    UnaryExpression: {
      extends: "Expression",
      fields:  ["operator", "@argument", "prefix"]
    },

    BinaryExpression: {
      extends: "Expression",
      fields:  ["operator", "@left", "@right"]
    },

    AssignmentExpression: {
      extends: "Expression",
      fields:  ["@left", "operator", "@right"]
    },

    UpdateExpression: {
      extends: "Expression",
      fields:  ["operator", "@argument", "prefix"]
    },

    LogicalExpression: {
      extends: "Expression",
      fields:  ["operator", "@left", "@right"]
    },

    ConditionalExpression: {
      extends: "Expression",
      fields:  ["@test", "@consequent", "@alternate"]
    },

    NewExpression: {
      extends: "Expression",
      fields:  ["@callee", "@arguments"]
    },

    CallExpression: {
      extends: "Expression",
      fields:  ["@callee", "@arguments"]
    },

    MemberExpression: {
      extends: "Expression",
      fields:  ["@object", "@property", "computed", "kind"]
    },

    YieldExpression: {
      extends: "Expression",
      fields:  ["@argument"]
    },

    ComprehensionExpression: {
      extends: "Expression",
      fields:  ["@blocks", "@filter"]
    },

    GeneratorExpression: {
      extends: "Expression",
      fields:  ["@blocks", "@filter"]
    },

    LetExpression: {
      extends: "Expression",
      fields:  ["@head", "@body"]
    },

    Pattern: {
      extends: "Node"
    },

    ObjectPattern: {
      extends: "Pattern",
      fields:  ["@properties"]
    },

    ArrayPattern: {
      extends: "Pattern",
      fields:  ["@elements"]
    },

    SwitchCase: {
      extends: "Node",
      fields:  ["@test", "@consequent"]
    },

    CatchClause: {
      extends: "Node",
      fields:  ["@param", "@guard", "@body"]
    },

    Identifier: {
      extends: "Expression",
      fields:  ["name", "kind"]
    },

    Literal: {
      extends: "Expression",
      fields:  ["value"]
    },

    Type: {
      extends: "Node"
    },

    PointerType: {
      extends: "Type",
      fields: ["@base", "arraySize"]
    },

    StructType: {
      extends: "Type",
      fields: ["@id", "@fields", "isUnion"]
    },

    FieldDeclarator: {
      extends: "Node",
      fields: ["@id", "@decltype"]
    },

    ArrowType: {
      extends: "Type",
      fields: ["@params", "@return"]
    },

    TypeIdentifier: {
      extends: "Type",
      fields: ["name"]
    },

    TypeAliasDirective: {
      extends: "Node",
      fields: ["@original", "@alias"]
    },

    CastExpression: {
      extends: "Expression",
      fields: ["@as", "@argument"]
    }
  };

  function allFields(spec) {
    // Make the location a special last field.
    var fields = ["leadingComments", "loc"];
    while (spec) {
      if (spec.fields) {
        fields = spec.fields.concat(fields);
      }
      spec = spec.extends ? lang[spec.extends] : null;
    }
    return fields;
  };
  exports.allFields = allFields;

  function prefixUnderscore(s) {
    return "_" + s;
  }

  function ensureConstructor(name, spec) {
    if (!exports[name]) {
      // Make a new constructor if it doesn't exist yet.
      var fields = allFields(spec);
      var children = [];
      var body = ["this.type = \"" + name + "\";"];
      for (var i = 0, j = fields.length; i < j; i++) {
        var fname = fields[i];
        if (fname.charAt(0) === "@") {
          fields[i] = fname = fname.substr(1);
          children.push(fname);
        }
        body.push("this." + fname + " = _" + fname + ";");
      }
      // Prefix parameter names with underscores so keywords work.
      var node = new Function(fields.map(prefixUnderscore), body.join("\n"));

      // Hook up the prototypes.
      if (spec.extends) {
        var pnode = ensureConstructor(spec.extends, lang[spec.extends]);
        node.prototype = Object.create(pnode.prototype);
      }

      Object.defineProperty(node.prototype, "_children",
                            { value: children,
                              writable: true,
                              configurable: true,
                              enumerable: false });

      exports[name] = node;
    }
    return exports[name];
  }

  // Build constructors out of the language spec.
  for (var name in lang) {
    ensureConstructor(name, lang[name]);
  }

  // Make a walk function (map and replace) named |name|. By default it
  // walks the ASexports bottom-up. If different behavior is needed for different
  // nodes, override the walk function explicitly on those nodes.
  //
  // Returning null means "delete this null". Any other falsey values means
  // identity.
  exports.makePass = function makePass(name, prop) {
    return function (o) {
      var trans, arr;
      var child, children = this._children;
      for (var i = 0, j = children.length; i < j; i++) {
        if (!(child = this[children[i]])) {
          continue;
        }

        if (child instanceof Array) {
          arr = this[children[i]] = [];
          for (var k = 0, l = child.length; k < l; k++) {
            if (typeof child[k][name] === "function") {
              trans = child[k][name](o);
              if (trans !== null) {
                arr.push(trans);
              }
            }
          }
        } else if (typeof child[name] === "function") {
          trans = child[name](o);
          if (trans === null) {
            this[children[i]] = undefined;
          } else {
            this[children[i]] = trans;
          }
        }
      }

      if (typeof this[prop] === "function") {
        if (o.logger && typeof this.loc !== "undefined") {
          o.logger.push(this);
          trans = this[prop](o);
          o.logger.pop();
        } else {
          trans = this[prop](o);
        }
        if (trans === null) {
          return null;
        }
        return trans ? trans : this;
      }

      return this;
    };
  };

  exports.lift = function lift(raw) {
    if (raw instanceof Array) {
      return raw.map(function (r) {
        return lift(r);
      });
    }

    var type = raw.type;
    var Node = exports[type];
    if (!Node) {
      throw new Error("unknown node type `" + type + "'");
    }

    var node = new Node();
    node.loc = raw.loc;
    var fields = allFields(lang[type]);
    for (var i = 0, j = fields.length; i < j; i++) {
      var field;
      if (fields[i].charAt(0) === "@") {
        field = fields[i].substr(1);
        if (raw[field]) {
          node[field] = lift(raw[field]);
        }
      } else {
        field = fields[i];
        node[field] = raw[field];
      }
    }

    return node;
  };

  exports.flatten = function flatten(node) {
    if (node instanceof Array) {
      return node.map(function (n) {
        return flatten(n);
      });
    }

    var type = node.type;
    var raw = { type: type };
    var fields = allFields(lang[type]);
    for (var i = 0, j = fields.length; i < j; i++) {
      var field;
      if (fields[i].charAt(0) === "@") {
        field = fields[i].substr(1);
        if (node[field]) {
          raw[field] = flatten(node[field]);
        } else {
          raw[field] = null;
        }
      } else {
        field = fields[i];
        raw[field] = node[field];
      }
    }

    return raw;
  };

})(typeof exports === "undefined" ? (estransform = {}) : exports);
