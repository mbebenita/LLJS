(function (exports) {
  var NODE_JS = 1;
  var JS_SHELL = 2;
  var BROWSER = 3;
  var enabled = false;
  var mode;
  if (typeof process !== 'undefined') {
    mode = NODE_JS;
  } else if (typeof snarf !== 'undefined') {
    mode = JS_SHELL;
  } else {
    mode = BROWSER;
  }
  var ck, root, dbg;
  if (mode === NODE_JS) {
    print = console.log;
  }
  var memcheck = {};
  // The shadow memory (SM) is a typed array with a corresponding U1
  // view that holds a addresssable/defined flag (FLAG_ACC and FLAG_DEF)
  // for each byte of main memory.
  var FLAG_ACC = 1;
  var FLAG_DEF = 2;
  var FLAG_MAL = 4;
  var SM;
  var viewSM;
  function reset(memSize) {
    SM = new ArrayBuffer(memSize);
    viewSM = new Uint8Array(SM);
    exports.enabled = enabled = true;
    memcheck = {
      used: [],
      errors: {
        double_free: [],
        bad_access: [],
        undef_access: []
      }
    };
  }
  function setFlag(idx, size, mask) {
    var _;
    for (var i = 0; i < size; _ = i, i = (i + 1 | 0) >>> 0, _) {
      viewSM[idx + i] |= mask;
    }
  }
  function clearFlag(idx, size, mask) {
    var _;
    for (var i = 0; i < size; _ = i, i = (i + 1 | 0) >>> 0, _) {
      viewSM[idx + i] &= ~mask;
    }
  }
  function isSet(bt, flag) {
    if (viewSM[bt] & flag) {
      return true;
    } else {
      return false;
    }
  }
  // (byte, uint, bool) -> unit
  function setAddressable(bt, size, on) {
    if (on) {
      setFlag(bt, size, FLAG_ACC >>> 0);
    } else {
      clearFlag(bt, size, FLAG_ACC >>> 0);
    }
  }
  // (byte) -> bool
  function isAddressable(bt) {
    return isSet(bt, FLAG_ACC);
  }
  // (byte, uint, bool) -> unit
  function setDefined(bt, size, on) {
    if (on) {
      setFlag(bt, size, FLAG_DEF >>> 0);
    } else {
      clearFlag(bt, size, FLAG_DEF >>> 0);
    }
  }
  // (byte) -> bool
  function isDefined(bt) {
    return isSet(bt, FLAG_DEF);
  }
  // (byte, bool) -> unit
  function setAlloc(bt, value) {
    if (value) {
      setFlag(bt, 1, FLAG_MAL >>> 0);
      memcheck.used[bt] = callstack.slice(0);
    } else {
      clearFlag(bt, 1, FLAG_MAL >>> 0);
      memcheck.used[bt] = undefined;
    }
  }
  // (byte) -> bool
  function isAlloc(bt) {
    return isSet(bt, FLAG_MAL);
  }
  // (str, str) -> unit
  function addError(kind, msg) {
    if (memcheck.errors[kind] === undefined) {
      memcheck.errors[kind] = [];
    }
    memcheck.errors[kind].push(msg);
  }
  function addDoubleFreeError(bt) {
    memcheck.errors.double_free.push({
      membyte: bt,
      trace: callstack.slice(0)
    });
  }
  function addBadAccessError(bt) {
    memcheck.errors.bad_access.push({
      membyte: bt,
      trace: callstack.slice(0)
    });
  }
  function addUndefinedError(bt) {
    memcheck.errors.undef_access.push({
      membyte: bt,
      trace: callstack.slice(0)
    });
  }
  // unit -> [byte*]
  function getBadAccesses() {
    return memcheck.errors.bad_access;
  }
  // unit -> [byte*]
  function getBadUndefined() {
    return memcheck.errors.undef_access;
  }
  // unit -> [byte*]
  function getBadFrees() {
    return memcheck.errors.double_free;
  }
  // unit -> [byte, [str]]
  function getLeaks() {
    return memcheck.used.map(function (val, idx) {
      if (val) {
        return {
          membyte: idx,
          trace: val
        };
      }
    }).filter(function (val, idx) {
      if (val) {
        return val;
      }
    });
  }
  var callstack = [];
  function call_push(name, fname, line, col) {
    callstack.push(name + ' (' + fname + '.ljs:' + line + ':' + col + ')');
  }
  function call_pop() {
    callstack.pop();
  }
  function call_reset(name, line, col) {
    var fn = name + ':' + line + ':' + col;
    var idx = callstack.lastIndexOf(fn);
    if (idx !== -1) {
      callstack = callstack.slice(0, idx + 1);
    }
  }
  function getCallstack() {
    return callstack;
  }
  // uint -> str
  function report(limit) {
    function fmtErrors(err) {
      var errors;
      if (limit >= 0) {
        errors = err.slice(0, limit);
      } else {
        errors = err;
      }
      return errors.map(function (val, idx) {
        var stack;
        if (val.trace.length === 0) {
          stack = 'at <empty stack>';
        } else {
          stack = val.trace.reverse().join('\n\tat ');
        }
        return 'address ' + val.membyte + '\n\t' + stack;
      }).join('\n');
    }
    var leaks = '== Memory Leaks ==\n' + fmtErrors(getLeaks());
    var access = '== Access of unallocated memory ==\n' + fmtErrors(getBadAccesses());
    var undef = '== Access of uninitialized memory ==\n' + fmtErrors(getBadUndefined());
    var frees = '== Free of unallocated memory ==\n' + fmtErrors(getBadFrees());
    return [
      access,
      undef,
      frees,
      leaks
    ].join('\n\n');
  }
  exports.setAddressable = setAddressable;
  exports.isAddressable = isAddressable;
  exports.setDefined = setDefined;
  exports.isDefined = isDefined;
  exports.setAlloc = setAlloc;
  exports.isAlloc = isAlloc;
  exports.addDoubleFreeError = addDoubleFreeError;
  exports.addBadAccessError = addBadAccessError;
  exports.addUndefinedError = addUndefinedError;
  exports.getBadAccesses = getBadAccesses;
  exports.getBadUndefined = getBadUndefined;
  exports.getBadFrees = getBadFrees;
  exports.getLeaks = getLeaks;
  exports.report = report;
  exports.reset = reset;
  exports.enabled = enabled;
  exports.memcheck_call_pop = call_pop;
  exports.memcheck_call_push = call_push;
  exports.memcheck_call_reset = call_reset;
  exports.getCallstack = getCallstack;
}.call(this, typeof exports === 'undefined' ? memcheck = {} : exports));
