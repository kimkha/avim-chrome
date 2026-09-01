"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { METHOD, toneMatrixCases, type } = require("./helpers/avim-harness.js");

const VNI = { method: METHOD.VNI };

const BASE_VOWELS = {
	"a": "a",
	"â": "a6",
	"ă": "a8",
	"e": "e",
	"ê": "e6",
	"i": "i",
	"o": "o",
	"ô": "o6",
	"ơ": "o7",
	"u": "u",
	"ư": "u7",
	"y": "y",
};

describe("VNI: vowel x tone matrix", () => {
	for (const testCase of toneMatrixCases(BASE_VOWELS, "12345")) {
		it(`"${testCase.sequence}" produces "${testCase.expected}"`, () => {
			assert.equal(type(testCase.sequence, VNI), testCase.expected);
		});
	}
});

describe("VNI: vowel modifiers", () => {
	const cases = [
		["a6", "â"],
		["a8", "ă"],
		["e6", "ê"],
		["o6", "ô"],
		["o7", "ơ"],
		["u7", "ư"],
		["d9", "đ"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, VNI), expected);
		});
	}
});

describe("VNI: removing marks with 0", () => {
	const cases = [
		["a10", "a"],
		["toi60", "toi"],
		["d90", "d"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, VNI), expected);
		});
	}
});

describe("VNI: real words", () => {
	const cases = [
		["toi6", "tôi"],
		["viet65", "việt"],
		["nguoi72", "người"],
		["duong792", "đường"],
		["chao2", "chào"],
		["khong6", "không"],
		["quoc61", "quốc"],
		["ngoai5", "ngoại"],
		["xuan6", "xuân"],
		["d9ong62", "đồng"],
		["hoa2", "hòa"],
		["gia1", "giá"],
		["nghia4", "nghĩa"],
		["thuyet651", "thuyết"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, VNI), expected);
		});
	}
});

describe("VNI: keys with nothing to modify stay literal", () => {
	const cases = [
		["a7", "a7"],
		["a0", "a0"],
		["a9", "a9"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, VNI), expected);
		});
	}
});

describe("VNI: telex keys are inert", () => {
	const cases = [
		["as", "as"],
		["dd", "dd"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, VNI), expected);
		});
	}
});
