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

/** Stands in for chrome/gdocs-bridge.js, which the engine only ever reaches through the node. */
function installBridge(context, text, caret) {
	const node = { id: NODE_ID, textContent: "", dataset: {} };
	const state = { text, caret, ready: true, writes: [] };

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
		}
		if (event.type === "avim:gdocs:write") {
			state.writes.push(JSON.parse(node.dataset.avimWrite));
		}
		return true;
	};
	return state;
}

/** The \u0003 Docs puts in front of the document, so every offset here is one past it. */
const MARKER = "\u0003";

/**
 * Types a sequence the way Docs does it: the key lands in the document first, then the scheduled
 * rewrite reconciles against it.
 */
function typeInDocs(sequence, config = {}) {
	const context = loadEngine({ method: METHOD.TELEX, ...config });
	const state = installBridge(context, MARKER, MARKER.length);

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

/**
 * Docs owns the keystroke, so the adapter reconciles after the fact instead of preventing it. The
 * outcome still has to be the one the engine produces in a plain field, escape sequences included.
 */
describe("Google Docs types the same as a textarea", () => {
	const sequences = [
		"chaof",
		"tieengs",
		"vieejt",
		"nguowif",
		"aa",
		"aaa",
		"ddd",
		"ass",
		"hello",
		"xin chaof",
	];

	for (const sequence of sequences) {
		it(`"${sequence}"`, () => {
			assert.equal(typeInDocs(sequence), MARKER + type(sequence, { method: METHOD.TELEX }));
		});
	}

	it("VNI too", () => {
		assert.equal(
			typeInDocs("cha2o", { method: METHOD.VNI }),
			MARKER + type("cha2o", { method: METHOD.VNI }),
		);
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
		context.document.dispatchEvent = (event) => {
			if (event.type === "avim:gdocs:read") {
				const node = context.document.getElementById(NODE_ID);
				node.dataset.avimOk = "1";
				node.textContent = `${MARKER}chaof`;
				node.dataset.avimBase = "0";
				node.dataset.avimStart = "2";
				node.dataset.avimEnd = "6";
			}
			return true;
		};
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
		const context = loadEngine({ method: METHOD.TELEX, onOff: 0 });
		const state = installBridge(context, `${MARKER}chao`, 5);
		context.gdocsKeyPress({ which: "f".charCodeAt(0) });
		runTimersWithDelay(context, 0);
		assert.deepEqual(state.writes, []);
	});
});
