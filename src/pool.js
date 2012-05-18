/**
 * We cannot store references to JavaScript objects in the LLJS heap. We need a way to
 * manage all the JS objects that enter the LLJS heap using some kind of reference counting
 * scheme, hence this reference counted object pool.
 *
 * Manages a reference counted pool of objects. It maintains a bi-directional mapping of
 * numeric IDs to Objects. Each object in the pool is given an unique ID that is stored
 * as a property in the object. The mapping from IDs to Objects is done using a dense
 * object array stored in the pool.
 *
 * The trick is to reuse objecet IDs so that the dense object map doesn't get too large.
 * This is done using a |bit| map that keeps track of available object IDs. Searching for
 * a new ID is done using a wrap-around linear scan through the bit map, starting at the
 * |nextWord| position which is updated whenever an ID is freed or found.
 */

var Pool = (function (maxSize) {

  var obj = []; /* ID to Object Map */
  var ref = new Uint32Array(maxSize); /* Reference Count Map */
  var bit = new Uint32Array(Math.ceil(maxSize / 32)); /* Used ID Bit Map */

  /**
   * Tidy uses defineProperty to add IDs to objects when they are aquired and delete to
   * remove their IDs when they are released. This is slightly slower than leaving the
   * ID property behind.
   */
  const tidy = false;

  const OBJECT_ID_NAME = "OBJECT ID";

  function bitCount(v) {
    v = v - ((v >> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
    return ((v + (v >> 4) & 0xF0F0F0F) * 0x1010101) >> 24;
  }

  /**
   * This is a clever bit hack that computes the first zero bit in a number.
   *
   * (http://skalkoto.blogspot.com/2008/01/bit-operations-find-first-zero-bit.html)
   *
   *          v = 1010 1111
   *     v = ~v = 0101 0000  (1) Invert the number.
   *         -v = 1011 0000  (2) Compute 2's complement.
   * v = v & -v = 0001 0000  (3) And (1) and (2).
   *
   * The result is the bit position of the 1 bit in (3) which you can compute
   * by subtracting 1 and then counting bits.
   *
   *      v - 1 = 0000 1111  4) Subtract 1, and use bitCount() to find the
   *                            result.
   *
   */
  function firstZero(v) {
    v = ~v;
    v = (v & (-v)) - 1;
    // Inlined bitCount(v).
    v = v - ((v >> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
    return ((v + (v >> 4) & 0xF0F0F0F) * 0x1010101) >> 24;
  }

  var nextWord = 0;

  /**
   * Finds the next available ID by scanning the bit map.
   */
  function nextID() {
    var cur = nextWord;
    var end = bit.length;
    while (true) {
      for (var i = cur, j = end; i < j; i++) {
        var word = bit[i];
        if (word === 0xFFFFFFFF) {
          continue;
        } else if (word === 0) {
          bit[i] = 1;
          nextWord = i;
          return i << 5;
        } else {
          var fz = firstZero(word);
          bit[i] |= 1 << fz;
          nextWord = i;
          return (i << 5) + fz;
        }
      }
      if (end === nextWord) {
        return -1;
      }
      end = cur;
      cur = 0;
    }
  }

  /**
   * Frees an ID, by clearing a bit in the bit map.
   */
  function freeID(id) {
    bit[id >> 5] &= ~(1 << (id & 0x1f));
    nextWord = id >> 5;
  }

  /**
   * Adds an object to the pool if it doesn't exist and increments its reference count by one.
   */
  function acquire(o) {
    var id = o[OBJECT_ID_NAME];
    if (id === undefined) {
      id = nextID();
      if (tidy) {
        Object.defineProperty(o, OBJECT_ID_NAME, {
          value : id,
          writable : false,
          enumerable : false,
          configurable : true
        });
      } else {
        o[OBJECT_ID_NAME] = id;
      }
      obj[id] = o;
      ref[id] = 1;
    } else {
      ref[id] ++;
    }
    return id;
  }

  /**
   * Decrements an objects reference count by one, and removes it from the pool if
   * the reference count is zero.
   */
  function release(id) {
    if (id === undefined) {
      return;
    }
    if (--ref[id] === 0) {
      freeID(id);
      var o = obj[id];
      obj[id] = null;
      if (tidy) {
        delete o[OBJECT_ID_NAME];
      } else {
        o[OBJECT_ID_NAME] = undefined;
      }
    }
  }

  function get(id) {
    return obj[id];
  }

  function trace() {
    print("    ID Map: " + bit.length);
    print(" Count Map: " + ref.length);
    print("Object Map: " + obj.length);

    var count = 0;
    for (var i = 0; i < bit.length; i++) {
      count += bitCount(bit[i]);
    }
    print("Object Map Density: " + ((count / (bit.length * 32)) * 100).toFixed(2) + " %");
  }

  return {
    acquire: acquire,
    release: release,
    trace: trace,
    get: get
  };

})(100000 * 10);

if (true) {
  var acquire = Pool.acquire;
  var release = Pool.release;

  var test = [];
  for (var i = 0; i < 100000; i++) {
    test[i] = {i: i};
  }

  for (var i = 0; i < 4000000; i++) {
    var j = (Math.random() * test.length) | 0;
    var k = acquire(test[j]);

    j = (Math.random() * test.length) | 0;
    k = test[j]["OBJECT ID"];
    release(k);
  }

  Pool.trace();
}