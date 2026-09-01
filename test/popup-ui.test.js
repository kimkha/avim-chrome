import { describe, it } from "node:test";
import assert from "node:assert/strict";

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

	it("asks for the prefs on load", () => {
		const popup = loadPopup({});

		assert.deepEqual(popup.sent, [{ get_prefs: "all" }]);
	});
});

describe("Choosing an option saves it and reloads the popup", () => {
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
			assert.deepEqual(popup.reloads, [true]);
		});
	}

	it("#off turns AVIM off without touching the method", () => {
		const popup = loadPopup({});

		popup.fire("off", "click");

		assert.deepEqual(popup.sent.at(-1), { save_prefs: "all", onOff: 0 });
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
		});
	}
});

describe("Labels come from the locale file, not the hardcoded fallbacks", () => {
	const labels = [
		["txtDemoCopy", "extPopupDemoCopy"],
		["txtRemoveAccent", "extPopupRemoveAccent"],
		["txtSpellCheck", "extPopupSpellCheck"],
		["txtOff", "extPopupOff"],
	];

	for (const [elementId, messageKey] of labels) {
		it(`#${elementId} shows "${enMessages[messageKey].message}"`, () => {
			const popup = loadPopup({});

			assert.equal(popup.element(elementId).innerHTML, enMessages[messageKey].message);
		});
	}
});
