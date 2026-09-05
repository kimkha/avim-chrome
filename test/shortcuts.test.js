import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	METHOD,
	countPreventDefaultCalls,
	createInput,
	loadEngine,
	pressKey,
	type,
	typeContentEditable,
	typeContentEditableDetailed,
} from "./helpers/avim-harness.js";

const VN = [{ key: "vn", value: "Việt Nam" }];

function on(shortcuts = VN, extra = {}) {
	return { shortcutsOn: 1, shortcuts, ...extra };
}

describe("A word-boundary key expands the word in front of it", () => {
	const cases = [
		["vn ", "Việt Nam "],
		["vn,", "Việt Nam,"],
		["vn.", "Việt Nam."],
		["vn!", "Việt Nam!"],
		["vn;", "Việt Nam;"],
		["vn)", "Việt Nam)"],
		["vn-", "Việt Nam-"],
		["xin vn ", "xin Việt Nam "],
		["(vn)", "(Việt Nam)"],
		["vn vn ", "Việt Nam Việt Nam "],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, on()), expected);
		});
	}

	const inert = [
		["vn", "vn"],
		["v", "v"],
		["vnx ", "vnx "],
		["avn ", "avn "],
	];

	for (const [sequence, expected] of inert) {
		it(`leaves "${sequence}" alone`, () => {
			assert.equal(type(sequence, on()), expected);
		});
	}

	it("leaves the caret after the boundary key", () => {
		const context = loadEngine(on());
		const element = createInput({ value: "vn", caret: 2 });

		pressKey(context, element, " ");

		assert.equal(element.value, "Việt Nam ");
		assert.equal(element.selectionStart, 9);
	});

	it("keeps the text that follows the caret", () => {
		const context = loadEngine(on());
		const element = createInput({ value: "vnX", caret: 2 });

		pressKey(context, element, " ");

		assert.equal(element.value, "Việt Nam X");
		assert.equal(element.selectionStart, 9);
	});
});

describe("Enter and Tab end a word too", () => {
	const cases = [
		["Enter", "\r", "Việt Nam\r"],
		["Tab", "\t", "Việt Nam\t"],
		["a newline", "\n", "Việt Nam\n"],
	];

	for (const [name, key, expected] of cases) {
		it(`expands on ${name}`, () => {
			const context = loadEngine(on());
			const element = createInput({ value: "vn", caret: 2 });

			pressKey(context, element, key);

			assert.equal(element.value, expected);
		});
	}
});

describe("The boundary key is typed by the shortcut, not the browser", () => {
	// Two events race on a model-backed editor: left to the browser, "vn x" came out "Việt Namx "
	it("cancels the keypress and types the boundary itself", () => {
		const context = loadEngine(on());
		const element = createInput({ value: "vn", caret: 2 });

		assert.equal(countPreventDefaultCalls(context, element, " "), 1);
		assert.equal(element.value, "Việt Nam ");
	});

	it("leaves Enter to the browser, which does more than insert a character", () => {
		const context = loadEngine(on());
		const element = createInput({ value: "vn", caret: 2 });

		assert.equal(countPreventDefaultCalls(context, element, "\r"), 0);
		assert.equal(element.value, "Việt Nam");
	});

	it("does not cancel a keypress that completes nothing", () => {
		const context = loadEngine(on());
		const element = createInput({ value: "xx", caret: 2 });

		assert.equal(countPreventDefaultCalls(context, element, " "), 0);
		assert.equal(element.value, "xx");
	});
});

describe("The engine keeps every key it has a use for", () => {
	// VIQR spends punctuation on tone marks, so those keys must reach the engine, not a shortcut
	const viqr = [
		["a'", "á"],
		["a`", "à"],
		["a?", "ả"],
		["a~", "ã"],
		["a.", "ạ"],
		["a^", "â"],
	];

	for (const [sequence, expected] of viqr) {
		it(`VIQR "${sequence}" still produces "${expected}"`, () => {
			const shortcuts = [{ key: "a", value: "SHORTCUT" }];
			assert.equal(type(sequence, on(shortcuts, { method: METHOD.VIQR })), expected);
		});
	}

	it("VIQR \"o+\" still produces \"ơ\"", () => {
		const shortcuts = [{ key: "o", value: "SHORTCUT" }];
		assert.equal(type("o+", on(shortcuts, { method: METHOD.VIQR })), "ơ");
	});

	it("expands under VIQR on a key the engine has no use for", () => {
		const shortcuts = [{ key: "a", value: "SHORTCUT" }];
		assert.equal(type("a,", on(shortcuts, { method: METHOD.VIQR })), "SHORTCUT,");
	});

	it("matches the word the engine produced, not the keys that were typed", () => {
		assert.equal(type("as ", on([{ key: "as", value: "X" }], { method: METHOD.TELEX })), "á ");
	});

	it("matches a word the engine did produce", () => {
		assert.equal(type("as ", on([{ key: "á", value: "X" }], { method: METHOD.TELEX })), "X ");
	});
});

describe("Telex keeps working around the shortcuts", () => {
	const shortcuts = [{ key: "w", value: "ư" }, { key: "uow", value: "ươ" }];
	const cases = [
		["w ", "ư "],
		["chw ", "chw "],
		["chuw ", "chư "],
		["aw ", "ă "],
		["uow ", "ươ "],
		["quow ", "quơ "],
		["duongw ", "dương "],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(type(sequence, on(shortcuts)), expected);
		});
	}
});

describe("Matching is case-sensitive", () => {
	it("expands the listed casing", () => {
		assert.equal(type("vn ", on([{ key: "vn", value: "ư" }])), "ư ");
	});

	it("leaves an unlisted casing alone", () => {
		assert.equal(type("VN ", on([{ key: "vn", value: "ư" }])), "VN ");
	});

	it("tells two casings of the same key apart", () => {
		const shortcuts = [{ key: "vn", value: "một" }, { key: "VN", value: "HAI" }];
		assert.equal(type("VN ", on(shortcuts)), "HAI ");
	});
});

describe("Shortcuts stay out of the way until the prefs turn them on", () => {
	it("does not expand with the feature off", () => {
		assert.equal(type("vn ", { shortcutsOn: 0, shortcuts: VN }), "vn ");
	});

	it("does not expand when the prefs carry no shortcuts", () => {
		assert.equal(type("vn ", { shortcutsOn: 1, shortcuts: [] }), "vn ");
	});

	it("does not expand while AVIM itself is off", () => {
		assert.equal(type("vn ", on(VN, { onOff: 0 })), "vn ");
	});

	it("ignores an entry with a blank key", () => {
		assert.equal(type("vn ", on([{ key: "", value: "ư" }])), "vn ");
	});

	it("ships nothing by default, so a word is left as typed", () => {
		assert.equal(type("vn ", { shortcutsOn: 1 }), "vn ");
	});
});

describe("A shortcut expands to arbitrary text", () => {
	it("types a whole phrase", () => {
		assert.equal(type("vn ", on()), "Việt Nam ");
	});

	it("swallows the word when the replacement is empty", () => {
		assert.equal(type("q ", on([{ key: "q", value: "" }])), " ");
	});

	it("expands a key that is itself punctuation-free but long", () => {
		assert.equal(type("dctm ", on([{ key: "dctm", value: "địa chỉ trung tâm" }])), "địa chỉ trung tâm ");
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
			assert.equal(type("vn ", on(VN, { method })), "Việt Nam ");
		});
	}
});

describe("Shortcuts reach a contenteditable as well as a field", () => {
	const cases = [
		["vn ", "Việt Nam "],
		["vn,", "Việt Nam,"],
		["xin vn ", "xin Việt Nam "],
		["vn", "vn"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(typeContentEditable(sequence, on()), expected);
		});
	}

	it("leaves the caret after the boundary key", () => {
		assert.deepEqual(typeContentEditableDetailed("vn ", on()), { text: "Việt Nam ", caret: 9 });
	});
});

describe("Shortcuts obey the same field rules as the engine", () => {
	it("leaves a read-only field alone", () => {
		const context = loadEngine(on());
		const element = createInput({ value: "vn", caret: 2, readOnly: true });

		pressKey(context, element, " ");

		assert.equal(element.value, "vn ");
	});

	it("leaves an excluded field alone", () => {
		const context = loadEngine(on(VN, { exclude: ["email"] }));
		const element = createInput({ value: "vn", caret: 2, id: "email" });

		pressKey(context, element, " ");

		assert.equal(element.value, "vn ");
	});

	it("does not expand when the keystroke replaces a selection", () => {
		const context = loadEngine(on());
		const element = createInput({ value: "vn", caret: 0, caretEnd: 2 });

		pressKey(context, element, " ");

		assert.equal(element.value, " ");
	});
});
