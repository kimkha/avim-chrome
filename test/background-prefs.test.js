import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { loadBackground } from "./helpers/background-harness.js";

const GET = { get_prefs: "all" };

describe("A fresh profile gets the shipped defaults", () => {
	it("answers get_prefs with every pref parsed to a number", async () => {
		const background = loadBackground();

		assert.deepEqual(await background.send(GET), {
			method: 0,
			onOff: 1,
			ckSpell: 1,
			oldAccent: 1,
			shortcutsOn: 0,
			shortcuts: [],
			patterns: [],
		});
	});

	it("ships no URL pattern rows, so nothing overrides the panel", async () => {
		const background = loadBackground();

		assert.deepEqual((await background.send(GET)).patterns, []);
	});

	it("ships the shortcuts switched off, with no rows at all", async () => {
		const background = loadBackground();

		const prefs = await background.send(GET);

		assert.equal(prefs.shortcutsOn, 0);
		assert.deepEqual(prefs.shortcuts, []);
	});

	it("reads the stored strings back as numbers", async () => {
		const background = loadBackground({ stored: { method: "2", onOff: "0", shortcutsOn: "1" } });

		const prefs = await background.send(GET);

		assert.equal(prefs.method, 2);
		assert.equal(prefs.onOff, 0);
		assert.equal(prefs.shortcutsOn, 1);
	});
});

describe("Stored shortcuts survive a hand-edited profile", () => {
	it("hands back what was stored", async () => {
		const stored = { shortcuts: JSON.stringify([{ key: "vn", value: "Việt Nam" }]) };
		const background = loadBackground({ stored });

		assert.deepEqual((await background.send(GET)).shortcuts, [{ key: "vn", value: "Việt Nam" }]);
	});

	// The alternative to a fallback is throwing inside get_prefs, which leaves the tab unable to type
	const broken = [
		["half-written JSON", "{not json"],
		["a bare string", '"w"'],
		["an object rather than a list", '{"w":"ư"}'],
		["null", "null"],
	];

	for (const [label, value] of broken) {
		it(`falls back to an empty list for ${label}`, async () => {
			const background = loadBackground({ stored: { shortcuts: value } });

			assert.deepEqual((await background.send(GET)).shortcuts, []);
		});
	}

	it("drops a row with no key, which is how a shortcut is deleted", async () => {
		const stored = { shortcuts: JSON.stringify([{ key: "", value: "ư" }, { key: "vn", value: "x" }]) };
		const background = loadBackground({ stored });

		assert.deepEqual((await background.send(GET)).shortcuts, [{ key: "vn", value: "x" }]);
	});

	it("drops entries that are not rows at all", async () => {
		const stored = { shortcuts: JSON.stringify([null, 7, { value: "ư" }, { key: "w", value: "ư" }]) };
		const background = loadBackground({ stored });

		assert.deepEqual((await background.send(GET)).shortcuts, [{ key: "w", value: "ư" }]);
	});
});

describe("save_prefs writes what the popup sent", () => {
	it("stores prefs as strings, because that is what get compares types against", async () => {
		const background = loadBackground();

		await background.send({ save_prefs: "all", method: 2, shortcutsOn: 1 });

		assert.equal(background.storage.method, "2");
		assert.equal(background.storage.shortcutsOn, "1");
	});

	it("leaves the prefs the popup did not mention alone", async () => {
		const background = loadBackground({ stored: { onOff: "0" } });

		await background.send({ save_prefs: "all", method: 3 });

		assert.equal(background.storage.onOff, "0");
		assert.equal(background.storage.shortcuts, undefined);
	});

	it("stores the shortcut rows as one JSON string", async () => {
		const background = loadBackground();

		await background.send({ save_prefs: "all", shortcuts: [{ key: "vn", value: "Việt Nam" }] });

		assert.equal(background.storage.shortcuts, '[{"key":"vn","value":"Việt Nam"}]');
	});

	it("drops a row whose key was cleared, which is how the popup deletes one", async () => {
		const background = loadBackground();

		await background.send({ save_prefs: "all", shortcuts: [{ key: "", value: "ư" }, { key: "w", value: "ư" }] });

		assert.deepEqual(JSON.parse(background.storage.shortcuts), [{ key: "w", value: "ư" }]);
	});

	it("keeps a row whose result is empty, which swallows the keys on purpose", async () => {
		const background = loadBackground();

		await background.send({ save_prefs: "all", shortcuts: [{ key: "w", value: "" }] });

		assert.deepEqual(JSON.parse(background.storage.shortcuts), [{ key: "w", value: "" }]);
	});

	const coerced = [
		["a number", 7, "7"],
		["nothing at all", undefined, ""],
		["null", null, ""],
	];

	for (const [label, value, expected] of coerced) {
		it(`turns a result of ${label} into a string`, async () => {
			const background = loadBackground();

			await background.send({ save_prefs: "all", shortcuts: [{ key: "w", value }] });

			assert.deepEqual(JSON.parse(background.storage.shortcuts), [{ key: "w", value: expected }]);
		});
	}
});

describe("Every open tab hears about a change", () => {
	it("pushes the saved prefs to all of them", async () => {
		const background = loadBackground({ tabs: [11, 22] });

		await background.send({ save_prefs: "all", shortcutsOn: 1, shortcuts: [{ key: "w", value: "ư" }] });

		assert.deepEqual(background.pushedToTabs.map((push) => push.id), [11, 22]);
		assert.deepEqual(background.pushedToTabs[0].prefs.shortcuts, [{ key: "w", value: "ư" }]);
		assert.equal(background.pushedToTabs[0].prefs.shortcutsOn, 1);
	});

	// A chrome:// tab or the web store has no content script and rejects; the rest must still hear
	it("carries on past a tab that cannot be reached", async () => {
		const background = loadBackground({ tabs: [11, 22, 33], mutedTabs: [22] });

		await background.send({ save_prefs: "all", shortcutsOn: 1 });

		assert.deepEqual(background.pushedToTabs.map((push) => push.id), [11, 33]);
	});

	it("sends an empty shortcut list once the feature is switched off", async () => {
		const stored = { shortcutsOn: "1", shortcuts: JSON.stringify([{ key: "w", value: "ư" }]) };
		const background = loadBackground({ stored });

		await background.send({ save_prefs: "all", shortcutsOn: 0 });

		assert.equal(background.pushedToTabs.at(-1).prefs.shortcutsOn, 0);
	});
});

describe("The badge follows the on/off state", () => {
	it("turns AVIM off and says so", async () => {
		const background = loadBackground();

		await background.send({ turn_avim: "all" });

		assert.equal(background.storage.onOff, "0");
		assert.equal(background.badge.text, "off");
		assert.deepEqual(background.badge.color, [255, 0, 0, 255]);
	});

	it("turns it back on", async () => {
		const background = loadBackground({ stored: { onOff: "0" } });

		await background.send({ turn_avim: "all" });

		assert.equal(background.storage.onOff, "1");
		assert.equal(background.badge.text, "on");
		assert.deepEqual(background.badge.color, [0, 255, 0, 255]);
	});

	it("leaves the shortcuts alone while toggling", async () => {
		const stored = { shortcuts: JSON.stringify([{ key: "vn", value: "Việt Nam" }]) };
		const background = loadBackground({ stored });

		await background.send({ turn_avim: "all" });

		assert.deepEqual(background.pushedToTabs.at(-1).prefs.shortcuts, [{ key: "vn", value: "Việt Nam" }]);
	});
});

describe("The fast input text is stored apart from the prefs", () => {
	const READ = { get_demo_text: "all" };

	it("answers with an empty string on a fresh profile", async () => {
		const background = loadBackground();

		assert.equal(await background.send(READ), "");
	});

	it("answers with what was stored", async () => {
		const background = loadBackground({ stored: { demoText: "tiếng Việt" } });

		assert.equal(await background.send(READ), "tiếng Việt");
	});

	it("writes what the popup sends", async () => {
		const background = loadBackground();

		await background.send({ save_demo_text: "xin chào" });

		assert.equal(background.storage.demoText, "xin chào");
		assert.equal(await background.send(READ), "xin chào");
	});

	it("writes an empty string, so clearing the field sticks", async () => {
		const background = loadBackground({ stored: { demoText: "cũ" } });

		await background.send({ save_demo_text: "" });

		assert.equal(background.storage.demoText, "");
	});

	it("never pushes it to the tabs", async () => {
		const background = loadBackground({ tabs: [1, 2] });

		await background.send({ save_demo_text: "xin chào" });

		assert.deepEqual(background.pushedToTabs, []);
	});

	it("keeps it out of get_prefs", async () => {
		const background = loadBackground({ stored: { demoText: "tiếng Việt" } });

		const prefs = await background.send(GET);

		assert.equal(prefs.demoText, undefined);
	});

	it("leaves the prefs alone", async () => {
		const background = loadBackground({ stored: { method: "2", shortcuts: '[{"key":"vn","value":"Việt Nam"}]' } });

		await background.send({ save_demo_text: "xin chào" });

		const prefs = await background.send(GET);
		assert.equal(prefs.method, 2);
		assert.deepEqual(prefs.shortcuts, [{ key: "vn", value: "Việt Nam" }]);
	});
});

describe("A pref change reaches the popup, which is not a tab", () => {
	it("pushes the new prefs to extension pages as well as tabs", async () => {
		const background = loadBackground({ stored: { onOff: '1', method: '0' } });

		await background.send({ save_prefs: "all", method: 2 });

		assert.equal(background.pushedToPages.length, 1);
		assert.equal(background.pushedToPages[0].method, 2);
		assert.deepEqual(background.pushedToTabs.map((push) => push.prefs.method), [2, 2]);
	});

	it("pushes the flipped state when Ctrl is tapped twice", async () => {
		const background = loadBackground({ stored: { onOff: '1' } });

		await background.send({ turn_avim: "onOff" });

		assert.deepEqual(background.pushedToPages.map((prefs) => prefs.onOff), [0]);
		assert.equal(background.badge.text, 'off');
	});

	it("still updates the badge when no popup is open to receive the push", async () => {
		const background = loadBackground({ stored: { onOff: '1' }, noPageOpen: true });

		await background.send({ turn_avim: "onOff" });

		assert.deepEqual(background.pushedToPages, []);
		assert.equal(background.badge.text, 'off');
		assert.equal(background.storage.onOff, '0');
	});
});

describe("turn_avim answers with the state it just wrote", () => {
	it("replies with the flipped prefs, so the caller needs no broadcast", async () => {
		const background = loadBackground({ stored: { onOff: '1', method: '2', ckSpell: '1' } });

		const reply = await background.send({ turn_avim: "onOff" });

		assert.equal(reply.onOff, 0);
		assert.equal(reply.method, 2);
		assert.equal(reply.ckSpell, 1);
	});

	it("replies with onOff back on when it was off", async () => {
		const background = loadBackground({ stored: { onOff: '0' } });

		assert.equal((await background.send({ turn_avim: "onOff" })).onOff, 1);
	});

	it("replies even when no popup is open to receive the push", async () => {
		const background = loadBackground({ stored: { onOff: '1' }, noPageOpen: true });

		assert.equal((await background.send({ turn_avim: "onOff" })).onOff, 0);
	});

	it("hands the caller the same prefs it pushed to tabs", async () => {
		const background = loadBackground({ stored: { onOff: '1', method: '3' } });

		const reply = await background.send({ turn_avim: "onOff" });

		assert.deepEqual(background.pushedToTabs.map((push) => push.prefs.onOff), [0, 0]);
		assert.deepEqual(background.pushedToPages, [reply]);
	});
});

describe("Stored URL patterns survive a hand-edited profile", () => {
	it("parses the stored JSON into rows", async () => {
		const stored = { patterns: '[{"pattern":"docs.google.com","mode":"off"}]' };
		const background = loadBackground({ stored });

		assert.deepEqual((await background.send(GET)).patterns, [
			{ pattern: "docs.google.com", mode: "off" },
		]);
	});

	it("falls back to no rows when the JSON is corrupt", async () => {
		const background = loadBackground({ stored: { patterns: "{not json" } });

		assert.deepEqual((await background.send(GET)).patterns, []);
	});

	it("falls back to no rows when the JSON is not an array", async () => {
		const background = loadBackground({ stored: { patterns: '{"pattern":"a.test"}' } });

		assert.deepEqual((await background.send(GET)).patterns, []);
	});

	it("drops a row whose pattern is blank, which is how one is deleted", async () => {
		const stored = { patterns: '[{"pattern":"","mode":"off"},{"pattern":"a.test","mode":"on"}]' };
		const background = loadBackground({ stored });

		assert.deepEqual((await background.send(GET)).patterns, [{ pattern: "a.test", mode: "on" }]);
	});

	it("rewrites an unknown mode to default rather than dropping the row", async () => {
		const stored = { patterns: '[{"pattern":"a.test","mode":"sometimes"}]' };
		const background = loadBackground({ stored });

		assert.deepEqual((await background.send(GET)).patterns, [{ pattern: "a.test", mode: "default" }]);
	});

	it("keeps a row the user cycled back to default", async () => {
		const stored = { patterns: '[{"pattern":"a.test","mode":"default"}]' };
		const background = loadBackground({ stored });

		assert.deepEqual((await background.send(GET)).patterns, [{ pattern: "a.test", mode: "default" }]);
	});
});

describe("save_prefs stores the URL pattern rows", () => {
	it("writes them as JSON, cleaned", async () => {
		const background = loadBackground();

		await background.send({
			save_prefs: "all",
			patterns: [{ pattern: "a.test", mode: "on" }, { pattern: "", mode: "off" }],
		});

		assert.equal(background.storage.patterns, '[{"pattern":"a.test","mode":"on"}]');
	});

	it("leaves the rows alone when the popup sends only a method", async () => {
		const stored = { patterns: '[{"pattern":"a.test","mode":"on"}]' };
		const background = loadBackground({ stored });

		await background.send({ save_prefs: "all", method: 2 });

		assert.equal(background.storage.patterns, '[{"pattern":"a.test","mode":"on"}]');
	});

	it("pushes the rows to every tab, so each one can match its own URL", async () => {
		const background = loadBackground();

		await background.send({ save_prefs: "all", patterns: [{ pattern: "a.test", mode: "off" }] });

		for (const push of background.pushedToTabs) {
			assert.deepEqual(push.prefs.patterns, [{ pattern: "a.test", mode: "off" }]);
		}
	});
});

describe("A tab a URL pattern decided gets a washed-out badge of its own", () => {
	const REPORT = (state) => ({ report_pattern: state });
	const FROM_TAB = { tab: { id: 42 } };

	it("paints pale green when a row forced it on", async () => {
		const background = loadBackground();

		await background.send(REPORT({ onOff: 1, overridden: true }), FROM_TAB);

		assert.deepEqual(background.tabBadge(42), {
			text: "on",
			color: [168, 240, 168, 255],
			textColor: [0, 0, 0, 255],
		});
	});

	it("paints pale red when a row forced it off", async () => {
		const background = loadBackground();

		await background.send(REPORT({ onOff: 0, overridden: true }), FROM_TAB);

		assert.deepEqual(background.tabBadge(42), {
			text: "off",
			color: [255, 180, 180, 255],
			textColor: [0, 0, 0, 255],
		});
	});

	it("paints the solid colour when no row decided, so the tab matches the panel", async () => {
		const background = loadBackground();

		await background.send(REPORT({ onOff: 1, overridden: false }), FROM_TAB);

		assert.deepEqual(background.tabBadge(42).color, [0, 255, 0, 255]);
		assert.deepEqual(background.tabBadge(42).textColor, [255, 255, 255, 255]);
	});

	it("leaves the default badge for tabs that never reported", async () => {
		const background = loadBackground({ stored: { onOff: "1" } });
		await background.send({ save_prefs: "all", ckSpell: 1 });

		await background.send(REPORT({ onOff: 0, overridden: true }), FROM_TAB);

		assert.equal(background.tabBadge(42).text, "off");
		assert.equal(background.badge.text, "on");
	});

	it("ignores a report with no tab, which is how the popup's own engine reports", async () => {
		const background = loadBackground();

		await assert.rejects(() => background.send(REPORT({ onOff: 0, overridden: true })));
		assert.equal(background.tabBadge(42), undefined);
	});
});
