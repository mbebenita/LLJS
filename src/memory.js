var M = new ArrayBuffer(1024 * 1024 * 32);

var U1 = new Uint8Array(M);
var I1 = new Int16Array(M);
var U2 = new Uint16Array(M);
var I2 = new Int16Array(M);
var U4 = new Uint32Array(M);
var I4 = new Int32Array(M);
var F4 = new Float32Array(M);
var F8 = new Float64Array(M);

var $HP;
var $SP;
var $BP;
var $HP_END;
var $MAX_STACK_SIZE = 1024 * 1024 / 4;

function ma(size) {
  return $HP += size;
}

function resetHeap() {
  $HP = 10;
  $HP_END = U4.length - $MAX_STACK_SIZE;
  $SP = U4.length;
  $BP = $HP_END;
}

var memoryCopy = function memoryCopyWords(dst, src, len) {
  if (src === null) {
    return dst;
  }
  for (var i = 0; i < len; i++) {
    U4[dst++] = U4[src++];
  }
  return dst;
};

function memoryCopyBytes(dst, src, len) {
  if (src === null) {
    return;
  }
  var i = 0;
  if (len & 3 === 0) {
    len >>= 2;
    for (; i < len; i++) {
      U4[dst++] = U4[src++];
    }
  } else if (len & 1 === 0) {
    len >>= 1;
    for (; i < len; i++) {
      U2[dst++] = U2[src++];
    }
  } else {
    for (; i < len; i++) {
      U1[dst++] = U1[src++];
    }
  }
};

resetHeap();

var extern = {
  trace: function (x) { print(x); },
  toHex: function (x) {
    return "0x" + Number(x).toString(16);
  }
};