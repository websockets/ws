ALL_TESTS = $(shell find test/ -name '*.test.js')
ALL_INTEGRATION = $(shell find test/ -name '*.integration.js')

run-tests:
	@./node_modules/.bin/expresso \
		-t 2000 \
		--serial \
		$(TESTFLAGS) \
		$(TESTS)

run-integrationtests:
	@./node_modules/.bin/expresso \
		-t 5000 \
		--serial \
		$(TESTFLAGS) \
		$(TESTS)

test:
	@$(MAKE) NODE_PATH=lib TESTS="$(ALL_TESTS)" run-tests

integrationtest:
	@$(MAKE) NODE_PATH=lib TESTS="$(ALL_INTEGRATION)" run-integrationtests

.PHONY: test
