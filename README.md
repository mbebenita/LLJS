LLJS
====

LLJS is a typed dialect of JavaScript that offers a
C-like type system with manual memory management. It compiles to JavaScript
and lets you write memory-efficient and GC pause-free code less painfully, in
short, LLJS is the bastard child of JavaScript and C. LLJS is early research
prototype work, so don't expect anything rock solid just yet.  The research
goal here is to explore low-level statically typed features in a high-level
dynamically typed language. Think of it as inline assembly in C, or the
unsafe keyword in C#. It's not pretty, but it gets the job done.

[Try It Online](http://lljs.org)

Usage
=====

For users of node.js, `bin/ljc` is provided.

For users of SpiderMonkey `js` shell, the compiler can be invoked with:

    $ js ljc.js

in the src/ directory.

Memcheck
========

If you would like to compile with support for [memory checking](http://disnetdev.com/blog/2012/07/18/memory-checking-in-low-level-javascript/) (detects
leaks, accesses of unallocated and undefined memory locations, and
double frees) then compile with the -m flag:

    $ bin/ljc -m -o myscript.js myscript.ljs

And add the following code to the end of your program run to report
any memory errors:

    let m = require('memory');
    // for SpiderMonkey do
    // let m = load('memory.js')
    console.log(m.memcheck.report());

The memory checker uses Proxies so if you use node.js you need to
enable it with:

    $ node --harmony-proxies myscript.js

Testing
=======

To run the tests install the [Mocha](http://visionmedia.github.com/mocha/) module then run:

    export NODE_PATH=src/
    mocha --compilers ljs:ljc

from the root LLJS directory.