"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { METHOD, toneMatrixCases, type } = require("./helpers/avim-harness.js");

const VIQR = { method: METHOD.VIQR };
const VIQR_STAR = { method: METHOD.VIQR_STAR };

const TONE_KEYS = "'`?~.";

const VIQR_BASE_VOWELS = {
	"a": "a",
	"â": "a^",
	"ă": "a(",
	"e": "e",
	"ê": "e^",
	"i": "i",
	"o": "o",
	"ô": "o^",
	"ơ": "o+",
	"u": "u",
	"ư": "u+",
	"y": "y",
};

// VIQR* differs from VIQR only in the horn key: * instead of +
const VIQR_STAR_BASE_VOWELS = Object.assign({}, VIQR_BASE_VOWELS, {
	"ơ": "o*",
	"ư": "u*",
});

describe("VIQR: vowel x tone matrix", () => {
	for (const testCase of toneMatrixCases(VIQR_BASE_VOWELS, TONE_KEYS)) {
		it(`"${testCase.sequence}" produces "${testCase.expected}"`, () => {
			assert.equal(type(testCase.sequence, VIQR), testCase.expected);
		});
	}
});

describe("VIQR*: vowel x tone matrix", () => {
	for (const testCase of toneMatrixCases(VIQR_STAR_BASE_VOWELS, TONE_KEYS)) {
		it(`"${testCase.sequence}" produces "${testCase.expected}"`, () => {
			assert.equal(type(testCase.sequence, VIQR_STAR), testCase.expected);
		});
	}
});

describe("VIQR: real words", () => {
	const cases = [
		["to^i", "tôi"],
		["vie^.t", "việt"],
		["ngu+o+i`", "người"],
		["chao`", "chào"],
		["kho^ng", "không"],
		["dDo^ng`", "đồng"],
		["ngoa.i", "ngoại"],
		["xua^n", "xuân"],
		["quo^c'", "quốc"],
		["hoa`", "hòa"],
		["gia?", "giả"],
		["nghia~", "nghĩa"],
		["thuye^t'", "thuyết"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, VIQR), expected);
		});
	}
});

describe("VIQR*: real words", () => {
	const cases = [
		["to^i", "tôi"],
		["vie^.t", "việt"],
		["ngu*o*i`", "người"],
		["dD", "đ"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, VIQR_STAR), expected);
		});
	}
});

describe("VIQR: D is typed as a capital D after d", () => {
	it('"dD" produces "đ"', () => {
		assert.equal(type("dD", VIQR), "đ");
	});
});

describe("VIQR: keys with nothing to modify stay literal", () => {
	const cases = [
		["a+", "a+"],
		["a-", "a-"],
		["as", "as"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, VIQR), expected);
		});
	}
});

describe("VIQR*: the VIQR horn key is inert", () => {
	const cases = [
		["a*", "a*"],
		["o*", "ơ"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, VIQR_STAR), expected);
		});
	}
});
