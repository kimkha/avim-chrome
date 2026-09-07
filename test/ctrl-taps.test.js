import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	METHOD,
	loadEngine,
	pressKeyUp,
	pressKeyDown,
	capturedMessages,
	clearCapturedMessages,
	replyTo,
	runTimersWithDelay,
} from "./helpers/avim-harness.js";

const CTRL = 17;

const PAGE = "https://example.test/page";

const rows = (...entries) => entries.map(([pattern, mode]) => ({ pattern, mode }));

const prefs = (overrides) => ({
	method: METHOD.TELEX,
	onOff: 1,
	ckSpell: 1,
	oldAccent: 1,
	shortcutsOn: 0,
	shortcuts: [],
	patterns: [],
	...overrides,
});

function tap(context, times) {
	for (let i = 0; i < times; i++) {
		pressKeyUp(context, CTRL);
	}
}

/** Stands in for the background: the flip is stored, then answered, then pushed back. */
function answerTheFlip(context, { onOff, patterns = [] }) {
	replyTo(context, "turn_avim", prefs({ onOff: onOff === 1 ? 0 : 1, patterns }));
}

const writes = (context) => capturedMessages(context).filter((message) => message.save_prefs);

const lastWrite = (context) => writes(context).at(-1);

describe("Tapping Ctrl twice still toggles AVIM everywhere", () => {
	it("asks the background to flip the panel switch", () => {
		const context = loadEngine({ url: PAGE });
		clearCapturedMessages(context);

		tap(context, 2);

		assert.deepEqual(capturedMessages(context), [{ turn_avim: "onOff" }]);
	});

	it("leaves this site's row alone", () => {
		const context = loadEngine({ url: PAGE });
		clearCapturedMessages(context);

		tap(context, 2);
		answerTheFlip(context, { onOff: 1 });

		assert.deepEqual(writes(context), []);
	});
});

describe("A third Ctrl tap moves only this site", () => {
	it("writes a row for the site and puts the panel switch back", () => {
		const context = loadEngine({ url: PAGE });
		clearCapturedMessages(context);

		tap(context, 3);
		answerTheFlip(context, { onOff: 1 });

		assert.deepEqual(lastWrite(context), {
			save_prefs: "all",
			onOff: 1,
			patterns: rows(["*://example.test/*", "off"]),
		});
	});

	it("turns the site off, then hands it back on the next triple tap", () => {
		const first = loadEngine({ url: PAGE, onOff: 1 });
		clearCapturedMessages(first);
		tap(first, 3);
		answerTheFlip(first, { onOff: 1 });
		const afterFirst = lastWrite(first).patterns;

		const second = loadEngine({ url: PAGE, onOff: 1, patterns: afterFirst });
		clearCapturedMessages(second);
		tap(second, 3);
		answerTheFlip(second, { onOff: 1, patterns: afterFirst });

		assert.deepEqual(afterFirst, rows(["*://example.test/*", "off"]));
		assert.deepEqual(lastWrite(second).patterns, rows(["*://example.test/*", "default"]));
	});
});

describe("The row records the opposite of what the site is doing right now", () => {
	const PANEL = { 1: "on", 0: "off" };
	const CASES = [
		{ panel: 1, row: "default", written: "off" },
		{ panel: 1, row: "on", written: "off" },
		{ panel: 1, row: "off", written: "default" },
		{ panel: 0, row: "default", written: "on" },
		{ panel: 0, row: "on", written: "default" },
		{ panel: 0, row: "off", written: "on" },
	];

	for (const { panel, row, written } of CASES) {
		const site = row === "default" ? "no row of its own" : `a "${row}" row`;
		it(`writes "${written}" when the panel is ${PANEL[panel]} and the site has ${site}`, () => {
			const patterns = row === "default" ? [] : rows(["*://example.test/*", row]);
			const context = loadEngine({ url: PAGE, onOff: panel, patterns });
			clearCapturedMessages(context);

			tap(context, 3);
			answerTheFlip(context, { onOff: panel, patterns });

			assert.equal(lastWrite(context).onOff, panel);
			assert.deepEqual(lastWrite(context).patterns, rows(["*://example.test/*", written]));
		});
	}

	it("drops a row that only repeated the panel, rather than keeping it", () => {
		const patterns = rows(["*://example.test/*", "on"]);
		const context = loadEngine({ url: PAGE, onOff: 1, patterns });
		clearCapturedMessages(context);

		tap(context, 3);
		answerTheFlip(context, { onOff: 1, patterns });

		assert.equal(lastWrite(context).patterns.length, 1);
		assert.equal(lastWrite(context).patterns[0].mode, "off");
	});
});

describe("The third tap moves the row that already governs the page", () => {
	it("cycles the broader row instead of adding one for the host", () => {
		const patterns = rows(["*.example.test", "default"]);
		const url = "https://docs.example.test/page";
		const context = loadEngine({ url, onOff: 1, patterns });
		clearCapturedMessages(context);

		tap(context, 3);
		answerTheFlip(context, { onOff: 1, patterns });

		assert.deepEqual(lastWrite(context).patterns, rows(["*.example.test", "off"]));
	});

	it("keeps every other row untouched", () => {
		const patterns = rows(["keep.test", "on"]);
		const context = loadEngine({ url: PAGE, onOff: 1, patterns });
		clearCapturedMessages(context);

		tap(context, 3);
		answerTheFlip(context, { onOff: 1, patterns });

		assert.deepEqual(lastWrite(context).patterns, [
			{ pattern: "keep.test", mode: "on" },
			{ pattern: "*://example.test/*", mode: "off" },
		]);
	});
});

describe("The third tap waits for the flip to be stored", () => {
	it("writes nothing until the background has answered the second tap", () => {
		const context = loadEngine({ url: PAGE });
		clearCapturedMessages(context);

		tap(context, 3);

		assert.deepEqual(writes(context), []);
	});

	it("still writes when the background answers before the third tap arrives", () => {
		const context = loadEngine({ url: PAGE });
		clearCapturedMessages(context);

		tap(context, 2);
		answerTheFlip(context, { onOff: 1 });
		tap(context, 1);

		assert.deepEqual(lastWrite(context).patterns, rows(["*://example.test/*", "off"]));
	});

	it("writes once, not twice, when the answer lands after the third tap", () => {
		const context = loadEngine({ url: PAGE });
		clearCapturedMessages(context);

		tap(context, 3);
		answerTheFlip(context, { onOff: 1 });

		assert.equal(writes(context).length, 1);
	});
});

describe("Counting the taps", () => {
	it("does not move the site on two taps alone", () => {
		const context = loadEngine({ url: PAGE });
		clearCapturedMessages(context);

		tap(context, 2);
		answerTheFlip(context, { onOff: 1 });

		assert.deepEqual(writes(context), []);
	});

	it("does nothing at all on a fourth tap", () => {
		const context = loadEngine({ url: PAGE });
		clearCapturedMessages(context);

		tap(context, 4);
		answerTheFlip(context, { onOff: 1 });

		assert.equal(capturedMessages(context).filter((m) => m.turn_avim).length, 1);
		assert.equal(writes(context).length, 1);
	});

	it("treats a tap after the window as a fresh first tap", () => {
		const context = loadEngine({ url: PAGE });
		clearCapturedMessages(context);

		tap(context, 2);
		answerTheFlip(context, { onOff: 1 });
		runTimersWithDelay(context, 300);
		tap(context, 1);

		assert.deepEqual(writes(context), []);
	});

	it("forgets the count when another key is released mid-gesture", () => {
		const context = loadEngine({ url: PAGE });
		clearCapturedMessages(context);

		tap(context, 2);
		answerTheFlip(context, { onOff: 1 });
		pressKeyUp(context, 65);
		tap(context, 1);

		assert.deepEqual(writes(context), []);
	});

	it("forgets the count when a key is pressed mid-gesture", () => {
		const context = loadEngine({ url: PAGE });
		clearCapturedMessages(context);

		tap(context, 2);
		answerTheFlip(context, { onOff: 1 });
		pressKeyDown(context, 65);
		tap(context, 1);

		assert.deepEqual(writes(context), []);
	});
});

describe("A page no row can name is left out", () => {
	it("writes nothing for the popup's own page", () => {
		const context = loadEngine({ url: "chrome-extension://abcdef/popup.html" });
		clearCapturedMessages(context);

		tap(context, 3);
		answerTheFlip(context, { onOff: 1 });

		assert.deepEqual(writes(context), []);
	});

	it("still flips the panel switch from there", () => {
		const context = loadEngine({ url: "chrome-extension://abcdef/popup.html" });
		clearCapturedMessages(context);

		tap(context, 3);

		assert.deepEqual(capturedMessages(context), [{ turn_avim: "onOff" }]);
	});
});
