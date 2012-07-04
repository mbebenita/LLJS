cd /Users/tim/dev/LLJS/

# bin/ljc -m src/tests/test-compiler.ljs
# cat src/tests/test-compiler.js

mkdir -p build/node
mkdir -p build/sm

bin/ljc src/memory.ljs
bin/ljc src/memcheck.ljs
bin/ljc -m src/tests/test-memcheck.ljs

cp src/memory.js build/node
cp src/memcheck.js build/node
cp src/tests/test-memcheck.js build/node

bin/ljc -l src/memory.ljs
bin/ljc -l src/memcheck.ljs
bin/ljc -l -m src/tests/test-memcheck.ljs

cp src/memory.js build/sm
cp src/memcheck.js build/sm
cp src/memcheck-harness.js build/sm
cp src/tests/test-memcheck.js build/sm

echo "======================"
echo "Running node tests..."
node --harmony_proxies build/node/test-memcheck.js
echo "\n\n======================"
echo "Running SpiderMonkey tests..."
cd build/sm/
js memcheck-harness.js
