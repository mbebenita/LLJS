(function (exports) {
  var util, T, Types;
  if (typeof process !== "undefined") {
    util = require("./util.js");
    T = require("./estransform.js");
    Types = require("./types.js");
  } else {
    util = this.util;
    T = estransform;
    Types = this.Types;
  }

  /**
   * Import nodes.
   */
  const Node = T.Node;
  const Literal = T.Literal;
  const Identifier = T.Identifier;
  const VariableDeclaration = T.VariableDeclaration;
  const VariableDeclarator = T.VariableDeclarator;
  const MemberExpression = T.MemberExpression;
  const BinaryExpression = T.BinaryExpression;
  const SequenceExpression = T.SequenceExpression;
  const CallExpression = T.CallExpression;
  const AssignmentExpression = T.AssignmentExpression;
  const ExpressionStatement = T.ExpressionStatement;
  const ReturnStatement = T.ReturnStatement;
  const Program = T.Program;
  const FunctionDeclaration = T.FunctionDeclaration;
  const FunctionExpression = T.FunctionExpression;
  const ConditionalExpression = T.ConditionalExpression;
  const ObjectExpression = T.ObjectExpression;
  const UnaryExpression = T.UnaryExpression;
  const NewExpression = T.NewExpression;
  const UpdateExpression = T.UpdateExpression;
  const ForStatement = T.ForStatement;
  const BlockStatement = T.BlockStatement;
  const CatchClause = T.CatchClause;
  const ThisExpression = T.ThisExpression;
  const TypeAliasDirective = T.TypeAliasDirective;
  const CastExpression = T.CastExpression;

  /**
   * Import utilities.
   */
  const assert = util.assert;
  const cast = util.cast;
  const alignTo = util.alignTo;
  const dereference = util.dereference;

  /**
   * Import types.
   */
  const TypeAlias = Types.TypeAlias;
  const PrimitiveType = Types.PrimitiveType;
  const StructType = Types.StructType;
  const PointerType = Types.PointerType;
  const ArrowType = Types.ArrowType;

  /**
   * Scopes and Variables
   */

  function Variable(name, type) {
    this.name = name;
    this.type = type;
    this.isStackAllocated = (type instanceof StructType ||
                             (type && type.arraySize !== undefined));
  }

  Variable.prototype.toString = function () {
    return Types.tystr(this.type, 0) + " " + this.name;
  };

  Variable.prototype.getStackAccess = function getStackAccess(scope, loc) {
    assert(this.isStackAllocated);
    assert(typeof this.wordOffset !== "undefined", "stack-allocated variable offset not computed.");
    var byteOffset = this.wordOffset * Types.wordTy.size;
    return dereference(scope.SP(), byteOffset, this.type, scope, loc);
  };

  function Scope(parent, name) {
    this.name = name;
    this.parent = parent;
    this.root = parent.root;
    this.variables = Object.create(null);
    this.frame = parent.frame;
    assert(this.frame instanceof Frame);
  }

  Scope.prototype.getVariable = function getVariable(name, local) {
    var variable = this.variables[name];
    if (variable instanceof Variable) {
      return variable;
    }

    if (this.parent && !local) {
      return this.parent.getVariable(name);
    }

    return null;
  };

  Scope.prototype.freshName = function freshName(name, variable) {
    var mangles = this.frame.mangles;
    var fresh = 0;
    var freshName = name;
    while (mangles[freshName]) {
      freshName = name + "$" + ++fresh;
    }
    if (variable) {
      mangles[freshName] = variable;
    }
    return freshName;
  };

  Scope.prototype.freshVariable = function freshVariable(name, type) {
    var variable = new Variable(name, type);
    variable.name = this.freshName(name, variable);
    return variable;
  };

  Scope.prototype.freshTemp = function freshTemp(ty, loc, inDeclarator) {
    var t = this.freshVariable("_", ty);
    var id = cast(new Identifier(t.name), ty);
    if (!inDeclarator) {
      var cachedLocals = this.frame.cachedLocals;
      cachedLocals[t.name] = new VariableDeclarator(id);
    }
    return id;
  };

  Scope.prototype.cacheReference = function cacheReference(node) {
    assert(node);

    var def, use;

    if (node instanceof MemberExpression && !(node.object instanceof Identifier)) {
      assert(!node.computed);
      var t = this.freshTemp(node.object.ty, node.object.loc);
      node.object = new AssignmentExpression(t, "=", node.object, node.object.loc);
      var use = new MemberExpression(t, node.property, false, "[]", node.property.loc);
      return { def: node, use: use };
    }

    return { def: node, use: node };
  };

  Scope.prototype.addVariable = function addVariable(variable, external) {
    assert(variable);
    assert(!variable.frame);
    assert(!this.variables[variable.name], "Scope already has a variable named " + variable.name);
    variable.frame = this.frame;

    var variables = this.variables;
    var name = variable.name;

    variables[name] = variable;
    if (!external) {
      variable.name = this.freshName(name, variable);
    }

    //logger.info("added variable " + variable + " to scope " + this);
  };

  Scope.prototype.MEMORY = function MEMORY() {
    return this.root.MEMORY();
  };

  Scope.prototype.getView = function getView(type) {
    return this.frame.getView(type);
  };

  Scope.prototype.MALLOC = function MALLOC() {
    return this.frame.MALLOC();
  };

  Scope.prototype.FREE = function FREE() {
    return this.frame.FREE();
  };

  Scope.prototype.MEMCPY = function MEMCPY(size) {
    return this.frame.MEMCPY(size);
  };

  Scope.prototype.MEMSET = function MEMSET(size) {
    return this.frame.MEMSET(size);
  };
  
  Scope.prototype.MEMCHECK_CALL_PUSH = function MEMCHECK_CALL_PUSH() {
    return this.frame.MEMCHECK_CALL_PUSH();
  };
  
  Scope.prototype.MEMCHECK_CALL_RESET = function MEMCHECK_CALL_RESET() {
    return this.frame.MEMCHECK_CALL_RESET();
  };
  
  Scope.prototype.MEMCHECK_CALL_POP = function MEMCHECK_CALL_POP() {
    return this.frame.MEMCHECK_CALL_POP();
  };

  Scope.prototype.toString = function () {
    return this.name;
  };

  function Frame(parent, name) {
    this.name = name;
    this.parent = parent;
    this.root = parent ? parent.root : this;
    this.variables = Object.create(null);
    this.cachedLocals = Object.create(null);
    this.frame = this;
    this.mangles = Object.create(null);
  }

  Frame.prototype = Object.create(Scope.prototype);

  function getCachedLocal(frame, name, ty) {
    var cachedLocals = frame.cachedLocals;
    var cname = "$" + name;
    if (!cachedLocals[cname]) {
      var id = cast(new Identifier(frame.freshVariable(cname, ty).name), ty);
      var init = new MemberExpression(frame.root.MEMORY(), new Identifier(name), false);
      cachedLocals[cname] = new VariableDeclarator(id, init, false);
    }
    return cachedLocals[cname].id;
  }

  Frame.prototype.MEMORY = function MEMORY() {
    assert(this.root === this);
    if (!this.cachedMEMORY) {
      this.cachedMEMORY = new Identifier(this.freshVariable("$M").name);
    }
    return this.cachedMEMORY;
  };

  Frame.prototype.MALLOC = function MALLOC() {
    return getCachedLocal(this, "malloc", Types.mallocTy);
  };

  Frame.prototype.FREE = function FREE() {
    return getCachedLocal(this, "free", Types.freeTy);
  };

  Frame.prototype.MEMCPY = function MEMCPY(size) {
    assert(size === 1 || size === 2 || size === 4);
    var name, ty;
    switch (size) {
    case 1: name = "memcpy"; ty = Types.memcpyTy; break;
    case 2: name = "memcpy2"; ty = Types.memcpy2Ty; break;
    case 4: name = "memcpy4"; ty = Types.memcpy4Ty; break;
    }
    return getCachedLocal(this, name, ty);
  };

  Frame.prototype.MEMSET = function MEMSET(size) {
    assert(size === 1 || size === 2 || size === 4);
    var name, ty;
    switch (size) {
    case 1: name = "memset"; ty = Types.memsetTy; break;
    case 2: name = "memset2"; ty = Types.memset2Ty; break;
    case 4: name = "memset4"; ty = Types.memset4Ty; break;
    }
    return getCachedLocal(this, name, ty);
  };
  
  Frame.prototype.MEMCHECK_CALL_PUSH = function MEMCHECK_CALL_PUSH() {
    return getCachedLocal(this, "memcheck_call_push", "dyn");
  };
  
  Frame.prototype.MEMCHECK_CALL_RESET = function MEMCHECK_CALL_RESET() {
    return getCachedLocal(this, "memcheck_call_reset", "dyn");
  };
  
  Frame.prototype.MEMCHECK_CALL_POP = function MEMCHECK_CALL_POP() {
    return getCachedLocal(this, "memcheck_call_pop", "dyn");
  };

  Frame.prototype.getView = function getView(ty) {
    assert(ty);
    assert(ty.align);

    var alignType = ty.align;
    if (typeof alignType.signed === "undefined") {
      return getCachedLocal(this, "F" + alignType.size);
    }
    return getCachedLocal(this, (alignType.signed ? "I" : "U") + alignType.size);
  };

  Frame.prototype.SP = function SP() {
    if (!this.cachedSP) {
      this.cachedSP = cast(new Identifier(this.freshVariable("$SP").name), Types.spTy);
    }
    return this.cachedSP;
  };

  Frame.prototype.realSP = function realSP() {
    return cast(new MemberExpression(this.getView(Types.builtinTypes.uint), new Literal(1), true), Types.spTy);
  };

  Frame.prototype.close = function close() {
    const wordSize = Types.wordTy.size;
    var wordOffset = 0;
    var mangles = this.mangles;
    // The SP and frame sizes are in *words*, since we expect most accesses
    // are to ints, but the alignment is by *double word*, to fit doubles.
    for (var name in mangles) {
      var variable = mangles[name];
      if (mangles[name].isStackAllocated) {
        var size = variable.type.size;
        variable.wordOffset = wordOffset;
        wordOffset += alignTo(size, wordSize * 2) / wordSize;
      }
    }

    this.frameSizeInWords = wordOffset;
  };

  exports.Variable = Variable;
  exports.Scope = Scope;
  exports.Frame = Frame;
  exports.getCachedLocal = getCachedLocal;

}).call(this, typeof exports === "undefined" ? (scope = {}) : exports);

