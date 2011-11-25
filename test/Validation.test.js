var Validation = require('../build/Release/validation').Validation;

module.export = {
    'validates simple string': function() {
        assert.ok(Validation.isValidUTF8(new Buffer('as')));
    },
    'invalidates erroneous string': function() {
        var invalidBuffer = new Buffer([0xce, 0xba, 0xe1, 0xbd, 0xb9, 0xcf, 0x83, 0xce, 0xbc, 0xce, 0xb5, 0xed, 0xa0, 0x80, 0x65, 0x64, 0x69, 0x74, 0x65, 0x64]);
        assert.fail(Validation.isValidUTF8(invalidBuffer));
    },
    'validates autobahn string': function() {
        assert.ok(Validation.isValidUTF8(new Buffer('\xf0\x90\x80\x80')));
        assert.ok(Validation.isValidUTF8(new Buffer([0xf0, 0x90, 0x80, 0x80])));
    }
};
