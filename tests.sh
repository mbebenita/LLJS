cd /Users/tim/dev/LLJS/
export NODE_DISABLE_COLORS=1


# bin/ljc -m src/tests/test-compiler.ljs
# cat src/tests/test-compiler.js

export NODE_PATH="build/node:$NODE_PATH"

mkdir -p build/node
mkdir -p build/sm

# build for node
bin/ljc -0 src/memory.ljs
bin/ljc -0 src/memcheck.ljs
bin/ljc -m -0 src/tests/test-memcheck.ljs
# move to node builddir
cp src/memory.js build/node
cp src/memcheck.js build/node
cp src/tests/test-memcheck.js build/node

# build for sm
bin/ljc -l -0 src/memory.ljs
bin/ljc -l -0 src/memcheck.ljs
bin/ljc -l -m -0 src/tests/test-memcheck.ljs
# move to sm builddir
cp src/memory.js build/sm
cp src/memcheck.js build/sm
cp src/tests/test-memcheck.js build/sm

# build bench for sm (no memcheck)
bin/ljc -l -0 benchmarks/linked-list.ljs
bin/ljc -l -0 benchmarks/access-nbody.ljs
# move bench to sm builddir
cp benchmarks/access-nbody.js build/sm/access-nbody.js
cp benchmarks/linked-list.js build/sm/linked-list.js

# build bench for sm (with memcheck)
bin/ljc -l -m -0 benchmarks/access-nbody.ljs
bin/ljc -l -m -0 benchmarks/linked-list.ljs
cp benchmarks/access-nbody.js build/sm/access-nbody-memcheck.js
cp benchmarks/linked-list.js build/sm/linked-list-memcheck.js

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
