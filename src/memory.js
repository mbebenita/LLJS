var M = new ArrayBuffer(1024 * 1024 * 32);
var U8 = new Uint8Array(M);
var I8 = new Int16Array(M);
var U16 = new Uint16Array(M);
var I16 = new Int16Array(M);
var U32 = new Uint32Array(M);
var I32 = new Int32Array(M);
var F32 = new Float32Array(M);
var F64 = new Float64Array(M);

var $HP = 4;
var $SP = 0;

function ma(size) {
  return $HP += size;
}

function resetHeap() {
  $HP = 4;
  $SP = M.byteLength;
}

var mc = function memoryCopy(dst, src, len) {
  var i = 0;
  if (len & 3 === 0) {
    len >>= 2;
    for (; i < len; i++) {
      U32[dst++] = U32[src++];
    }
  } else if (len & 1 === 0) {
    len >>= 1;
    for (; i < len; i++) {
      U16[dst++] = U16[src++];
    }
  } else {
    for (; i < len; i++) {
      U8[dst++] = U8[src++];
    }
  }
};

var tracer = new IndentingWriter();

resetHeap();