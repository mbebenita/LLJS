(function (exports) {
  /**
   * Types.
   */

  function tystr(type, lvl) {
    return type ? type.toString(lvl) : "dyn";
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

  PrimitiveType.prototype.lint = function () {};

  function StructType(name) {
    this.name = name;
    this.members = [];
    this.fields = [];
    this.offset = 0;
    this.isUnion = false;
    this.staticType = this instanceof StructStaticType ?
                      this : new StructStaticType(this);
  }

  StructType.prototype.toString = function (lvl) {
    lvl = lvl || 0;
    if (lvl > 0) {
      return this.name || "<anon struct>";
    }
    var s = "struct" + (this.name ? (" " + this.name) : " ") + " { ";
    s += this.fields.map(function (f) {
      return tystr(f.type, lvl + 1) + " " + f.name;
    }).join("; ");
    return s + " }";
  };

  StructType.prototype.getMember = function getMember(name) {
    var members = this.members;
    for (var i = 0; i < members.length; i++) {
      if (members[i].name === name) {
        return members[i];
      }
    }
    return null;
  };

  function StructStaticType(type) {
    this.instanceType = type;
    StructType.call(this, type.name + "_Static");
  }

  StructStaticType.prototype = Object.create(StructType.prototype);

  function PointerType(base) {
    this.base = base;
  }

  PointerType.prototype.defaultValue = 0;
  PointerType.prototype.size = 4;

  PointerType.prototype.toString = function (lvl) {
    lvl = lvl || 0;
    return tystr(this.base, lvl + 1) + "*";
  };

  function ArrayType(base, length) {
    PointerType.call(this, base);
    this.length = length;
  }

  ArrayType.prototype = Object.create(PointerType.prototype);
  ArrayType.prototype.toString = function (lvl) {
    lvl = lvl || 0;
    var lengths = "";
    var base = this;
    while (base instanceof ArrayType) {
      lengths += '[' + (base.length !== undefined ? base.length : "*") + ']';
      base = base.base;
    }
    return tystr(base, lvl + 1) + lengths;
  };
  /**
   * Gets the root element type.
   */
  ArrayType.prototype.getRoot = function () {
    var base = this;
    while (base instanceof ArrayType) {
      base = base.base;
    }
    return base;
  };
  ArrayType.prototype.defaultValue = undefined;

  function ArrowType(paramTypes, returnType) {
    this.paramTypes = paramTypes;
    this.returnType = returnType;
  }

  ArrowType.prototype.toString = function () {
    return tystr(this.returnType, 0) + "(" + this.paramTypes.map(function (pty) {
      return tystr(pty, 0);
    }).join(", ") + ")";
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
  const nullTy = new PrimitiveType("null", 0, 0, undefined);
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
    bool:   i32ty,
    float:  f32ty,
    double: f64ty,

    byte:   u8ty,
    word:   u32ty,

    void:   voidTy,
    null:   nullTy,
    dyn:    undefined
  };

  PointerType.prototype.align = u32ty;

  exports.TypeAlias = TypeAlias;
  exports.PrimitiveType = PrimitiveType;
  exports.StructType = StructType;
  exports.StructStaticType = StructStaticType;
  exports.PointerType = PointerType;
  exports.ArrayType = ArrayType;
  exports.ArrowType = ArrowType;
  exports.builtinTypes = builtinTypes;

  exports.tystr = tystr;

  exports.u8ty  = u8ty;
  exports.i8ty  = i8ty;
  exports.u16ty = u16ty;
  exports.i16ty = i16ty;
  exports.u32ty = u32ty;
  exports.i32ty = i32ty;
  exports.f32ty = f32ty;
  exports.f64ty = f64ty;

  exports.wordTy = wordTy;
  exports.voidTy = voidTy;
  exports.nullTy = nullTy;
  exports.bytePointerTy = bytePointerTy;
  exports.spTy = spTy;

  exports.mallocTy = mallocTy;
  exports.freeTy = freeTy;

  exports.memsetTy = memsetTy;
  exports.memset2Ty = memset2Ty;
  exports.memset4Ty = memset4Ty;

  exports.memcpyTy = memcpyTy;
  exports.memcpy2Ty = memcpy2Ty;
  exports.memcpy4Ty = memcpy4Ty;

}).call(this, typeof exports === "undefined" ? (Types = {}) : exports);
