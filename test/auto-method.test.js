import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { METHOD, type } from "./helpers/avim-harness.js";

const AUTO = { method: METHOD.AUTO };

describe("Auto: accepts telex and VNI sequences interchangeably", () => {
	const cases = [
		["as", "á"],
		["a1", "á"],
		["aa", "â"],
		["a6", "â"],
		["aas", "ấ"],
		["a61", "ấ"],
		["ows", "ớ"],
		["o71", "ớ"],
		["uwj", "ự"],
		["u75", "ự"],
		["dd", "đ"],
		["d9", "đ"],
		["tooi", "tôi"],
		["toi6", "tôi"],
		["nguoiwf", "người"],
		["nguoi72", "người"],
		["chaof", "chào"],
		["chao2", "chào"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, AUTO), expected);
		});
	}
});

describe("Auto: VIQR and VIQR* are disabled by default", () => {
	const cases = [
		["a'", "a'"],
		["a^", "a^"],
		["a+", "a+"],
		["a(", "a("],
		["a-", "a-"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" stays literal`, () => {
			assert.equal(type(sequence, AUTO), expected);
		});
	}
});

describe("Auto: AVIMAutoConfig selects which methods participate", () => {
	const TELEX_ONLY = [true, false, false, false];
	const VNI_ONLY = [false, true, false, false];
	const VIQR_ONLY = [false, false, true, false];
	const NONE = [false, false, false, false];

	it("telex only accepts telex keys", () => {
		assert.equal(type("as", { method: METHOD.AUTO, autoConfig: TELEX_ONLY }), "á");
	});

	it("telex only ignores VNI keys", () => {
		assert.equal(type("a1", { method: METHOD.AUTO, autoConfig: TELEX_ONLY }), "a1");
	});

	it("VNI only accepts VNI keys", () => {
		assert.equal(type("a1", { method: METHOD.AUTO, autoConfig: VNI_ONLY }), "á");
	});

	it("VNI only ignores telex keys", () => {
		assert.equal(type("as", { method: METHOD.AUTO, autoConfig: VNI_ONLY }), "as");
	});

	it("enabling VIQR accepts VIQR keys", () => {
		assert.equal(type("to^i", { method: METHOD.AUTO, autoConfig: [true, true, true, false] }), "tôi");
	});

	it("enabling VIQR* accepts the star horn key", () => {
		assert.equal(type("o*", { method: METHOD.AUTO, autoConfig: [true, true, false, true] }), "ơ");
	});

	it("VIQR only ignores telex and VNI keys", () => {
		assert.equal(type("as", { method: METHOD.AUTO, autoConfig: VIQR_ONLY }), "as");
		assert.equal(type("a1", { method: METHOD.AUTO, autoConfig: VIQR_ONLY }), "a1");
		assert.equal(type("a'", { method: METHOD.AUTO, autoConfig: VIQR_ONLY }), "á");
	});

	it("all methods disabled types nothing", () => {
		assert.equal(type("as", { method: METHOD.AUTO, autoConfig: NONE }), "as");
		assert.equal(type("a1", { method: METHOD.AUTO, autoConfig: NONE }), "a1");
		assert.equal(type("dd", { method: METHOD.AUTO, autoConfig: NONE }), "dd");
	});
});
