"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { METHOD, toneMatrixCases, type } = require("./helpers/avim-harness.js");

const TELEX = { method: METHOD.TELEX };

const BASE_VOWELS = {
	"a": "a",
	"â": "aa",
	"ă": "aw",
	"e": "e",
	"ê": "ee",
	"i": "i",
	"o": "o",
	"ô": "oo",
	"ơ": "ow",
	"u": "u",
	"ư": "uw",
	"y": "y",
};

describe("Telex: vowel x tone matrix", () => {
	for (const testCase of toneMatrixCases(BASE_VOWELS, "sfrxj")) {
		it(`"${testCase.sequence}" produces "${testCase.expected}"`, () => {
			assert.equal(type(testCase.sequence, TELEX), testCase.expected);
		});
	}
});

describe("Telex: vowel modifiers", () => {
	const cases = [
		["aa", "â"],
		["aw", "ă"],
		["ee", "ê"],
		["oo", "ô"],
		["ow", "ơ"],
		["uw", "ư"],
		["dd", "đ"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, TELEX), expected);
		});
	}
});

describe("Telex: removing tones with Z", () => {
	const cases = [
		["asz", "a"],
		["aaz", "a"],
		["awz", "a"],
		["ddz", "d"],
		["tooisz", "tôi"],
		["nguoiwfz", "ngươi"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, TELEX), expected);
		});
	}
});

describe("Telex: repeating a key escapes the transform", () => {
	const cases = [
		["aaa", "aa"],
		["ddd", "dd"],
		["ass", "as"],
		["oooo", "ooo"],
		["www", "www"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, TELEX), expected);
		});
	}
});

describe("Telex: English words are transformed too", () => {
	// telex has no notion of language: any matching keys transform, which is by design
	const cases = [
		["assets", "asets"],
		["office", "ofice"],
		["google", "gôgle"],
		["test", "tét"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, TELEX), expected);
		});
	}
});

describe("Telex: real words", () => {
	const cases = [
		["tooi", "tôi"],
		["vieejt", "việt"],
		["nguoiwf", "người"],
		["chaof", "chào"],
		["khoong", "không"],
		["dduowngwf", "đường"],
		["cuoiwf", "cười"],
		["truowngf", "trường"],
		["nguyeenj", "nguyện"],
		["ddoongf", "đồng"],
		["chuyeenr", "chuyển"],
		["hoaf", "hòa"],
		["xuaan", "xuân"],
		["ruowuj", "rượu"],
		["quoocs", "quốc"],
		["ngoaij", "ngoại"],
		["thuyeets", "thuyết"],
		["gias", "giá"],
		["nghiax", "nghĩa"],
		["hoangf", "hoàng"],
		["quays", "quáy"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, TELEX), expected);
		});
	}
});

describe("Telex: rare words keeping a doubled o", () => {
	const cases = [
		["gooongf", "goòng"],
		["gooongs", "goóng"],
		["gooongr", "goỏng"],
		["gooongx", "goõng"],
		["gooongj", "goọng"],
		["thooongf", "thoòng"],
		["xooong", "xoong"],
		["booong", "boong"],
		["cooong", "coong"],
		["sooong", "soong"],
		["tooong", "toong"],
		["looong", "loong"],
		["mooocs", "moóc"],
		["sooocs", "soóc"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, TELEX), expected);
		});
	}
});

describe("Telex: compound words typed with a space", () => {
	const cases = [
		["oo too", "ô tô"],
		["bee toong", "bê tông"],
		["caf phee", "cà phê"],
		["xichs loo", "xích lô"],
		["soo coo la", "sô cô la"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, TELEX), expected);
		});
	}
});

describe("Telex: sentences", () => {
	const cases = [
		["xin chaof", "xin chào"],
		["Tieengs Vieejt", "Tiếng Việt"],
		["xin chaof cacs banj", "xin chào các bạn"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, TELEX), expected);
		});
	}
});

describe("Telex: uppercase", () => {
	const cases = [
		["AS", "Á"],
		["DD", "Đ"],
		["TOOI", "TÔI"],
		["Tieengs", "Tiếng"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, TELEX), expected);
		});
	}
});

describe("Telex: a tone key with no vowel to attach to stays literal", () => {
	const cases = [
		["dds", "đs"],
		["s", "s"],
		["ws", "ws"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, TELEX), expected);
		});
	}
});
