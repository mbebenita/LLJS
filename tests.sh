cd /Users/tim/dev/LLJS/
export NODE_DISABLE_COLORS=1


# bin/ljc -m src/tests/test-compiler.ljs
# cat src/tests/test-compiler.js

export NODE_PATH="build/node:$NODE_PATH"

mkdir -p build/node
mkdir -p build/sm

# build for node
bin/ljc -0 -o build/node/memory.js src/memory.ljs
bin/ljc -0 -o build/node/memcheck.js src/memcheck.ljs
bin/ljc -m -0 -o build/node/test-memcheck.js src/tests/test-memcheck.ljs

# build for sm
bin/ljc -l -0 -o build/sm/memory.js src/memory.ljs
bin/ljc -l -0 -o build/sm/memcheck.js src/memcheck.ljs
bin/ljc -l -m -0 -o build/sm/test-memcheck.js src/tests/test-memcheck.ljs

# build bench for sm (no memcheck)
bin/ljc -l -0 -o build/sm/linked-list.js benchmarks/linked-list.ljs
bin/ljc -l -0 -o build/sm/access-nbody.js benchmarks/access-nbody.ljs

# build bench for sm (with memcheck)
bin/ljc -l -m -0 -o build/sm/access-nbody-memcheck.js benchmarks/access-nbody.ljs
bin/ljc -l -m -0 -o build/sm/linked-list-memcheck.js benchmarks/linked-list.ljs

cp src/memcheck-harness.js build/sm

# echo "======================"
# echo "Running node tests..."
node --harmony_proxies build/node/test-memcheck.js

# echo "\n\n======================"
# echo "Running SpiderMonkey tests..."
cd build/sm/
# js memcheck-harness.js

echo "======================"
echo "Running benchmarks..."
echo "== nbody =="
js -n -m access-nbody.js
echo "\n== nbody (memcheck) =="
js -n -m access-nbody-memcheck.js
echo "\n== linked list =="
js -n -m linked-list.js
echo "\n== linked list (memcheck) =="
js -n -m linked-list-memcheck.js
