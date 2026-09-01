"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { METHOD, loadEngine, createInput, pressKey } = require("./helpers/avim-harness.js");

function pressOnce(elementOptions, char) {
	const context = loadEngine({ method: METHOD.TELEX });
	const element = createInput(elementOptions);
	element.scrollTop = 42;
	const prevented = pressKey(context, element, char);
	return {
		value: element.value,
		caret: element.selectionStart,
		caretEnd: element.selectionEnd,
		scrollTop: element.scrollTop,
		prevented: prevented,
	};
}

describe("Caret position after a transform", () => {
	it("accents the word before a mid-field caret and leaves the caret put", () => {
		const result = pressOnce({ value: "abc", caret: 1 }, "s");
		assert.equal(result.value, "ábc");
		assert.equal(result.caret, 1);
		assert.equal(result.caretEnd, 1);
	});

	it("accents only the word the caret sits in", () => {
		const result = pressOnce({ value: "chaoX", caret: 4 }, "f");
		assert.equal(result.value, "chàoX");
		assert.equal(result.caret, 4);
	});

	it("accents the last word of a sentence", () => {
		const result = pressOnce({ value: "xin chao", caret: 8 }, "f");
		assert.equal(result.value, "xin chào");
		assert.equal(result.caret, 8);
	});

	it("cancels the keypress when it changed the text", () => {
		assert.equal(pressOnce({ value: "chao", caret: 4 }, "f").prevented, true);
	});

	it("preserves scrollTop", () => {
		assert.equal(pressOnce({ value: "chao", caret: 4 }, "f").scrollTop, 42);
	});
});

describe("Nothing to transform", () => {
	it("inserts the key at the start of the field", () => {
		const result = pressOnce({ value: "abc", caret: 0 }, "s");
		assert.equal(result.value, "sabc");
		assert.equal(result.prevented, false);
	});

	it("inserts the key into an empty field", () => {
		const result = pressOnce({ value: "", caret: 0 }, "s");
		assert.equal(result.value, "s");
		assert.equal(result.prevented, false);
	});
});

describe("Active selection", () => {
	it("replaces a full selection instead of accenting it", () => {
		const result = pressOnce({ value: "abc", caret: 0, caretEnd: 3 }, "s");
		assert.equal(result.value, "s");
		assert.equal(result.prevented, false);
	});

	it("replaces a partial selection instead of accenting it", () => {
		const result = pressOnce({ value: "abc", caret: 1, caretEnd: 2 }, "s");
		assert.equal(result.value, "asc");
		assert.equal(result.prevented, false);
	});
});

describe("Typing a whole word one key at a time keeps the caret at the end", () => {
	it("ends with the caret after the last character", () => {
		const context = loadEngine({ method: METHOD.TELEX });
		const element = createInput({ value: "", caret: 0 });
		for (const char of "nguoiwf") {
			pressKey(context, element, char);
		}
		assert.equal(element.value, "người");
		assert.equal(element.selectionStart, element.value.length);
	});
});
