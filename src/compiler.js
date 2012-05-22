(function (exports) {
  if (typeof process !== "undefined") {
    util = require("./util.js");
  }

  if (typeof process !== "undefined") {
    var T = require("./estransform.js");
  } else {
    var T = estransform;
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
  const ThisExpression = T.ThisExpression;
  const TypeAliasDirective = T.TypeAliasDirective;
  const CastExpression = T.CastExpression;

  var Option = util.Option;
  var OptionSet = util.OptionSet;
  var IndentingWriter = util.IndentingWriter;
  var assert = util.assert;
  var quote = util.quote;
  var clone = util.clone;
  var mapObject = util.mapObject;

  var options = new OptionSet("Compiler Options");
  var bare = options.register(new Option("b", "b", false, "Don't wrap in module."));
  var trace = options.register(new Option("t", "t", false, "Trace compiler execution."));

  function isInteger(x) {
    return parseInt(x) === Number(x);
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

  function extend(old, props) {
    var newObj = Object.create(old);
    if (props) {
      for (var key in props) {
        newObj[key] = props[key];
      }
    }
    return newObj;
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

  function check(node, condition, message, warn) {
    if (!condition) {
      (warn ? reportWarning : reportError)(node, message);
    }
  }

  function reportWarning(node, message) {
    if (console) {
      var position = node.loc;
      var prefix = "";
      if (position) {
        prefix += ":" + position.start.line + ":" + position.start.column + ": ";
      }
      console.warn(prefix + "warning: " + message);
    }
  }

  /**
   * Types.
   */

  function tystr(type, lvl) {
    if (!type) {
      return "dyn";
    }
    return type.toString(lvl);
  }

  function TypeAlias(name) {
    this.name = name;
  };

  function PrimitiveType(name, size, defaultValue, signed) {
    this.name = name;
    this.size = size;
    this.signed = signed;
    this.defaultValue = defaultValue;
    this.align = this;
  };

  PrimitiveType.prototype.toString = function () {
    return this.name;
  };

  PrimitiveType.prototype.toJSON = function () {
    return this.name;
  };

  PrimitiveType.prototype.lint = function () {};

  function StructType(name) {
    this.name = name;
    this.fields = [];
    this.offset = 0;
  }

  StructType.prototype.toString = function (lvl) {
    lvl = lvl || 0;
    if (lvl > 0) {
      return this.name;
    }
    var s = "struct" + (this.name ? (" " + this.name) : " ") + " { ";
    s += this.fields.map(function (f) {
      return tystr(f.type, lvl + 1) + " " + f.name;
    }).join("; ");
    return s + " }";
  };

  StructType.prototype.toJSON = function () {
    return this.toString(0);
  };

  StructType.prototype.getField = function getField(name) {
    var fields = this.fields;
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].name === name) {
        return fields[i];
      }
    }
    return null;
  };

  function PointerType(base) {
    this.base = base;
  };

  PointerType.prototype.defaultValue = 0;
  PointerType.prototype.size = 4;

  PointerType.prototype.toString = function (lvl) {
    lvl = lvl || 0;
    return tystr(this.base, lvl + 1) + "*";
  };

  PointerType.prototype.toJSON = function () {
    return this.toString(0);
  };

  function ArrowType(paramTypes, returnType) {
    this.paramTypes = paramTypes;
    this.returnType = returnType;
  }

  ArrowType.prototype.toString = function () {
    return this.name || (this.name = this.returnType + "(" + this.paramTypes.join(", ") + ")");
  };

  ArrowType.prototype.toJSON = function () {
    return this.toString();
  };

  const u8ty  = new PrimitiveType("u8",  1, 0, false);
  const i8ty  = new PrimitiveType("i8",  1, 0, true);
  const u16ty = new PrimitiveType("u16", 2, 0, false);
  const i16ty = new PrimitiveType("i16", 2, 0, true);
  const u32ty = new PrimitiveType("u32", 4, 0, false);
  const i32ty = new PrimitiveType("i32", 4, 0, true);
  const f32ty = new PrimitiveType("f32", 4, 0, undefined);
  const f64ty = new PrimitiveType("f64", 8, 0, undefined);

  const wordTy = u32ty;
  const voidTy = new PrimitiveType("void", 0, 0, undefined);
  const bytePointerTy = new PointerType(u8ty);
  const spTy = new PointerType(u32ty);

  const mallocTy = new ArrowType([u32ty], bytePointerTy);
  const freeTy = new ArrowType([bytePointerTy], voidTy);

  function createMemcpyType(pointerTy) {
    return new ArrowType([pointerTy, pointerTy, u32ty], pointerTy);
  }

  function createMemsetType(pointerTy) {
    return new ArrowType([pointerTy, pointerTy.base, u32ty], voidTy);
  }

  const memcpyTy  = createMemcpyType(bytePointerTy);
  const memcpy2Ty = createMemcpyType(new PointerType(u16ty));
  const memcpy4Ty = createMemcpyType(new PointerType(u32ty));
  const memsetTy  = createMemsetType(bytePointerTy);
  const memset2Ty = createMemsetType(new PointerType(u16ty));
  const memset4Ty = createMemsetType(new PointerType(u32ty));

  u8ty.integral = u8ty.numeric = true;
  i8ty.integral = i8ty.numeric = true;
  u16ty.integral = u16ty.numeric = true;
  i16ty.integral = i16ty.numeric = true;
  u32ty.integral = u32ty.numeric = true;
  i32ty.integral = i32ty.numeric = true;
  f32ty.numeric = true;
  f64ty.numeric = true;

  var builtinTypes = {
    u8:     u8ty,
    i8:     i8ty,
    u16:    u16ty,
    i16:    i16ty,
    u32:    u32ty,
    i32:    i32ty,
    f32:    f32ty,
    f64:    f64ty,

    num:    f64ty,
    int:    i32ty,
    uint:   u32ty,
    float:  f32ty,
    double: f64ty,

    byte:   u8ty,
    word:   u32ty,

    void:   voidTy,
    dyn:    undefined
  };

  PointerType.prototype.align = u32ty;

  function Variable(name, type) {
    this.name = name;
    this.type = type;
    this.isStackAllocated = type instanceof StructType;
  }

  Variable.prototype.toString = function () {
    return "variable " + this.name + " " + tystr(this.type, 0);
  };

  Variable.prototype.getStackAccess = function getStackAccess(scope) {
    assert(this.isStackAllocated);
    assert(typeof this.wordOffset !== "undefined", "stack-allocated variable offset not computed.");
    var byteOffset = this.wordOffset * wordTy.size;
    return dereference(scope.SP(), byteOffset, this.type, scope);
  };

  function Scope(parent, name) {
    this.name = name;
    this.parent = parent;
    this.root = parent.root;
    this.variables = {};
    this.frame = parent.frame;
    assert(this.frame instanceof Frame);
  }

  Scope.prototype.getVariable = function getVariable(name, local) {
    var variable = this.variables[name];
    if (variable) {
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

  Scope.prototype.freshTemp = function freshTemp(ty, inDeclarator) {
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
      var t = this.freshTemp(node.obj.ty);
      node.object = new AssignmentExpression(t, "=", node.obj);
      var use = new MemberExpression(t, node.property, false);
      return { def: node, use: use };
    }

    return { def: node, use: node };
  };

  Scope.prototype.addVariable = function addVariable(variable, external) {
    assert(variable);
    assert(!variable.frame);
    assert(!this.variables[variable.name]);
    variable.frame = this.frame;

    var variables = this.variables;
    var name = variable.name;

    variables[name] = variable;
    if (!external) {
      variable.name = this.freshName(name, variable);
    }

    tracer.writeLn("Added variable " + variable + " to scope " + this);
  };

  Scope.prototype.MEMORY = function MEMORY() {
    return this.root.MEMORY();
  };

  Scope.prototype.getView = function getView(type) {
    return this.frame.getView(type);
  }

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

  Scope.prototype.toString = Scope.prototype.toJSON = function () {
    return this.name;
  };

  function Frame(parent, name) {
    this.name = name;
    this.parent = parent;
    this.root = parent ? parent.root : this;
    this.variables = {};
    this.cachedLocals = {};
    this.frame = this;
    this.mangles = {};
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
    return getCachedLocal(this, "malloc", mallocTy);
  };

  Frame.prototype.FREE = function FREE() {
    return getCachedLocal(this, "free", freeTy);
  };

  Frame.prototype.MEMCPY = function MEMCPY(size) {
    assert(size === 1 || size === 2 || size === 4);
    var name, ty;
    switch (size) {
    case 1: name = "memcpy"; ty = memcpyTy; break;
    case 2: name = "memcpy2"; ty = memcpy2Ty; break;
    case 4: name = "memcpy4"; ty = memcpy4Ty; break;
    }
    return getCachedLocal(this, name, ty);
  };

  Frame.prototype.MEMSET = function MEMSET(size) {
    assert(size === 1 || size === 2 || size === 4);
    var name, ty;
    switch (size) {
    case 1: name = "memset"; ty = memsetTy; break;
    case 2: name = "memset2"; ty = memset2Ty; break;
    case 4: name = "memset4"; ty = memset4Ty; break;
    }
    return getCachedLocal(this, name, ty);
  };

  Frame.prototype.getView = function getView(ty) {
    assert(ty);
    assert(ty.align);

    var alignType = ty.align;
    return getCachedLocal(this, (alignType.signed ? "I" : "U") + alignType.size);
  };

  Frame.prototype.SP = function SP() {
    if (!this.cachedSP) {
      this.cachedSP = cast(new Identifier(this.freshVariable("$SP").name), spTy);
    }
    return this.cachedSP;
  };

  Frame.prototype.realSP = function realSP() {
    return cast(new MemberExpression(this.getView(builtinTypes.uint), new Literal(1), true), spTy);
  };

  Frame.prototype.close = function close() {
    const wordSize = wordTy.size;
    var wordOffset = 0;
    var mangles = this.mangles;
    // The SP and frame sizes are in *words*, since we expect most accesses
    // are to ints, but the alignment is by *double word*, to fit doubles.
    for (var name in mangles) {
      var variable = mangles[name];
      if (mangles[name].isStackAllocated) {
        variable.wordOffset = wordOffset;
        wordOffset += alignTo(variable.type.size, wordSize * 2) / wordSize;
      }
    }

    this.frameSizeInWords = wordOffset;
  };

  var tracer;

  function compile(node, name) {
    tracer = new IndentingWriter(!trace.value);
    if (trace.value) {
      // print (JSON.stringify(node, null, 2));
    }

    // Lift into constructors.
    node = T.lift(node);

    // Pass 1.
    var types = resolveAndLintTypes(node, clone(builtinTypes));
    var o = { types: types, name: name };
    // Pass 2.
    node.scan(o);
    // Pass 3.
    node = node.transform(o);
    // Pass 4.
    node = node.lower(o);

    return createModule(node, name);
  }

  function createRequire(name) {
    return new CallExpression(new Identifier("require"), [new Literal(name)]);
  }

  function createModule(program, name) {
    var body = [];
    var cachedMEMORY = program.frame.cachedMEMORY;
    if (cachedMEMORY) {
      var mdecl;
      if (name === "memory") {
        mdecl = new VariableDeclarator(cachedMEMORY, new Identifier("exports"));
      } else {
        mdecl = new VariableDeclarator(cachedMEMORY, createRequire("memory"));
      }
      body.push(new VariableDeclaration("const", [mdecl]));
    }

    if (bare.value) {
      program.body = body.concat(program.body);
      return program;
    }

    body = new BlockStatement(body.concat(program.body));
    var exports = new Identifier("exports");
    var module = new MemberExpression(new FunctionExpression(null, [exports], body), new Identifier("call"));
    var moduleArgs = [
      new ThisExpression(),
      new ConditionalExpression(
        new BinaryExpression("===", new UnaryExpression("typeof", exports), new Literal("undefined")),
        new AssignmentExpression(new Identifier(name), "=", new ObjectExpression([])),
        exports)
    ];
    return new Program([new ExpressionStatement(new CallExpression(module, moduleArgs))]);
  }

  /**
   * Pass 1: resolve type synonyms and do some type sanity checking.
   */

  T.Type.prototype.reflect = function (o) {
    var ty = this.construct().resolve(o.types);
    ty.lint();
    return ty;
  };

  T.TypeIdentifier.prototype.construct = function () {
    var ty = new TypeAlias(this.name);
    ty.node = this;
    return ty;
  };

  T.PointerType.prototype.construct = function () {
    var ty = new PointerType(this.base.construct());
    ty.node = this;
    return ty;
  };

  T.StructType.prototype.construct = function () {
    var ty = new StructType(this.id ? this.id.name : undefined);
    ty.node = this;
    ty.fields = this.fields.map(function (f) {
      return { name: f.id.name, type: f.decltype.construct() };
    });
    return ty;
  };

  T.ArrowType.prototype.construct = function () {
    return new ArrowType(this.params.map(function (p) { return p.construct(); }),
                         this.return.construct());
  };

  function startResolving(ty) {
    if (ty._resolving) {
      reportError(ty.node, "infinite type");
    }
    ty._resolving = true;
  };

  function finishResolving(ty) {
    delete ty._resolving;
    ty._resolved = true;
  };

  PrimitiveType.prototype.resolve = function () {
    return this;
  };

  TypeAlias.prototype.resolve = function (types, inPointer) {
    startResolving(this);
    if (!(this.name in types)) {
      reportError(this.node, "unable to resolve type name `" + this.name + "'");
    }
    var ty = types[this.name];
    finishResolving(this);
    if (inPointer && ty instanceof TypeAlias) {
      ty = ty.resolve(types, inPointer);
    }
    return ty;
  };

  PointerType.prototype.resolve = function (types) {
    if (this._resolved) {
      return this;
    }

    startResolving(this);
    this.base = this.base.resolve(types, true);
    finishResolving(this);
    return this;
  };

  StructType.prototype.resolve = function (types) {
    if (this._resolved) {
      return this;
    }

    startResolving(this);
    var field, fields = this.fields;
    for (var i = 0, j = fields.length; i < j; i++) {
      field = fields[i];
      if (field.type) {
        field.type = field.type.resolve(types);
      }
    }
    finishResolving(this);
    return this;
  };

  ArrowType.prototype.resolve = function (types) {
    if (this._resolved) {
      return this;
    }

    var paramTypes = this.paramTypes;
    for (var i = 0, j = paramTypes.length; i < j; i++) {
      if (paramTypes[i]) {
        paramTypes[i] = paramTypes[i].resolve(types);
      }
    }
    if (this.returnType) {
      this.returnType = this.returnType.resolve(types);
    }
    return this;
  };

  PointerType.prototype.lint = function () {
    check(this.node, this.base, "pointer without base type");
    check(this.node, this.base.size, "cannot take pointer of size 0 type " + quote(tystr(this.base, 0)));
  };

  StructType.prototype.lint = function () {
    var maxSize = 1;
    var maxSizeType = u8ty;
    var fields = this.fields
    var field, type;
    var prev = { offset: 0, type: { size: 0 } };
    for (var i = 0, j = fields.length; i < j; i++) {
      field = fields[i];
      type = field.type;
      check(this.node, type, "cannot have untyped field");
      check(this.node, type.size, "cannot have fields of size 0 type " + quote(tystr(type, 0)));

      if (type.align.size > maxSize) {
        maxSize = type.size;
        maxSizeType = type;
      }
      field.offset = alignTo(prev.offset + prev.type.size, type.size);
      prev = field;
    }
    this.size = alignTo(field.offset + type.size, maxSize);
    this.align = maxSizeType;
  };

  ArrowType.prototype.lint = function () {
    var paramTypes = this.paramTypes;
    for (var i = 0, j = paramTypes.length; i < j; i++) {
      if (paramTypes[i]) {
        paramTypes[i].lint();
      }
    }
    if (this.returnType) {
      this.returnType.lint();
    }
  };

  function resolveAndLintTypes(root, types) {
    var s, stmts = root.body;
    var alias, aliases = [];
    var ty;
    for (var i = 0, j = stmts.length; i < j; i++) {
      s = stmts[i];
      if (s instanceof TypeAliasDirective) {
        alias = s.alias.name;
        if (s.original instanceof T.StructType && s.original.id) {
          types[alias] = types[s.original.id.name] = s.original.construct();
          aliases.push(s.original.id.name);
        } else {
          types[alias] = s.original.construct();
        }
        aliases.push(alias);
      } else if (s instanceof T.StructType && s.id) {
        types[s.id.name] = s.construct();
        aliases.push(s.id.name);
      }
    }

    for (var i = 0, j = aliases.length; i < j; i++) {
      ty = types[aliases[i]];
      ty.resolve(types).lint();
    }

    return types;
  }

  /**
   * Pass 2: build scope information and lint inline types.
   */

  function isNull(node) {
    return node instanceof Literal && (node.value === null || node.value === 0);
  }

  Node.prototype.scan = T.makePass("scan", "scanNode");

  function scanList(list, o) {
    for (var i = 0, j = list.length; i < j; i++) {
      list[i].scan(o);
    }
  }

  T.Type.prototype.scan = function (o) {
    return this;
  };

  Program.prototype.scan = function (o) {
    o = extend(o);
    var types = o.types;
    var scope = new Frame(null, "Program");
    o.scope = this.frame = scope;

    scope.addVariable(new Variable("exports"), true);
    scope.addVariable(new Variable("require"), true);
    scope.addVariable(new Variable("load"), true);

    scanList(this.body, o);

    return this;
  };

  FunctionExpression.prototype.scan =
  FunctionDeclaration.prototype.scan = function (o) {
    var scope = o.scope;

    var ty;
    if (this.decltype) {
      ty = this.decltype.reflect(o);
    }
    if (this.id) {
      scope.addVariable(new Variable(this.id.name, ty));
    }

    o = extend(o);
    scope = new Frame(scope, "Function " + (this.id ? this.id.name : "anonymous"));
    scope.returnType = ty.returnType;
    o.scope = this.frame = scope;

    var params = this.params;
    var parameters = this.parameters = [];
    var variable;
    for (var i = 0, j = params.length; i < j; i++) {
      variable = new Variable(params[i].name, ty.paramTypes[i]);
      scope.addVariable(variable);
      parameters.push(variable);
    }

    assert(this.body instanceof BlockStatement);
    scanList(this.body.body, o);

    return this;
  };

  VariableDeclaration.prototype.scan = function (o) {
    check(this, this.kind === "let" || this.kind === "const" || this.kind === "extern",
          "Only block scoped variable declarations are allowed, use the " + quote("let") + " keyword instead.");

    /* Only emit vars, we mangle names ourselves. */
    if (this.kind === "let") {
      this.kind = "var";
    }

    scanList(this.declarations, extend(o, { declkind: this.kind }));

    return this;
  };

  VariableDeclarator.prototype.scanNode = function (o) {
    var types = o.types;
    var scope = o.scope;

    var name = this.id.name;
    var ty = this.decltype ? this.decltype.reflect(o) : undefined;

    check(this, !scope.getVariable(name, true),
          "Variable " + quote(name) + " is already declared in local scope.");
    scope.addVariable(new Variable(name, ty), o.declkind === "extern");
  };

  ForStatement.prototype.scan = function (o) {
    o = extend(o);
    o.scope = this.scope = new Scope(o.scope, "ForStatement", "block");
    Node.prototype.scan.call(this, o);
    return this;
  };

  BlockStatement.prototype.scan = function (o) {
    o = extend(o);
    o.scope = this.scope = new Scope(o.scope, "BlockStatement", "block");
    scanList(this.body, o);
    return this;
  };

  /**
   * Pass 3: Type Transform
   */

  PrimitiveType.prototype.assignableFrom = function (other) {
    if (other instanceof PrimitiveType) {
      check(this, this.size === other.size, "conversion from " + quote(tystr(other, 0)) +
            " to " + quote(tystr(this, 0)) + " may alter its value", true);
      check(this, this.signed === other.signed, "conversion from " + quote(tystr(other, 0)) +
            " to " + quote(tystr(this, 0)) + " may alter its sign", true);

      return true;
    }

    if (other instanceof PointerType) {
      reportWarning(this, "conversion from pointer to " + quote(tystr(other, 0)) + " without cast");
      return true;
    }

    return false;
  };

  StructType.prototype.assignableFrom = function (other) {
    return this === other;
  };

  PointerType.prototype.assignableFrom = function (other) {
    if (other instanceof PointerType) {
      check(this, other.base.align.size >= this.base.align.size,
            "incompatible pointer conversion from " + quote(tystr(this, 0)) + " to " + quote(tystr(other, 0)), true);
      return true;
    }

    if (other instanceof PrimitiveType && other.integral) {
      reportWarning(this, "conversion from " + quote(tystr(other, 0)) +" to pointer without cast");
      return true;
    }

    return false;
  };

  ArrowType.prototype.assignableFrom = function (other) {
    if (!(other instanceof ArrowType)) {
      return false;
    }

    var paramTypes = this.paramTypes;
    var otherParamTypes = other.paramTypes;
    if (otherParamTypes.length != paramTypes.length) {
      return false;
    }

    for (var i = 0, j = paramTypes.length; i < j; i++) {
      if (!paramTypes[i].assignableFrom(otherParamTypes[i])) {
        return false;
      }
    }

    return this.returnType.assignableFrom(other.returnType);
  };

  function cast(node, ty) {
    if (node.ty && node.ty !== ty) {
      node = new CastExpression(undefined, node);
    }
    node.ty = ty;
    return node;
  }

  Node.prototype.transform = T.makePass("transform", "transformNode");

  function compileList(list, o) {
    var translist = [];
    var trans;
    for (var i = 0, j = list.length; i < j; i++) {
      trans = list[i].transform(o);
      if (trans !== null) {
        translist.push(trans ? trans : list[i]);
      }
    }
    return translist;
  }

  TypeAliasDirective.prototype.transform = function () {
    return null;
  };

  Program.prototype.transform = function (o) {
    o = extend(o);
    o.scope = this.frame;
    this.body = compileList(this.body, o);
    this.frame.close();
    return this;
  };

  FunctionExpression.prototype.transform =
  FunctionDeclaration.prototype.transform = function (o) {
    o = extend(o);
    o.scope = this.frame;

    assert(this.body instanceof BlockStatement);
    this.body.body = compileList(this.body.body, o);

    return this;
  };

  ForStatement.prototype.transform = function (o) {
    o = extend(o);
    o.scope = this.scope;
    return Node.prototype.transform.call(this, o);
  };

  BlockStatement.prototype.transform = function (o) {
    o = extend(o);
    o.scope = this.scope;
    this.body = compileList(this.body, o);
    return this;
  };

  CastExpression.prototype.transformNode = function (o) {
    if (this.as && !(this.ty = this.as.reflect(o))) {
      return this.argument;
    }
  };

  Literal.prototype.transformNode = function (o) {
    if (this.value === null) {
      return cast(this, bytePointerTy);
    }

    if (typeof this.value === "number") {
      return cast(this, isInteger(this.value) ? i32ty : f64ty);
    }
  };

  Identifier.prototype.transformNode = function (o) {
    if (this.kind === "variable") {
      var scope = o.scope;
      var variable = scope.getVariable(this.name);

      check(this, variable, "unknown identifier " + quote(this.name) + " in scope " + scope);
      check(this, variable.isStackAllocated ? variable.frame === scope.frame : true,
            "cannot close over stack-allocated variables");

      this.name = variable.name;
      this.variable = variable;

      return cast(this, variable.type);
    }
  };

  VariableDeclaration.prototype.transformNode = function (o) {
    if (this.kind === "extern") {
      return null;
    }
  };

  VariableDeclarator.prototype.transformNode = function (o) {
    var variable = this.id.variable;
    var ty = this.id.ty;

    if (!this.init && ty && typeof ty.defaultValue !== "undefined") {
      this.init = cast(new Literal(ty.defaultValue), ty);
    }

    if (this.init) {
      var a = (new AssignmentExpression(this.id, "=", this.init)).transform(o);
      this.id = a.left;
      this.init = a.right;
    }
  };

  ReturnStatement.prototype.transformNode = function (o) {
    var frame = o.scope.frame;
    var returnType = frame.returnType;
    var arg = this.argument;
    var ty = arg ? arg.ty : undefined;
    if (returnType) {
      check(this, returnType.assignableFrom(ty), "incompatible types: returning " +
            quote(tystr(ty, 0)) + " as " + quote(tystr(returnType, 0)));
      if (arg) {
        this.argument = cast(arg, returnType);
      }
    }
  }

  const BINOP_ARITHMETIC = ["+", "-", "*", "/", "%"];
  const BINOP_BITWISE    = ["<<", ">>", ">>>", "~", "&", "|"]
  const BINOP_COMPARISON = ["==", "!=", "===", "!==", "<", ">", "<=", ">="]

  BinaryExpression.prototype.transformNode = function (o) {
    var ty;
    var lty = this.left.ty;
    var rty = this.right.ty;
    var op = this.operator;

    if (lty instanceof PointerType && (op === "+" || op === "-")) {
      if (rty instanceof PrimitiveType && rty.integral) {
        var scale = lty.base.size / lty.base.align.size;
        if (scale > 1) {
          this.right = new BinaryExpression("*", this.right, new Literal(scale));
        }
        ty = lty;
      } else if (rty instanceof PointerType && op === "-") {
        if (lty.assignableFrom(rty)) {
          ty = i32ty;
        }
      }
    } else if (BINOP_COMPARISON.indexOf(op) >= 0) {
      if (lty instanceof PointerType && isNull(this.right)) {
        this.right = cast(this.right, lty);
      } else if (rty instanceof PointerType && isNull(this.left)) {
        this.left = cast(this.left, rty);
      }
      ty = i32ty;
    } else if (BINOP_BITWISE.indexOf(op) >= 0) {
      ty = i32ty;
    } else if (BINOP_ARITHMETIC.indexOf(op) >= 0 && (lty && lty.numeric) && (rty && rty.numeric)) {
      ty = f64ty;
    }

    if (ty) {
      return cast(this, ty);
    }
  };

  UnaryExpression.prototype.transform = function (o) {
    var ty;
    var op = this.operator;

    if (op === "sizeof") {
      ty = this.argument.reflect(o);
      return cast(new Literal(ty.size), i32ty);
    }

    if (op === "delete" && (ty = this.argument.ty)) {
      check(this, ty instanceof PointerType, "cannot free non-pointer type");
      return new CallExpression(o.scope.FREE(), [this.argument]);
    }

    var arg = this.argument = this.argument.transform(o);
    ty = arg.ty;

    if (op === "*") {
      check(this, ty instanceof PointerType, "cannot dereference non-pointer type " + quote(tystr(ty, 0)));
      return cast(this, ty.base);
    }

    if (op === "&") {
      check(this, ty, "cannot take address of untyped expression");
      if (arg.variable) {
        arg.variable.isStackAllocated = true;
      }
      return cast(this, new PointerType(ty));
    }

    if (op === "!" || op === "~") {
      return cast(this, i32ty);
    }

    if (op === "-") {
      if (arg.ty && arg.ty.numeric) {
        return cast(this, arg.ty);
      }
      return cast(this, f64ty);
    }

    return this;
  };

  NewExpression.prototype.transform = function (o) {
    var ty;
    if (this.callee instanceof Identifier && this.arguments.length === 0 &&
        (ty = o.types[this.callee.name])) {
      return new CallExpression(o.scope.MALLOC(), [cast(new Literal(ty.size), u32ty)]);
    }
    return Node.prototype.transform.call(this, o);
  };

  SequenceExpression.prototype.transformNode = function (o) {
    assert(this.expressions.length);
    var last = this.expressions[this.expressions.length - 1];
    return cast(this, last.ty);
  };

  UpdateExpression.prototype.transformNode = function (o) {
    var arg = this.argument;
    var ty = arg.ty
    if (ty.integral || ty instanceof PointerType) {
      var scope = o.scope;
      var op = this.operator === "++" ? "+" : "-";
      var ref = scope.cacheReference(arg);
      var right = new BinaryExpression(op, ref.use, new Literal(1));
      if (this.prefix) {
        return (new AssignmentExpression(ref.def, "=", right)).transform(o);
      }
      var t = scope.freshTemp(ty);
      var assn = new AssignmentExpression(t, "=", ref.def);
      var incdec = (new AssignmentExpression(ref.use, "=", right)).transform(o);
      return cast(new SequenceExpression([assn, incdec, t]), ty);
    }
  };

  MemberExpression.prototype.transformNode = function (o) {
    var obj = this.object;
    var prop = this.property;
    var oty = obj.ty;

    if (!oty || this.computed) {
      return;
    }

    if (this.kind === "->") {
      check(this, oty instanceof PointerType && oty.base instanceof StructType,
            "base of struct dereference must be struct type.");
      oty = oty.base;
    } else {
      check(this, !(oty instanceof PointerType), "cannot use . operator on pointer type.");
      if (!(oty instanceof StructType)) {
        return;
      }
    }

    check(this, prop instanceof Identifier, "invalid property name.");
    var field = this.structField = oty.getField(prop.name);
    check(this, field, "Unknown field " + quote(prop.name) + " of type " + quote(tystr(oty, 0)));

    return cast(this, field.type);
  };

  AssignmentExpression.prototype.transformNode = function (o) {
    var lty = this.left.ty;
    var rty = this.right.ty;

    if (!lty) {
      return;
    }

    var scope = o.scope;
    var op = this.operator;

    if (op !== "=") {
      var binop = op.substr(0, op.indexOf("="));
      var ref = scope.cacheReference(this.left);
      var right = new BinaryExpression(binop, ref.use, this.right);
      return (new AssignmentExpression(ref.def, "=", right)).transform(o);
    }

    check(this, lty.assignableFrom(rty), "incompatible types: assigning " +
          quote(tystr(rty, 0)) + " to " + quote(tystr(lty, 0)));

    if (lty instanceof StructType) {
      // Emit a memcpy using the largest alignment size we can.
      var mc, size, pty;
      if (lty.align === u32ty) {
        mc = scope.MEMCPY(4);
        size = lty.size / 4;
      } else if (lty.align === u16ty) {
        mc = scope.MEMCPY(2);
        size = lty.size / 2;
      } else {
        mc = scope.MEMCPY(u8ty.size);
        size = lty.size;
      }
      var left = new UnaryExpression("&", this.left);
      var right = new UnaryExpression("&", this.right);
      return cast(new CallExpression(mc, [left, right, new Literal(size)]), lty).transform(o);
    } else {
      this.right = cast(this.right, lty);
      return cast(this, lty);
    }
  };

  CallExpression.prototype.transformNode = function (o) {
    var fty = this.callee.ty;
    if (!fty) {
      return;
    }

    check(this, fty instanceof ArrowType, "trying to call non-function type");

    var paramTys = fty.paramTypes;
    var args = this.arguments;

    for (var i = 0, j = paramTys.length; i < j; i++) {
      var arg = args[i];
      var pty = paramTys[i];
      var aty = arg ? arg.ty : undefined;
      if (pty) {
        check(this, pty.assignableFrom(aty), "incompatible types: passing " +
              quote(tystr(aty, 0)) + " to " + quote(tystr(pty, 0)));
        args[i] = cast(arg, pty);
      }
    }

    return cast(this, fty.returnType);
  };

  /**
   * Pass 4: Lowering.
   */

  PrimitiveType.prototype.convert = function (expr) {
    assert(expr);

    var rty = expr.ty;

    if (this === rty || !(rty instanceof PrimitiveType)) {
      return expr;
    }

    var conversion;
    var lwidth = this.size << 3;
    var rwidth = rty.size << 3

    // Do we need to truncate? Bitwise operators automatically truncate to 32
    // bits in JavaScript so if the width is 32, we don't need to do manual
    // truncation.
    if (lwidth !== 32 && lwidth < rwidth) {
      var mask = new Literal((1 << lwidth) - 1);
      conversion = new BinaryExpression("&", expr, mask);
      // Do we need to sign extend?
      if (this.signed) {
        var shift = new Literal(32 - lwidth);
        conversion = new BinaryExpression("<<", conversion, shift);
        conversion = new BinaryExpression(">>", conversion, shift);
      }
    } else if (lwidth !== rwidth || rty.signed !== this.signed) {
      conversion = new BinaryExpression((this.signed ? "|" : ">>>"), expr,
                                        new Literal(0));
    } else {
      conversion = expr;
    }

    return conversion;
  };

  PointerType.prototype.convert = function (expr) {
    var rty = expr.ty;
    if (this === rty || !(rty instanceof PointerType)) {
      return expr;
    }

    // This is important for TI. Returning null here would result in the site
    // being dimorphic.
    if (isNull(expr)) {
      expr.value = 0;
      return expr;
    }

    return realign(expr, this.base.align.size);
  };

  StructType.prototype.convert = function (expr) {
    return expr;
  };

  ArrowType.prototype.convert = function (expr) {
    return expr;
  };

  function realign(expr, lalign) {
    assert(expr.ty instanceof PointerType);
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

    return new BinaryExpression(op, expr, new Literal(log2(ratio)));
  }

  function alignAddress(base, byteOffset, ty) {
    var address = realign(base, ty.align.size);
    if (byteOffset !== 0) {
      assert(isAlignedTo(byteOffset, ty.align.size), "unaligned byte offset " + byteOffset +
             " for type " + quote(ty) + " with alignment " + ty.align.size);
      var offset = byteOffset / ty.align.size;
      address = new BinaryExpression("+", address, new Literal(offset));
    }
    return address;
  }

  function dereference(address, byteOffset, ty, scope) {
    assert(scope);
    address = alignAddress(address, byteOffset, ty);
    var expr = new MemberExpression(scope.getView(ty), address, true);
    // Remember (coerce) the type so we can realign, but *do not* cast.
    expr.ty = ty;
    return expr;
  }

  function createPrologue(node, o) {
    assert(node.frame);

    var frame = node.frame;
    var code = [];

    var local, v;
    var constants = [];
    var variables = [];

    var cachedLocals = frame.cachedLocals;
    for (local in cachedLocals) {
      v = cachedLocals[local];
      if (v.init) {
        constants.push(v);
      } else {
        variables.push(v);
      }
    }

    if (constants.length) {
      code.push(new VariableDeclaration("const", constants));
    }

    if (variables.length) {
      code.push(new VariableDeclaration("var", variables));
    }

    var frameSize = frame.frameSizeInWords;
    if (frameSize) {
      var allocStack = new AssignmentExpression(frame.realSP(), "-=", new Literal(frameSize));
      var spDecl = new VariableDeclarator(frame.SP(), allocStack);
      code.push(new VariableDeclaration("const", [spDecl]));
    }

    if (node.parameters) {
      var params = node.parameters;
      for (var i = 0, j = params.length; i < j; i++) {
        var p = params[i];
        if (!p.isStackAllocated) {
          continue;
        }
        var assn = new AssignmentExpression(p.getStackAccess(frame), "=", new Identifier(p.name));
        code.push(new ExpressionStatement(assn));
      }
    }

    return code;
  }

  function createEpilogue(node, o) {
    assert(node.frame);
    var frame = node.frame;
    var frameSize = frame.frameSizeInWords;
    if (frameSize) {
      return [new ExpressionStatement(new AssignmentExpression(frame.realSP(), "+=", new Literal(frameSize)))];
    }
    return [];
  }

  function lowerList(list, o) {
    var translist = [];
    var trans;
    for (var i = 0, j = list.length; i < j; i++) {
      trans = list[i].lower(o);
      if (trans !== null) {
        translist.push(trans ? trans : list[i]);
      }
    }
    return translist;
  }

  Node.prototype.lower = T.makePass("lower", "lowerNode");

  Program.prototype.lower = function (o) {
    o = extend(o);
    o.scope = this.frame;

    this.body = lowerList(this.body, o);
    var prologue = createPrologue(this, o);
    var epilogue = createEpilogue(this, o);
    this.body = prologue.concat(this.body).concat(epilogue);

    return this;
  };

  FunctionExpression.prototype.lower =
  FunctionDeclaration.prototype.lower = function (o) {
    o = extend(o);
    o.scope = this.frame;

    this.body.body = lowerList(this.body.body, o);
    var prologue = createPrologue(this, o);
    var epilogue = createEpilogue(this, o);
    this.body.body = prologue.concat(this.body.body).concat(epilogue);
    this.frame.close();

    return this;
  };

  ForStatement.prototype.lower = function (o) {
    o = extend(o);
    o.scope = this.scope;
    return Node.prototype.lower.call(this, o);
  };

  BlockStatement.prototype.lower = function (o) {
    o = extend(o);
    o.scope = this.scope;
    this.body = lowerList(this.body, o);
    return this;
  };

  Identifier.prototype.lowerNode = function (o) {
    var variable = this.variable;
    if (variable && variable.isStackAllocated) {
      return variable.getStackAccess(o.scope);
    }
  };

  VariableDeclaration.prototype.lowerNode = function (o) {
    if (this.declarations.length === 0) {
      return null;
    }
  };

  VariableDeclarator.prototype.lowerNode = function (o) {
    if (!(this.id instanceof Identifier)) {
      if (this.init) {
        this.init = new AssignmentExpression(this.id, "=", this.init);
        this.id = o.scope.freshTemp(undefined, true);
      } else {
        return null;
      }
    }
  };

  ReturnStatement.prototype.lowerNode = function (o) {
    var scope = o.scope;
    var frameSize = scope.frame.frameSizeInWords;
    if (frameSize) {
      var arg = this.argument;
      var t = scope.freshTemp(ty);
      var ref = scope.cacheReference(arg);
      var assn = new AssignmentExpression(t, "=", ref.def);
      var restoreStack = new AssignmentExpression(scope.frame.realSP(), "+=", new Literal(frameSize));
      this.argument = new SequenceExpression([assn, restoreStack, t]);
    }
  };

  UnaryExpression.prototype.lowerNode = function (o) {
    var arg = this.argument;

    if (this.operator === "*") {
      return dereference(arg, 0, this.ty, o.scope);
    }

    if (this.operator === "&") {
      return arg.property;
    }
  };

  MemberExpression.prototype.lowerNode = function (o) {
    var field = this.structField;
    if (!field) {
      return;
    }

    var address;
    if (this.kind === "->") {
      address = this.object;
    } else {
      assert(this.object instanceof MemberExpression);
      address = this.object.property;
    }

    return dereference(address, field.offset, field.type, o.scope);
  };

  CastExpression.prototype.lowerNode = function (o) {
    return this.ty.convert(this.argument);
  };

  exports.compile = compile;
  exports.options = options;

}(typeof exports === 'undefined' ? (compiler = {}) : exports));
