import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	METHOD,
	loadEngine,
	createInput,
	pressKey,
	pressKeyUp,
	countPreventDefaultCalls,
	runTimersWithDelay,
	capturedMessages,
	clearCapturedMessages,
	type,
} from "./helpers/avim-harness.js";

const TELEX = { method: METHOD.TELEX };

function typeWithModifier(char, modifiers, config) {
	const context = loadEngine({ method: METHOD.TELEX, ...config });
	const element = createInput({ value: "a", caret: 1 });
	pressKey(context, element, char, modifiers);
	return element.value;
}

describe("Gating: the extension is off", () => {
	it("leaves input untouched when onOff is 0", () => {
		assert.equal(type("as", { method: METHOD.TELEX, onOff: 0 }), "as");
	});

	it("converts again when onOff is 1", () => {
		assert.equal(type("as", { method: METHOD.TELEX, onOff: 1 }), "á");
	});
});

describe("Gating: excluded fields", () => {
	it('skips the default excluded id "email"', () => {
		assert.equal(type("as", { method: METHOD.TELEX, element: { id: "email" } }), "as");
	});

	it('skips a field whose name matches the exclude list', () => {
		assert.equal(type("as", { method: METHOD.TELEX, element: { name: "email" } }), "as");
	});

	it("converts in an email field once the exclude list is emptied", () => {
		assert.equal(type("as", { method: METHOD.TELEX, exclude: [], element: { id: "email" } }), "á");
	});

	it("honours a custom exclude entry by id", () => {
		assert.equal(
			type("as", { method: METHOD.TELEX, exclude: ["notes"], element: { id: "notes" } }),
			"as",
		);
	});

	it("honours a custom exclude entry by name", () => {
		assert.equal(
			type("as", { method: METHOD.TELEX, exclude: ["notes"], element: { name: "notes" } }),
			"as",
		);
	});

	it("leaves unrelated fields alone", () => {
		assert.equal(
			type("as", { method: METHOD.TELEX, exclude: ["notes"], element: { id: "body" } }),
			"á",
		);
	});
});

describe("Gating: read-only fields", () => {
	it("does not convert in a read-only field", () => {
		assert.equal(type("as", { method: METHOD.TELEX, element: { readOnly: true } }), "as");
	});
});

describe("Gating: supported input types", () => {
	for (const inputType of ["textarea", "text", "search", "tel"]) {
		it(`converts in type="${inputType}"`, () => {
			assert.equal(type("as", { method: METHOD.TELEX, element: { type: inputType } }), "á");
		});
	}

	for (const inputType of ["password", "email", "number", "url", "checkbox"]) {
		it(`does not convert in type="${inputType}"`, () => {
			assert.equal(type("as", { method: METHOD.TELEX, element: { type: inputType } }), "as");
		});
	}
});

describe("Gating: shadow DOM retargeting", () => {
	// A capture listener on document sees e.target retargeted to the shadow host; the real input
	// is only reachable through composedPath()[0]
	function pressRetargetedKey(context, element, char) {
		const shadowHost = { type: undefined, isContentEditable: false };
		context.document.activeElement = element;
		let prevented = false;
		context.keyPressHandler({
			target: shadowHost,
			composedPath: () => [element, shadowHost],
			which: char.charCodeAt(0),
			ctrlKey: false,
			altKey: false,
			preventDefault() {
				prevented = true;
			},
		});
		return prevented;
	}

	it("converts in an input reached through composedPath", () => {
		const context = loadEngine(TELEX);
		const element = createInput({ value: "a", caret: 1 });
		const prevented = pressRetargetedKey(context, element, "s");
		assert.equal(element.value, "á");
		assert.equal(prevented, true);
	});

	it("still honours the exclude list on the real target, not the host", () => {
		const context = loadEngine(TELEX);
		const element = createInput({ value: "a", caret: 1, id: "email" });
		const prevented = pressRetargetedKey(context, element, "s");
		assert.equal(element.value, "a");
		assert.equal(prevented, false);
	});
});

describe("Gating: modifier keys", () => {
	it("ignores the keypress while Ctrl is held", () => {
		assert.equal(typeWithModifier("s", { ctrl: true }), "as");
	});

	it("ignores the keypress while Alt is held", () => {
		assert.equal(typeWithModifier("s", { alt: true }), "as");
	});

	it("still converts Alt+~ because tilde is explicitly allowed", () => {
		assert.equal(typeWithModifier("~", { alt: true }, { method: METHOD.VIQR }), "ã");
	});
});

describe("Cancelling the keypress", () => {
	it("cancels a transforming keypress exactly once", () => {
		const context = loadEngine(TELEX);
		const element = createInput({ value: "a", caret: 1 });
		assert.equal(countPreventDefaultCalls(context, element, "s"), 1);
	});

	it("does not cancel a keypress that changes nothing", () => {
		const context = loadEngine(TELEX);
		const element = createInput({ value: "x", caret: 1 });
		assert.equal(countPreventDefaultCalls(context, element, "q"), 0);
	});
});

describe("Gating: character codes the engine skips", () => {
	const cases = [
		["a!", "a!"],
		["a,", "a,"],
		["a ", "a "],
		["a1", "a1"],
	];

	for (const [sequence, expected] of cases) {
		it(`"${sequence}" is left as typed`, () => {
			assert.equal(type(sequence, TELEX), expected);
		});
	}
});

describe("Preferences messaging", () => {
	it("asks the background page for preferences on load", () => {
		const context = loadEngine(TELEX);
		assert.deepEqual(capturedMessages(context)[0], { get_prefs: "all" });
	});

	it("toggles AVIM when Ctrl is released twice in a row", () => {
		const context = loadEngine(TELEX);
		clearCapturedMessages(context);
		pressKeyUp(context, 17);
		pressKeyUp(context, 17);
		assert.deepEqual(capturedMessages(context), [{ turn_avim: "onOff" }]);
	});

	it("does not toggle when the two Ctrl releases are more than 300ms apart", () => {
		const context = loadEngine(TELEX);
		clearCapturedMessages(context);
		pressKeyUp(context, 17);
		runTimersWithDelay(context, 300);
		pressKeyUp(context, 17);
		assert.deepEqual(capturedMessages(context), []);
	});

	it("does not toggle when another key is released in between", () => {
		const context = loadEngine(TELEX);
		clearCapturedMessages(context);
		pressKeyUp(context, 17);
		pressKeyUp(context, 65);
		pressKeyUp(context, 17);
		assert.deepEqual(capturedMessages(context), []);
	});

	it("does not toggle on a single Ctrl release", () => {
		const context = loadEngine(TELEX);
		clearCapturedMessages(context);
		pressKeyUp(context, 17);
		assert.deepEqual(capturedMessages(context), []);
	});

	it("toggles twice for four consecutive Ctrl releases", () => {
		const context = loadEngine(TELEX);
		clearCapturedMessages(context);
		pressKeyUp(context, 17);
		pressKeyUp(context, 17);
		pressKeyUp(context, 17);
		pressKeyUp(context, 17);
		assert.deepEqual(capturedMessages(context), [{ turn_avim: "onOff" }, { turn_avim: "onOff" }]);
	});
});
