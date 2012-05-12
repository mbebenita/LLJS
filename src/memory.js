modules.memory = function () {
  var exports = {};
  const MB = 1024 * 1024;
  const WORD_SIZE = 4;
  const SIZE = 32 * MB / WORD_SIZE;
  const STACK_SIZE = 2 * MB / WORD_SIZE;
  const HEAP_SIZE = SIZE - STACK_SIZE;
  function memoryCopy(dst, src, length) {
    const $I4 = I4;
    var $TU4 = null;
    for (var i = 0; i < length; i = i + 1 | 0) {
      $I4[($TU4 = dst, dst = dst + 1, $TU4)] = $I4[($TU4 = src, src = src + 1, $TU4)];
    }
    return dst;
  }
  function memoryZero(dst, length) {
    const $I4 = I4;
    var $TU4 = null;
    for (var i = 0; i < length; i = i + 1 | 0) {
      $I4[($TU4 = dst, dst = dst + 1, $TU4)] = 0;
    }
    return dst;
  }
  var base = 0 >> 2;
  var freep = 0 >> 2;
  function resetMemory() {
    var M = exports.M = new ArrayBuffer(SIZE * WORD_SIZE);
    exports.U1 = new Uint8Array(M);
    exports.I1 = new Int8Array(M);
    exports.U2 = new Uint16Array(M);
    exports.I2 = new Int16Array(M);
    U4 = new Uint32Array(M);
    I4 = new Int32Array(M);
    exports.U4 = U4;
    exports.I4 = I4;
    exports.F4 = new Float32Array(M);
    exports.F8 = new Float64Array(M);
    U4[0] = 4;
    U4[1] = SIZE;
    base = 2;
    freep = 0 >> 2;
  }
  resetMemory();
  function sbrk(nBytes) {
    var nWords = nBytes / 4 | 0;
    if (U4[0] + nWords > HEAP_SIZE) {
      trace('Out of Memory');
      return 0;
    }
    var address = U4[0] << 2;
    U4[0] = U4[0] + nWords;
    return address;
  }
  var nUnitsMin = 1024 >>> 0;
  function morecore(nUnits) {
    const $U4 = U4;
    if (nUnits < nUnitsMin) {
      nUnits = nUnitsMin | 0;
    }
    var buffer = sbrk(nUnits * 8 | 0);
    if (buffer === 0) {
      return 0 >> 2;
    }
    var header = (buffer >> 2);
    $U4[header + 1] = nUnits >>> 0;
    free(header + 1 * 2 << 2);
    return freep;
  }
  function malloc(nBytes) {
    const $U4 = U4;
    var p = 0, prevp = 0;
    var nUnits = (nBytes + 8 - 1) / 8 + 1 | 0;
    if ((prevp = freep) === 0) {
      $U4[base] = (freep = (prevp = base));
      $U4[base + 1] = 0 >>> 0;
    }
    for (p = $U4[prevp]; true; prevp = p, p = $U4[p]) {
      if ($U4[p + 1] >= nUnits) {
        if ($U4[p + 1] === nUnits) {
          $U4[prevp] = $U4[p];
        } else {
          $U4[p + 1] = $U4[p + 1] - nUnits >>> 0;
          p += ($U4[p + 1] | 0) * 2;
          $U4[p + 1] = nUnits >>> 0;
        }
        freep = prevp;
        return p + 1 * 2 << 2;
      }
      if (p === freep) {
        if ((p = morecore(nUnits)) == 0) {
          return 0;
        }
      }
    }
    return 0;
  }
  function free(ap) {
    const $U4 = U4;
    var bp = ((ap >> 2) - 1 * 2), p = 0;
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
  exports.resetMemory = resetMemory;
  exports.memoryCopy = memoryCopy;
  exports.memoryZero = memoryZero;
  exports.malloc = malloc;
  exports.free = free;
  return exports;
};
