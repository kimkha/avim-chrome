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
		});
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
