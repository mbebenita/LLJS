modules.memory = function () {
  var exports = {};
  const MB$18 = 1024 * 1024;
  const SIZE$19 = 32 * MB$18;
  const STACK_SIZE$20 = 2 * MB$18;
  const HEAP_SIZE$21 = SIZE$19 - STACK_SIZE$20;
  function memoryCopy$22(dst$0, src$1, length$2) {
    const $I4 = I4;
    var $TU4 = null;
    for (var i$3 = 0; i$3 < length$2; i$3 = i$3 + 1 | 0) {
      $I4[($TU4 = dst$0, dst$0 = dst$0 + 1, $TU4)] = $I4[($TU4 = src$1, src$1 = src$1 + 1, $TU4)];
    }
    return dst$0;
  }
  
  var base$23 = 0 >> 2;
  var freep$24 = 0 >> 2;
  function resetMemory$25() {
    var M$0 = exports.M = new ArrayBuffer(SIZE$19);
    exports.U1 = new Uint8Array(M$0);
    exports.I1 = new Int8Array(M$0);
    exports.U2 = new Uint16Array(M$0);
    exports.I2 = new Int16Array(M$0);
    U4 = new Uint32Array(M$0);
    I4 = new Int32Array(M$0);
    exports.U4 = U4;
    exports.I4 = I4;
    exports.F4 = new Float32Array(M$0);
    exports.F8 = new Float64Array(M$0);
    U4[0] = 4;
    U4[1] = SIZE$19;
    base$23 = 2;
    freep$24 = 0 >> 2;
  }
  resetMemory$25();
  function sbrk$26(nBytes$0) {
    var nWords$1 = nBytes$0 / 4 | 0;
    if (U4[0] + nWords$1 > HEAP_SIZE$21) {
      trace('Out of Memory');
      return 0;
    }
    var address$2 = U4[0] << 2;
    U4[0] = U4[0] + nWords$1;
    return address$2;
  }
  var nUnitsMin$27 = 1024 >>> 0;
  function morecore$28(nUnits$0) {
    const $U4 = U4;
    if (nUnits$0 < nUnitsMin$27) {
      nUnits$0 = nUnitsMin$27 | 0;
    }
    var buffer$1 = sbrk$26(nUnits$0 * 8 | 0);
    if (buffer$1 === 0) {
      return 0 >> 2;
    }
    var header$2 = (buffer$1 >> 2);
    $U4[header$2 + 1] = nUnits$0 >>> 0;
    free$30(header$2 + 1 * 2 << 2);
    return freep$24;
  }
  function malloc$29(nBytes$0) {
    const $U4 = U4;
    var p$1 = 0, prevp$2 = 0;
    var nUnits$3 = (nBytes$0 + 8 - 1) / 8 + 1 | 0;
    if ((prevp$2 = freep$24) === 0) {
      $U4[base$23] = (freep$24 = (prevp$2 = base$23));
      $U4[base$23 + 1] = 0 >>> 0;
    }
    for (p$1 = $U4[prevp$2]; true; prevp$2 = p$1, p$1 = $U4[p$1]) {
      if ($U4[p$1 + 1] >= nUnits$3) {
        if ($U4[p$1 + 1] === nUnits$3) {
          $U4[prevp$2] = $U4[p$1];
        } else {
          $U4[p$1 + 1] = $U4[p$1 + 1] - nUnits$3 >>> 0;
          p$1 += ($U4[p$1 + 1] | 0) * 2;
          $U4[p$1 + 1] = nUnits$3 >>> 0;
        }
        freep$24 = prevp$2;
        return p$1 + 1 * 2 << 2;
      }
      if (p$1 === freep$24) {
        if ((p$1 = morecore$28(nUnits$3)) == 0) {
          return 0;
        }
      }
    }
    return 0;
  }
  function free$30(ap$0) {
    const $U4 = U4;
    var bp$1 = ((ap$0 >> 2) - 1 * 2), p$2 = 0;
    for (p$2 = freep$24; !(bp$1 > p$2 && bp$1 < $U4[p$2]); p$2 = $U4[p$2]) {
      if (p$2 >= $U4[p$2] && (bp$1 > p$2 || bp$1 < $U4[p$2])) {
        break;
      }
    }
    if (bp$1 + $U4[bp$1 + 1] * 2 === $U4[p$2]) {
      $U4[bp$1 + 1] = $U4[bp$1 + 1] + $U4[$U4[p$2] + 1] >>> 0;
      $U4[bp$1] = $U4[$U4[p$2]];
    } else {
      $U4[bp$1] = $U4[p$2];
    }
    if (p$2 + $U4[p$2 + 1] * 2 == bp$1) {
      $U4[p$2 + 1] = $U4[p$2 + 1] + $U4[bp$1 + 1] >>> 0;
      $U4[p$2] = $U4[bp$1];
    } else {
      $U4[p$2] = bp$1;
    }
    freep$24 = p$2;
  }
  exports.resetMemory = resetMemory$25;
  exports.memoryCopy = memoryCopy$22;
  exports.malloc = malloc$29;
  exports.free = free$30;
  return exports;
};
