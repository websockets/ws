ALL_TESTS = $(shell find test/ -name '*.test.js')
ALL_INTEGRATION = $(shell find test/ -name '*.integration.js')

run-tests:
	@./node_modules/.bin/mocha \
		-t 2000 \
		$(TESTFLAGS) \
		$(TESTS)

run-integrationtests:
	@./node_modules/.bin/mocha \
		-t 5000 \
		$(TESTFLAGS) \
		$(TESTS)

test:
	@$(MAKE) NODE_PATH=lib TESTS="$(ALL_TESTS)" run-tests

integrationtest:
	@$(MAKE) NODE_PATH=lib TESTS="$(ALL_INTEGRATION)" run-integrationtests

autobahn:
	@NODE_PATH=lib node test/autobahn.js 

autobahn-server:
	@NODE_PATH=lib node test/autobahn-server.js 

validator:
	node-waf configure build

.PHONY: test
