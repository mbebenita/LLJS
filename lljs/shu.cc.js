(function() {
  function j(c) {
    var a = new Date;
    c();
    return new Date - a
  }
  var g, d, k, l, f, m;
  HEAPSIZE = 33554432;
  buf = new ArrayBuffer(HEAPSIZE);
  new Int8Array(buf);
  m = new Uint8Array(buf);
  new Int16Array(buf);
  new Uint16Array(buf);
  new Int32Array(buf);
  f = f = new Uint32Array(buf);
  f[0] = 8;
  f[1] = HEAPSIZE;
  d = 0;
  k = function(c) {
    var a = f, b, e, c = (c + 8 - 1) / 8 + 1 >> 0;
    if(!(e = d)) {
      e = d = a[0] >> 2, a[0] += 8, a[d] = d, a[d + 1] = 0
    }
    for(b = a[e];;) {
      if(a[b + 1] >= c) {
        return a[b + 1] === c ? a[e] = a[b] : (a[b + 1] -= c, b += 2 * a[b + 1], a[b + 1] = c), d = e, b + 2 << 2
      }
      if(b === d && !(b = l(c))) {
        break
      }
      e = b;
      b = a[b]
    }
    return 0
  };
  l = function(c) {
    var a = f, b, e;
    1024 > c && (c = 1024);
    b = 8 * c;
    if(a[0] + b >= m.length) {
      return 0
    }
    e = a[0] >> 2;
    a[e + 1] = c;
    a[0] += b;
    g(e + 2 << 2);
    return d
  };
  g = function(c) {
    var a, b = f, c = (c >> 2) - 2;
    for(a = d;!(c > a && c < b[a]) && !(a >= b[a] && (c > a || c < b[a]));) {
      a = b[a]
    }
    c + 2 * b[c + 1] === b[a] ? (b[c + 1] += b[b[a] + 1], b[c] = b[b[a]]) : b[c] = b[a];
    a + 2 * b[a + 1] === c ? (b[a + 1] += b[c + 1], b[a] = b[c]) : b[a] = c;
    d = a
  };
  for(var p = new Date, h = 0, i = 0, n = 0;1E3 > n;n++) {
    var o = new Uint32Array(1E4), h = h + j(function() {
      for(var c = 0;1E4 > c;c++) {
        o[c] = k(32)
      }
    }), i = i + j(function() {
      for(var c = 0;1E4 > c;c++) {
        g(o[c])
      }
    })
  }
  print("Malloc: " + h + ", Free: " + i);
  print("Done in " + (new Date - p) + " checksum: 0")
}).call(this);

