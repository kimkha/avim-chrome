"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { METHOD, type } = require("./helpers/avim-harness.js");

function withSpellCheck(sequence) {
	return type(sequence, { method: METHOD.TELEX, checkSpell: 1 });
}

function withoutSpellCheck(sequence) {
	return type(sequence, { method: METHOD.TELEX, checkSpell: 0 });
}

describe("Spell check rejects letters that never appear in Vietnamese", () => {
	const cases = [
		["fas", "fas", "fá"],
		["jas", "jas", "já"],
		["was", "was", "wá"],
		["zas", "zas", "zá"],
		["fast", "fast", "fát"],
		["status", "status", "státu"],
	];

	for (const [sequence, guarded, unguarded] of cases) {
		it(`"${sequence}" stays "${guarded}" when spell check is on`, () => {
			assert.equal(withSpellCheck(sequence), guarded);
		});

		it(`"${sequence}" becomes "${unguarded}" when spell check is off`, () => {
			assert.equal(withoutSpellCheck(sequence), unguarded);
		});
	}
});

describe("Spell check rejects impossible vowel clusters", () => {
	const cases = [
		["aes", "aes", "áe"],
		["oues", "oues", "oúe"],
		["yyas", "yyas", "yýa"],
		["ioas", "ioas", "ióa"],
		["khuyaa", "khuyaa", "khuyâ"],
	];

	for (const [sequence, guarded, unguarded] of cases) {
		it(`"${sequence}" stays "${guarded}" when spell check is on`, () => {
			assert.equal(withSpellCheck(sequence), guarded);
		});

		it(`"${sequence}" becomes "${unguarded}" when spell check is off`, () => {
			assert.equal(withoutSpellCheck(sequence), unguarded);
		});
	}
});

describe("Spell check still allows valid Vietnamese", () => {
	const cases = [
		["as", "á"],
		["chaof", "chào"],
		["nguoiwf", "người"],
		["thuyeets", "thuyết"],
		["quoocs", "quốc"],
		["nghieengs", "nghiếng"],
		["chuyeenr", "chuyển"],
		["nguyeenj", "nguyện"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}" with spell check on`, () => {
			assert.equal(withSpellCheck(sequence), expected);
		});
	}
});

describe("Spell check protects common English words", () => {
	const cases = [
		["class", "class", "clas"],
		["assets", "asets", "asét"],
	];

	for (const [sequence, guarded, unguarded] of cases) {
		it(`"${sequence}" is closer to intact when spell check is on`, () => {
			assert.equal(withSpellCheck(sequence), guarded);
			assert.equal(withoutSpellCheck(sequence), unguarded);
		});
	}
});

describe("Spell check makes no difference for these words", () => {
	const cases = ["hello", "email", "video", "tone", "hotel", "office", "google", "test"];

	for (const sequence of cases) {
		it(`"${sequence}" types the same either way`, () => {
			assert.equal(withSpellCheck(sequence), withoutSpellCheck(sequence));
		});
	}
});
