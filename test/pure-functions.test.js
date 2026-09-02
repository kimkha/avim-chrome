import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import {
	AVIM_PATH,
	METHOD,
	loadEngine,
	createInput,
	primeMethodTables,
} from "./helpers/avim-harness.js";

function engine() {
	return primeMethodTables(loadEngine({ method: METHOD.TELEX }));
}

describe("upperCase", () => {
	const cases = [
		["abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
		["1234567890", "1234567890"],
		["`~!@#$%^&*()_+[]\\;'\"{}|:<>?,./", "`~!@#$%^&*()_+[]\\;'\"{}|:<>?,./"],
		["a,â,ă,e,ê,i,o,ô,ơ,u,ư,y", "A,Â,Ă,E,Ê,I,O,Ô,Ơ,U,Ư,Y"],
		[
			"á,à,ả,ã,ạ,ắ,ằ,ẳ,ẵ,ặ,ă,ấ,ầ,ẩ,ẫ,ậ,â,é,è,ẻ,ẽ,ẹ,ế,ề,ể,ễ,ệ,ê,í,ì,ỉ,ĩ,ị,ó,ò,ỏ,õ,ọ,ố,ồ,ổ,ỗ,ộ,ô,ớ,ờ,ở,ỡ,ợ,ơ,ú,ù,ủ,ũ,ụ,ứ,ừ,ử,ữ,ự,ư,ý,ỳ,ỷ,ỹ,ỵ",
			"Á,À,Ả,Ã,Ạ,Ắ,Ằ,Ẳ,Ẵ,Ặ,Ă,Ấ,Ầ,Ẩ,Ẫ,Ậ,Â,É,È,Ẻ,Ẽ,Ẹ,Ế,Ề,Ể,Ễ,Ệ,Ê,Í,Ì,Ỉ,Ĩ,Ị,Ó,Ò,Ỏ,Õ,Ọ,Ố,Ồ,Ổ,Ỗ,Ộ,Ô,Ớ,Ờ,Ở,Ỡ,Ợ,Ơ,Ú,Ù,Ủ,Ũ,Ụ,Ứ,Ừ,Ử,Ữ,Ự,Ư,Ý,Ỳ,Ỷ,Ỹ,Ỵ",
		],
		["Thương em thương tự thuở nào...", "THƯƠNG EM THƯƠNG TỰ THUỞ NÀO..."],
		["Nhớ em, nhớ cả dạt dào đêm nay", "NHỚ EM, NHỚ CẢ DẠT DÀO ĐÊM NAY"],
		["ệộ", "ỆỘ"],
		["ọợặ", "ỌỢẶ"],
		["", ""],
	];

	for (const [input, expected] of cases) {
		it(`uppercases ${JSON.stringify(input.slice(0, 24))}`, () => {
			assert.equal(engine().upperCase(input), expected);
		});
	}
});

describe("fromCharCode", () => {
	it("maps 272 to Đ", () => {
		assert.equal(engine().fromCharCode(272), "Đ");
	});

	it("maps 417 to ơ", () => {
		assert.equal(engine().fromCharCode(417), "ơ");
	});
});

describe("notWord", () => {
	const separators = [" ", "\t", "\r", "\n", "-", ".", ",", "(", ")", "\u00a0"];
	const letters = ["a", "Z", "ê", "đ", "1"];

	for (const char of separators) {
		it(`treats ${JSON.stringify(char)} as a word separator`, () => {
			assert.equal(engine().notWord(char), true);
		});
	}

	for (const char of letters) {
		it(`treats ${JSON.stringify(char)} as part of a word`, () => {
			assert.equal(engine().notWord(char), false);
		});
	}
});

describe("notNumber", () => {
	it("reports true for a letter", () => {
		assert.equal(engine().notNumber("x"), true);
	});

	it("reports false for a digit string", () => {
		assert.equal(engine().notNumber("5"), false);
	});

	it("reports false for a numeric char code", () => {
		assert.equal(engine().notNumber(272), false);
	});

	// "e" would otherwise parse as an exponent, so it is special-cased as not-a-number
	it('reports true for "e"', () => {
		assert.equal(engine().notNumber("e"), true);
	});
});

describe("checkCode", () => {
	const skipped = [33, 44, 145, 255];
	const allowed = [32, 39, 40, 42, 43, 45, 46, 97, 122, 65];

	for (const code of skipped) {
		it(`skips key code ${code}`, () => {
			assert.equal(engine().checkCode(code), true);
		});
	}

	for (const code of allowed) {
		it(`does not skip key code ${code}`, () => {
			assert.equal(engine().checkCode(code), false);
		});
	}

	it("skips every code when AVIM is off", () => {
		const context = loadEngine({ method: METHOD.TELEX, onOff: 0 });
		assert.equal(context.checkCode(97), true);
	});
});

describe("unV strips tone marks but keeps vowel modifiers", () => {
	const cases = [
		["ạ", "a"],
		["ộ", "ô"],
		["ợ", "ơ"],
		["ập", "âp"],
		["tiếng", "tiêng"],
		["abc", "abc"],
	];

	for (const [input, expected] of cases) {
		it(`${JSON.stringify(input)} becomes ${JSON.stringify(expected)}`, () => {
			assert.equal(engine().unV(input), expected);
		});
	}
});

describe("unV2 strips vowel modifiers", () => {
	const cases = [
		["â", "a"],
		["ơ", "o"],
		["ư", "u"],
		["tiêng", "tieng"],
		["ạ", "ạ"],
	];

	for (const [input, expected] of cases) {
		it(`${JSON.stringify(input)} becomes ${JSON.stringify(expected)}`, () => {
			assert.equal(engine().unV2(input), expected);
		});
	}
});

describe("getSF lists the base vowels the engine can modify", () => {
	it("returns the 24 lower and upper case base vowels", () => {
		assert.equal(engine().getSF().join(""), "aâăeêioôơuưyAÂĂEÊIOÔƠUƯY");
	});
});

describe("retKC returns the 24 accented code points for a tone key", () => {
	for (const toneKey of ["S", "F", "J", "R", "X"]) {
		it(`returns 24 code points for "${toneKey}"`, () => {
			assert.equal(engine().retKC(toneKey).length, 24);
		});
	}

	it("starts the nặng row at ạ", () => {
		assert.equal(engine().retKC("J")[0], 7841);
	});

	it("returns an empty array for a key that is not a tone key", () => {
		assert.deepEqual(Array.from(engine().retKC("Q")), []);
	});
});

describe("upperCase fallback table", () => {
	// unreachable while toUpperCase handles every entry, so behaviour cannot guard it
	it("pairs every source character with its correct uppercase form", () => {
		const source = readFileSync(AVIM_PATH, "utf8");
		const lower = Array.from(source.match(/const LOWER_VIET = "([^"]+)"/)[1]);
		const upper = Array.from(source.match(/const UPPER_VIET = "([^"]+)"/)[1]);
		assert.equal(lower.length, upper.length);
		assert.deepEqual(lower.map((char) => char.toUpperCase()), upper);
	});
});

describe("repSign collects accented code points", () => {
	it("returns all five tone rows when no key is excluded", () => {
		assert.equal(engine().repSign(null).length, 120);
	});

	it("excludes the row of the given tone key", () => {
		assert.equal(engine().repSign("S").length, 96);
	});
});

describe("retUni maps a base vowel plus tone key to a code point", () => {
	const cases = [
		["a", "S", 225],
		["a", "F", 224],
		["A", "S", 193],
	];

	for (const [word, toneKey, expected] of cases) {
		it(`${JSON.stringify(word)} + ${toneKey} is ${expected}`, () => {
			assert.equal(engine().retUni(word, toneKey, 1), expected);
		});
	}

	it("returns undefined for a consonant", () => {
		assert.equal(engine().retUni("z", "S", 1), undefined);
	});
});

describe("DAWEOF undoes a vowel modifier", () => {
	it("turns â back into a", () => {
		assert.deepEqual(Array.from(engine().DAWEOF("â", "A", 1)), [1, "a"]);
	});

	it("keeps the tone when undoing ấ", () => {
		assert.deepEqual(Array.from(engine().DAWEOF("ấ", "A", 2)), [2, "á"]);
	});

	it("turns ơ back into o", () => {
		assert.deepEqual(Array.from(engine().DAWEOF("ơ", "W", 1)), [1, "o"]);
	});

	it("returns false when the character has no modifier to undo", () => {
		assert.equal(engine().DAWEOF("x", "A", 1), false);
	});
});

describe("getEditorObject", () => {
	it("reads value and collapsed caret from an input", () => {
		const result = engine().getEditorObject(createInput({ value: "abc", caret: 2 }));
		assert.equal(result.v, "abc");
		assert.equal(result.s, 2);
		assert.equal(result.e, 2);
	});

	it("reads a selection range from an input", () => {
		const result = engine().getEditorObject(createInput({ value: "abcd", caret: 1, caretEnd: 3 }));
		assert.equal(result.s, 1);
		assert.equal(result.e, 3);
	});

	it("returns false for an element without setSelectionRange", () => {
		assert.equal(engine().getEditorObject({ value: "abc" }), false);
	});
});

describe("mozGetText extracts the word before the caret", () => {
	it("stops at a space", () => {
		assert.deepEqual(Array.from(engine().mozGetText({ v: "xin chao", s: 8, e: 8 })), ["chao", 8]);
	});

	it("stops at punctuation", () => {
		assert.deepEqual(Array.from(engine().mozGetText({ v: "hello.world", s: 11, e: 11 })), ["world", 11]);
	});

	it("keeps a leading backslash", () => {
		assert.deepEqual(Array.from(engine().mozGetText({ v: "a\\b", s: 3, e: 3 })), ["\\b", 3]);
	});

	it("returns an empty word when the selection is not collapsed", () => {
		assert.deepEqual(Array.from(engine().mozGetText({ v: "abc", s: 1, e: 3 })), ["", 1]);
	});

	it("returns an empty word at the start of the field", () => {
		assert.deepEqual(Array.from(engine().mozGetText({ v: "abc", s: 0, e: 0 })), ["", 0]);
	});

	it("returns false for an empty field", () => {
		assert.equal(engine().mozGetText({ v: "", s: 0, e: 0 }), false);
	});

	it("returns false when there is no editor object", () => {
		assert.equal(engine().mozGetText(false), false);
	});
});
