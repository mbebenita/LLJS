(function (exports) {
  const $M = exports;
  var NODE_JS = 1;
  var JS_SHELL = 2;
  var BROWSER = 3;
  var mode;
  if (typeof process !== 'undefined') {
    mode = NODE_JS;
  } else if (typeof snarf !== 'undefined') {
    mode = JS_SHELL;
  } else {
    mode = BROWSER;
  }
  var ck;
  if (mode === NODE_JS) {
    print = console.log;
    ck = require('memcheck');
  } else {
    ck = (load('memcheck.js'), memcheck);
  }
  const MB = 1024 * 1024 | 0;
  const WORD_SIZE = 4;
  const SIZE = 32 * MB / WORD_SIZE;
  const STACK_SIZE = 2 * MB / WORD_SIZE;
  const HEAP_SIZE = SIZE - STACK_SIZE;
  // debug
  var log = function () {
  };
  // let log = console.log;
  // let I4, U4;
  /*
   +---------------+ -
 0 | Heap  Pointer |
 1 | Stack Pointer |
   +---------------+ <- Heap Pointer (HP)
   |               |
   |               | |
   |     HEAP      | | Malloc Region
   |               | v
   |               |
   +---------------+
   |               |
   |               | ^
   |     STACK     | |
   |               | |
   |               |
   +---------------+ <- Stack Pointer (SP)
*/
  function memcpy(dst, src, length) {
    const $U1 = $M.U1;
    var _, _$1;
    for (var i = 0; i < length; i = i + 1 | 0) {
      $U1[_ = dst, dst = dst + 1, _] = $U1[_$1 = src, src = src + 1, _$1];
    }
    return dst;
  }
  function memcpy2(dst, src, length) {
    const $U2 = $M.U2;
    var _, _$1;
    for (var i = 0; i < length; i = i + 1 | 0) {
      $U2[_ = dst, dst = dst + 1, _] = $U2[_$1 = src, src = src + 1, _$1];
    }
    return dst;
  }
  function memcpy4(dst, src, length) {
    const $U4 = $M.U4;
    var _, _$1;
    for (var i = 0; i < length; i = i + 1 | 0) {
      $U4[_ = dst, dst = dst + 1, _] = $U4[_$1 = src, src = src + 1, _$1];
    }
    return dst;
  }
  function memset(s, b, length) {
    const $U1 = $M.U1;
    for (var i = 0; i < length; i = i + 1 | 0) {
      $U1[s] = b;
    }
  }
  function memset2(s, b, length) {
    const $U2 = $M.U2;
    for (var i = 0; i < length; i = i + 1 | 0) {
      $U2[s] = b;
    }
  }
  function memset4(s, b, length) {
    const $U4 = $M.U4;
    for (var i = 0; i < length; i = i + 1 | 0) {
      $U4[s] = b;
    }
  }
  var base = 0;
  var freep = 0;
  // ugly hack, probably doesn't really work. 
  // use the debugger api to make this more robust?
  var memFn = [
      free,
      malloc,
      sbrk,
      reset,
      morecore
    ];
  function isMemFn(fn) {
    if (memFn.indexOf(fn) !== -1) {
      return true;
    }
    return false;
  }
  function shadowMemory(mem, memsize) {
    var handler = makeIdHandler(mem);
    // override the identity get/set handlers
    handler.get = function (receiver, name) {
      var loc = parseInt(name, 10) << (memsize >> 1);
      // malloc/free can get/set unallocated memory
      if (!isMemFn(handler.get.caller)) {
        if (!ck.isAddressable(loc)) {
          ck.addBadAccessError(loc);
        }
        if (!ck.isValid(loc)) {
          ck.addUndefinedError(loc);
        }
      }
      return mem[name];
    };
    handler.set = function (receiver, name, val) {
      // let byte *loc = (byte *) (parseInt(name, 10));
      var loc = parseInt(name, 10) << (memsize >> 1);
      // memory functions should be able to set unallocated addresses
      if (!isMemFn(handler.set.caller)) {
        if (!ck.isAddressable(loc)) {
          ck.addBadAccessError(loc);
        }
        ck.setValid(loc, memsize, true);
      }
      mem[name] = val;
      return true;
    };
    return Proxy.create(handler);
  }
  function reset() {
    var M = exports.M = new ArrayBuffer(SIZE * WORD_SIZE);
    exports.U1 = shadowMemory(new Uint8Array(M), 1);
    exports.I1 = shadowMemory(new Int8Array(M), 1);
    exports.U2 = shadowMemory(new Uint16Array(M), 2);
    exports.I2 = shadowMemory(new Int16Array(M), 2);
    exports.U4 = shadowMemory(new Uint32Array(M), 4);
    exports.I4 = shadowMemory(new Int32Array(M), 4);
    exports.F4 = shadowMemory(new Float32Array(M), 4);
    exports.F8 = shadowMemory(new Float64Array(M), 8);
    exports.U4[0] = 4;
    exports.U4[1] = SIZE;
    base = 2;
    freep = 0;
  }
  reset();
  function sbrk(nBytes) {
    var U4 = exports.U4;
    var nWords = nBytes / 4 | 0;
    if (U4[0] + nWords > HEAP_SIZE) {
      return 0;
    }
    var address = U4[0];
    U4[0] += nWords;
    return address;
  }
  var nUnitsMin = 1024;
  function morecore(nUnits) {
    const $U4 = $M.U4;
    if (nUnits < nUnitsMin) {
      nUnits = nUnitsMin;
    }
    var buffer = sbrk(nUnits * 8 | 0);
    if (buffer === 0) {
      return 0;
    }
    var header = buffer;
    $U4[header + 1] = nUnits;
    // prevent double free recording on morecore
    ck.setAlloc(header + 1 * 2 << 2, true, 'morecore');
    // setting all the user addressable bytes as addressable in the
    // shadow memory
    ck.setAddressable(header + 1 * 2 << 2, nUnits, true);
    free(header + 1 * 2 << 2);
    return freep;
  }
  function malloc(nBytes) {
    const $U4 = $M.U4;
    var p = 0, prevp = 0;
    var nUnits = ((((nBytes + 8 | 0) - 1 | 0) / 8 | 0) + 1 | 0) >>> 0;
    if ((prevp = freep) === 0) {
      $U4[base] = freep = prevp = base;
      $U4[base + 1] = 0;
    }
    for (p = $U4[prevp]; true; prevp = p, p = $U4[p]) {
      if ($U4[p + 1] >= nUnits) {
        if ($U4[p + 1] === nUnits) {
          $U4[prevp] = $U4[p];
        } else {
          $U4[p + 1] = ($U4[p + 1] - nUnits | 0) >>> 0;
          p = p + $U4[p + 1] * 2;
          $U4[p + 1] = nUnits;
        }
        freep = prevp;
        // record that this chunck of memory can be addressed
        ck.setAddressable(p + 1 * 2 << 2, nUnits, true);
        // recored that this byte was allocated (and should be freed later)
        var cname = typeof malloc.caller === 'undefined' ? '' : malloc.caller.name;
        ck.setAlloc(p + 1 * 2 << 2, true, cname);
        return p + 1 * 2 << 2;
      }
      if (p === freep) {
        if ((p = morecore(nUnits)) === 0) {
          return 0;
        }
      }
    }
    return 0;
  }
  function free(ap) {
    const $U4 = $M.U4;
    var bp = (ap >> 2) - 1 * 2, p = 0;
    if (ck.isAlloc(ap)) {
      // this byte actually was malloced before, reset it
      ck.setAlloc(ap, false);
      // this memory chunk is no longer addressable
      ck.setAddressable(ap, $U4[bp + 1], false);
    } else {
      // this byte was never allocated, trying to free the wrong thing
      ck.addDoubleFreeError(ap);
    }
    for (p = freep; !(bp > p && bp < $U4[p]); p = $U4[p]) {
      if (p >= $U4[p] && (bp > p || bp < $U4[p])) {
        break;
      }
    }
    if (bp + $U4[bp + 1] * 2 === $U4[p]) {
      $U4[bp + 1] = ($U4[bp + 1] + $U4[$U4[p] + 1] | 0) >>> 0;
      $U4[bp] = $U4[$U4[p]];
    } else {
      $U4[bp] = $U4[p];
    }
    if (p + $U4[p + 1] * 2 == bp) {
      $U4[p + 1] = ($U4[p + 1] + $U4[bp + 1] | 0) >>> 0;
      $U4[p] = $U4[bp];
    } else {
      $U4[p] = bp;
    }
    freep = p;
  }
  function makeIdHandler(obj) {
    return {
      getOwnPropertyDescriptor: function (name) {
        var desc = Object.getOwnPropertyDescriptor(obj, name);
        // a trapping proxy's properties must always be configurable  
        if (desc !== undefined) {
          desc.configurable = true;
        }
        return desc;
      },
      getPropertyDescriptor: function (name) {
        var desc = Object.getPropertyDescriptor(obj, name);
        // not in ES5  
        // a trapping proxy's properties must always be configurable  
        if (desc !== undefined) {
          desc.configurable = true;
        }
        return desc;
      },
      getOwnPropertyNames: function () {
        return Object.getOwnPropertyNames(obj);
      },
      getPropertyNames: function () {
        return Object.getPropertyNames(obj);
      },
      defineProperty: function (name, desc) {
        Object.defineProperty(obj, name, desc);
      },
      delete: function (name) {
        return delete obj[name];
      },
      fix: function () {
        if (Object.isFrozen(obj)) {
          return Object.getOwnPropertyNames(obj).map(function (name) {
            return Object.getOwnPropertyDescriptor(obj, name);
          });
        }
        // As long as obj is not frozen, the proxy won't allow itself to be fixed  
        return undefined;
      },
      has: function (name) {
        return name in obj;
      },
      hasOwn: function (name) {
        return Object.prototype.hasOwnProperty.call(obj, name);
      },
      get: function (receiver, name) {
        return obj[name];
      },
      set: function (receiver, name, val) {
        obj[name] = val;
        return true;
      },
      enumerate: function () {
        var result = [];
        for (var name in obj) {
          result.push(name);
        }
        ;
        return result;
      },
      keys: function () {
        return Object.keys(obj);
      }
    };
  }
  exports.reset = reset;
  exports.memcpy = memcpy;
  exports.memcpy2 = memcpy2;
  exports.memcpy4 = memcpy4;
  exports.memset = memset;
  exports.memset2 = memset2;
  exports.memset4 = memset4;
  exports.malloc = malloc;
  exports.free = free;
  exports.checker = ck;
}.call(this, typeof exports === 'undefined' ? memory = {} : exports));
