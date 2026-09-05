import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	METHOD,
	typeContentEditable,
	typeContentEditableDetailed,
} from "./helpers/avim-harness.js";

function typeEditable(sequence, config) {
	return typeContentEditable(sequence, { method: METHOD.TELEX, ...config });
}

describe("contenteditable: telex", () => {
	const cases = [
		["as", "á"],
		["aa", "â"],
		["aw", "ă"],
		["ow", "ơ"],
		["uw", "ư"],
		["dd", "đ"],
		["tooi", "tôi"],
		["vieejt", "việt"],
		["nguoiwf", "người"],
		["chaof", "chào"],
		["dduowngf", "đường"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(typeEditable(sequence), expected);
		});
	}
});

describe("contenteditable: sentences", () => {
	const cases = [
		["xin chaof", "xin chào"],
		["Tieengs Vieejt", "Tiếng Việt"],
		["xin chaof cacs banj", "xin chào các bạn"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(typeEditable(sequence), expected);
		});
	}
});

describe("contenteditable: other input methods", () => {
	const cases = [
		["a1", "á", METHOD.VNI],
		["toi6", "tôi", METHOD.VNI],
		["viet65", "việt", METHOD.VNI],
		["duong792", "đường", METHOD.VNI],
		["to^i", "tôi", METHOD.VIQR],
		["ngu+o+i`", "người", METHOD.VIQR],
		["ngu*o*i`", "người", METHOD.VIQR_STAR],
	];

	for (const [sequence, expected, method] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(typeEditable(sequence, { method }), expected);
		});
	}
});

describe("contenteditable: existing content", () => {
	it("accents the word before the caret", () => {
		assert.equal(typeEditable("f", { element: { value: "chao", caret: 4 } }), "chào");
	});

	it("leaves text after the caret alone", () => {
		assert.equal(typeEditable("f", { element: { value: "chaoX", caret: 4 } }), "chàoX");
	});

	it("does not transform when the caret is at the very start", () => {
		assert.equal(typeEditable("s", { element: { value: "a", caret: 0 } }), "sa");
	});
});

describe("contenteditable: caret is restored before the trailing text", () => {
	const cases = [
		["f", { value: "chaoZ", caret: 4 }, "chàoZ", 4],
		["fx", { value: "chaoZ", caret: 4 }, "chãoZ", 4],
		["ofx", { value: "chaZ", caret: 3 }, "chãoZ", 4],
		["aof", { value: "chZ", caret: 2 }, "chàoZ", 4],
	];

	for (const [sequence, element, expectedText, expectedCaret] of cases) {
		it(`typing "${sequence}" into "${element.value}" gives "${expectedText}"`, () => {
			const result = typeContentEditableDetailed(sequence, {
				method: METHOD.TELEX,
				element,
			});
			assert.equal(result.text, expectedText);
			assert.equal(result.caret, expectedCaret);
		});
	}
});

describe("contenteditable: repeating a key escapes the transform", () => {
	// These rewrite the word without cancelling the keystroke, so the browser adds the key on top.
	// The textarea path has covered them since the start; this side had nothing.
	const cases = [
		["aaa", "aa"],
		["ddd", "dd"],
		["ass", "as"],
		["oooo", "ooo"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" produces "${expected}"`, () => {
			assert.equal(typeEditable(sequence), expected);
		});
	}
});

describe("contenteditable: preferences are respected", () => {
	it("types nothing special when AVIM is off", () => {
		assert.equal(typeEditable("as", { onOff: 0 }), "as");
	});

	it("keeps spell check behaviour", () => {
		assert.equal(typeEditable("fas", { checkSpell: 1 }), "fas");
		assert.equal(typeEditable("fas", { checkSpell: 0 }), "fá");
	});
});
