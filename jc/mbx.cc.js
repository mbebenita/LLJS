load("memory.js");
$BP = $SP -= 2;
mc($BP, null, 2);
var h = 0;
function i(a) {
  for(var b = U4, a = (a >> 2) - 2, d = 0, d = h;!(a > d && a < b[d]) && !(d >= b[d] && (a > d || a < b[d]));d = b[d]) {
  }
  a + 2 * b[a + 1] === b[d] ? (b[a + 1] += b[b[d] + 1], b[a] = b[b[d]]) : b[a] = b[d];
  d + 2 * b[d + 1] == a ? (b[d + 1] += b[a + 1], b[d] = b[a]) : b[d] = a;
  h = d
}
var j = new Date;
function k(a) {
  var b = new Date;
  a();
  return new Date - b
}
for(var l = 0, m = 0, n = 0;1E3 > n;n++) {
  var o = new Uint32Array(1E4), l = l + k(function() {
    for(var a = 0;1E4 > a;a++) {
      var b = o, d = a, e;
      a: {
        e = U4;
        var c = 0, f = 0;
        if(0 === (f = h)) {
          e[$BP] = h = f = $BP, e[$BP + 1] = 0
        }
        for(c = e[f];;f = c, c = e[c]) {
          if(5 <= e[c + 1]) {
            5 === e[c + 1] ? e[f] = e[c] : (e[c + 1] -= 5, c += 2 * (e[c + 1] | 0), e[c + 1] = 5);
            h = f;
            e = c + 2 << 2;
            break a
          }
          if(f = c === h) {
            c = 5;
            f = U4;
            1024 > c && (c = 1024);
            var g;
            g = (8 * c | 0) / 4;
            if($HP + g > $HP_END) {
              extern.a("Out of memory."), g = 0
            }else {
              var p = $HP << 2;
              $HP += g;
              g = p
            }
            0 === g ? c = 0 : (g >>= 2, f[g + 1] = c, i(g + 2 << 2), c = h);
            f = 0 == c
          }
          if(f) {
            break
          }
        }
        e = 0
      }
      b[d] = e
    }
  }), m = m + k(function() {
    for(var a = 0;1E4 > a;a++) {
      i(o[a])
    }
  })
}
print("Malloc: " + l + ", Free: " + m);
print("Done in " + (new Date - j) + " checksum: 0");

