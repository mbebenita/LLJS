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
types.voidPointer = new PointerType(types.void);
types.wordPointer = new PointerType(types.word);

/*
function getType(name) {
  assert (name in types, "Type \"" + name + "\" is not found.");
  assert (types[name]);
  return types[name];
}
*/

var Scope = (function () {
  function scope(parent, name, type) {
    this.name = name;
    this.parent = parent;
    this.types = {};
    this.variables = {};
    this.global = type === "global";
    this.options = parent ? Object.create(parent.options) : {};
    if (type === "global" || type === "function") {
      this.options.cachedLocals = {};
    }
  }

  scope.prototype.getVariable = function getVariable(name, local) {
    var variable = this.variables[name];
    if (variable) {
      return variable;
    } else if (!local && this.parent) {
      return this.parent.getVariable(name);
    }
    return null;
  };

  scope.prototype.addVariable = function addVariable(variable) {
    assert (variable);
    assert (!variable.scope);
    tracer.writeLn("Added variable " + variable + " to scope " + this);
    variable.scope = this;
    this.variables[variable.name] = variable;
  };

  scope.prototype.getType = function getType(name, find) {
    var type = this.types[name];
    if (type) {
      return type;
    } else if (this.parent) {
      return this.parent.getType(name);
    }
    return unexpected ("Undefined type " + name);
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
  scope.prototype.toString = function toString() {
    return this.name;
  };

  scope.prototype.close = function close() {
    var wordOffset = 0;
    for (var key in this.variables) {
      var x = this.variables[key];
      if (x.isStackAllocated) {
        x.wordOffset = wordOffset;
        wordOffset += wordAlignment(x.type.getSize()) / 4;
      }
    }
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

  throw new Error(str + message);
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


function createLiteral(value) {
  return {type: "Literal", value: value};
}

function createIdentifier(name) {
  return {type: "Identifier", name: name};
}

function createBinary(left, operator, right, type) {
  assert (type);
  return {
    type: "BinaryExpression",
    operator: operator,
    left: left,
    right: right,
    cType: type
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

function createCall(callee, arguments, type) {
  return {
    type: "CallExpression",
    callee: callee,
    arguments: arguments,
    cType: type
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
      address = createBinary(address, "+", createLiteral(offset), address.cType);
    }
  }
  return {
    type: "MemberExpression",
    computed: true,
    object: {
      type: "Identifier",
      name: scope.getViewName(type),
      cType: new PointerType(type)
    },
    property: address,
    cType: type
  };
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
      value = createBinary(value, (shift > 0 ? "<<" : ">>"), createLiteral(Math.abs(shift)), lType);
    } else {
      value = createIdentity(value, lType);
    }
  } else if (lType instanceof Type && rType instanceof Type) {
    if (lType === types.u32) {
      value = createBinary(value, ">>>", createLiteral(0), lType);
    } else if (lType === types.i32) {
      value = createBinary(value, "|", createLiteral(0), lType);
    } else if (lType === types.num) {
      // No Conversion Needed
    }
  }
  return value;
}

function createDefaultValue(type) {
  var node = createLiteral(type.defaultValue);
  node.cType = type;
  node.fixed = true;
  return node;
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
    return createMemoryAccess (scope, this.type, this.getAddress());
  };
  variable.prototype.getAddress = function getAddress() {
    assert (this.isStackAllocated);
    var wordAddress = createBinary (
      createIdentifier(this.scope.global ? "$BP" : "$SP"),
      "+",
      createLiteral(this.wordOffset),
      types.wordPointer
    );
    return createConversion(wordAddress, new PointerType(this.type));
  };
  return variable;
})();

var tracer;
function compile(node) {
  tracer = new IndentingWriter(!trace.value);
  if (trace.value) {
    print (JSON.stringify(node, null, 2));
  }
  computeTypes(node, types);
}


function isIdentifier(node) {
  assert (node);
  return node.type === "Identifier";
}

function computeTypes(node, types) {

  function TypeName(scope) {
    var type = scope.getType(this.typeSpecifier);
    if (this.pointer) {
      for (var i = 0; i < this.pointer.count; i++) {
        type = new PointerType(type);
      }
    }
    return type;
  }

  var scanFunctions = {
    Program: function Program() {
      this.scope = new Scope(null, "Program", "global");
      this.scope.types = clone(types);
      walkRecursively(this.body, this.scope, scanFunctions);
      this.scope.close();
    },
    StructDeclaration: function (scope) {
      var sType = new StructType(this.id.name);
      scope.addType(sType);
      walkList(this.fields, scope, {
        VariableDeclaration: function (scope) {
          var bType = this.typeSpecifier ? scope.getType(this.typeSpecifier) : types.dyn;
          walkList(this.declarations, scope, {
            VariableDeclarator: function () {
              var type = bType;
              if (this.pointer) {
                tracer.writeLn(this.pointer.count);
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
      outerScope.addVariable(new Variable(this.id.name, type));
      walkRecursively(this.body, this.scope, scanFunctions);
      this.scope.close();
    },
    VariableDeclaration: function (scope) {
      var bType = this.typeSpecifier ? scope.getType(this.typeSpecifier) : types.dyn;
      walkList(this.declarations, scope, {
        VariableDeclarator: function () {
          var type = bType;
          if (this.pointer) {
            tracer.writeLn(this.pointer.count);
            for (var i = 0; i < this.pointer.count; i++) {
              type = new PointerType(type);
            }
          }
          check(this, !scope.getVariable(this.id.name, true), "Variable " + quote(this.id.name) + " is already declared.");
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
          scope.getVariable(this.argument.name).isStackAllocated = true;
        }
      }
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

  function createFrame(scope) {
    var code = [];
    if (Object.keys(scope.options.cachedLocals).length) {
      code.push({
        type: "VariableDeclaration",
        kind: "const",
        declarations: mapObject(scope.options.cachedLocals, function (k, v) {
          return {
            type: "VariableDeclarator",
            id: createIdentifier(k),
            init: createIdentifier(v)
          };
        })
      });
    }
    return code;
  }

  var typeFunctions = {
    Program: function Program() {
      var scope = this.scope;
      scope.addVariable(new Variable("extern", types.dyn));
      scope.addVariable(new Variable("$HP", types.i32Pointer));
      scope.addVariable(new Variable("$BP", types.i32Pointer));
      scope.addVariable(new Variable("$SP", types.i32Pointer));
      scope.addVariable(new Variable("NULL", types.i32Pointer));
      scope.addVariable(new Variable("$HP_END", types.i32Pointer));
      scope.addVariable(new Variable("load", new FunctionType(types.dyn, [types.dyn])));
      scope.addVariable(new Variable("malloc", new FunctionType(types.u8Pointer, [types.u32])));
      walkList(this.body, this.scope, typeFunctions);
      this.body = createFrame(this.scope).concat(this.body);
    },
    StructDeclaration: function StructDeclaration(scope) { },
    FunctionDeclaration: function FunctionDeclaration() {
      var scope = this.scope;
      walk(this.body, scope, typeFunctions);
      var prologue = createFrame(this.scope);
      if (this.body.type === "BlockStatement") {
        this.body.body = prologue.concat(this.body.body);
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
        this.init = createConversion(walk(this.init, scope, typeFunctions), type);
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
      walkList(this.body, scope, typeFunctions);
    },
    IfStatement: function IfStatement(scope) {
      walkList([this.test, this.consequent, this.alternate], scope, typeFunctions);
    },
    ForStatement: function ForStatement(scope) {
      walk(this.init, scope, typeFunctions);
      walk(this.test, scope, typeFunctions);
      walk(this.update, scope, typeFunctions);
      walk(this.body, scope, typeFunctions);
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
          this.right = createBinary(this.right, "*", createLiteral(scale), types.i32);
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
        return createLiteral(type.getSize());
      }
      this.argument = walk(this.argument, scope, typeFunctions);
      if (this.operator === "*") {
        type = this.argument.cType;
        check(this, type instanceof PointerType, "Cannot dereference non-pointer type " + quote(type));
        if (type.type instanceof StructType) {
          return this;
        }
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
      if (this.computed) {
        return;
      }
      if (oType === types.dyn) {
        this.cType = types.dyn;
        return;
      }
      var address;
      if (this.kind === "->") {
        check(this, oType instanceof PointerType, "Cannot dereference non pointer type.");
        check(this, oType.pointers === 0, "Cannot dereference pointers to pointers.");
        oType = oType.base;
        address = this.object;
      } else {
        check(this, !(oType instanceof PointerType), "Cannot use . operator on pointer types.");
        // The object here is actually a MemberExpression
        assert (this.object.type === "MemberExpression", this.object.type);
        address = this.object.property;
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
        if (this.name === "NULL") {
          return {type: "Literal", value: 0, cType: types.voidPointer};
        }
        this.variable = scope.getVariable(this.name);
        check(this, this.variable, "Variable " + quote(this.name) + " not found in current scope " + scope);
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
          this.right = createBinary(this.right, "*", createLiteral(scale), rType);
        }
        return;
      }
      checkTypeAssignment(this, lType, rType);
      if (lType instanceof StructType) {
        var left = this.left.property;
        var right = this.right ? this.right.property : createLiteral(null);
        var sizeInWords = lType.getSize() / types.word.getSize();
        assert (lType.getSize() % types.word.getSize() === 0);
        return createCall(createIdentifier("memoryCopy"), [left, right, createLiteral(sizeInWords)], lType);
      }
      this.cType = lType;
    },
    SequenceExpression: function SequenceExpression(scope) {
      this.expressions = walkList(this.expressions, scope, typeFunctions);
    },
    TypeName: TypeName,
    NewExpression: function NewExpression(scope) {
      if (this.callee.type === "Identifier") {
        var type = scope.getType(this.callee.name);
        if (type) {
          return createCall(createIdentifier("malloc"), [createLiteral(type.getSize())], new PointerType(type));
        }
      }
      this.cType = types.dyn;
    },
    UpdateExpression: function () {

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
