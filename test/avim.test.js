//"use strict";

// TODO Should remove eval() and turn on strict mode
eval(require('fs').readFileSync('./src/scripts/avim.js','utf-8'));

describe("Demo", function() {
	it("with fromCharCode", function() {
		expect(fromCharCode(272)).toBe("Đ");
	});
});

describe("Basic function:", function() {
	
	it("Uppercase", function() {
		var testcase = [
			["abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
			["1234567890", "1234567890"],
			["`~!@#$%^&*()_+[]\\;'\"{}|:<>?,./", "`~!@#$%^&*()_+[]\\;'\"{}|:<>?,./"],
			["a,â,ă,e,ê,i,o,ô,ơ,u,ư,y", "A,Â,Ă,E,Ê,I,O,Ô,Ơ,U,Ư,Y"],
			["á,à,ả,ã,ạ,ắ,ằ,ẳ,ẵ,ặ,ă,ấ,ầ,ẩ,ẫ,ậ,â,é,è,ẻ,ẽ,ẹ,ế,ề,ể,ễ,ệ,ê,í,ì,ỉ,ĩ,ị,ó,ò,ỏ,õ,ọ,ố,ồ,ổ,ỗ,ộ,ô,ớ,ờ,ở,ỡ,ợ,ơ,ú,ù,ủ,ũ,ụ,ứ,ừ,ử,ữ,ự,ư,ý,ỳ,ỷ,ỹ,ỵ", "Á,À,Ả,Ã,Ạ,Ắ,Ằ,Ẳ,Ẵ,Ặ,Ă,Ấ,Ầ,Ẩ,Ẫ,Ậ,Â,É,È,Ẻ,Ẽ,Ẹ,Ế,Ề,Ể,Ễ,Ệ,Ê,Í,Ì,Ỉ,Ĩ,Ị,Ó,Ò,Ỏ,Õ,Ọ,Ố,Ồ,Ổ,Ỗ,Ộ,Ô,Ớ,Ờ,Ở,Ỡ,Ợ,Ơ,Ú,Ù,Ủ,Ũ,Ụ,Ứ,Ừ,Ử,Ữ,Ự,Ư,Ý,Ỳ,Ỷ,Ỹ,Ỵ"],
			["Thương em thương tự thuở nào...", "THƯƠNG EM THƯƠNG TỰ THUỞ NÀO..."],
			["Nhớ em, nhớ cả dạt dào đêm nay", "NHỚ EM, NHỚ CẢ DẠT DÀO ĐÊM NAY"]
		];
		
		for (var i = 0; i < testcase.length; i++) {
			var test = testcase[i];
			var result = upperCase(test[0]);
			expect(result).toBe(test[1]);
		}
	});
	
});
