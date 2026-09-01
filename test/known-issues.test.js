"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
	METHOD,
	loadEngine,
	createInput,
	primeMethodTables,
	type,
} = require("./helpers/avim-harness.js");

/**
 * Wrong-but-current behaviour, asserted so a refactor cannot change it silently.
 * When one is fixed, the test fails and should be rewritten as the correct expectation.
 */

describe("Known issue: an empty value falls back to innerText", () => {
	// getEditorObject uses `(ele.value) ? ele.value : ele.innerText`, and "" is falsy
	it("reads innerText instead of the empty value", () => {
		const context = loadEngine({ method: METHOD.TELEX });
		const element = createInput({ value: "", caret: 0, innerText: "ngoai" });
		assert.equal(context.getEditorObject(element).v, "ngoai");
	});

	it("reads value once it is non-empty", () => {
		const context = loadEngine({ method: METHOD.TELEX });
		const element = createInput({ value: "abc", caret: 3, innerText: "ngoai" });
		assert.equal(context.getEditorObject(element).v, "abc");
	});
});

describe("Known issue: helpers depend on main() having run first", () => {
	// AVIMObj.SFJRX is only assigned inside main(), and repSign reads it unconditionally
	it("unV throws on a fresh engine", () => {
		const context = loadEngine({ method: METHOD.TELEX });
		assert.throws(() => context.unV("ạ"), /Cannot read properties of undefined/);
	});

	it("unV works after one keypress", () => {
		assert.equal(primeMethodTables(loadEngine({ method: METHOD.TELEX })).unV("ạ"), "a");
	});
});

describe("Known issue: spell check treats a solid compound as one syllable", () => {
	// ckspell reads back to the last separator, so an internal consonant looks like an error
	const cases = [
		["beetoong", "bêtoong", "bêtông"],
		["cafphee", "càphee", "càphê"],
		["xichsloo", "xíchloo", "xíchlô"],
	];

	for (const [sequence, guarded, unguarded] of cases) {
		it(`"${sequence}" only reaches "${unguarded}" with spell check off`, () => {
			assert.equal(type(sequence, { method: METHOD.TELEX, checkSpell: 1 }), guarded);
			assert.equal(type(sequence, { method: METHOD.TELEX, checkSpell: 0 }), unguarded);
		});
	}

	it("blocks the last mark of VNI ôtô but allows it with spell check off", () => {
		assert.equal(type("o6to6", { method: METHOD.VNI, checkSpell: 1 }), "ôto6");
		assert.equal(type("o6to6", { method: METHOD.VNI, checkSpell: 0 }), "ôtô");
	});

	it("does not affect the same words typed with a space", () => {
		assert.equal(type("bee toong", { method: METHOD.TELEX, checkSpell: 1 }), "bê tông");
		assert.equal(type("oo too", { method: METHOD.TELEX, checkSpell: 1 }), "ô tô");
	});
});

describe("Known issue: a telex modifier undoes an earlier vowel across a consonant", () => {
	// findC scans back over the whole word, so the o of "ôt"+o is read as an escape
	const cases = [
		["ooto", "oto"],
		["aata", "ata"],
		["eete", "ete"],
		["uwtu", "ưtu"],
	];

	for (const [sequence, actual] of cases) {
		it(`"${sequence}" currently types "${actual}"`, () => {
			assert.equal(type(sequence, { method: METHOD.TELEX, checkSpell: 0 }), actual);
		});
	}

	it("makes solid ôtô unreachable in telex even with spell check off", () => {
		assert.equal(type("ootoo", { method: METHOD.TELEX, checkSpell: 0 }), "otô");
		assert.equal(type("ootoo", { method: METHOD.TELEX, checkSpell: 1 }), "otoo");
	});

	it("does not affect VNI, whose modifier keys are digits", () => {
		assert.equal(type("o6to", { method: METHOD.VNI, checkSpell: 0 }), "ôto");
	});
});
