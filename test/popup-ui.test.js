import { describe, it } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import path from "node:path";

import { loadPopup, enMessages } from "./helpers/popup-harness.js";

describe("Copy All puts the demo text on the clipboard", () => {
	it("writes the textarea value", async () => {
		const popup = loadPopup({});
		popup.element("inputDemo").value = "tiếng Việt";

		popup.fire("demoCopy", "click");
		await popup.settled();

		assert.deepEqual(popup.clipboardWrites, ["tiếng Việt"]);
	});

	it("leaves the text selected, so the copy is visible", () => {
		const popup = loadPopup({});
		popup.element("inputDemo").value = "tiếng Việt";

		popup.fire("demoCopy", "click");

		assert.equal(popup.element("inputDemo").focused, true);
		assert.equal(popup.element("inputDemo").selected, true);
	});

	it("copies an empty textarea without throwing", async () => {
		const popup = loadPopup({});

		popup.fire("demoCopy", "click");
		await popup.settled();

		assert.deepEqual(popup.clipboardWrites, [""]);
	});

	it("falls back to execCommand when writeText is refused", async () => {
		const popup = loadPopup({ clipboardFails: true });
		popup.element("inputDemo").value = "tiếng Việt";

		popup.fire("demoCopy", "click");
		await popup.settled();

		assert.deepEqual(popup.execCommands, ["copy"]);
	});

	it("does not reach execCommand when writeText succeeds", async () => {
		const popup = loadPopup({});
		popup.element("inputDemo").value = "tiếng Việt";

		popup.fire("demoCopy", "click");
		await popup.settled();

		assert.deepEqual(popup.execCommands, []);
	});
});

describe("Remove accent strips diacritics from the demo text", () => {
	const cases = [
		["tiếng Việt", "tieng Viet"],
		["Đường Đi", "Duong Di"],
		["ừ ữ ự ơ ớ", "u u u o o"],
		["ăn cơm chưa", "an com chua"],
		["no accents here", "no accents here"],
		["", ""],
	];

	for (const [input, expected] of cases) {
		it(`"${input}" becomes "${expected}"`, () => {
			const popup = loadPopup({});
			popup.element("inputDemo").value = input;

			popup.fire("removeAccent", "click");

			assert.equal(popup.element("inputDemo").value, expected);
		});
	}

	it("does not touch the clipboard", () => {
		const popup = loadPopup({});
		popup.element("inputDemo").value = "tiếng Việt";

		popup.fire("removeAccent", "click");

		assert.deepEqual(popup.clipboardWrites, []);
	});
});

describe("The popup reflects the prefs the background reports", () => {
	const methods = [
		["auto", 0],
		["telex", 1],
		["vni", 2],
		["viqr", 3],
		["viqrStar", 4],
	];

	for (const [id, method] of methods) {
		it(`checks #${id} for method ${method}`, () => {
			const popup = loadPopup({ prefs: { method, onOff: 1 } });

			assert.equal(popup.element(id).checked, true);
			assert.equal(popup.element("off").checked, false);
		});
	}

	it("checks #off when AVIM is off, whatever the method is", () => {
		const popup = loadPopup({ prefs: { method: 2, onOff: 0 } });

		assert.equal(popup.element("off").checked, true);
		assert.equal(popup.element("vni").checked, false);
	});

	it("mirrors the spell check pref", () => {
		assert.equal(loadPopup({ prefs: { ckSpell: 1 } }).element("spellCheck").checked, true);
		assert.equal(loadPopup({ prefs: { ckSpell: 0 } }).element("spellCheck").checked, false);
	});

	it("asks for the prefs and the saved fast input on load, and writes nothing", () => {
		const popup = loadPopup({});

		assert.deepEqual(popup.sent, [{ get_prefs: "all" }, { get_demo_text: "all" }]);
		assert.deepEqual(popup.writes(), []);
	});
});

describe("Choosing an option saves it without reloading the popup", () => {
	const methods = [
		["auto", 0],
		["telex", 1],
		["vni", 2],
		["viqr", 3],
		["viqrStar", 4],
	];

	for (const [id, method] of methods) {
		it(`#${id} saves method ${method} and turns AVIM on`, () => {
			const popup = loadPopup({ prefs: { onOff: 0 } });

			popup.fire(id, "click");

			assert.deepEqual(popup.sent.at(-1), { save_prefs: "all", method, onOff: 1 });
			assert.deepEqual(popup.reloads, []);
		});
	}

	it("shows the chosen method once the background pushes it back", () => {
		const popup = loadPopup({ prefs: { onOff: 0 } });

		popup.fire("vni", "click");
		popup.pushPrefs({ onOff: 1, method: 2, ckSpell: 1, shortcutsOn: 0, shortcuts: [], patterns: [] });

		assert.equal(popup.element("vni").checked, true);
		assert.equal(popup.element("off").checked, false);
		assert.deepEqual(popup.reloads, []);
	});

	it("keeps the site settings rows a reload used to wipe", () => {
		const popup = loadPopup({ prefs: { patterns: [{ pattern: "*://a.test/*", mode: "off" }] } });
		popup.fire("openPatterns", "click");
		popup.patternRows()[0].patternInput.value = "*://edited.test/*";

		popup.fire("telex", "click");
		popup.pushPrefs({ onOff: 1, method: 1, ckSpell: 1, shortcutsOn: 0, shortcuts: [], patterns: [] });

		assert.deepEqual(popup.patternRows().map((row) => row.patternInput.value), ["*://edited.test/*"]);
		assert.equal(popup.element("patternScreen").style.display, "");
	});

	it("#off turns AVIM off without touching the method", () => {
		const popup = loadPopup({});

		popup.fire("off", "click");

		assert.deepEqual(popup.sent.at(-1), { save_prefs: "all", onOff: 0 });
		assert.deepEqual(popup.reloads, []);
	});

	const spellCheckCases = [
		[true, 1],
		[false, 0],
	];

	for (const [checked, saved] of spellCheckCases) {
		it(`#spellCheck ${checked ? "on" : "off"} saves ckSpell ${saved}`, () => {
			const popup = loadPopup({});
			popup.element("spellCheck").checked = checked;

			popup.fire("spellCheck", "change");

			assert.deepEqual(popup.sent.at(-1), { save_prefs: "all", ckSpell: saved });
			assert.deepEqual(popup.reloads, []);
		});
	}
});

describe("Labels come from the locale file, not the hardcoded fallbacks", () => {
	const labels = [
		["txtSearch", "extPopupSearch"],
		["txtDemoCopy", "extPopupDemoCopy"],
		["txtRemoveAccent", "extPopupRemoveAccent"],
		["txtSpellCheck", "extPopupSpellCheck"],
		["txtOff", "extPopupOff"],
	];

	for (const [elementId, messageKey] of labels) {
		it(`#${elementId} shows "${enMessages[messageKey].message}"`, () => {
			const popup = loadPopup({});

			assert.equal(popup.element(elementId).textContent, enMessages[messageKey].message);
		});
	}
});

describe("Search sends the fast input to a new tab", () => {
	function search(value) {
		const popup = loadPopup({});
		popup.element("inputDemo").value = value;
		popup.fire("searchDemo", "click");
		return popup;
	}

	const quiet = ["", "   ", "\n\t "];

	for (const value of quiet) {
		it(`does nothing for ${JSON.stringify(value)}`, () => {
			const popup = search(value);

			assert.deepEqual(popup.createdTabs, []);
			assert.deepEqual(popup.searchQueries, []);
		});
	}

	const searches = [
		["xin chào", "xin chào"],
		["chào", "chào"],
		["tiếng.việt", "tiếng.việt"],
		["abc.công", "abc.công"],
		["tiếng việt.com", "tiếng việt.com"],
		["1.2.3.4", "1.2.3.4"],
		["a.b", "a.b"],
		["vn", "vn"],
		["  nhiều   khoảng   trắng  ", "nhiều khoảng trắng"],
		["hai\ndòng", "hai dòng"],
	];

	for (const [typed, text] of searches) {
		it(`searches for ${JSON.stringify(typed)}`, () => {
			const popup = search(typed);

			assert.deepEqual(popup.searchQueries, [{ text, disposition: "NEW_TAB" }]);
			assert.deepEqual(popup.createdTabs, []);
		});
	}

	const visits = [
		["https://google.com", "https://google.com"],
		["http://a.b/c", "http://a.b/c"],
		["google.com", "https://google.com"],
		["GOOGLE.COM", "https://GOOGLE.COM"],
		["example.co.uk", "https://example.co.uk"],
		["google.com/search?q=x", "https://google.com/search?q=x"],
		["phở.vn", "https://phở.vn"],
	];

	for (const [typed, url] of visits) {
		it(`opens ${JSON.stringify(typed)} as ${JSON.stringify(url)}`, () => {
			const popup = search(typed);

			assert.deepEqual(popup.createdTabs, [{ url }]);
			assert.deepEqual(popup.searchQueries, []);
		});
	}

	const rejected = ["javascript://evil", "javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "chrome://settings"];

	for (const typed of rejected) {
		it(`refuses to navigate to ${JSON.stringify(typed)}`, () => {
			const popup = search(typed);

			assert.deepEqual(popup.createdTabs, []);
			assert.equal(popup.searchQueries.length, 1);
		});
	}
});

describe("Search is the primary action of the fast input", () => {
	const html = fs.readFileSync(path.join(import.meta.dirname, "..", "src", "popup.html"), "utf8");

	it("comes before Copy and Remove accents, so Tab from the textarea lands on it", () => {
		const order = ["inputDemo", "searchDemo", "demoCopy", "removeAccent"]
			.map((id) => html.indexOf(`id="${id}"`));

		assert.deepEqual(order, [...order].sort((a, b) => a - b));
		assert.ok(order.every((index) => index > -1));
	});

	it("is the only primary button on the main screen", () => {
		const primaries = [...html.matchAll(/<button[^>]*class="[^"]*buttonPrimary[^"]*"[^>]*id="([^"]+)"/g)]
			.map((match) => match[1]);

		assert.deepEqual(primaries, ["searchDemo", "saveShortcuts", "savePatterns"]);
	});
});

describe("The fast input keeps what was typed last time", () => {
	it("restores the stored text", () => {
		const popup = loadPopup({ demoText: "tiếng Việt" });

		assert.equal(popup.element("inputDemo").value, "tiếng Việt");
	});

	it("selects all of it, so typing replaces it", () => {
		const popup = loadPopup({ demoText: "tiếng Việt" });

		assert.equal(popup.element("inputDemo").focused, true);
		assert.equal(popup.element("inputDemo").selected, true);
	});

	it("asks the background for it on load", () => {
		const popup = loadPopup({ demoText: "xin chào" });

		assert.ok(popup.sent.some((message) => message.get_demo_text === "all"));
	});

	it("leaves the field empty when nothing was stored", () => {
		const popup = loadPopup({});

		assert.equal(popup.element("inputDemo").value, "");
	});

	it("does not clobber a keystroke that beat the async read", () => {
		const popup = loadPopup({ demoText: "cũ", deferDemoText: true });
		popup.element("inputDemo").value = "đang gõ";

		popup.deliverDemoText();

		assert.equal(popup.element("inputDemo").value, "đang gõ");
	});

	it("still restores when nothing was typed before the reply arrives", () => {
		const popup = loadPopup({ demoText: "cũ", deferDemoText: true });

		popup.deliverDemoText();

		assert.equal(popup.element("inputDemo").value, "cũ");
	});

	it("stores every edit as it happens", () => {
		const popup = loadPopup({});
		popup.element("inputDemo").value = "chào";

		popup.fire("inputDemo", "input");

		assert.deepEqual(popup.sent.at(-1), { save_demo_text: "chào" });
	});

	it("stores an emptied field, so clearing sticks", () => {
		const popup = loadPopup({ demoText: "chào" });
		popup.element("inputDemo").value = "";

		popup.fire("inputDemo", "input");

		assert.deepEqual(popup.sent.at(-1), { save_demo_text: "" });
	});

	it("stores the stripped text after Remove accents", () => {
		const popup = loadPopup({ demoText: "tiếng Việt" });

		popup.fire("removeAccent", "click");

		assert.deepEqual(popup.sent.at(-1), { save_demo_text: "tieng Viet" });
	});
});

describe("A pref pushed from the background updates the open popup", () => {
	it("flips the radios to off, so double-Ctrl is reflected", () => {
		const popup = loadPopup({ prefs: { onOff: 1, method: 0 } });
		assert.equal(popup.element("auto").checked, true);

		popup.pushPrefs({ onOff: 0, method: 0, ckSpell: 1, shortcutsOn: 0, shortcuts: [] });

		assert.equal(popup.element("off").checked, true);
		assert.equal(popup.element("auto").checked, false);
	});

	it("flips them back on, picking the method that came with it", () => {
		const popup = loadPopup({ prefs: { onOff: 0 } });
		assert.equal(popup.element("off").checked, true);

		popup.pushPrefs({ onOff: 1, method: 2, ckSpell: 1, shortcutsOn: 0, shortcuts: [] });

		assert.equal(popup.element("vni").checked, true);
		assert.equal(popup.element("off").checked, false);
	});

	it("follows spell check and the shortcut switch", () => {
		const popup = loadPopup({ prefs: { onOff: 1, ckSpell: 1, shortcutsOn: 0 } });

		popup.pushPrefs({ onOff: 1, method: 0, ckSpell: 0, shortcutsOn: 1, shortcuts: [] });

		assert.equal(popup.element("spellCheck").checked, false);
		assert.equal(popup.element("shortcutsOn").checked, true);
		assert.equal(popup.element("saveShortcuts").disabled, false);
	});

	it("leaves the shortcut rows untouched, so a push cannot duplicate or wipe them", () => {
		const popup = loadPopup({ prefs: { onOff: 1, shortcutsOn: 1, shortcuts: [{ key: "vn", value: "Việt Nam" }] } });
		const values = () => popup.shortcutRows().map((row) => [row.keyInput.value, row.resultInput.value]);
		assert.deepEqual(values(), [["vn", "Việt Nam"]]);

		popup.pushPrefs({ onOff: 0, method: 0, ckSpell: 1, shortcutsOn: 1, shortcuts: [{ key: "hn", value: "Hà Nội" }] });

		assert.deepEqual(values(), [["vn", "Việt Nam"]]);
	});

	it("ignores a message that is not a pref payload", () => {
		const popup = loadPopup({ prefs: { onOff: 1, method: 0 } });

		popup.pushPrefs({ some_other_message: "all" });
		popup.pushPrefs(undefined);

		assert.equal(popup.element("auto").checked, true);
	});
});
