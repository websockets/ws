ALL_TESTS = $(shell find test/ -name '*.test.js')

run-tests:
	@./node_modules/.bin/expresso \
		-t 2000 \
		--serial \
		$(TESTFLAGS) \
		$(TESTS)

test:
	@$(MAKE) NODE_PATH=lib TESTS="$(ALL_TESTS)" run-tests

.PHONY: test
