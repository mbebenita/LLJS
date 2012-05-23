(function (exports) {
  const $M = exports;
  const MB = 1024 * 1024;
  const WORD_SIZE = 4;
  const SIZE = 32 * MB / WORD_SIZE;
  const STACK_SIZE = 2 * MB / WORD_SIZE;
  const HEAP_SIZE = SIZE - STACK_SIZE;
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
  function reset() {
    var M = exports.M = new ArrayBuffer(SIZE * WORD_SIZE);
    exports.U1 = new Uint8Array(M);
    exports.I1 = new Int8Array(M);
    exports.U2 = new Uint16Array(M);
    exports.I2 = new Int16Array(M);
    exports.U4 = new Uint32Array(M);
    exports.I4 = new Int32Array(M);
    exports.F4 = new Float32Array(M);
    exports.F8 = new Float64Array(M);
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
    var address = U4[0] << 2;
    U4[0] += nWords;
    return address;
  }
  var nUnitsMin = 1024;
  function morecore(nUnits) {
    const $U4 = $M.U4;
    if (nUnits < nUnitsMin) {
      nUnits = nUnitsMin | 0;
    }
    var buffer = sbrk(nUnits * 8 | 0);
    if (buffer === 0) {
      return 0;
    }
    var header = buffer >> 2;
    $U4[header + 1] = nUnits >>> 0;
    free(header + 1 * 2 << 2);
    return freep;
  }
  function malloc(nBytes) {
    const $U4 = $M.U4;
    var p = 0, prevp = 0;
    var nUnits = (nBytes + 8 - 1) / 8 + 1 | 0;
    if ((prevp = freep) === 0) {
      $U4[base] = freep = prevp = base;
      $U4[base + 1] = 0;
    }
    for (p = $U4[prevp]; true; prevp = p, p = $U4[p]) {
      if ($U4[p + 1] >= nUnits) {
        if ($U4[p + 1] === nUnits) {
          $U4[prevp] = $U4[p];
        } else {
          $U4[p + 1] = $U4[p + 1] - nUnits >>> 0;
          p = p + $U4[p + 1] * 2;
          $U4[p + 1] = nUnits >>> 0;
        }
        freep = prevp;
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
    var bp = ap - 1 >> 2, p = 0;
    for (p = freep; !(bp > p && bp < $U4[p]); p = $U4[p]) {
      if (p >= $U4[p] && (bp > p || bp < $U4[p])) {
        break;
      }
    }
    if (bp + $U4[bp + 1] * 2 === $U4[p]) {
      $U4[bp + 1] = $U4[bp + 1] + $U4[$U4[p] + 1] >>> 0;
      $U4[bp] = $U4[$U4[p]];
    } else {
      $U4[bp] = $U4[p];
    }
    if (p + $U4[p + 1] * 2 == bp) {
      $U4[p + 1] = $U4[p + 1] + $U4[bp + 1] >>> 0;
      $U4[p] = $U4[bp];
    } else {
      $U4[p] = bp;
    }
    freep = p;
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
}.call(this, typeof exports === 'undefined' ? memory = {} : exports));
