var trace = options.register(new Option("t", "t", false, "Trace compiler execution."));

var Type = (function () {
  function type(name, size, defaultValue, signed) {
    this.name = name;
    this.size = size;
    this.signed = signed;
    this.defaultValue = defaultValue;
  };

  type.prototype.toString = function () {
    return this.name;
  };

  type.prototype.toJSON = function () {
    return this.name;
  };

  type.prototype.getSize = function () {
    assert (this.size);
    return this.size;
  };

  type.prototype.assignableFrom = function (other) {
    if (this === types.dyn) {
      return true;
    }
    if (this instanceof StructType || other instanceof StructType) {
      return this === other;
    }
    if (this.size !== undefined) {
      // Widening assignments are cool.
      if (other.size <= this.size) {
        return true;
      }
      // Narrowing assignments are also cool for now.
      if (other.size >= this.size) {
        return true;
      }
    }

    if (other === types.void) {
      return true;
    }

    return this === other;
  };


  return type;
})();

var StructType = (function () {
  function structType(name) {
    this.name = name;
    this.fields = [];
    this.offset = 0;
  }

  structType.prototype = Object.create(Type.prototype);

  structType.prototype.getSize = function () {
    assert (this.fields);
    /*
    var size = 0;
    this.fields.forEach(function (field) {
      size += field.type.getSize();
    });
    this.size = size;
    return size;
    */
    return this.size;
  };

  structType.prototype.addField = function addField(name, type) {
    this.fields.push({name: name, type: type, offset: this.offset});
    // TODO: Compact fields.
    this.offset += Math.max(types.word.getSize(), type.getSize());
    this.size = this.offset;
  };

  structType.prototype.getField = function getField(name) {
    var fields = this.fields;
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].name === name) {
        return fields[i];
      }
    }
    return null;
  };

  return structType;
})();

var PointerType = (function () {
  function pointerType(type) {
    this.type = type;
    this.size = 4;
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

  pointerType.prototype.defaultValue = 0;

  pointerType.prototype.toString = function () {
    if (this.name) {
      return this.name;
    }
    if (this.type instanceof FunctionType) {
      return this.name = this.type.returnType.toString() + "(*)" + "(" + this.type.parameterTypes.join(", ") + ")";
    } else {
      return this.name = this.type.toString() + "*";
    }
  };
  pointerType.prototype.toJSON = function () {
    return this.toString();
  };
  pointerType.prototype.getSize = function () {
    return 4;
  };
  pointerType.prototype.assignableFrom = function (other) {
    if (other === types.void) {
      return true;
    }
    if (other === types.null) {
      return true;
    }
    if (this.base === types.void && other instanceof PointerType) {
      return true;
    }
    if (other instanceof PointerType && other.base === types.void) {
      return true;
    }
    return other instanceof PointerType && this.base.assignableFrom(other.base) && this.pointers === other.pointers;
  };
  return pointerType;
})();

var FunctionType = (function () {
  function functionType(returnType, parameterTypes) {
    this.returnType = returnType;
    this.parameterTypes = parameterTypes;
  }
  functionType.prototype.toString = function () {
    return this.name || (this.name = this.returnType + "(" + this.parameterTypes.join(", ") + ")");
  };
  functionType.prototype.toJSON = function () {
    return this.toString();
  };
  functionType.prototype.assignableFrom = function (other) {
    if (other === types.void) {
      return true;
    }
    if (other === types.null) {
      return true;
    }
    return other instanceof FunctionType;
  };
  functionType.prototype.getSize = function () {
    return 4;
  };
  return functionType;
})();

var types = {
  u8:   new Type("u8",   1, 0, false),
  i8:   new Type("i8",   1, 0, true),
  u16:  new Type("u16",  2, 0, false),
  i16:  new Type("i16",  2, 0, true),
  u32:  new Type("u32",  4, 0, false),
  i32:  new Type("i32",  4, 0, true),
  f32:  new Type("f32",  4, 0, undefined),
  f64:  new Type("f64",  8, 0, undefined),

  num:  new Type("num",  8, 0, undefined),
  void: new Type("void", 1, 0, undefined),
  dyn:  new Type("dyn",  undefined, 0, undefined)
};

types.int = types.i32;
types.word = types.u32;
types.uint = types.u32;
types.float = types.f32;
types.double = types.f64;
types.u8Pointer = new PointerType(types.u8);
types.i32Pointer = new PointerType(types.i32);
types.u32Pointer = new PointerType(types.u32);
types.voidPointer = new PointerType(types.void);
types.wordPointer = new PointerType(types.word);

var Scope = (function () {
  function scope(parent, name, type) {
    this.name = name;
    this.parent = parent;
    this.types = {};
    this.variables = {};
    this.type = type;
    this.options = parent ? Object.create(parent.options) : {};
    this.depth = this.parent ? this.parent.depth + 1 : 0;
    if (type === "function") {
      this.options.cachedLocals = {};
      this.functionScope = this;
      this.localVariables = {};
    } else if (type === "block") {
      this.functionScope = parent.functionScope;
      assert (this.functionScope.type === "function");
    }
  }

  scope.prototype.getVariable = function getVariable(name, local) {
    var variable = this.variables[name];
    if (variable) {
      return variable;
    } else if (this.localVariables && this.localVariables[name]) {
      return this.localVariables[name];
    } else if (this.parent && !local) {
      return this.parent.getVariable(name, local);
    }
    return null;
  };

  scope.prototype.addVariable = function addVariable(variable, external) {
    assert (variable);
    assert (!variable.scope);
    variable.scope = this;
    this.variables[variable.name] = variable;
    var functionScope = this.type === "block" ? this.functionScope : this;
    if (!external) {
      variable.name = variable.name + "$" + Object.keys(functionScope.localVariables).length;
    }
    functionScope.localVariables[variable.name] = variable;
    tracer.writeLn("Added variable " + variable + " to scope " + this, INFO);
  };

  scope.prototype.getType = function getType(name, strict) {
    var type = this.types[name];
    if (type) {
      return type;
    } else if (this.parent) {
      return this.parent.getType(name, strict);
    }
    if (strict) {
      return unexpected ("Undefined type " + name);
    }
  };

  scope.prototype.addType = function addType(type) {
    assert (type);
    // print("Adding type " + type + " to scope " + this + ".");
    this.types[type.name] = type;
  };
  scope.prototype.getViewName = function getViewName(type) {
    assert (type);
    if (type instanceof StructType) {
      return type.name;
    }
    assert (type.size <= types.word.size);
    var name = (type.signed ? "I" : "U") + type.size;
    var cachedName = "$" + name;
    this.options.cachedLocals[cachedName] = name;
    return cachedName;
  };
  scope.prototype.getTempName = function getTempName(type) {
    assert (type);
    var name = "T" + (type.signed ? "I" : "U") + type.size;
    var cachedName = "$" + name;
    this.options.cachedLocals[cachedName] = null;
    return cachedName;
  };
  scope.prototype.toString = function toString() {
    return this.name;
  };

  scope.prototype.close = function close() {
    var wordOffset = 0;
    function computeOffset(x) {
      if (x.isStackAllocated) {
        x.wordOffset = wordOffset;
        wordOffset += wordAlignment(x.type.getSize()) / 4;
      }
    }

    mapObject(this.localVariables, function (k, v) {
      computeOffset(v);
    });

    this.frameSizeInWords = wordOffset;
  };

  return scope;
})();


var Frame = (function () {
  function frame() {
    this.variables = [];
    this.size = 0;
  }
  frame.prototype.add = function add (variable) {
    assert (variable instanceof Variable);
    this.variables.push(variable);
    variable.offset = this.size;
    this.size += variable.type.getSize();
  };
  return frame;
})();


function walkComputeTypes(nodes, scope, a) {
  return nodes.map(function (x) {
    assert ("computeType" in x, "Node: " + x.tag + " doesn't have a computeType function.");
    return x.computeType(scope, a);
  });
}

function walkCreateTypes(nodes, o) {
  return nodes.map(function (x) {
    assert ("createType" in x, "Node: " + x.tag + " doesn't have a createType function.");
    return x.createType(o);
  });
}

function walkGenerateCode(nodes, writer, scope) {
  return nodes.map(function (x) {
    assert ("generateCode" in x, "Node: " + x.tag + " doesn't have a generateCode function.");
    return x.generateCode(writer, scope);
  });
}

function reportError(node, message) {
  var str = "";
  var position = node.loc;

  if (position) {
    /*
     str = source.split("\n")[position.line - 1] + "\n";
     for (var i = 0; i < position.column - 1; i++) {
     str += " ";
     }
     str += "^ ";
     */
    str = "At " + position.start.line + ":" + position.start.column + ": " + node.type + ": ";
  } else {
    str = "At " + node.type + ": ";
  }

  var error = new Error(str + message);
  if (position) {
    error.lineNumber = position.start.line;
    error.column = position.start.column;
  }
  throw error;
}

function checkTypeAssignment(node, a, b, message) {
  assert (a && b);
  if (!a.assignableFrom(b)) {
    reportError(node, "Unassignable types " + a + " <= " + b + (message ? " " + message : ""));
  }
}

function check(node, condition, message) {
  if (!condition) {
    reportError(node, message);
  }
}

function createLiteral(value, type) {
  assert (value !== undefined);
  return {type: "Literal", value: value, cType: type, fixed: true};
}

function createIdentifier(name, type, fixed) {
  return {type: "Identifier", name: name, cType: type, fixed: fixed};
}

function createMember(object, property, type, computed) {
  return {
    type: "MemberExpression",
    computed: computed,
    object: object,
    property: property,
    cType: type
  };
}

function createBinary(left, operator, right, type) {
  return {
    type: "BinaryExpression",
    operator: operator,
    left: left,
    right: right,
    cType: type
  };
}


function createSequence(expressions) {
  return {
    type: "SequenceExpression",
    expressions: expressions
  };
}

/**
 * Identity node used to attach attributes to AST nodes without modifying them.
 */
function createIdentity(argument, type) {
  return {
    type: "IdentityExpression",
    argument: argument,
    cType: type
  };
}

function createCall(callee, args, type) {
  return {
    type: "CallExpression",
    callee: callee,
    arguments: args,
    cType: type,
    fixed: true
  };
}

function createAssignment(left, operator, right) {
  return {
    type: "AssignmentExpression",
    operator: operator,
    left: left,
    right: right
  };
}

function createExpressionStatement(expression) {
  return {
    type: "ExpressionStatement",
    expression: expression
  };
}

function createMemoryAccess(scope, type, address, byteOffset) {
  assert (scope);
  address = createConversion(address, new PointerType(type));
  if (byteOffset) {
    var typeSize = Math.min(type.size, types.word.size);
    assert (byteOffset % typeSize === 0, "Unaligned byte offset " + byteOffset + " for type " + quote(type) + " with size " + type.getSize());
    var offset = byteOffset / typeSize;
    if (offset) {
      address = createBinary(address, "+", createLiteral(offset, types.int), address.cType);
    }
  }
  return createMember(createIdentifier(scope.getViewName(type), new PointerType(type)), address, type, true);
}

function createConversion(value, lType) {
  assert (value);
  assert (value.cType);
  var rType = value.cType;
  if (lType === rType) {
    return value;
  }
  if (lType instanceof PointerType && rType instanceof PointerType) {
    var shift = log2(Math.min(rType.type.size, types.word.size)) -
                log2(Math.min(lType.type.size, types.word.size));
    if (shift) {
      value = createBinary(value, (shift > 0 ? "<<" : ">>"), createLiteral(Math.abs(shift), types.int), lType);
    } else {
      value = createIdentity(value, lType);
    }
  } else if (lType instanceof Type && rType instanceof Type) {
    if (lType === types.u32) {
      value = createBinary(value, ">>>", createLiteral(0, types.int), lType);
    } else if (lType === types.i32) {
      value = createBinary(value, "|", createLiteral(0, types.int), lType);
    } else if (lType === types.num) {
      // No Conversion Needed
    }
  } else if (rType === types.dyn) {
    value = createIdentity(value, lType);
  } else if (lType instanceof PointerType && rType === types.int) {
    value = createIdentity(value, lType);
  }
  return value;
}

function createDefaultValue(type) {
  return createLiteral(type.defaultValue, type);
}

function createStackPointer() {
  return createMember(createIdentifier("U4"), createLiteral(0), types.intPointer, true);
  // return createIdentifier("$SP", types.intPointer);
}

var Variable = (function () {
  function variable(name, type) {
    assert (name && type);
    this.name = name;
    this.type = type;
    this.isStackAllocated = type instanceof StructType;
  }
  variable.prototype.toString = function () {
    return "variable " + this.name + " " + this.type;
  };
  variable.prototype.generateCode = function (writer, scope) {
    if (this.type instanceof StructType) {
      return this.frameOffset();
    } else if (this.isStackAllocated) {
      return generateMemoryAccess(scope, this.getPointer(), this.type);
    }
    return this.name;
  };
  variable.prototype.getMemoryAccess = function getMemoryAccess(scope) {
    assert (this.isStackAllocated);
    return createMemoryAccess (scope, this.type, this.getAddress(scope));
  };
  variable.prototype.getAddress = function getAddress(scope) {
    assert (this.wordOffset !== undefined, "Local variable offset is not computed.");
    assert (this.isStackAllocated);
    var wordAddress = createBinary (
      createStackPointer(),
      "+",
      createLiteral(this.wordOffset, types.int),
      types.wordPointer
    );
    return createConversion(wordAddress, new PointerType(this.type));
  };
  return variable;
})();

var tracer;

function compile(node, name) {
  tracer = new IndentingWriter(!trace.value);
  if (trace.value) {
    // print (JSON.stringify(node, null, 2));
  }
  process(node, types);
  return createModule(node, name);
}

function createImports(imports, name) {
  return {
    type: "VariableDeclaration",
    kind: "const",
    declarations: imports.map(function (x) {
      return {
        type: "VariableDeclarator",
        id: {
          "type": "Identifier",
          "name": x
        },
        init: createMember(createIdentifier(name), createIdentifier(x), types.dyn, false)
      };
    })
  };
}

function createModule(program, name) {
  var body = [
    {
      "type": "VariableDeclaration",
      "declarations": [
        {
          "type": "VariableDeclarator",
          "id": {
            "type": "Identifier",
            "name": "exports"
          },
          "init": {
            "type": "ObjectExpression",
            "properties": []
          }
        }
      ],
      "kind": "var"
    }
  ];
  if (name !== "memory") {
    body.push({
      "type": "VariableDeclaration",
      "declarations": [
        {
          "type": "VariableDeclarator",
          "id": {
            "type": "Identifier",
            "name": "$M"
          },
          "init": {
            "type": "CallExpression",
            "callee": {
              "type": "Identifier",
              "name": "require"
            },
            "arguments": [
              {
                "type": "Literal",
                "value": "memory"
              }
            ]
          }
        }
      ],
      "kind": "const"
    });
    body.push(createImports(["I1", "U1", "I2", "U2", "I4", "U4", "malloc", "free"], "$M"));
  }
  body = body.concat(program.body);

  body = body.concat({
    "type": "ReturnStatement",
    "argument": {
      "type": "Identifier",
      "name": "exports"
    }
  });

  return {
    "type": "Program",
    "body": [
      {
        "type": "ExpressionStatement",
        "expression":{
          "type": "AssignmentExpression",
          "operator": "=",
          "left": createMember(createIdentifier("modules"), createIdentifier(name), types.dyn, false),
          "right": {
            "type": "FunctionExpression",
            "id": null,
            "params": [],
            "body": {
              "type": "BlockStatement",
              "body": body
            }
          }
        }
      }
    ]
  };
}

function isIdentifier(node) {
  assert (node);
  return node.type === "Identifier";
}

var binaryOperators = {
  "+":   {name: "+", computeType: function (l, r) { return types.dyn; }},
  "-":   {name: "-", computeType: function (l, r) { return types.dyn; }},
  "*":   {name: "*", computeType: function (l, r) { return types.dyn; }},
  "/":   {name: "/", computeType: function (l, r) { return types.dyn; }},
  "&":   {name: "&", computeType: function (l, r) { return types.int; }},
  "<<":  {name: "<<", computeType: function (l, r) { return types.int; }},
  ">>":  {name: ">>", computeType: function (l, r) { return types.int; }},
  ">>>": {name: ">>>", computeType: function (l, r) { return types.uint; }},
  "|":   {name: "|", computeType: function (l, r) { return types.int; }},
  "^":   {name: "^", computeType: function (l, r) { return types.int; }},
  "&":   {name: "&", computeType: function (l, r) { return types.int; }}
};

var assignmentOperators = {
  "+=":   binaryOperators["+"],
  "-=":   binaryOperators["-"],
  "*=":   binaryOperators["*"],
  "/=":   binaryOperators["/"],
  "&=":   binaryOperators["&"],
  "<<=":  binaryOperators["<<"],
  ">>=":  binaryOperators[">>"],
  ">>>=": binaryOperators[">>>"],
  "|=":   binaryOperators["|"],
  "^=":   binaryOperators["^"],
  "&=":   binaryOperators["&"]
};

function process(node, types) {

  function TypeName(scope) {
    var type = scope.getType(this.typeSpecifier, true);
    if (this.pointer) {
      for (var i = 0; i < this.pointer.count; i++) {
        type = new PointerType(type);
      }
    }
    return type;
  }

  var scanFunctions = {
    Program: function Program() {
      var scope = this.scope = new Scope(null, "Program", "function");
      scope.addVariable(new Variable("exports", types.dyn), true);
      scope.addVariable(new Variable("require", types.dyn), true);
      scope.addVariable(new Variable("timer", types.dyn), true);
      scope.addVariable(new Variable("trace", types.dyn), true);
      scope.addVariable(new Variable("NULL", types.voidPointer), true);
      scope.addVariable(new Variable("load", new FunctionType(types.dyn, [types.dyn])), true);
      scope.addVariable(new Variable("malloc", new FunctionType(types.voidPointer, [types.int])), true);
      scope.addVariable(new Variable("free", new FunctionType(types.voidPointer, [types.voidPointer])), true);

      scope.addVariable(new Variable("ArrayBuffer", types.dyn), true);
      scope.addVariable(new Variable("Uint8Array", types.dyn), true);
      scope.addVariable(new Variable("Int8Array", types.dyn), true);
      scope.addVariable(new Variable("Uint16Array", types.dyn), true);
      scope.addVariable(new Variable("Int16Array", types.dyn), true);
      scope.addVariable(new Variable("Uint32Array", types.dyn), true);
      scope.addVariable(new Variable("Int32Array", types.dyn), true);
      scope.addVariable(new Variable("Float32Array", types.dyn), true);
      scope.addVariable(new Variable("Float64Array", types.dyn), true);

      scope.addVariable(new Variable("U4", types.dyn), true);
      scope.addVariable(new Variable("I4", types.dyn), true);


      scope.types = clone(types);
      walkRecursively(this.body, scope, scanFunctions);
      scope.close();
    },
    StructDeclaration: function (scope) {
      var sType = new StructType(this.id.name);
      scope.addType(sType);
      walkList(this.fields, scope, {
        VariableDeclaration: function (scope) {
          var bType = this.typeSpecifier ? scope.getType(this.typeSpecifier, true) : types.dyn;
          walkList(this.declarations, scope, {
            VariableDeclarator: function () {
              var type = bType;
              if (this.pointer) {
                for (var i = 0; i < this.pointer.count; i++) {
                  type = new PointerType(type);
                }
              }
              check(this, !scope.getVariable(this.id.name, true), "Field " + quote(this.id.name) + " is already declared.");
              sType.addField(this.id.name, type);
            }
          });
        }
      });
    },
    FunctionDeclaration: function FunctionDeclaration(scope) {
      var returnType = this.returnType ? walk(this.returnType, scope, {TypeName: TypeName}) : types.dyn;
      var outerScope = scope;
      scope = this.scope = new Scope(scope, "Function " + this.id.name, "function");
      var parameterTypes = [];
      walkList(this.params, scope, {
        Identifier: function () {
          var type = this.typeName ? walk(this.typeName, scope, {TypeName: TypeName}) : types.dyn;
          scope.addVariable(new Variable(this.name, type));
          parameterTypes.push(type);
        }
      });
      var type = new FunctionType(returnType, parameterTypes);
      scope.options.functionType = type;
      scope.options.functionScope = scope;
      outerScope.addVariable(new Variable(this.id.name, type));
      walkRecursively(this.body, this.scope, scanFunctions);
      this.scope.close();
    },
    VariableDeclaration: function (scope) {
      check(this, this.kind === "let" || this.kind === "const", "Only block scoped variable declarations are allowed, use the " + quote("let") + " keyword instead.");
      if (this.kind === "let") {
        this.kind = "var"; // Only emit vars.
      }
      var bType = this.typeSpecifier ? scope.getType(this.typeSpecifier, true) : types.dyn;
      walkList(this.declarations, scope, {
        VariableDeclarator: function () {
          var type = bType;
          if (this.pointer) {
            tracer.writeLn(this.pointer.count);
            for (var i = 0; i < this.pointer.count; i++) {
              type = new PointerType(type);
            }
          }
          check(this, !scope.getVariable(this.id.name, true), "Variable " + quote(this.id.name) + " is already declared in local scope.");
          scope.addVariable(this.variable = new Variable(this.id.name, type));
          if (this.init) {
            walkRecursively(this.init, scope, scanFunctions);
          }
        }
      });
    },
    UnaryExpression: function(scope) {
      walkRecursively(this.argument, scope, scanFunctions);
      if (this.operator === "&") {
        if (isIdentifier(this.argument) && this.argument.kind === "variable") {
          var variable = scope.getVariable(this.argument.name);
          check(this, variable.type !== types.dyn, "Cannot take the address of a variable declared as dyn.");
          variable.isStackAllocated = true;
        }
      }
    },
    ForStatement: function(scope) {
      scope = this.scope = new Scope(scope, "ForStatement", "block");
      walkRecursively(this.init, scope, scanFunctions);
      walkRecursively(this.test, scope, scanFunctions);
      walkRecursively(this.update, scope, scanFunctions);
      walkRecursively(this.body, scope, scanFunctions);
    },
    BlockStatement: function(scope) {
      scope = this.scope = new Scope(scope, "BlockStatement", "block");
      walkRecursively(this.body, scope, scanFunctions);
    }
  };
  function walkRecursively(node, scope, functions) {
    tracer.writeLn(node.type);
    if (node instanceof Array) {
      for (var i = 0; i < node.length; i++) {
        walkRecursively(node[i], scope, functions);
      }
    } else if (node.type in functions) {
      walk(node, scope, functions);
    } else {
      for (var key in node) {
        var child = node[key];
        if (child instanceof Object && "type" in child ||
            child instanceof Array) {
          walkRecursively(child, scope, functions);
        }
      }
    }
  }

  walkRecursively(node, null, scanFunctions);

  tracer.writeLn("Scan Done");

  function createPrologue(scope) {
    var code = [];

    var constants = {};
    var variables = {};

    mapObject(scope.options.cachedLocals, function (k, v) {
      (v ? constants : variables)[k] = v;
    });

    [constants, variables].forEach(function (set) {
      if (Object.keys(set).length) {
        code.push({
          type: "VariableDeclaration",
          kind: set === constants ? "const": "var",
          declarations: mapObject(set, function (k, v) {
            return {
              type: "VariableDeclarator",
              id: createIdentifier(k),
              init: createIdentifier(v)
            };
          })
        });
      }
    });

    if (scope.frameSizeInWords) {
      code.push (
        createExpressionStatement (
          createAssignment (
            createStackPointer(), "-=", createLiteral(scope.frameSizeInWords, types.int)
          )
        )
      );
    }

    return code;
  }

  function createEpilogue(scope) {
    var code = [];
    if (scope.frameSizeInWords) {
      code.push (
        createExpressionStatement (
          createAssignment (
            createStackPointer(), "+=", createLiteral(scope.frameSizeInWords, types.int)
          )
        )
      );
    }
    return code;
  }

  var typeFunctions = {
    Program: function Program() {
      var scope = this.scope;
      walkList(this.body, this.scope, typeFunctions);
      var prologue = createPrologue(this.scope);
      var epilogue = createEpilogue(this.scope);
      this.body = prologue.concat(this.body).concat(epilogue);
    },
    StructDeclaration: function StructDeclaration(scope) { },
    FunctionDeclaration: function FunctionDeclaration(scope) {
      walk(this.id, scope, typeFunctions);
      var scope = this.scope;
      walkList(this.params, scope, typeFunctions);
      walk(this.body, scope, typeFunctions);
      var prologue = createPrologue(this.scope);
      var epilogue = createEpilogue(this.scope);
      if (this.body.type === "BlockStatement") {
        this.body.body = prologue.concat(this.body.body).concat(epilogue);
      } else {
        assert (false);
      }
    },
    VariableDeclaration: function VariableDeclaration(scope) {
      walkList(this.declarations, scope, typeFunctions);
    },
    VariableDeclarator: function VariableDeclarator(scope) {
      this.id = walk(this.id, scope, typeFunctions);
      var type = this.id.cType;
      if (this.init) {
        this.init = walk(this.init, scope, typeFunctions);
      } else if (type !== types.dyn && !(type instanceof StructType)) {
        this.init = createDefaultValue(type);
      }
      this.init = walk(createAssignment(this.id, "=", this.init), scope, typeFunctions);
      this.id = {type: "Identifier", name: "_"};
      if (this.init.left && isIdentifier(this.init.left)) {
        var variable = this.init.left.variable;
        assert (variable);
        this.id = {type: "Identifier", name: variable.name};
        this.init = this.init.right;
      }
    },
    BlockStatement: function BlockStatement(scope) {
      scope = this.scope;
      this.body = walkList(this.body, scope, typeFunctions);
    },
    IfStatement: function IfStatement(scope) {
      this.test = walk(this.test, scope, typeFunctions);
      this.consequent = walk(this.consequent, scope, typeFunctions);
      if (this.alternate) {
        this.alternate = walk(this.alternate, scope, typeFunctions);
      }
    },
    ForStatement: function ForStatement(scope) {
      scope = this.scope;
      this.init = walk(this.init, scope, typeFunctions);
      this.test = walk(this.test, scope, typeFunctions);
      this.update = walk(this.update, scope, typeFunctions);
      this.body = walk(this.body, scope, typeFunctions);
    },
    WhileStatement: function WhileStatement(scope) {
      this.test = walk(this.test, scope, typeFunctions);
      this.body = walk(this.body, scope, typeFunctions);
    },
    BinaryExpression: function BinaryExpression(scope) {
      this.left = walk(this.left, scope, typeFunctions);
      this.right = walk(this.right, scope, typeFunctions);
      var lType = this.left.cType;
      var rType = this.right.cType;

      if (lType instanceof PointerType && (this.operator === "+" || this.operator === "-")) {
        var scale = lType.type.size / types.word.size;
        assert (scale);
        if (scale > 1) {
          this.right = createBinary(this.right, "*", createLiteral(scale, types.int), types.i32);
          this.fixed = true;
        }
        this.cType = lType;
      }
      if (!this.cType) {
        this.cType = types.num;
      }
    },
    LogicalExpression: function LogicalExpression(scope) {
      var lType = walk(this.left, scope, typeFunctions);
      var rType = walk(this.right, scope, typeFunctions);
    },
    UnaryExpression: function UnaryExpression(scope) {
      var type;
      if (this.operator === "sizeof") {
        type = walk(this.argument, scope, {TypeName: TypeName});
        return createLiteral(type.getSize(), types.int);
      }
      this.argument = walk(this.argument, scope, typeFunctions);
      if (this.operator === "*") {
        type = this.argument.cType;
        check(this, type instanceof PointerType, "Cannot dereference non-pointer type " + quote(type));
        return createMemoryAccess(scope, type.type, this.argument);
      } else if (this.operator === "&") {
        if (this.argument.type === "MemberExpression") {
          return this.argument.property;
        }
      }
    },
    ExpressionStatement: function ExpressionStatement(scope) {
      this.expression = walk(this.expression, scope, typeFunctions);
    },
    BreakStatement: function BreakStatement(scope) { },
    CallExpression: function CallExpression(scope) {
      this.callee = walk(this.callee, scope, typeFunctions);
      this.arguments = walkList(this.arguments, scope, typeFunctions);
      var type = this.callee.cType;
      if (type !== types.dyn) {
        assert (type instanceof FunctionType);
        check(this, this.arguments.length === type.parameterTypes.length, "Argument / parameter mismatch.");
        for (var i = 0; i < this.arguments.length; i++) {
          this.arguments[i] = createConversion(this.arguments[i], type.parameterTypes[i]);
        }
      }
      this.cType = type.returnType;
    },
    CastExpression: function CastExpression(scope) {
      var type = walk(this.typeName, scope, {TypeName: TypeName});
      this.argument = walk(this.argument, scope, typeFunctions);
      return createConversion(this.argument, type);
    },
    MemberExpression: function MemberExpression(scope) {
      this.object = walk(this.object, scope, typeFunctions);
      this.property = walk(this.property, scope, typeFunctions);
      var oType = this.object.cType;
      var pType = this.property.cType;
      if (oType === types.dyn) {
        this.cType = types.dyn;
        return;
      }
      if (this.computed) {
        return;
      }
      var address;
      if (this.kind === "->") {
        check(this, oType instanceof PointerType, "Cannot dereference non pointer type.");
        check(this, oType.pointers === 0, "Cannot dereference pointers to pointers.");
        oType = oType.base;
        address = this.object;
      } else {
        if (this.kind === ".") {
          check(this, !(oType instanceof PointerType), "Cannot use . operator on pointer types.");
          // The object here is actually a MemberExpression
          assert (this.object.type === "MemberExpression", this.object.type);
          address = this.object.property;
        } else {
          assert (false);
        }
      }
      check(this, oType instanceof StructType, "Property access on non structs is not possible.");
      check(this, isIdentifier(this.property), "Invalid property name.");
      var field = oType.getField(this.property.name);
      check(this, field, "Field \"" + this.property.name + "\" does not exist in type " + oType + ".");
      this.field = field;
      this.cType = field.type;
      return createMemoryAccess(scope, field.type, address, field.offset);
    },
    Identifier: function Identifier(scope) {
      if (this.kind === "variable") {
        this.variable = scope.getVariable(this.name);
        if (this.name === "NULL") {
          return createLiteral(0, this.variable.type);
        }
        check(this, this.variable, "Variable " + quote(this.name) + " not found in current scope " + scope);
        this.name = this.variable.name;
        var type = this.cType = this.variable.type;
        if (this.variable.isStackAllocated) {
          return this.variable.getMemoryAccess(scope);
        }
      } else {
        this.cType = this.cType ? this.cType : types.dyn;
      }
    },
    Variable: function Variable(scope) { },
    Literal: function Literal(scope) {
      if (typeof this.value === "number") {
        this.cType = isInteger(this.value) ? types.i32 : types.f64;
        return;
      }
      this.cType = types.dyn;
    },
    ReturnStatement: function (scope) {
      this.argument = walk(this.argument, scope, typeFunctions);
      var rType = scope.options.functionType.returnType;
      checkTypeAssignment(this, rType, this.argument.cType);
      this.argument = createConversion(this.argument, rType);

      var frameSizeInWords = scope.options.functionScope.frameSizeInWords;
      if (frameSizeInWords) {
        this.argument = createSequence([
          createAssignment (
            createStackPointer(), "+=", createLiteral(frameSizeInWords, types.int)
          ),
          this.argument
        ]);
      }
    },
    AssignmentExpression: function AssignmentExpression(scope) {
      this.left = walk(this.left, scope, typeFunctions);
      var lType = this.left.cType;
      var rType = lType;
      if (this.right) {
        this.right = walk(this.right, scope, typeFunctions);
        rType = this.right.cType;
      }
      if (lType instanceof PointerType && (this.operator === "+=" || this.operator === "-=")) {
        check(this, rType === types.i32 || rType === types.u32, "Can't do pointer arithmetic with " + quote(rType) + " types.");
        this.right = createConversion(this.right, types.i32);
        var scale = lType.type.size / types.word.size;
        assert (scale);
        if (scale > 1) {
          this.right = createBinary(this.right, "*", createLiteral(scale, types.int), rType);
        }
        return;
      }
      checkTypeAssignment(this, lType, rType);
      if (lType instanceof StructType) {
        var left = this.left.property;
        var right;
        if (!this.right) {
          right = createLiteral(null, types.dyn);
        } else if (this.right.type === "MemberExpression") {
          right = this.right.property;
        } else if (this.right.type === "CallExpression") {
          right = this.right;
        }
        var sizeInWords = lType.getSize() / types.word.getSize();
        assert (lType.getSize() % types.word.getSize() === 0);
        return createCall(createIdentifier("memoryCopy"), [left, right, createLiteral(sizeInWords, types.int)], lType);
      }
      this.cType = lType;
      if (this.operator in assignmentOperators) {
        var binaryOperator = assignmentOperators[this.operator];
        this.right = createBinary(this.left, binaryOperator.name, this.right, binaryOperator.computeType(lType, rType));
        this.operator = "=";
      }
      if (this.right) {
        this.right = createConversion(this.right, lType);
      }
    },
    SequenceExpression: function SequenceExpression(scope) {
      this.expressions = walkList(this.expressions, scope, typeFunctions);
      this.cType = this.expressions[this.expressions.length - 1].cType;
    },
    TypeName: TypeName,
    NewExpression: function NewExpression(scope) {
      if (this.callee.type === "Identifier") {
        var type = scope.getType(this.callee.name, false);
        if (type) {
          var call = createCall(createIdentifier("malloc"), [createLiteral(type.getSize(), types.int)], types.voidPointer);
          return createConversion(call, new PointerType(type));
        }
      }
      this.callee = walk(this.callee, scope, typeFunctions);
      this.arguments = walkList(this.arguments, scope, typeFunctions);
      this.cType = types.dyn;
    },
    UpdateExpression: function (scope) {
      this.argument = walk(this.argument, scope, typeFunctions);
      this.cType = this.argument.cType;
      if (this.argument.cType === types.dyn || this.argument === types.num) {
        return;
      }
      var operator = this.operator === "++" ? "+" : "-";
      var value = createAssignment (
        this.argument,
        "=",
        createBinary (
          this.argument,
          "+",
          createLiteral(1, types.int)
        )
      );
      if (!this.prefix) {
        var t = createIdentifier(scope.getTempName(this.argument.cType), this.argument.cType, true);
        value = createSequence([
          createAssignment (
            t,
            "=",
            this.argument
          ),
          value,
          t
        ]);
      }
      return walk(value, scope, typeFunctions);
    },
    FunctionExpression: function UpdateExpression() {
      this.cType = types.dyn;
    },
    IdentityExpression: function IdentityExpression(scope) {
      this.argument = walk(this.argument, scope, typeFunctions);
    }
  };

  function walk(node, scope, functions) {
    assert (node);
    if (!node.type || node.fixed) {
      return node;
    }
    assert (functions);
    tracer.enter("> " + node.type + (node.loc ? " " + node.loc.start.line : ""));
    assert (node.type in functions, "Node type " + quote(node.type) + " not found.");
    var result = functions[node.type].call(node, scope);
    tracer.leave("< " + node.type + (result ? " <-- " + (result.type ? result.type : result.constructor.name) : ""));
    if (result !== undefined) {
      return result;
    }
    return node;
  }

  function walkList(list, scope, functions) {
    var result = [];
    for (var i = 0; i < list.length; i++) {
      var res = null;
      if (list[i]) {
        res = walk(list[i], scope, functions);
      }
      result.push(res);
    }
    return result;
  }

  walk(node, null, typeFunctions);
}
