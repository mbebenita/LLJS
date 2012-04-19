load("util.js");
load("peg.js");

var options = new OptionSet("option(s)");

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

var parser = P.buildParser(snarf("jc.peg", "text"), { trackLineAndColumn: true});

var source = snarf(file, "text");
var program = parser.parse(source);

// print (parser.toSource());

// print (JSON.stringify(program, null, 2));

var Type = (function () {
  function type(name, size, defaultValue) {
    this.name = name;
    this.size = size;
    this.defaultValue = defaultValue;
  };
  type.prototype.toString = function () {
    return this.name;
  };
  type.prototype.toJSON = function () {
    return this.name;
  };
  type.prototype.getSize = function () {
    if (this.size) {
      return this.size;
    }
    assert (this.fields);
    var size = 0;
    this.fields.forEach(function (field) {
      size += field.type.getSize();
    });
    this.size = size;
    return size;
  };
  type.prototype.assignableFrom = function (other) {
    if (other === types.void) {
      return true;
    }
    return this === other;
  };

  type.prototype.addField = function addField(name, type) {
    if (!this.fields) {
      this.fields = [];
      this.offset = 0;
    }
    this.fields.push({name: name, type: type, offset: this.offset});
    this.offset += type.getSize();
  };

  type.prototype.getField = function getField(name) {
    var fields = this.fields;
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].name === name) {
        return fields[i];
      }
    }
    return null;
  };
  return type;
})();

var PointerType = (function () {
  function pointerType(type) {
    this.type = type;
    if (type instanceof pointerType) {
      this.base = type.base;
      this.pointers = type.pointers + 1;
    } else {
      this.base = type;
      this.pointers = 0;
    }
  };
  function stars(n) {
    var str = "";
    while (n--) {
      str += "*";
    }
    return str;
  }
  pointerType.prototype.toString = function () {
    return this.base + stars(this.pointers + 1);
  };
  pointerType.prototype.toJSON = function () {
    return this.base + stars(this.pointers + 1);
  };
  pointerType.prototype.getSize = function () {
    return 4;
  };
  pointerType.prototype.assignableFrom = function (other) {
    if (other === types.void) {
      return true;
    }
    return other instanceof PointerType && this.base.assignableFrom(other.base) && this.pointers === other.pointers;
  };
  return pointerType;
})();


function walk(node, match, options) {
  assert (node);
  var nodes = node;
  if (typeof nodes.length === "undefined") {
    nodes = [nodes];
  }
  for (var i = 0; i < nodes.length; i++) {
    node = nodes[i];
    if (node.tag in match) {
      // print (node.tag + " " + (options && Object.keys(options)));
      match[node.tag].call(node, options);
    }
  }
}

function walkExpression(node, match, options) {
  if (node === null) {
    node = {tag: "Void"};
  } else if (node === undefined) {
    node = {tag: "Void"};
  }
  assert (node.tag in match, "Tag " + node.tag + " not implemented.");
  return match[node.tag].call(node, options);
}

var types = {
  int: new Type("int", 4, 0),
  void: new Type("void", undefined, 0)
};

function createType(node) {
  assert (node.tag === "Type", "Invalid node type : " + node.tag);
  assert (node.name in types, "Type " + node.name + " is not defined.");
  var type = types[node.name];
  var pointers = node.pointers;
  while(pointers--) {
    type = new PointerType(type);
  }
  return type;
}

function getType(name) {
  assert (name in types);
  assert (types[name]);
  return types[name];
}

(function gatherStructs(program) {
  walk(program.elements, {
    Struct: function Struct() {
      assert (!(this.name in types), "Type " + this.name + " is already defined.");
      types[this.name] = new Type(this.name);
    }
  });

  walk(program.elements, {
    Struct: function Struct() {
      var type = types[this.name];
      assert (this.elements.length);
      this.elements.forEach(function (x) {
        type.addField(x.name, createType(x.type));
      });
    }
  });
})(program);

function printError(position, message) {
  var str = "";
  if (position) {
    str = source.split("\n")[position.line - 1] + "\n";
    for (var i = 0; i < position.column - 1; i++) {
      str += " ";
    }
    str += "^ ";
  }
  print(str + message);
}

function checkTypeAssignment(node, a, b) {
  if (!a.assignableFrom(b)) {
    printError(node.position, "Unassignable types " + a + " <= " + b);
  }
}

function check(node, condition, message) {
  if (!condition) {
    printError(node.position, message);
  }
}

var Scope = (function () {
  function scope(parent) {
    this.parent = parent;
    this.symbols = {};
  }

  scope.prototype.get = function get(name) {
    var symbol = this.symbols[name];
    if (symbol) {
      return symbol;
    } else if (this.parent) {
      return this.parent.get(name);
    }
    return unexpected ("Undefined symbol " + name);
  };

  scope.prototype.add = function add(name, symbol) {
    assert (name);
    this.symbols[name] = symbol;
  };
  return scope;
})();

(function computeTypes(program) {
  var global = new Scope();
  var match = {
    Program: function Program() {
      walk(this.elements, match, {scope: global});
    },
    Struct: function () {},
    VariableStatement: function VariableStatement(o) {
      assert (o.scope);
      this.type = createType(this.type);
      walk(this.declarations, match, Object.create(o, {type: {value: this.type}}));
    },
    VariableDeclaration: function VariableDeclaration(o) {
      var type = walkExpression(this.value, match, o);
      checkTypeAssignment(this, o.type, type);
      o.scope.add(this.name, o.type);
    },
    Void: function Void() {
      return types.void;
    },
    BinaryExpression: function BinaryExpression(o) {
      var l = walkExpression(this.left, match, o);
      var r = walkExpression(this.right, match, o);
      return this.type = l;
    },
    AssignmentExpression: function AssignmentExpression(o) {
      var l = walkExpression(this.left, match, o);
      var r = walkExpression(this.right, match, o);
    },
    NumericLiteral: function NumericLiteral(o) {
      return this.type = types.int;
    },
    Function: function Function(o) {
      o = {scope: new Scope(o.scope)};
      walk(this.params, match, o);
      walk(this.elements, match, o);
    },
    Parameter: function Parameter(o) {
      this.type = createType(this.type);
      o.scope.add(this.name, this.type);
    },
    NewOperator: function () {
      return this.type = new PointerType(getType(this.constructor.name));
    },
    NullLiteral: function NullLiteral() {
      return types.void;
    },
    PropertyAccess: function PropertyAccess(o) {
      var type = walkExpression(this.base, match, o);
      if (this.name.dereference) {
        check(this, type instanceof PointerType, "Cannot dereference non pointer type.");
        check(this, type.pointers === 0, "Cannot dereference pointers to pointers type.");
        type = type.base;
      } else {
        check(this, !(type instanceof PointerType), "Cannot use . operator on pointer types.");
      }
      check(this, type.fields, "Property access on non structs is not possible.");
      var field = type.getField(this.name.name);
      check(this, field, "Field \"" + this.name.name + "\" does not exist in type " + type + ".");
      return this.type = field.type;
    },
    Variable: function Variable(o) {
      check (this, o.scope.get(this.name), "Variable " + this.name + " is not defined.");
      return this.type = o.scope.get(this.name);
    },
    ExpressionStatement: function ExpressionStatement(o) {
      return walkExpression(this.expression, match, o);
    },
    WhileStatement: function WhileStatement(o) {
      walk(this.statement, match, o);
    },
    ForStatement: function ForStatement(o) {
      o = {scope: new Scope(o.scope)};
      walk(this.initializer, match, o);
      walk(this.test, match, o);
      walk(this.counter, match, o);
      walk(this.statement, match, o);
    },
    Block: function Block(o) {
      o = {scope: new Scope(o.scope)};
      walk(this.statements, match, o);
    },
    FunctionCall: function FunctionCall(o) {
      walk(this.arguments, match, o);
    }
  };
  walk(program, match);
})(program);


print (JSON.stringify(program, null, 2));


(function compile(program) {
  var writer = new IndentingWriter();

  var Variable = (function () {
    function variable(name, type, address, isLocal) {
      assert (name && type);
      this.name = name;
      this.type = type;
      this.address = address;
      this.isLocal = isLocal;
    }
    return variable;
  })();

  var global = new Scope();

  function accessMemory(address, type, offset) {
    if (type === types.int || type instanceof PointerType) {
      return "M[" + address + " + " + offset + "]";
    }
    return notImplemented(type);
  };

  var match = {
    Program: function Program() {
      walk(this.elements, match, {scope: global});
    },
    Struct: function () {},
    VariableStatement: function VariableStatement(o) {
      assert (o.scope);
      var type = this.type;
      var str = "var " +
      this.declarations.map(function (x) {
        o.scope.add(x.name, new Variable(x.name, type, 0));
        return x.name + " = " + walkExpression(x.value, match, o);
      }).join(", ");
      if (this.inForInitializer) {
        return str;
      }
      writer.writeLn(str + ";");
    },
    VariableDeclaration: function VariableDeclaration(o) {
      return walkExpression(this.value, match, o);
    },
    Void: function Void() {
      return types.void.defaultValue;
    },
    BinaryExpression: function BinaryExpression(o) {
      var l = walkExpression(this.left, match, o);
      var r = walkExpression(this.right, match, o);
      if (this.left.type instanceof PointerType) {
        r = "(" + r + " * " + this.left.type.type.getSize() + ")";
      }
      return "(" + l + " " + this.operator + " " + r + ")";
    },
    AssignmentExpression: function AssignmentExpression(o) {
      var l = walkExpression(this.left, match, o);
      var r = walkExpression(this.right, match, o);
      return l + " " + this.operator + " " + r;
    },
    ExpressionStatement: function ExpressionStatement(o) {
      writer.writeLn(walkExpression(this.expression, match, o) + ";");
    },
    NumericLiteral: function NumericLiteral(o) {
      return this.value;
    },
    Function: function Function(o) {
      o = {scope: new Scope(o.scope)};
      walk(this.params, match, o);
      writer.enter("function " + this.name + "(" +
      this.params.map(function (x) {
        o.scope.add(x.name, new Variable(x.name, x.type, 0));
        return x.name;
      }).join(", ") + ") {");
      walk(this.elements, match, o);
      writer.leave("}");
    },
    Parameter: function Parameter(o) {
      o.scope.add(this.name, new Variable(this.name, this.type, 0));
    },
    NewOperator: function () {
      return "allocate(" + this.type.type.getSize() + ")";
    },
    NullLiteral: function NullLiteral() {
      return types.void.defaultValue;
    },
    PropertyAccess: function PropertyAccess(o) {
      var base = walkExpression(this.base, match, o);
      if (this.name.dereference) {
        var field = this.base.type.type.getField(this.name.name);
        return accessMemory(base, field.type, field.offset);
      }
      return notImplemented();
    },
    Variable: function Variable(o) {
      var v = o.scope.get(this.name);
      assert (v);
      return v.name;
    },
    WhileStatement: function WhileStatement(o) {
      writer.enter("while (" + walkExpression(this.condition, match, o) + ") {");
      walk(this.statement, match, o);
      writer.leave("}");
    },
    Block: function Block(o) {
      o = {scope: new Scope(o.scope)};
      walk(this.statements, match, o);
    },
    ReturnStatement: function ReturnStatement(o) {
      writer.writeLn("return " + walkExpression(this.value, match, o) + ";");
    },
    ForStatement: function ForStatement(o) {
      o = {scope: new Scope(o.scope), isExpression: true};
      writer.enter("for (" +
        walkExpression(this.initializer, match, o) + "; " +
        walkExpression(this.test, match, o) + "; " +
        walkExpression(this.counter, match, o) + ") {"
      );
      walk(this.statement, match, o);
      writer.leave("}");
    },
    PostfixExpression: function PostfixExpression(o) {
      return walkExpression(this.expression, match, o) + this.operator;
    },
    FunctionCall: function FunctionCall(o) {
      return this.name.name + "(" +
        this.arguments.map(function (x) {
        return walkExpression(x, match, o);
      }).join(", ") + ")";
    }
  };
  walk(program, match);
})(program);