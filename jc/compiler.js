
function compile(source, generateExports) {
  var program = parser.parse(source);


  function check(node, condition, message) {
    if (!condition) {
      reportError(node, message);
    }
  }

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
      return other instanceof FunctionType;
    };
    functionType.prototype.getSize = function () {
      return 4;
    };
    return functionType;
  })();

  function walk(node, match, options) {
    assert (node);
    var nodes = node;
    if (typeof nodes.length === "undefined") {
      nodes = [nodes];
    }
    var results = [];
    for (var i = 0; i < nodes.length; i++) {
      node = nodes[i];
      if (node.tag in match) {
        results.push(match[node.tag].call(node, options));
      }
    }
    return results;
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
    uint: new Type("uint", 4, 0),

    u8: new Type("u8", 1, 0),
    i8: new Type("i8", 1, 0),
    u16: new Type("u16", 2, 0),
    i16: new Type("i16", 2, 0),
    u32: new Type("u32", 4, 0),
    i32: new Type("i32", 4, 0),

    void: new Type("void", undefined, 0),
    dyn: new Type("dyn", undefined, 0)
  };

  function createType(node) {
    assert (node);
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
      StructDeclaration: function StructDeclaration() {
        assert (!(this.name in types), "Type " + this.name + " is already defined.");
        types[this.name] = new Type(this.name);
      }
    });

    /*
    walk(program.elements, {
      Struct: function Struct() {
        var type = types[this.name];
        check (this, this.elements.length, "Structs must have at least one field declaration.");
        this.elements.forEach(function (x) {
          type.addField(x.name, createType(x.type));
        });
      }
    });
    */

  })(program);

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
      str = "At " + position.line + ":" + position.column + ": ";
    } else {
      str = "At " + node.tag + ": ";
    }

    throw new Error(str + message);
  }

  function checkTypeAssignment(node, a, b) {
    if (!a.assignableFrom(b)) {
      reportError(node, "Unassignable types " + a + " <= " + b);
    }
  }

  var Scope = (function () {
    function scope(parent, name) {
      this.name = name;
      this.parent = parent;
      this.symbols = {};
      this.symbolList = [];
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
      print("Adding name: " + name + ", symbol: " + symbol + " to scope " + this + ".");
      this.symbols[name] = symbol;
      this.symbolList.push({name: name, symbol: symbol});
    };

    scope.prototype.toString = function toString() {
      return this.name;
    };

    return scope;
  })();

  print (JSON.stringify(program, null, 2));

  (function computeTypes(program) {
    var global = new Scope(null, "global");

    var match = {
      Program: function Program() {
        walk(this.elements, match, {scope: global});
      },
      VariableStatement: function VariableStatement(o) {
        assert (o.scope);
        o = Object.create(o, {type: {value: getType(this.typeSpecifier)}});
        this.declarations = walk(this.declarations, match, o);
      },
      VariableDeclaration: function VariableDeclaration(o) {
        var type = walkExpression(this.declarator, match, o);
        var name = o.scope.symbolList.last().name;
        var valueType = walkExpression(this.value, match, o);
        checkTypeAssignment(this, type, valueType);
        return {name: name, type: type, value: this.value};
      },
      StructDeclaration: function StructDeclaration(o) {
        var type = types[this.name];
        assert (type);
        check (this, this.declarations.length, "Structs must have at least one field declaration.");
        var scope = new Scope();
        walk(this.declarations, match, {scope: scope});
        scope.symbolList.forEach(function (s) {
          type.addField(s.name, s.symbol);
        });
      },
      FieldDeclaration: function FieldDeclaration(o) {
        var type = getType(this.typeSpecifier);
        if (this.declarator) {
          o = Object.create(o, {type: {value: type}});
          type = walkExpression(this.declarator, match, o);
        }
        return type;
      },
      Declarator: function Declarator(o) {
        var type = o.type;
        if (this.pointer) {
          for (var i = 0; i < this.pointer.count; i++) {
            type = new PointerType(type);
          }
        }
        if (this.directDeclarator) {
          o = Object.create(o, {type: {value: type}});
          return walkExpression(this.directDeclarator, match, o);
        }
        return type;
      },
      DirectDeclarator: function DirectDeclarator(o) {
        assert (o.type);
        var type = o.type;
        for (var i = this.declaratorSuffix.length - 1; i >= 0; i--) {
          type = walkExpression(this.declaratorSuffix[i], match, { returnType: type });
        }
        if (this.declarator) {
          o = Object.create(o, {type: {value: type}});
          type = walkExpression(this.declarator, match, o);
        } else if (this.name) {
          o.scope.add(this.name, type);
        }
        return type;
      },
      FunctionDeclarator: function FunctionDeclarator(o) {
        var parameterTypes = this.parameterList ? this.parameterList.map(function (x) {
          return walkExpression(x, match, o);
        }) : [];
        return new FunctionType(o.returnType, parameterTypes);
      },
      ParameterDeclaration: function ParameterDeclaration(o) {
        var type = getType(this.typeSpecifier);
        if (this.declarator) {
          o = Object.create(o, {type: {value: type}});
          type = walkExpression(this.declarator, match, o);
        }
        return type;
      },
      ArrayDeclarator: function ArrayDeclarator(o) {
        notImplemented();
      },
      TypeName: function TypeName(o) {
        var type = getType(this.typeSpecifier);
        if (this.declarator) {
          o = Object.create(o, {type: {value: type}});
          return walkExpression(this.declarator, match, o);
        }
        return this.type = type;
      },
      Void: function Void() {
        return types.void;
      },
      BinaryExpression: function BinaryExpression(o) {
        var l = walkExpression(this.left, match, o);
        var r = walkExpression(this.right, match, o);
        return this.type = l;
      },
      UnaryExpression: function UnaryExpression(o) {
        var type = walkExpression(this.expression, match, o);
        if (this.operator === "*") {
          type = type.type;
        }
        return this.type = type;
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
        var parameterTypes = [];
        this.parameters = this.parameters.map(function (x) {
          var type = walkExpression(x, match, o);
          parameterTypes.push(type);
          return {name: x.declarator.directDeclarator.name, type: type};
        });
        var returnType = walkExpression(this.type, match, o);
        this.type = new FunctionType(returnType, parameterTypes);
        o = Object.create(o, {functionType: {value: this.type}});
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
      IfStatement: function IfStatement(o) {
        walk(this.condition, match, o);
        walk(this.ifStatement, match, o);
        if (this.elseStatement) {
          walk(this.elseStatement, match, o);
        }
      },
      Block: function Block(o) {
        o = {scope: new Scope(o.scope)};
        walk(this.statements, match, o);
      },
      FunctionCall: function FunctionCall(o) {
        walk(this.arguments, match, o);
      },
      ReturnStatement: function ReturnStatement(o) {
        var type = walkExpression(this.value, match, o);
//        checkTypeAssignment(this, o.functionType.returnType, type);
      },
      ConditionalExpression: function ConditionalExpression(o) {
        var cType = walkExpression(this.condition, match, o);
        var tType = walkExpression(this.trueExpression, match, o);
        var fType = walkExpression(this.falseExpression, match, o);
        // TODO: Merge types here.
        return tType;
      }
    };
    walk(program, match);
  })(program);

  print (JSON.stringify(program, null, 2));

  var str = "";
  var writer = new IndentingWriter(false, {writeLn: function (x) {
    str += x + "\n";
  }});

  (function generateCode(program) {

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

    var global = new Scope(null, "global");

    function log2(x) {
      return Math.log(x) / Math.LN2;
    }

    function accessMemory(address, type, offset) {
      if (type === types.int) {
        return "I32[" + address + (offset ? " + " + offset : "") + " >> " + log2(type.getSize()) + "]";
      } else if (type === types.uint || type instanceof PointerType) {
        return "U32[" + address + (offset ? " + " + offset : "") + " >> " + log2(type.getSize()) + "]";
      }
      return notImplemented(type);
    };

    var match = {
      Program: function Program() {
        walk(this.elements, match, {scope: global});
      },
      StructDeclaration: function () {},
      VariableStatement: function VariableStatement(o) {
        assert (o.scope);
        var str = "var " +
          this.declarations.map(function (x) {
            o.scope.add(x.name, new Variable(x.name, x.type, 0));
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
      UnaryExpression: function UnaryExpression(o) {
        if (this.operator === "*") {
          return accessMemory(walkExpression(this.expression, match, o), this.expression.type);
        } else {
          return this.operator + walkExpression(this.expression, match, o);
        }
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
        o.scope.add(this.name, this.type);
        o = {scope: new Scope(o.scope, "function scope for " + this.name)};
        walk(this.parameters, match, o);
        writer.enter("function " + this.name + "(" +
          this.parameters.map(function (x) {
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
        return "malloc(" + this.type.type.getSize() + ")";
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
        o = {scope: new Scope(o.scope, "block scope")};
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
      IfStatement: function IfStatement(o) {
        writer.enter("if (" + walkExpression(this.condition, match, o) + ") {");
        walk(this.ifStatement, match, o);
        if (this.elseStatement) {
          if (this.elseStatement.tag === "Block") {
            writer.leaveAndEnter("} else {");
            walk(this.elseStatement, match, o);
          } else if (this.elseStatement.tag === "IfStatement") {
            writer.leaveAndEnter("} else if (" + walkExpression(this.elseStatement.condition, match, o) + ") {");
            walk(this.elseStatement.ifStatement, match, o);
          }
        }
        writer.leave("}");
      },
      ConditionalExpression: function ConditionalExpression(o) {
        return "((" + walkExpression(this.condition, match, o) + ") ? " +
          walkExpression(this.trueExpression, match, o) + " : " +
          walkExpression(this.falseExpression, match, o) + ")";
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

    if (generateExports) {
      writer.writeLn("return {" + global.symbolList.filter(function (x) {
        return x.symbol instanceof FunctionType;
      }).map(function (x) {
        return "\"" + x.name + "\": " + x.name;
      }).join(", ") + "};");
    }

  })(program);

  return str;
}


