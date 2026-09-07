import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { loadPopup } from "./helpers/popup-harness.js";

const rows = (...entries) => entries.map(([pattern, mode]) => ({ pattern, mode }));

const savedPatterns = (popup) => popup.writes().at(-1).patterns;

describe("The URL pattern screen opens over the main one", () => {
	it("starts closed", () => {
		const popup = loadPopup();

		assert.equal(popup.element("patternScreen").style.display, "none");
	});

	it("opens from the Patterns button and parks focus on Back", () => {
		const popup = loadPopup();

		popup.fire("openPatterns", "click");

		assert.equal(popup.element("patternScreen").style.display, "");
		assert.equal(popup.activeElement().id, "backFromPatterns");
	});

	it("makes the main screen inert while it is open", () => {
		const popup = loadPopup();

		popup.fire("openPatterns", "click");

		assert.equal(popup.element("mainScreen").inert, true);
	});

	it("closes from Back and hands focus back to the fast input", () => {
		const popup = loadPopup();
		popup.fire("openPatterns", "click");

		popup.fire("backFromPatterns", "click");

		assert.equal(popup.element("patternScreen").style.display, "none");
		assert.equal(popup.element("mainScreen").inert, false);
		assert.equal(popup.activeElement().id, "inputDemo");
	});

	it("closes on a click that lands on the backdrop", () => {
		const popup = loadPopup();
		popup.fire("openPatterns", "click");

		popup.fire("patternScreen", "click", { target: popup.element("patternScreen") });

		assert.equal(popup.element("patternScreen").style.display, "none");
	});

	it("stays open when the click lands inside the dialog", () => {
		const popup = loadPopup();
		popup.fire("openPatterns", "click");

		popup.fire("patternScreen", "click", { target: popup.element("patternList") });

		assert.equal(popup.element("patternScreen").style.display, "");
	});

	it("carries no switch, because a row is either on, off or default", () => {
		const popup = loadPopup();

		assert.equal(popup.element("patternScreen").children.length, 0);
		assert.equal(popup.writes().length, 0);
	});
});

describe("The screen lists the stored rows", () => {
	it("shows one blank row when nothing is stored", () => {
		const popup = loadPopup();

		const [only] = popup.patternRows();

		assert.equal(popup.patternRows().length, 1);
		assert.equal(only.patternInput.value, "");
		assert.equal(only.modeSelect.value, "default");
	});

	it("shows a row per stored pattern, with its mode picked", () => {
		const patterns = rows(["docs.google.com", "off"], ["mail.test", "on"]);
		const popup = loadPopup({ prefs: { patterns } });

		assert.deepEqual(
			popup.patternRows().map((row) => [row.patternInput.value, row.modeSelect.value]),
			[["docs.google.com", "off"], ["mail.test", "on"]],
		);
	});

	it("offers all three modes on every row, in click order", () => {
		const popup = loadPopup();

		const [only] = popup.patternRows();

		assert.deepEqual(only.modeSelect.children.map((option) => option.value), ["default", "on", "off"]);
		assert.deepEqual(only.modeSelect.children.map((option) => option.textContent), ["Default", "On", "Off"]);
	});

	it("appends a row from the Add button", () => {
		const popup = loadPopup();

		popup.fire("addPattern", "click");

		assert.equal(popup.patternRows().length, 2);
	});

	it("appends a row from Enter in a pattern field", () => {
		const popup = loadPopup();
		let prevented = false;

		popup.fireOn(popup.patternRows()[0].patternInput, "keydown", {
			key: "Enter",
			preventDefault: () => {
				prevented = true;
			},
		});

		assert.equal(popup.patternRows().length, 2);
		assert.ok(prevented);
		assert.equal(popup.activeElement(), popup.patternRows()[1].patternInput);
	});

	it("drops the row the ✕ belongs to", () => {
		const patterns = rows(["a.test", "off"], ["b.test", "on"]);
		const popup = loadPopup({ prefs: { patterns } });

		popup.fireOn(popup.patternRows()[0].removeButton, "click");

		assert.deepEqual(popup.patternRows().map((row) => row.patternInput.value), ["b.test"]);
	});

	it("puts a blank row back when the last one is removed", () => {
		const popup = loadPopup({ prefs: { patterns: rows(["a.test", "off"]) } });

		popup.fireOn(popup.patternRows()[0].removeButton, "click");

		assert.equal(popup.patternRows().length, 1);
		assert.equal(popup.patternRows()[0].patternInput.value, "");
	});

	it("stores nothing until Save is pressed", () => {
		const popup = loadPopup({ prefs: { patterns: rows(["a.test", "off"]) } });

		popup.fireOn(popup.patternRows()[0].removeButton, "click");

		assert.equal(popup.writes().length, 0);
	});
});

describe("Saving the screen writes the rows and closes it", () => {
	it("sends every filled row with its mode", () => {
		const popup = loadPopup();
		popup.fire("openPatterns", "click");
		popup.patternRows()[0].patternInput.value = "docs.google.com";
		popup.patternRows()[0].modeSelect.value = "off";

		popup.fire("savePatterns", "click");

		assert.deepEqual(savedPatterns(popup), rows(["docs.google.com", "off"]));
	});

	it("leaves out a row whose pattern was emptied", () => {
		const popup = loadPopup({ prefs: { patterns: rows(["a.test", "off"], ["b.test", "on"]) } });
		popup.patternRows()[0].patternInput.value = "";

		popup.fire("savePatterns", "click");

		assert.deepEqual(savedPatterns(popup), rows(["b.test", "on"]));
	});

	it("closes the screen without reloading the popup", () => {
		const popup = loadPopup();
		popup.fire("openPatterns", "click");

		popup.fire("savePatterns", "click");

		assert.equal(popup.element("patternScreen").style.display, "none");
		assert.deepEqual(popup.reloads, []);
	});

	it("keeps the shortcut rows out of the write", () => {
		const popup = loadPopup({ prefs: { shortcuts: [{ key: "vn", value: "Việt Nam" }] } });

		popup.fire("savePatterns", "click");

		assert.equal(popup.writes().at(-1).shortcuts, undefined);
	});
});

describe("The quick setting names the site the popup is looking at", () => {
	it("asks the active tab's top frame for the state", () => {
		const popup = loadPopup();

		assert.deepEqual(popup.tabQueries, [{ active: true, currentWindow: true }]);
		assert.deepEqual(popup.tabMessages[0].message, { get_tab_pattern: "all" });
		assert.deepEqual(popup.tabMessages[0].options, { frameId: 0 });
	});

	it("shows the pattern and its mode", () => {
		const tabPattern = { url: "https://docs.google.com/", pattern: "docs.google.com", mode: "off" };
		const popup = loadPopup({ tabPattern });

		assert.equal(popup.element("quickPattern").hidden, false);
		assert.equal(popup.element("quickPatternName").textContent, "docs.google.com");
		assert.equal(popup.element("quickPatternMode").textContent, "Off");
		assert.equal(popup.element("quickPatternMode").className, "quickPatternMode quickPatternMode-off");
	});

	it("marks a site the panel still decides as Default", () => {
		const popup = loadPopup();

		assert.equal(popup.element("quickPatternMode").textContent, "Default");
		assert.equal(popup.element("quickPatternMode").className, "quickPatternMode quickPatternMode-default");
	});

	it("hides itself on a tab with no content script to answer", () => {
		const popup = loadPopup({ noContentScript: true });

		assert.equal(popup.element("quickPattern").hidden, true);
	});

	it("hides itself when there is no active tab at all", () => {
		const popup = loadPopup({ noActiveTab: true });

		assert.equal(popup.element("quickPattern").hidden, true);
		assert.deepEqual(popup.tabMessages, []);
	});

	it("does nothing when clicked while hidden", () => {
		const popup = loadPopup({ noContentScript: true });

		popup.fire("quickPattern", "click");

		assert.equal(popup.writes().length, 0);
	});
});

describe("Clicking the quick setting cycles the site and stores the row", () => {
	const cycle = (popup) => {
		popup.fire("quickPattern", "click");
		return popup.element("quickPatternMode").textContent;
	};

	it("walks Default, On, Off and back to Default", () => {
		const popup = loadPopup();

		assert.equal(popup.element("quickPatternMode").textContent, "Default");
		assert.equal(cycle(popup), "On");
		assert.equal(cycle(popup), "Off");
		assert.equal(cycle(popup), "Default");
	});

	it("creates the row on the first click, using the pattern it offered", () => {
		const popup = loadPopup();

		popup.fire("quickPattern", "click");

		assert.deepEqual(savedPatterns(popup), rows(["*://example.test/*", "on"]));
	});

	it("keeps the row rather than deleting it once it is back to default", () => {
		const popup = loadPopup();

		popup.fire("quickPattern", "click");
		popup.fire("quickPattern", "click");
		popup.fire("quickPattern", "click");

		assert.deepEqual(savedPatterns(popup), rows(["*://example.test/*", "default"]));
	});

	it("updates the stored row in place instead of adding a second one", () => {
		const tabPattern = { url: "https://a.test/", pattern: "a.test", mode: "off" };
		const popup = loadPopup({ prefs: { patterns: rows(["a.test", "off"]) }, tabPattern });

		popup.fire("quickPattern", "click");

		assert.deepEqual(savedPatterns(popup), rows(["a.test", "default"]));
	});

	it("leaves the other rows untouched", () => {
		const patterns = rows(["keep.test", "on"], ["*://example.test/*", "off"]);
		const tabPattern = { url: "https://example.test/", pattern: "*://example.test/*", mode: "off" };
		const popup = loadPopup({ prefs: { patterns }, tabPattern });

		popup.fire("quickPattern", "click");

		assert.deepEqual(savedPatterns(popup), rows(["keep.test", "on"], ["*://example.test/*", "default"]));
	});

	it("cycles the row the engine matched, not the host of the tab", () => {
		const tabPattern = { url: "https://docs.google.com/x", pattern: "*.google.com", mode: "default" };
		const popup = loadPopup({ prefs: { patterns: rows(["*.google.com", "default"]) }, tabPattern });

		popup.fire("quickPattern", "click");

		assert.deepEqual(savedPatterns(popup), rows(["*.google.com", "on"]));
	});

	it("does not reload the popup, which would shut it back to the main screen", () => {
		const popup = loadPopup();

		popup.fire("quickPattern", "click");

		assert.deepEqual(popup.reloads, []);
	});
});

describe("The pattern fields are hidden from the engine running in the popup", () => {
	it("excludes them by name, so a pattern like docs.google.com survives Telex", () => {
		const popup = loadPopup();

		assert.ok(popup.excluded().includes("avimPatternField"));
		assert.equal(popup.patternRows()[0].patternInput.name, "avimPatternField");
	});

	it("keeps the shortcut key field excluded too", () => {
		const popup = loadPopup();

		assert.ok(popup.excluded().includes("avimShortcutKey"));
	});
});
