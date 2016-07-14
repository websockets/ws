ALL_TESTS = $(shell find test -name '*.test.js')
ALL_INTEGRATION = $(shell find test -name '*.integration.js')

lint:
	@./node_modules/.bin/eslint lib index.js

run-tests:
	@./node_modules/.bin/mocha \
		-t 5000 \
		-s 2400 \
		$(TESTFLAGS) \
		$(TESTS)

run-integrationtests:
	@./node_modules/.bin/mocha \
		-t 5000 \
		-s 6000 \
		$(TESTFLAGS) \
		$(TESTS)

run-coverage:
	@./node_modules/.bin/istanbul cover --report html \
		./node_modules/.bin/_mocha -- \
		-t 5000 \
		-s 6000 \
		$(TESTFLAGS) \
		$(TESTS)

test: lint
	@$(MAKE) NODE_TLS_REJECT_UNAUTHORIZED=0 TESTS="$(ALL_TESTS)" run-tests

integrationtest:
	@$(MAKE) NODE_TLS_REJECT_UNAUTHORIZED=0 TESTS="$(ALL_INTEGRATION)" run-integrationtests

coverage:
	@$(MAKE) NODE_TLS_REJECT_UNAUTHORIZED=0 TESTS="$(ALL_TESTS)" run-coverage

benchmark:
	@node bench/sender.benchmark.js
	@node bench/parser.benchmark.js

autobahn:
	@NODE_PATH=lib node test/autobahn.js

autobahn-server:
	@NODE_PATH=lib node test/autobahn-server.js

.PHONY: test coverage
