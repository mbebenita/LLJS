(function (exports) {
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
 *
 * The pool provides three functions:
 *
 * acquire (obj) adds the |obj| to the pool, increments the reference count and returns its ID.
 * release (obj) decrements the reference count and removes the object if the count is zero.
 * get (id) returns the object with the given |id|.
 *
 */
  var Pool = function (initialSize) {
      var obj = [];
      /* ID to Object Map */
      var ref;
      /* Reference Count Map */
      var bit;
      /* Used ID Bit Map */
      var size = 0;
      var resizeCount = 0;
      const MIN_SIZE = 1024;
      function resize(newSize) {
        var oldRef = ref;
        ref = new Uint16Array(newSize);
        if (oldRef) {
          ref.set(oldRef);
        }
        var oldBit = bit;
        bit = new Uint32Array(Math.ceil(newSize / 32));
        if (oldBit) {
          bit.set(oldBit);
        }
        size = newSize;
        resizeCount++;
      }
      resize(Math.max(initialSize, MIN_SIZE));
      /**
   * Tidy uses defineProperty to add IDs to objects when they are aquired and delete to
   * remove their IDs when they are released. This is slightly slower than leaving the
   * ID property behind.
   */
      const tidy = false;
      const OBJECT_ID_NAME = 'OBJECT ID';
      function bitCount(v) {
        v = v - (v >> 1 & 1431655765);
        v = (v & 858993459) + (v >> 2 & 858993459) | 0;
        return ((v + (v >> 4) & 252645135) * 16843009 | 0) >> 24;
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
        v = (v & -v) - 1 | 0;
        // Inlined bitCount(v).
        v = v - (v >> 1 & 1431655765);
        v = (v & 858993459) + (v >> 2 & 858993459) | 0;
        return ((v + (v >> 4) & 252645135) * 16843009 | 0) >> 24;
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
            if (word === 4294967295) {
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
            /* Double the size if we can't find a free ID */
            nextWord = size;
            resize(size * 2);
            return nextID();
          }
          end = cur;
          cur = 0;
        }
      }
      /**
   * Frees an ID, by clearing a bit in the bit map.
   */
      function freeID(id) {
        bit[id >> 5] &= ~(1 << (id & 31));
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
              value: id,
              writable: false,
              enumerable: false,
              configurable: true
            });
          } else {
            o[OBJECT_ID_NAME] = id;
          }
          obj[id] = o;
          ref[id] = 1;
        } else {
          ref[id]++;
        }
        return id;
      }
      /**
   * Decrements an objects reference count by one, and removes it from the pool if
   * the reference count is zero.
   */
      function release(o) {
        releaseByID(o[OBJECT_ID_NAME]);
      }
      function releaseByID(id) {
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
        function getSizeName(v) {
          var KB = 1024;
          var MB = 1024 * KB;
          if (v / MB > 1) {
            return (v / MB).toFixed(2) + ' M';
          } else if (v / KB > 1) {
            return (v / KB).toFixed(2) + ' K';
          } else {
            return v + ' ';
          }
        }
        trace('      ID Map: ' + getSizeName(bit.length * 4) + 'B');
        trace('   Count Map: ' + getSizeName(ref.length * 2) + 'B');
        trace('  Object Map: ' + obj.length);
        trace('Resize Count: ' + resizeCount);
        var count = 0;
        for (var i = 0; i < bit.length; i++) {
          count += bitCount(bit[i]);
        }
        trace('Object Map Density: ' + (count / (bit.length * 32) * 100).toFixed(2) + ' %');
      }
      return {
        acquire: acquire,
        release: release,
        releaseByID: releaseByID,
        trace: trace,
        get: get
      };
    }(1024);
  exports.acquire = Pool.acquire;
  exports.release = Pool.release;
  exports.releaseByID = Pool.releaseByID;
  exports.trace = Pool.trace;
  exports.get = Pool.get;
}.call(this, typeof exports === 'undefined' ? pool = {} : exports));
