var start = new Date();

var head = {value: 0, next: null};
var last = head;

for (var i = 0; i < 10000; i++) {
  var next = {value: 1, next: null};
  last.next = next;
  last = next;
}

var sum = 0;

function add(node) {
  while (node) {
    sum += node.value;
    node = node.next;
  }
  return sum;
}

for (var i = 0; i < 50000; i++) {
  sum += add(head);
}

print("Elapsed: " + (new Date() - start) + " - " + sum);

var sum = 0;
var heap = new Uint32Array(new ArrayBuffer(1024 * 1024));
var start = new Date();

var pHead = 1
var pLast = pHead;

for (var i = 0; i < 10000; i++) {
  var pNext = pLast + 2;
  heap[pNext] = 1;
  heap[pNext + 1] = 0;
  heap[pLast + 1] = pNext;
  pLast = pNext;
}

function addC(h, pNode) {
  while (pNode) {
    sum += h[pNode];
    pNode = h[pNode + 1];
  }
  return sum;
}

for (var i = 0; i < 50000; i++) {
  sum += addC(heap, pHead);
}


print("Elapsed: " + (new Date() - start) + " - " + sum);
