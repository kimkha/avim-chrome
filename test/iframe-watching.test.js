import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { METHOD, loadEngine } from "./helpers/avim-harness.js";

const TELEX = { method: METHOD.TELEX };

function createFakeFrame(designMode) {
	const doc = {
		designMode,
		keypressListeners: [],
		addEventListener(type, listener) {
			this.keypressListeners.push({ type, listener });
		},
	};
	return {
		id: "",
		name: "",
		tagName: "IFRAME",
		loadListeners: [],
		addEventListener(type, listener) {
			this.loadListeners.push({ type, listener });
		},
		contentWindow: { document: doc },
		document: doc,
	};
}

function fireObserver(context, addedNodes) {
	const observer = context.__observers.at(-1);
	observer.callback([{ addedNodes }], observer);
}

describe("Watching for iframes replaces the old polling", () => {
	it("schedules no 100ms rescan timers at load", () => {
		const context = loadEngine(TELEX);
		assert.deepEqual(context.__timers.filter((timer) => timer.delay === 100), []);
	});

	it("observes the whole document for added children", () => {
		const context = loadEngine(TELEX);
		const observer = context.__observers.at(-1);
		assert.equal(observer.target, context.document.documentElement);
		// the options object comes from the vm realm, so compare fields, not prototypes
		assert.deepEqual({ ...observer.options }, { childList: true, subtree: true });
	});

	it("attaches to a designMode iframe added after load", () => {
		const context = loadEngine(TELEX);
		const frame = createFakeFrame("on");
		context.document.getElementsByTagName = () => [frame];

		fireObserver(context, [frame]);

		const types = frame.document.keypressListeners.map((entry) => entry.type);
		assert.deepEqual(types, ["keypress"]);
		assert.equal(frame.document.wi, frame.contentWindow);
	});

	it("finds an iframe nested inside the added node", () => {
		const context = loadEngine(TELEX);
		const frame = createFakeFrame("on");
		context.document.getElementsByTagName = () => [frame];
		const wrapper = { tagName: "DIV", querySelector: (selector) => (selector === "iframe" ? frame : null) };

		fireObserver(context, [wrapper]);

		assert.equal(frame.document.keypressListeners.length, 1);
	});

	it("ignores added nodes that bring no iframe", () => {
		const context = loadEngine(TELEX);
		let scans = 0;
		context.document.getElementsByTagName = () => {
			scans++;
			return [];
		};

		fireObserver(context, [{ tagName: "DIV", querySelector: () => null }]);
		fireObserver(context, [{}]);

		assert.equal(scans, 0);
	});

	it("retries on the frame's load event, for a document that was not ready", () => {
		const context = loadEngine(TELEX);
		const frame = createFakeFrame("off");
		context.document.getElementsByTagName = () => [frame];

		fireObserver(context, [frame]);
		assert.equal(frame.document.keypressListeners.length, 0, "not designMode yet, nothing to attach");

		frame.document.designMode = "on";
		const load = frame.loadListeners.find((entry) => entry.type === "load");
		load.listener();

		assert.equal(frame.document.keypressListeners.length, 1);
	});

	it("disconnects the old observer when prefs are pushed again", () => {
		const context = loadEngine(TELEX);
		const first = context.__observers.at(-1);

		context.configAVIM({ method: METHOD.TELEX, onOff: 1, ckSpell: 0, oldAccent: 1 });

		assert.equal(first.disconnected, true);
		const second = context.__observers.at(-1);
		assert.notEqual(second, first);
		assert.equal(second.disconnected, false);
	});
});
