import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	METHOD,
	loadEngine,
	runTimersWithDelay,
	type,
} from "./helpers/avim-harness.js";

const NODE_ID = "avim-gdocs-bridge";
const TAIL = 64;

function installBridge(context, text, caret) {
	const node = { id: NODE_ID, textContent: "", dataset: {} };
	// publishAs keeps the write path: a fixture that drops writes passes "does nothing" tests vacuously.
	const state = { text, caret, ready: true, publishAs: {}, writes: [] };

	context.CustomEvent = class {
		constructor(kind) {
			this.type = kind;
		}
	};
	context.document.getElementById = (id) => (id === NODE_ID ? node : null);
	context.document.dispatchEvent = (event) => {
		if (event.type === "avim:gdocs:read") {
			node.dataset.avimOk = state.ready ? "1" : "0";
			const base = Math.max(0, state.caret - TAIL);
			node.textContent = state.text.slice(base, state.caret);
			node.dataset.avimBase = String(base);
			node.dataset.avimStart = String(state.caret);
			node.dataset.avimEnd = String(state.caret);
			Object.assign(node.dataset, state.publishAs);
		}
		if (event.type === "avim:gdocs:write") {
			state.writes.push(JSON.parse(node.dataset.avimWrite));
		}
		return true;
	};
	return state;
}

/** Docs puts this in front of the document, so every offset here is one past it. */
const MARKER = "\u0003";

function typeInDocs(sequence, config = {}, initial = { text: MARKER, caret: MARKER.length }) {
	const context = loadEngine({ method: METHOD.TELEX, ...config });
	const state = installBridge(context, initial.text, initial.caret);

	for (const char of sequence) {
		context.gdocsKeyPress({ which: char.charCodeAt(0) });
		state.text = state.text.slice(0, state.caret) + char + state.text.slice(state.caret);
		state.caret += 1;
		runTimersWithDelay(context, 0);
		for (const edit of state.writes.splice(0)) {
			state.text = state.text.slice(0, edit.from) + edit.text + state.text.slice(edit.to);
			state.caret = edit.from + edit.text.length;
		}
	}
	return state.text;
}

describe("Google Docs types the same as a textarea", () => {
	const transforms = [
		[METHOD.TELEX, ["chaof", "tieengs", "vieejt", "nguowif", "aa", "aaa", "ddd", "ass", "xin chaof", "thuown", "thuowngf"]],
		[METHOD.VNI, ["toi6", "viet65", "nguoi72", "duong792", "a10"]],
		[METHOD.VIQR, ["hoa`", "gia?", "thuye^t'"]],
		[METHOD.VIQR_STAR, ["to^i", "vie^.t", "ngu*o*i`"]],
	];

	for (const [method, sequences] of transforms) {
		for (const sequence of sequences) {
			it(`method ${method}: "${sequence}"`, () => {
				const expected = type(sequence, { method });
				// A sequence the engine leaves alone would pass the next line vacuously
				assert.notEqual(expected, sequence, `"${sequence}" is not transformed at all`);
				assert.equal(typeInDocs(sequence, { method }), MARKER + expected);
			});
		}
	}

	for (const sequence of ["hello", "abc"]) {
		it(`leaves "${sequence}" alone, as a textarea does`, () => {
			assert.equal(type(sequence, { method: METHOD.TELEX }), sequence);
			assert.equal(typeInDocs(sequence), MARKER + sequence);
		});
	}

	// The bridge publishes only 64 characters, so the offsets it hands back must be absolute.
	it("converts a word further into the document than the published tail", () => {
		const head = `${MARKER}${"x".repeat(70)} `;
		const rest = " sau";
		assert.equal(
			typeInDocs("chaof", {}, { text: head + rest, caret: head.length }),
			`${head}chào${rest}`,
		);
	});
});

const VN = [{ key: "vn", value: "Việt Nam" }];

function withShortcuts(shortcuts = VN, extra = {}) {
	return { shortcutsOn: 1, shortcuts, ...extra };
}

describe("Shortcuts expand in Google Docs too", () => {
	// space and "." reach the engine first; "," and ")" are gated off it but still end a word
	for (const sequence of ["vn ", "vn.", "vn,", "vn)", "xin vn "]) {
		it(`"${sequence}" expands as it does in a textarea`, () => {
			const expected = type(sequence, withShortcuts());
			assert.notEqual(expected, sequence, `"${sequence}" is not expanded at all`);
			assert.equal(typeInDocs(sequence, withShortcuts()), MARKER + expected);
		});
	}

	for (const sequence of ["vn", "avn ", "vnx "]) {
		it(`leaves "${sequence}" alone, as a textarea does`, () => {
			assert.equal(type(sequence, withShortcuts()), sequence);
			assert.equal(typeInDocs(sequence, withShortcuts()), MARKER + sequence);
		});
	}

	it("stays put when the shortcuts pref is off", () => {
		assert.equal(typeInDocs("vn ", { shortcuts: VN }), `${MARKER}vn `);
	});

	// VIQR spends punctuation on tone marks, so the engine must get those keys before a shortcut does
	it("lets VIQR keep a tone key a shortcut would otherwise have eaten", () => {
		const config = withShortcuts([{ key: "a", value: "SHORTCUT" }], { method: METHOD.VIQR });
		assert.equal(typeInDocs("a'", config), `${MARKER}á`);
		assert.equal(typeInDocs("a,", config), `${MARKER}SHORTCUT,`);
	});
});

describe("The Docs marker ends a word", () => {
	it("counts as a separator, so the engine never reads into it", () => {
		assert.equal(loadEngine({ method: METHOD.TELEX }).notWord(MARKER), true);
	});
});

describe("Google Docs rewrites are guarded", () => {
	const readyContext = () => {
		const context = loadEngine({ method: METHOD.TELEX });
		return { context, state: installBridge(context, `${MARKER}chaof`, 6) };
	};

	it("asks the bridge for the text and offers back one replacement", () => {
		const { context, state } = readyContext();
		context.gdocsRewrite("f", "f".charCodeAt(0));
		assert.deepEqual(state.writes, [{ from: 3, to: 6, text: "ào" }]);
	});

	it("does nothing until the bridge has an annotated object", () => {
		const { context, state } = readyContext();
		state.ready = false;
		context.gdocsRewrite("f", "f".charCodeAt(0));
		assert.deepEqual(state.writes, []);
	});

	it("does nothing when Docs has not applied the key yet", () => {
		const { context, state } = readyContext();
		state.text = `${MARKER}chao`;
		state.caret = 5;
		context.gdocsRewrite("f", "f".charCodeAt(0));
		assert.deepEqual(state.writes, []);
	});

	it("does nothing when the key changes nothing", () => {
		const { context, state } = readyContext();
		state.text = `${MARKER}chao`;
		state.caret = 5;
		context.gdocsRewrite("o", "o".charCodeAt(0));
		assert.deepEqual(state.writes, []);
	});

	it("does nothing when the caret replaces a selection", () => {
		const { context, state } = readyContext();
		state.publishAs = { avimStart: "2", avimEnd: "6" };
		context.gdocsRewrite("f", "f".charCodeAt(0));
		assert.deepEqual(state.writes, []);
	});

	it("does nothing when the published tail and offsets disagree", () => {
		const { context, state } = readyContext();
		state.publishAs = { avimStart: "7", avimEnd: "7" };
		context.gdocsRewrite("f", "f".charCodeAt(0));
		assert.deepEqual(state.writes, []);
	});

	it("leaves a control keystroke alone", () => {
		const { context, state } = readyContext();
		context.gdocsKeyPress({ which: "f".charCodeAt(0), ctrlKey: true });
		runTimersWithDelay(context, 0);
		assert.deepEqual(state.writes, []);
	});

	it("stays out of the way while AVIM is off", () => {
		assert.equal(typeInDocs("chaof", { onOff: 0 }), `${MARKER}chaof`);
		assert.equal(typeInDocs("vn ", withShortcuts(VN, { onOff: 0 })), `${MARKER}vn `);
	});
});
