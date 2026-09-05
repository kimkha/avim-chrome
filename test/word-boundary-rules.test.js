import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { METHOD, type, typeContentEditable } from "./helpers/avim-harness.js";

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
			assert.equal(type(sequence, { method, checkSpell: 0 }), expected);
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
			assert.equal(type(sequence, { method, checkSpell }), expected);
		});
	}

	it("still shifts the breve past the u of a real qu", () => {
		assert.equal(type("quaw", { method: METHOD.TELEX }), "quă");
		assert.equal(type("qua8", { method: METHOD.VNI }), "quă");
	});
});

describe("The u of a uo pair takes the horn together with the o", () => {
	const cases = [
		["owus", METHOD.TELEX, "ớu"],
		["owuf", METHOD.TELEX, "ờu"],
		["owuj", METHOD.TELEX, "ợu"],
	];

	for (const [sequence, method, expected] of cases) {
		it(`"${sequence}" produces "${expected}" without inserting a stray ư`, () => {
			assert.equal(type(sequence, { method, checkSpell: 0 }), expected);
		});
	}

	const pairs = [
		["uow", "ươ"],
		["uoiw", "ươi"],
		["uocw", "ươc"],
		["uowng", "ương"],
		["huow", "hươ"],
		["khuow", "khươ"],
		["muow", "mươ"],
		["thuowng", "thương"],
		["nguoiw", "ngươi"],
		["dduowngf", "đường"],
		["nguoiwf", "người"],
	];

	for (const [sequence, expected] of pairs) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, { method: METHOD.TELEX }), expected);
		});
	}

	it("leaves the u alone after a q, where the o stands by itself", () => {
		assert.equal(type("quow", { method: METHOD.TELEX }), "quơ");
	});
});

describe("A th onset holds the u back until a letter follows", () => {
	const cases = [
		["thuow", "thuơ"],
		["Thuow", "Thuơ"],
		["THUOW", "THUƠ"],
		["xin thuow", "xin thuơ"],
		["thuowr", "thuở"],
		["thuown", "thươn"],
		["Thuown", "Thươn"],
		["THUOWN", "THƯƠN"],
		["xin thuown", "xin thươn"],
		["thuowng", "thương"],
		["thuowngf", "thường"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, { method: METHOD.TELEX }), expected);
		});
	}

	it("reaches a contenteditable too", () => {
		assert.equal(typeContentEditable("thuow", { method: METHOD.TELEX }), "thuơ");
		assert.equal(typeContentEditable("thuown", { method: METHOD.TELEX }), "thươn");
	});

	// A word boundary is not a letter, so the pair stays as spelt
	it("keeps the bare u when the word ends there", () => {
		assert.equal(type("thuow ", { method: METHOD.TELEX }), "thuơ ");
		assert.equal(type("thuow,", { method: METHOD.TELEX }), "thuơ,");
	});

	it("does not hold the u back once something already follows the o", () => {
		assert.equal(type("thuoiw", { method: METHOD.TELEX }), "thươi");
	});

	it("never horns the u of qu, whatever follows", () => {
		assert.equal(type("quown", { method: METHOD.TELEX }), "quơn");
	});
});

describe("Repeating the moc key un-horns the whole pair", () => {
	const cases = [
		["uoww", "uow"],
		["uoiww", "uoiw"],
		["uocww", "uocw"],
		["huoww", "huow"],
		["nguoiww", "nguoiw"],
		["quoww", "quow"],
		["uww", "uw"],
		["oww", "ow"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, { method: METHOD.TELEX }), expected);
		});
	}

	// The pair is complete after one w, so a second one escapes instead of finishing the word
	it("no longer accepts the old dduowngwf spelling", () => {
		assert.equal(type("dduowngwf", { method: METHOD.TELEX }), "đuongwf");
	});

	const otherMethods = [
		["VNI", METHOD.VNI, "uoi7", "ươi", "uoi77", "uoi7"],
		["VIQR", METHOD.VIQR, "uoi+", "ươi", "uoi++", "uoi+"],
	];

	for (const [name, method, on, horned, off, plain] of otherMethods) {
		it(`${name} horns and un-horns the pair the same way`, () => {
			assert.equal(type(on, { method }), horned);
			assert.equal(type(off, { method }), plain);
		});
	}
});
