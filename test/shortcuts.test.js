import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	METHOD,
	createInput,
	loadEngine,
	pressKey,
	type,
	typeContentEditable,
} from "./helpers/avim-harness.js";

const DEFAULT_SHORTCUTS = [
	{ key: "w", value: "ư" },
	{ key: "W", value: "Ư" },
	{ key: "uow", value: "ươ" },
	{ key: "Uow", value: "Ươ" },
	{ key: "UOW", value: "ƯƠ" },
];

function on(shortcuts = DEFAULT_SHORTCUTS, extra = {}) {
	return { shortcutsOn: 1, shortcuts, ...extra };
}

describe("The default shortcuts expand what Telex leaves alone", () => {
	const cases = [
		["w", "ư"],
		["uow", "ươ"],
		["uowng", "ương"],
		["xin w", "xin ư"],
		["xin,w", "xin,ư"],
		["wa", "ưa"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, on()), expected);
		});
	}

	it("leaves the caret after the replacement", () => {
		const context = loadEngine(on());
		const element = createInput({ value: "", caret: 0 });

		pressKey(context, element, "w");

		assert.equal(element.value, "ư");
		assert.equal(element.selectionStart, 1);
	});

	it("keeps the text that follows the caret", () => {
		const context = loadEngine(on([{ key: "vn", value: "Việt Nam" }]));
		const element = createInput({ value: "vX", caret: 1 });

		pressKey(context, element, "n");

		assert.equal(element.value, "Việt NamX");
		assert.equal(element.selectionStart, 8);
	});
});

describe("A shortcut only fires when it is the whole word", () => {
	// The regression this guards: a tail match would let the `w` rule beat Telex everywhere.
	const cases = [
		["chuw", "chư"],
		["aw", "ă"],
		["nguow", "nguơ"],
		["duongw", "dương"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" still goes through the engine and gives "${expected}"`, () => {
			assert.equal(type(sequence, on()), expected);
		});
	}
});

describe("A shortcut also lands right after a bare consonant onset", () => {
	// "chw" and "chuw" are the same word typed two ways, and both have to reach "chư".
	const cases = [
		["chw", "chư"],
		["chuw", "chư"],
		["ngw", "ngư"],
		["thw", "thư"],
		["khw", "khư"],
		["xin chw", "xin chư"],
		["Chw", "Chư"],
		["CHW", "CHƯ"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, on()), expected);
		});
	}

	it("reaches a contenteditable too", () => {
		assert.equal(typeContentEditable("chw", on()), "chư");
	});

	// The onset pass runs only where the engine passed, so its own qu rule still wins
	const engineKeeps = [
		["quow", "quơ"],
		["quw", "qư"],
		["nguow", "nguơ"],
		["aw", "ă"],
	];

	for (const [sequence, expected] of engineKeeps) {
		it(`leaves "${sequence}" to the engine, which gives "${expected}"`, () => {
			assert.equal(type(sequence, on()), expected);
		});
	}

	it("does not fire once the word already has a vowel", () => {
		assert.equal(type("abvn", on([{ key: "vn", value: "Việt Nam" }])), "abvn");
	});

	// A vowel counts even when it arrived as one precomposed character, which is what NFD is for
	const precomposed = [
		["ưvn", "ưvn"],
		["ấvn", "ấvn"],
	];

	for (const [sequence, expected] of precomposed) {
		it(`treats the ${sequence.charAt(0)} in "${sequence}" as a vowel`, () => {
			assert.equal(type(sequence, on([{ key: "vn", value: "Việt Nam" }])), expected);
		});
	}

	const overlapping = [
		["the longer key wins", [{ key: "w", value: "S" }, { key: "hw", value: "L" }]],
		["whatever order they are stored in", [{ key: "hw", value: "L" }, { key: "w", value: "S" }]],
	];

	for (const [label, shortcuts] of overlapping) {
		it(`picks between two keys that both end the word: ${label}`, () => {
			assert.equal(type("chw", on(shortcuts)), "cL");
		});
	}

	it("does not fire with the feature off", () => {
		assert.equal(type("chw", { shortcutsOn: 0, shortcuts: DEFAULT_SHORTCUTS }), "chw");
	});
});

describe("The capitalised default shortcuts stand on their own", () => {
	const cases = [
		["w", "ư"],
		["W", "Ư"],
		["uow", "ươ"],
		["Uow", "Ươ"],
		["UOW", "ƯƠ"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, on()), expected);
		});
	}

	it("matches case exactly, so an unlisted casing is left alone", () => {
		assert.equal(type("W", on([{ key: "w", value: "ư" }])), "W");
	});
});

describe("Shortcuts stay out of the way until the prefs turn them on", () => {
	it("does not expand with the feature off", () => {
		assert.equal(type("w", { shortcutsOn: 0, shortcuts: DEFAULT_SHORTCUTS }), "w");
	});

	it("does not expand when the prefs carry no shortcuts", () => {
		assert.equal(type("w", { shortcutsOn: 1, shortcuts: [] }), "w");
	});

	it("does not expand while AVIM itself is off", () => {
		assert.equal(type("w", on(DEFAULT_SHORTCUTS, { onOff: 0 })), "w");
	});

	it("ignores an entry with a blank key, which would match every word", () => {
		assert.equal(type("w", on([{ key: "", value: "ư" }])), "w");
	});
});

describe("A shortcut expands to arbitrary text, not only a diacritic", () => {
	const shortcuts = [{ key: "vn", value: "Việt Nam" }];

	it("types a whole phrase", () => {
		assert.equal(type("vn", on(shortcuts)), "Việt Nam");
	});

	it("types a phrase mid-sentence", () => {
		assert.equal(type("xin vn", on(shortcuts)), "xin Việt Nam");
	});

	it("swallows the keys when the replacement is empty", () => {
		assert.equal(type("q", on([{ key: "q", value: "" }])), "");
	});
});

describe("Shortcuts do not depend on the input method", () => {
	const methods = [
		["AUTO", METHOD.AUTO],
		["TELEX", METHOD.TELEX],
		["VNI", METHOD.VNI],
		["VIQR", METHOD.VIQR],
		["VIQR*", METHOD.VIQR_STAR],
	];

	for (const [name, method] of methods) {
		it(`expands under ${name}`, () => {
			assert.equal(type("w", on(DEFAULT_SHORTCUTS, { method })), "ư");
		});
	}
});

describe("Shortcuts reach a contenteditable as well as a field", () => {
	const cases = [
		["w", "ư"],
		["uow", "ươ"],
		["chuw", "chư"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(typeContentEditable(sequence, on()), expected);
		});
	}
});

describe("Shortcuts obey the same field rules as the engine", () => {
	it("leaves a read-only field alone", () => {
		const context = loadEngine(on());
		const element = createInput({ readOnly: true });

		pressKey(context, element, "w");

		assert.equal(element.value, "w");
	});

	it("leaves an excluded field alone", () => {
		const context = loadEngine(on(DEFAULT_SHORTCUTS, { exclude: ["email"] }));
		const element = createInput({ id: "email" });

		pressKey(context, element, "w");

		assert.equal(element.value, "w");
	});

	it("does not expand when the keystroke replaces a selection", () => {
		const context = loadEngine(on());
		const element = createInput({ value: "abc", caret: 0, caretEnd: 3 });

		pressKey(context, element, "w");

		assert.equal(element.value, "w");
	});
});
