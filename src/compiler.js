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
    var size = 0;
    this.fields.forEach(function (field) {
      size += field.type.getSize();
    });
    this.size = size;
    return size;
  };

  structType.prototype.addField = function addField(name, type) {
    this.fields.push({name: name, type: type, offset: this.offset});
    this.offset += type.getSize();
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

function getType(name) {
  assert (name in types, "Type \"" + name + "\" is not found.");
  assert (types[name]);
  return types[name];
}

var Scope = (function () {
  function scope(parent, name, global) {
    this.name = name;
    this.parent = parent;
    this.types = {};
    this.variables = {};
    this.global = global;
    this.options = parent ? Object.create(parent.options) : {};
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
    // print("Adding variable " + variable + " to scope " + this + ".");
    variable.scope = this;
    this.variables[variable.name] = variable;
  };

  scope.prototype.getType = function getType(name) {
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

  scope.prototype.toString = function toString() {
    return this.name;
  };

  scope.prototype.close = function close() {
    var wordOffset = 0;
    for (var key in this.variables) {
      var x = this.variables[key];
      if (x.isStackAllocated || x.type instanceof StructType) {
        x.wordOffset = wordOffset;
        wordOffset += wordAlignment(x.type.getSize()) / 4;
      }
    }
    this.frameSizeInWords = wordOffset;
  };

  scope.prototype.cacheView = function cacheView(type) {
    if (this.global) {
      // Don't cache views in the global scope.
      return;
    }
    var viewName = getViewName(type);
    this.options.cachedViews[viewName] = "$" + viewName;
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
  var position = node.position;

  if (position) {
    /*
     str = source.split("\n")[position.line - 1] + "\n";
     for (var i = 0; i < position.column - 1; i++) {
     str += " ";
     }
     str += "^ ";
     */
    str = "At " + position.line + ":" + position.column + ": " + node.tag + ": ";
  } else {
    str = "At " + node.tag + ": ";
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

var Variable = (function () {
  function variable(name, type) {
    assert (name && type);
    this.name = name;
    this.type = type;
  }
  variable.prototype.toString = function () {
    return "variable " + this.name;
  };
  variable.prototype.generateCode = function (writer, scope) {
    if (this.type instanceof StructType) {
      return this.frameOffset();
    } else if (this.isStackAllocated) {
      return generateMemoryAccess(scope, this.getPointer(), this.type);
    }
    return this.name;
  };
  variable.prototype.frameOffset = function () {
    assert (this.scope);
    var address = this.scope.global ? "$BP" : "$SP";
    if (this.wordOffset) {
      address += " + " + this.wordOffset;
    }
    var shift = 2 - log2(min(this.type.size, 4));
    if (shift) {
      address += " << " + shift;
    }
    return address;
  };
  variable.prototype.getPointer = function () {
    if (this.pointer) {
      return this.pointer;
    }
    return this.pointer = {
      type: new PointerType(this.type),
      generateCode: function () {
        return this.frameOffset();
      }.bind(this)
    };
  };
  return variable;
})();


function createFrame(writer, scope) {
  var cache = mapObject(scope.options.cachedViews, function (k, v) {
    return v + " = " + k;
  });

  if (cache.length) {
    writer.writeLn("var " + cache.join(", ") + ";");
  }

  if (scope.frameSizeInWords) {
    writer.writeLn((scope.global ? "$BP = " : "") + "$SP -= " + scope.frameSizeInWords + ";");
    for (var key in scope.variables) {
      var variable = scope.variables[key];
      if (variable.isParameter && variable.isStackAllocated) {
        if (variable.type instanceof StructType) {
          writer.writeLn(generateMemoryCopy(variable.generateCode(null, scope), variable.name, variable.type.getSize()) + ";");
        } else {
          writer.writeLn(variable.generateCode(null, scope) + " = " + variable.name + ";");
        }
      }
    }
  }
};

function destroyFrame(writer, scope) {
  if (scope.frameSizeInWords) {
    writer.writeLn("$SP += " + scope.frameSizeInWords + ";");
  }
};

function computeDeclarations(elements, scope) {
  for (var i = 0; i < elements.length; i++) {
    var node = elements[i];
    if (node instanceof StructDeclaration) {
      assert (!(node.name in types), "Type " + node.name + " is already defined.");
      scope.addType(new StructType(node.name));
    } else if (node instanceof FunctionDeclaration) {
      scope.addVariable(new Variable(node.name, node.computeTypeAndDeclarations(scope)));
    }
  }
}

function Program (elements) {
  this.tag = "Program";
  this.elements = elements;
}

Program.prototype = {
  computeType: function (types) {
    var scope = this.scope = new Scope(null, "Program", true);
    scope.types = clone(types);
    scope.options.cachedViews = {};
    scope.addVariable(new Variable("extern", types.dyn));
    scope.addVariable(new Variable("$HP", types.i32Pointer));
    scope.addVariable(new Variable("$SP", types.i32Pointer));
    scope.addVariable(new Variable("$HP_END", types.i32Pointer));
    scope.addVariable(new Variable("malloc", new FunctionType(types.u8Pointer, [types.u32])));

    computeDeclarations(this.elements, scope);
    walkComputeTypes(this.elements, scope);
    scope.close();
  },
  generateCode: function (writer) {
    createFrame(writer, this.scope);
    walkGenerateCode(this.elements, writer, this.scope);
  }
};

function VariableStatement (typeSpecifier, variableDeclarations, inForStatement) {
  this.tag = "VariableStatement";
  this.typeSpecifier = typeSpecifier;
  this.variableDeclarations = variableDeclarations;
  this.inForStatement = inForStatement;
}

VariableStatement.prototype = {
  computeType: function (scope) {
    var typeSpecifier = this.typeSpecifier;
    this.variableDeclarations.forEach(function (x) {
      x.computeType(typeSpecifier, scope);
      check(x, !scope.getVariable(x.name, true), "Variable " + quote(x.name) + " is already declared.");
      scope.addVariable(x.variable = new Variable(x.name, x.type));
    });
    delete this.typeSpecifier;
  },

  generateCode: function (writer, scope) {
    var assignments = this.variableDeclarations.map(function (x) {
      var lType = x.variable.type;
      return generateAssignment(x, scope, x.variable, "=", x.value, lType, x.valueType, true);
    });

    if (this.inForStatement) {
      return "var " + assignments.join(", ");
    } else {
      writer.writeLn("var " + assignments.join(", ") + ";");
    }
  }
};

function VariableDeclaration (declarator, value) {
  this.tag = "VariableDeclaration";
  this.declarator = declarator;
  this.value = value;
}

VariableDeclaration.prototype = {
  computeType: function (typeSpecifier, scope) {
    var result = {name: null, type: scope.getType(typeSpecifier)};
    this.declarator.createType(result);
    if (this.value) {
      this.valueType = this.value.computeType(scope);
      checkTypeAssignment(this, result.type, this.valueType);
    }
    delete this.declarator;
    this.name = result.name;
    this.type = result.type;
  }
};

function Declarator (pointer, directDeclarator) {
  this.tag = "Declarator";
  this.pointer = pointer;
  this.directDeclarator = directDeclarator;
}

Declarator.prototype = {
  createType: function (result) {
    assert (result.type);
    if (this.pointer) {
      for (var i = 0; i < this.pointer.count; i++) {
        result.type = new PointerType(result.type);
      }
    }
    if (this.directDeclarator) {
      this.directDeclarator.createType(result);
    }
  }
};

function DirectDeclarator (name, declarator, declaratorSuffix) {
  this.tag = "DirectDeclarator";
  this.name = name;
  this.declarator = declarator;
  this.declaratorSuffix = declaratorSuffix;
}

DirectDeclarator.prototype = {
  createType: function (result) {
    assert (result.type);
    for (var i = this.declaratorSuffix.length - 1; i >= 0; i--) {
      result.type = this.declaratorSuffix[i].createType(result.type);
    }
    if (this.declarator) {
      this.declarator.createType(result);
    } else if (this.name) {
      result.name = this.name;
    }
  }
};

function FunctionDeclarator (parameters) {
  this.tag = "FunctionDeclarator";
  this.parameters = parameters;
}

FunctionDeclarator.prototype = {
  createType: function (returnType) {
    return new FunctionType(returnType, walkCreateTypes(this.parameters));
  },
  generateCode: function (writer, scope) {

  }
};

function ParameterDeclaration (typeSpecifier, declarator) {
  this.tag = "ParameterDeclaration";
  this.typeSpecifier = typeSpecifier;
  this.declarator = declarator;
}

ParameterDeclaration.prototype = {
  createType: function (scope) {
    return this.createParameter(scope).type;
  },
  createParameter: function (scope) {
    assert (scope);
    var result = {name: null, type: scope.getType(this.typeSpecifier)};
    if (this.declarator) {
      this.declarator.createType(result);
    }
    return result;
  }
};


function StructDeclaration (name, fields) {
  this.tag = "StructDeclaration";
  this.name = name;
  this.fields = fields;
}

StructDeclaration.prototype = {
  computeType: function (scope) {
    this.type = scope.getType(this.name);
    check(this, this.fields, "Struct " + quote(this.name) + " must have at least one field declaration.");
    walkComputeTypes(this.fields, scope, this.type);
  },
  generateCode: function (writer, scope) {}
};

function FieldDeclaration (typeSpecifier, declarator) {
  this.tag = "StructDeclaration";
  this.typeSpecifier = typeSpecifier;
  this.declarator = declarator;
}

FieldDeclaration.prototype = {
  computeType: function (scope, type) {
    var result = {name: null, type: scope.getType(this.typeSpecifier)};
    this.declarator.createType(result);
    type.addField(result.name, result.type);
  }
};

function TypeName (typeSpecifier, declarator) {
  this.tag = "TypeName";
  this.typeSpecifier = typeSpecifier;
  this.declarator = declarator;
}

TypeName.prototype = {
  createType: function (scope) {
    assert (scope);
    var result = {name: null, type: scope.getType(this.typeSpecifier)};
    if (this.declarator) {
      this.declarator.createType(result);
    }
    return result.type;
  },
  computeType: function (scope) {
    return this.createType(scope);
  }
};

function Literal (kind, value) {
  this.tag = "Literal";
  this.kind = kind;
  this.value = value;
}

Literal.prototype = {
  computeType: function () {
    switch (this.kind) {
      case "number": return isInteger(this.value) ? types.i32 : types.f64;
      case "boolean": return types.i32;
      case "NULL": return types.voidPointer;
      case "null": return types.void;
      case "string": return types.dyn;
      default: return notImplemented();
    }
  },
  generateCode: function (writer, scope) {
    assert(!writer);
     switch (this.kind) {
      case "number": return JSON.stringify(this.value);
      case "boolean": return JSON.stringify(this.value);
      case "null": return "null";
      case "NULL": return "0";
      case "string": return JSON.stringify(this.value);
      default: return notImplemented();
    }
  }
};

function FunctionDeclaration (name, returnType, parameters, elements) {
  this.tag = "FunctionDeclaration";
  this.name = name;
  this.returnType = returnType;
  this.parameters = parameters;
  this.elements = elements;
}

FunctionDeclaration.prototype = {
  computeTypeAndDeclarations: function (scope) {
    this.parameters = this.parameters.map(function (x) {
      return x.createParameter(scope);
    });

    var parameterTypes = this.parameters.map(function (x) {
      return x.type;
    });

    this.returnType = this.returnType.createType(scope);
    this.type = new FunctionType(this.returnType, parameterTypes);
    computeDeclarations(this.elements, scope);
    return this.type;
  },
  computeType: function (scope, signatureOnly) {
    this.scope = scope = new Scope(scope, "Function " + this.name);
    scope.options.enclosingFunction = this;
    scope.options.cachedViews = {};
    this.parameters.forEach(function (x) {
      var variable = new Variable(x.name, x.type);
      variable.isParameter = true;
      scope.addVariable(variable);
    });

    walkComputeTypes(this.elements, scope);

    scope.close();

    if (this.type.returnType !== types.void) {
      check(this, this.hasReturn, "Function must return a value of type " + quote(this.type.returnType) + ".");
    }
    return this.type;
  },
  generateCode: function (writer) {
    var scope = this.scope;
    scope.options.frame = new Frame();
    writer.enter("function " + this.name + "(" +
      this.parameters.map(function (x) {
        return x.name;
      }).join(", ") + ") {");
    createFrame(writer, scope);
    walkGenerateCode(this.elements, writer, scope);
    writer.leave("}");
  }
};

function ReturnStatement (value) {
  this.tag = "ReturnStatement";
  this.value = value;
}

ReturnStatement.prototype = {
  computeType: function (scope) {
    this.type = this.value.computeType(scope);
    checkTypeAssignment(this, scope.options.enclosingFunction.type.returnType, this.type);
    scope.options.enclosingFunction.hasReturn = true;
    this.returnType = scope.options.enclosingFunction.type.returnType;
  },
  generateCode: function (writer, scope) {
    var value = (this.value ? " " + this.value.generateCode(null, scope) : "");
    value = generateConversion(value, this.returnType, this.type);
    if (scope.frameSizeInWords) {
      writer.writeLn("var $T =" + value + ";");
      destroyFrame(writer, scope);
      writer.writeLn("return $T;");
    } else {
      writer.writeLn("return" + value + ";");
    }
  }
};

function ConditionalExpression (condition, trueExpression, falseExpression) {
  this.tag = "ConditionalExpression";
  this.condition = condition;
  this.trueExpression = trueExpression;
  this.falseExpression = falseExpression;
}

ConditionalExpression.prototype = {
  computeType: function (scope) {
    var ct = this.condition.computeType(scope);
    var tt = this.trueExpression.computeType(scope);
    var ft = this.falseExpression.computeType(scope);
    return tt;
  },
  generateCode: function (writer, scope) {
    assert (!writer);
    return "(" + this.condition.generateCode(null, scope) + " ? " +
      this.trueExpression.generateCode(null, scope) + " : " +
      this.falseExpression.generateCode(null, scope) + ")";
  }
};

function BinaryExpression (operator, left, right) {
  this.tag = "BinaryExpression";
  this.operator = operator;
  this.left = left;
  this.right = right;
}

BinaryExpression.prototype = {
  computeType: function (scope) {
    this.lType = this.left.computeType(scope);
    this.rType =  this.right.computeType(scope);
    if (this.lType instanceof PointerType && (this.operator === "+" || this.operator === "-")) {
      check(this, this.rType === types.i32 || this.rType === types.u32, "Can't do pointer arithmetic with " + quote(this.rType) + " types.");
    }
    return this.lType;
  },
  generateCode: function (writer, scope) {
    assert (!writer);
    if (this.lType instanceof PointerType && (this.operator === "+" || this.operator === "-")) {
      var value;
      if (this.right instanceof Literal) {
        value = this.right.value;
      } else {
        value = this.right.generateCode(null, scope);
      }
      var scale = this.lType.type.size / types.word.size;
      assert (scale);
      if (scale > 1) {
        value = paren(value + " * " + scale);
      }
      return paren(this.left.generateCode(null, scope) + " " + this.operator + " " + value);
    }
    return paren(
      this.left.generateCode(null, scope) + " " +
      this.operator + " " +
      this.right.generateCode(null, scope)
    );
  }
};

function UnaryExpression (operator, expression) {
  this.tag = "UnaryExpression";
  this.operator = operator;
  this.expression = expression;
}

UnaryExpression.prototype = {
  computeType: function (scope) {
    if (this.operator === "sizeof") {
      return types.i32;
    } else if (this.operator === "&") {
      var type = this.expression.computeType(scope);
      if (this.expression instanceof VariableIdentifier) {
        this.expression.variable.isStackAllocated = true;
      }
      return this.type = new PointerType(type);
    } else if (this.operator === "*") {
      var type = this.expression.computeType(scope);
      check(this, type instanceof PointerType, "Cannot dereference non pointer type.");
      scope.cacheView(type.type);
      return this.type = type.type;
    }
    return this.expression.computeType(scope);
  },
  generateCode: function (writer, scope) {
    if (this.expression instanceof TypeName) {
      return this.expression.computeType(scope).getSize();
    } else if (this.operator === "&") {
      if (this.expression instanceof VariableIdentifier) {
        var variable = this.expression.variable;
        assert (variable.isStackAllocated);
        return variable.frameOffset();
      } else {
        notImplemented();
      }
    } else if (this.operator === "*") {
      if (this.type instanceof StructType) {
        return this.expression.generateCode(null, scope);
      }
      return generateMemoryAccess(scope, this.expression, this.type);
    }
    return this.operator + this.expression.generateCode(null, scope);
  }
};

function CastExpression (type, expression) {
  this.tag = "CastExpression";
  this.type = type;
  this.expression = expression;
}

CastExpression.prototype = {
  computeType: function (scope) {
    this.rType = this.expression.computeType(scope);
    return this.type = this.type.computeType(scope);
  },
  generateCode: function (writer, scope) {
    var value = this.expression.generateCode(null, scope);
    return generateConversion(value, this.type, this.rType);
  }
};

function PostfixExpression (operator, expression) {
  this.tag = "PostfixExpression";
  this.operator = operator;
  this.expression = expression;
}

PostfixExpression.prototype = {
  computeType: function (scope) {
    check(this, this.operator === "++" || this.operator === "--");
    this.expression.computeType(scope);
  },
  generateCode: function (writer, scope) {
    if (this.expression.type instanceof PointerType) {
      var value = this.expression.generateCode(null, scope);
      var operator = this.operator === "++" ? " += " : " -= ";
      return "($X = " + value + ", " + value + operator + this.expression.type.getSize() + ", $X)";
    }
    return this.expression.generateCode(null, scope) + this.operator;
  }
};



function BreakStatement (label) {
  this.tag = "CastExpression";
  this.label = label;
}

BreakStatement.prototype = {
  computeType: function (scope) {
  },
  generateCode: function (writer, scope) {
    writer.writeLn("break;");
  }
};

function FunctionCall (name, arguments) {
  this.tag = "FunctionCall";
  this.name = name;
  this.arguments = arguments;
}

FunctionCall.prototype = {
  computeType: function (scope) {
    var type = this.name.computeType(scope);
    this.argumentTypes = walkComputeTypes(this.arguments, scope);
    if (type !== types.dyn) {
      this.parameterTypes = type.parameterTypes;
      assert (type instanceof FunctionType);
      check(this, this.argumentTypes.length === type.parameterTypes.length, "Argument / parameter mismatch.");
      for (var i = 0; i < this.arguments.length; i++) {
        var aType = this.argumentTypes[i];
        var pType = type.parameterTypes[i];
        checkTypeAssignment(this, aType, pType);
      }
      return type.returnType;
    }
    return type;
  },
  generateCode: function (writer, scope) {
    var arguments = [];
    for (var i = 0; i < this.arguments.length; i++) {
      var argument = this.arguments[i].generateCode(null, scope);
      if (this.parameterTypes) {
      var aType = this.argumentTypes[i];
      var pType = this.parameterTypes[i];
        argument = generateConversion(argument, pType, aType);
      }
      arguments[i] = argument;
    }
    return this.name.generateCode(null, scope) + "(" + arguments.join(", ") + ")";
  }
};

function VariableIdentifier (name) {
  this.tag = "VariableIdentifier";
  this.name = name;
}

VariableIdentifier.prototype = {
  computeType: function (scope) {
    this.variable = scope.getVariable(this.name);
    check(this, this.variable, "Variable " + quote(this.name) + " not found in current scope.");
    return this.type = this.variable.type;
  },
  generateCode: function (writer, scope) {
    return this.variable.generateCode(writer, scope);
  }
};

function ExpressionStatement (expression) {
  this.tag = "ExpressionStatement";
  this.expression = expression;
}

ExpressionStatement.prototype = {
  computeType: function (scope) {
    return this.expression.computeType(scope);
  },
  generateCode: function (writer, scope) {
    writer.writeLn(unparen(this.expression.generateCode(null, scope)) + ";");
  }
};

function AssignmentExpression (operator, left, right) {
  this.tag = "AssignmentExpression";
  this.operator = operator;
  this.left = left;
  this.right = right;
}

function generateMemoryCopy(dst, src, size) {
  return "mc(" + dst + ", " + src + ", " + div4(size) + ")";
}

function generateMemoryZero(dst, size) {
  return "mz(" + dst + ", " + div4(size) + ")";
}

AssignmentExpression.prototype = {
  computeType: function (scope) {
    this.lType = this.left.computeType(scope);
    this.rType = this.right.computeType(scope);

    if (this.lType instanceof PointerType && (this.operator === "+=" || this.operator === "-=")) {
      check(this, this.rType === types.i32 || this.rType === types.u32, "Can't do pointer arithmetic with " + quote(this.rType) + " types.");
    }

    return this.lType;
  },
  generateCode: function (writer, scope) {
    return generateAssignment(this, scope, this.left, this.operator, this.right, this.lType, this.rType);
  }
};

var min = Math.min;

function generateConversion (value, lType, rType) {
  if (lType === rType) {
    return value;
  }
  if (lType instanceof PointerType && rType instanceof PointerType) {
    var shift = log2(min(rType.type.size, types.word.size)) -
                log2(min(lType.type.size, types.word.size));

    if (shift) {
      value = paren(value + (shift > 0 ? " << " : " >> ") + Math.abs(shift));
    }
    return value;
  }
  if (lType instanceof Type && rType instanceof Type) {
    if (lType === types.u32) {
      return "(" + value + " >>> 0)";
    } else if (lType === types.i32) {
      return "(" + value + " | 0)";
    } else if (lType === types.num) {
      return value;
    }
  }
  if (lType instanceof PointerType) {
    if (rType === types.u32 || rType === types.i32) {
      return value;
    }
  }
  if (lType === types.dyn) {
    return value;
  }
  return unexpected("Cannot convert types " + quote(rType) + " to " + quote(lType));
}

function generateAssignment(node, scope, left, operator, right, lType, rType, inVarStatement) {
  var l = left.generateCode(null, scope);
  var r = right ? right.generateCode(null, scope) : null;
  if (lType instanceof StructType) {
    check(node, operator === null || operator === "=", "Can't apply operator " + quote(operator) + " to structs.");
    var value = generateMemoryCopy(l, r, lType.getSize());
    if (inVarStatement) {
      value = "_ = " + value;
    }
    return value;
  }
  var assignment = l + " " + operator + " ";
  if (lType instanceof PointerType && (operator == "+=" || operator == "-=")) {
    value = generateConversion(r, types.i32, rType);
    var scale = lType.type.size / types.word.size;
    assert (scale);
    if (scale > 1) {
      value = paren(value + " * " + scale);
    }
    assignment += value;
  } else {
    if (right && rType) {
      assignment += generateConversion(r, lType, rType);
    } else {
      assignment += lType.defaultValue;
    }
  }

  if (inVarStatement) {
    if (left instanceof Variable && left.isStackAllocated) {
      assignment = "_ = " + assignment;
    }
    return assignment;
  }
  return paren(assignment);
}

function isInteger(x) {
  return parseInt(x) === Number(x);
}

function isPowerOfTwo(x) {
  return x && ((x & (x - 1)) === 0);
}

function wordAlignment(x) {
  return (x + 3) & ~0x3;
}

function log2(x) {
  assert (isPowerOfTwo(x), "Value " + x + " is not a power of two.");
  return Math.log(x) / Math.LN2;
}

function div4(x) {
  assert (x % 4 === 0, "Value " + x + " is not divisible by four.");
  return x / 4;
}

function getViewName(type) {
  return (type.signed ? "I" : "U") + type.size;
}

function generateMemoryAccess(scope, address, type, byteOffset) {
  byteOffset = byteOffset || 0;
  var pType = address.type;
  assert (pType instanceof PointerType);
  var bType = pType.type;
  type = type instanceof PointerType ? types.u32 : type;
  var view = getViewName(type);
  if (view in scope.options.cachedViews) {
    view = scope.options.cachedViews[view];
  }
  address = address.generateCode(null, scope);
  address = generateConversion(address, pType, new PointerType(bType));
  var offset = byteOffset / min(bType.size, types.word.size);
  if (offset) {
    address += " + " + offset;
  }
  return view + "[" + address + "]";

  /*
  if (type === types.i32) {
    return "I32[" + address + (offset ? " + " + offset : "") + " >> " + log2(type.getSize()) + "]";
  } else if (type === types.u32 || type instanceof PointerType) {
    return "U32[" + address + (offset ? " + " + offset : "") + " >> " + log2(type.getSize()) + "]";
  }
  */

  return notImplemented(type);
};


function PropertyAccess (base, accessor) {
  this.tag = "PropertyAccess";
  this.base = base;
  this.accessor = accessor;
}

PropertyAccess.prototype = {
  computeType: function (scope) {
    var type = this.base.computeType(scope);
    if (this.accessor.tag === "expression") {
      this.accessor.expression.computeType(scope);
      if (type instanceof PointerType) {
        return this.type = type.type;
      }
      assert (false);
    } else if (this.accessor.tag === "arrow") {
      check(this, type instanceof PointerType, "Cannot dereference non pointer type.");
      check(this, type.pointers === 0, "Cannot dereference pointers to pointers type.");
      scope.cacheView(type);
      type = type.base;
    } else {
      check(this, !(type instanceof PointerType), "Cannot use . operator on pointer types.");
    }
    if (type instanceof StructType) {
      check(this, type instanceof StructType, "Property access on non structs is not possible.");
      var field = type.getField(this.accessor.name);
      check(this, field, "Field \"" + this.accessor.name + "\" does not exist in type " + type + ".");
      this.field = field;
      scope.cacheView(field.type);
      return this.type = field.type;
    } else {
      return this.type = types.dyn;
    }
  },
  generateCode: function (writer, scope) {
    if (this.accessor.tag === "arrow") {
      return generateMemoryAccess(scope, this.base, this.field.type, this.field.offset);
    } else if (this.accessor.tag === "dot") {
      if (this.base.type === types.dyn) {
        return this.base.generateCode(null, scope) + "." + this.accessor.name;
      } else {
        var base = this.base;
        if (base instanceof VariableIdentifier) {
          assert (base.variable.isStackAllocated);
          base = base.variable.getPointer();
        }
        return generateMemoryAccess(scope, base, this.field.type, this.field.offset);
      }
    }
    throw notImplemented();
  }
};

function NewExpression (constructor, arguments) {
  this.tag = "NewExpression";
  this.constructor = constructor;
  this.arguments = arguments;
}

NewExpression.prototype = {
  computeType: function (scope) {
    var ct = scope.getType(this.constructor.name);
    return this.type = new PointerType(ct);
  },
  generateCode: function (writer, scope) {
    assert (!writer);
    return "malloc(" + this.type.type.getSize() + ")";
  }
};

function Block (statements) {
  this.tag = "Block";
  this.statements = statements;
}

Block.prototype = {
  computeType: function (scope) {
    walkComputeTypes(this.statements, scope);
  },
  generateCode: function (writer, scope) {
    walkGenerateCode(this.statements, writer, scope);
  }
};

function WhileStatement (condition, statement, isDoWhile) {
  this.tag = "WhileStatement";
  this.condition = condition;
  this.statement = statement;
  this.isDoWhile = isDoWhile;
}

WhileStatement.prototype = {
  computeType: function (scope) {
    this.condition.computeType(scope);
    this.statement.computeType(scope);
  },
  generateCode: function (writer, scope) {
    if (this.isDoWhile) {
      writer.enter("do {");
    } else {
      writer.enter("while (" + this.condition.generateCode(null, scope) + ") {");
    }
    this.statement.generateCode(writer, scope);
    if (this.isDoWhile) {
      writer.leave("} while (" + this.condition.generateCode(null, scope) + ")");
    } else {
      writer.leave("}");
    }
  }
};

function IfStatement (condition, ifStatement, elseStatement) {
  this.tag = "IfStatement";
  this.condition = condition;
  this.ifStatement = ifStatement;
  this.elseStatement = elseStatement;
}

IfStatement.prototype = {
  computeType: function (scope) {
    this.condition.computeType(scope);
    this.ifStatement.computeType(scope);
    if (this.elseStatement) {
      this.elseStatement.computeType(scope);
    }
  },
  generateCode: function (writer, scope) {
    writer.enter("if (" + this.condition.generateCode(null, scope) + ") {");
    this.ifStatement.generateCode(writer, scope);
    if (this.elseStatement) {
      if (this.elseStatement instanceof Block) {
        writer.leaveAndEnter("} else {");
        this.elseStatement.generateCode(writer, scope);
      } else if (this.elseStatement instanceof IfStatement) {
        writer.leaveAndEnter("} else if (" + this.elseStatement.condition.generateCode(null, scope) + ") {");
        this.elseStatement.ifStatement.generateCode(writer, scope);
      }
    }
    writer.leave("}");
  }
};

function ForStatement (initializer, test, counter, statement) {
  this.tag = "ForStatement";
  this.initializer = initializer;
  this.test = test;
  this.counter = counter;
  this.statement = statement;
}

ForStatement.prototype = {
  computeType: function (scope) {
    if (this.initializer) {
      this.initializer.computeType(scope);
    }
    if (this.test) {
      this.test.computeType(scope);
    }
    if (this.counter) {
      this.counter.computeType(scope);
    }
    this.statement.computeType(scope);
  },
  generateCode: function (writer, scope) {
    scope = new Scope(scope, "For");
    var str = "for (";
    str += (this.initializer ? this.initializer.generateCode(null, scope) : "") + "; ";
    str += (this.test ? this.test.generateCode(null, scope) : "") + "; ";
    str += (this.counter ? this.counter.generateCode(null, scope) : "");
    str += ") {";
    writer.enter(str);
    this.statement.generateCode(writer, scope);
    writer.leave("}");
  }
};

function compile2(source, generateExports) {
  var program = parser.parse(source);
//  print (JSON.stringify(program, null, 2));
  program.computeType(types);
//  print (JSON.stringify(program, null, 2));
  var str = "";
  var writer = new IndentingWriter(false, {writeLn: function (x) {
    str += x + "\n";
  }});
  program.generateCode(writer);
  return str;
}

function walk(node, match) {
  print("Walk : " + node.type);
  var fn = match[node.type];
  if (fn) {
    fn.call(node);
  } else {
    for (var key in node) {
      var val = node[key];
      if (val) {
        if (val instanceof Object && "type" in val) {
          walk(val, match);
        } else if (val instanceof Array) {
          for (var i = 0; i < val.length; i++) {
            if (val[i] instanceof Object && "type" in val[i]) {
              walk(val[i], match);
            }
          }
        }
      }
    }
  }
}


function compile(node) {
  print (JSON.stringify(node, null, 2));

  computeTypes(node);

  print (JSON.stringify(node, null, 2));
}

function computeTypes(node) {
  var scope = node.scope = new Scope(null, "Program", true);
  var match = {
    VariableDeclaration: function (scope) {
      var type = getType(this.typeSpecifier);
      walkList(this.declarations, {
        VariableDeclarator: function () {
          if (this.pointer) {
            for (var i = 0; i < this.pointer.count; i++) {
              type = new PointerType(type);
            }
          }
          scope.addVariable(this.variable = new Variable(this.id.name, type));
        }
      });
    }
  };
  function walk(node, scope) {
    assert (node.type in match);
    return match[node.type].call(node, scope);
  }
  function walkList(list, match) {
    for (var i = 0; i < list.length; i++) {
      match[list[i].type].call(list[i]);
    }
  }
  walk(node, match);
}