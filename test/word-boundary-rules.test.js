"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { METHOD, type } = require("./helpers/avim-harness.js");

/**
 * Three rules read the character *before* a vowel. For a word-initial vowel there is no
 * such character, and each rule must read nothing rather than the word's last character.
 */

describe("The q+u rule reads before the u, not the end of the word", () => {
	const cases = [
		["uqs", METHOD.TELEX, "úq"],
		["uqf", METHOD.TELEX, "ùq"],
		["uq1", METHOD.VNI, "úq"],
		["uq'", METHOD.VIQR, "úq"],
		["unqs", METHOD.TELEX, "únq"],
	];

	for (const [sequence, method, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, { method: method, checkSpell: 0 }), expected);
		});
	}

	it("still refuses to accent the u of a real qu", () => {
		assert.equal(type("quas", { method: METHOD.TELEX }), "quá");
		assert.equal(type("quaf", { method: METHOD.TELEX }), "quà");
		assert.equal(type("quansg", { method: METHOD.TELEX }), "quáng");
	});
});

describe("The breve shift reads before the a, not the end of the word", () => {
	const cases = [
		["au8", METHOD.VNI, 0, "ău"],
		["au(", METHOD.VIQR, 0, "ău"],
		["auu8", METHOD.VNI, 1, "ăuu"],
		["ayu8", METHOD.VNI, 1, "ăyu"],
	];

	for (const [sequence, method, checkSpell, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, { method: method, checkSpell: checkSpell }), expected);
		});
	}

	it("still shifts the breve past the u of a real qu", () => {
		assert.equal(type("quaw", { method: METHOD.TELEX }), "quă");
		assert.equal(type("qua8", { method: METHOD.VNI }), "quă");
	});
});

describe("The uo pair check reads before the caret, not the end of the word", () => {
	const cases = [
		["owus", METHOD.TELEX, "ớu"],
		["owuf", METHOD.TELEX, "ờu"],
		["owuj", METHOD.TELEX, "ợu"],
	];

	for (const [sequence, method, expected] of cases) {
		it(`"${sequence}" produces "${expected}" without inserting a stray ư`, () => {
			assert.equal(type(sequence, { method: method, checkSpell: 0 }), expected);
		});
	}

	it("still builds a real ươ pair", () => {
		assert.equal(type("dduowngwf", { method: METHOD.TELEX }), "đường");
		assert.equal(type("nguoiwf", { method: METHOD.TELEX }), "người");
	});
});
