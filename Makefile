LJC = bin/ljc
ND_FLAGS = -0
SM_FLAGS = -0 -l

srcdir = src
testdir = src/tests
benchdir = benchmarks

build_node = build/node
build_sm = build/sm


js_files = memory.js memcheck.js test-memcheck.js \
			access-nbody.js access-nbody-memcheck.js \
			linked-list.js linked-list-memcheck.js

mainfiles = $(addprefix $(srcdir)/, memory.js memcheck.js)
nodefiles := $(addprefix $(build_node)/, $(js_files))
smfiles := $(addprefix $(build_sm)/, $(js_files))



.PHONY: all test clean node sm bench main

all: main node sm test bench

test: node sm
	@echo "======================"
	@echo "Running node tests..."
	(export NODE_PATH="$(build_node):$$NODE_PATH" && node --harmony_proxies $(build_node)/test-memcheck.js)
	@echo "======================"
	@echo "Running spidermonkey tests..."
	(cd $(build_sm) && js -n -m test-memcheck.js)

bench: node sm
	@echo "======================"
	@echo "Running node benchmarks..."
	@echo "== nbody =="
	(export NODE_PATH="$(build_node):$$NODE_PATH" && node --harmony_proxies $(build_node)/access-nbody.js)
	@echo "\n== nbody (memcheck) =="
	(export NODE_PATH="$(build_node):$$NODE_PATH" && node --harmony_proxies $(build_node)/access-nbody-memcheck.js)
	@echo "\n== linked list =="
	(export NODE_PATH="$(build_node):$$NODE_PATH" && node --harmony_proxies $(build_node)/linked-list.js)
	@echo "\n== linked list (memcheck) =="
	(export NODE_PATH="$(build_node):$$NODE_PATH" && node --harmony_proxies $(build_node)/linked-list-memcheck.js)
	@echo "======================"
	@echo "Running spdiermonkey benchmarks..."
	@echo "== nbody =="
	(cd $(build_sm) && js -n -m access-nbody.js)
	@echo "\n== nbody (memcheck) =="
	(cd $(build_sm) && js -n -m access-nbody-memcheck.js)
	@echo "\n== linked list =="
	(cd $(build_sm) && js -n -m linked-list.js)
	@echo "\n== linked list (memcheck) =="
	(cd $(build_sm) && js -n -m linked-list-memcheck.js)

main: $(mainfiles)
node: $(nodefiles)
sm: $(smfiles)

# main
$(srcdir)/memory.js: $(srcdir)/memory.ljs
	$(LJC) $(ND_FLAGS) -o $@ $<

$(srcdir)/memcheck.js: $(srcdir)/memcheck.ljs
	$(LJC) $(ND_FLAGS) -o $@ $<

# node
$(build_node)/memory.js: $(srcdir)/memory.ljs
	$(LJC) $(ND_FLAGS) -o $@ $<

$(build_node)/memcheck.js: $(srcdir)/memcheck.ljs
	$(LJC) $(ND_FLAGS) -o $@ $<

$(build_node)/test-memcheck.js: $(testdir)/test-memcheck.ljs
	$(LJC) $(ND_FLAGS) -m -o $@ $<

# benchmarks
$(build_node)/access-nbody.js: $(benchdir)/access-nbody.ljs
	$(LJC) $(ND_FLAGS) -o $@ $<

$(build_node)/linked-list.js: $(benchdir)/linked-list.ljs
	$(LJC) $(ND_FLAGS) -o $@ $<

$(build_node)/access-nbody-memcheck.js: $(benchdir)/access-nbody.ljs
	$(LJC) $(ND_FLAGS) -m -o $@ $<

$(build_node)/linked-list-memcheck.js: $(benchdir)/linked-list.ljs
	$(LJC) $(ND_FLAGS) -m -o $@ $<


# spidermonkey
$(build_sm)/memory.js: $(srcdir)/memory.ljs
	$(LJC) $(SM_FLAGS) -o $@ $<

$(build_sm)/memcheck.js: $(srcdir)/memcheck.ljs
	$(LJC) $(SM_FLAGS) -o $@ $<

$(build_sm)/test-memcheck.js: $(testdir)/test-memcheck.ljs
	$(LJC) $(SM_FLAGS) -m -o $@ $<

# benchmarks
$(build_sm)/access-nbody.js: $(benchdir)/access-nbody.ljs
	$(LJC) $(SM_FLAGS) -o $@ $<

$(build_sm)/linked-list.js: $(benchdir)/linked-list.ljs
	$(LJC) $(SM_FLAGS) -o $@ $<

$(build_sm)/access-nbody-memcheck.js: $(benchdir)/access-nbody.ljs
	$(LJC) $(SM_FLAGS) -m -o $@ $<

$(build_sm)/linked-list-memcheck.js: $(benchdir)/linked-list.ljs
	$(LJC) $(SM_FLAGS) -m -o $@ $<
