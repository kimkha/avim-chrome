//"use strict";

// TODO Should remove eval() and turn on strict mode
eval(require('fs').readFileSync('./src/scripts/avim.js','utf-8'));

describe("Demo", function() {
	it("with fromCharCode", function() {
		expect(fromCharCode(272)).toBe("Đ");
	});
});