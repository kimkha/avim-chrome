import { describe, it } from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import path from "node:path";

import { loadPopup, enMessages } from "./helpers/popup-harness.js";

const STORED = [{ key: "w", value: "ư" }, { key: "uow", value: "ươ" }];
const ENABLED = { shortcutsOn: 1, shortcuts: STORED };

function rowValues(popup) {
	return popup.shortcutRows().map((row) => [row.keyInput.value, row.resultInput.value]);
}

function openShortcuts(prefs = {}) {
	const popup = loadPopup({ prefs });
	popup.fire("openShortcuts", "click");
	return popup;
}

describe("The popup starts with the shortcut modal closed", () => {
	it("hides the modal", () => {
		const popup = loadPopup({});

		assert.notEqual(popup.element("mainScreen").style.display, "none");
		assert.equal(popup.element("shortcutScreen").style.display, "none");
	});

	it("opens the modal over the main screen, leaving it shown", () => {
		const popup = openShortcuts();

		assert.notEqual(popup.element("mainScreen").style.display, "none");
		assert.equal(popup.element("shortcutScreen").style.display, "");
	});
});

describe("The shortcut screen shows what the background stored", () => {
	it("renders one row per stored shortcut", () => {
		const popup = loadPopup({ prefs: { shortcuts: STORED } });

		assert.deepEqual(rowValues(popup), [["w", "ư"], ["uow", "ươ"]]);
	});

	it("opens on a single blank row when nothing is stored", () => {
		const popup = loadPopup({ prefs: { shortcuts: [] } });

		assert.deepEqual(rowValues(popup), [["", ""]]);
	});

	const toggleCases = [
		[1, true],
		[0, false],
	];

	for (const [stored, checked] of toggleCases) {
		it(`mirrors shortcutsOn ${stored}`, () => {
			assert.equal(loadPopup({ prefs: { shortcutsOn: stored } }).element("shortcutsOn").checked, checked);
		});
	}

	it("takes the input placeholders from the locale file", () => {
		const [row] = loadPopup({ prefs: { shortcuts: STORED } }).shortcutRows();

		assert.equal(row.keyInput.placeholder, enMessages.extPopupShortcutKeyHint.message);
		assert.equal(row.resultInput.placeholder, enMessages.extPopupShortcutResultHint.message);
	});
});

describe("The engine keeps its hands off the key fields", () => {
	// The regression this guards: the engine runs in the popup too, so a key field left to it typed
	// "uw" as "ư" and that shortcut could never be entered.
	it("names every key field so the engine skips it", () => {
		const popup = loadPopup({ prefs: { shortcuts: STORED } });

		const names = popup.shortcutRows().map((row) => row.keyInput.name);
		assert.deepEqual(names, ["avimShortcutKey", "avimShortcutKey"]);
	});

	it("adds that name to the engine's exclude list", () => {
		const popup = loadPopup({});

		assert.ok(popup.excluded().includes("avimShortcutKey"));
	});

	it("keeps the engine on the result field, so a result can be typed in Telex", () => {
		const [row] = loadPopup({ prefs: { shortcuts: STORED } }).shortcutRows();

		assert.equal(row.resultInput.name, "");
	});
});

describe("Add a shortcut appends a row to type into", () => {
	it("adds a blank row after the stored ones", () => {
		const popup = openShortcuts(ENABLED);

		popup.fire("addShortcut", "click");

		assert.deepEqual(rowValues(popup), [["w", "ư"], ["uow", "ươ"], ["", ""]]);
	});

	it("adds another one each time", () => {
		const popup = openShortcuts({ shortcutsOn: 1, shortcuts: [] });

		popup.fire("addShortcut", "click");
		popup.fire("addShortcut", "click");

		assert.equal(popup.shortcutRows().length, 3);
	});

	it("leaves the new row editable", () => {
		const popup = openShortcuts(ENABLED);

		popup.fire("addShortcut", "click");

		assert.equal(popup.shortcutRows().at(-1).keyInput.disabled, false);
	});

	it("does not save until Save is pressed", () => {
		const popup = openShortcuts(ENABLED);

		popup.fire("addShortcut", "click");

		assert.deepEqual(popup.writes(), []);
	});
});

describe("Every row has a delete button", () => {
	it("drops the row it belongs to", () => {
		const popup = openShortcuts(ENABLED);

		popup.fireOn(popup.shortcutRows()[0].removeButton, "click");

		assert.deepEqual(rowValues(popup), [["uow", "ươ"]]);
	});

	it("drops the right row when it is not the first", () => {
		const popup = openShortcuts(ENABLED);
		popup.fire("addShortcut", "click");
		popup.shortcutRows().at(-1).keyInput.value = "vn";

		popup.fireOn(popup.shortcutRows()[1].removeButton, "click");

		assert.deepEqual(rowValues(popup), [["w", "ư"], ["vn", ""]]);
	});

	it("leaves a blank row behind when the last one goes", () => {
		const popup = openShortcuts({ shortcutsOn: 1, shortcuts: [{ key: "w", value: "ư" }] });

		popup.fireOn(popup.shortcutRows()[0].removeButton, "click");

		assert.deepEqual(rowValues(popup), [["", ""]]);
	});

	it("takes the deletion out of what Save sends", () => {
		const popup = openShortcuts(ENABLED);

		popup.fireOn(popup.shortcutRows()[0].removeButton, "click");
		popup.fire("saveShortcuts", "click");

		assert.deepEqual(popup.sent.at(-1).shortcuts, [{ key: "uow", value: "ươ" }]);
	});

	it("does not save on its own", () => {
		const popup = openShortcuts(ENABLED);

		popup.fireOn(popup.shortcutRows()[0].removeButton, "click");

		assert.deepEqual(popup.writes(), []);
	});

	it("carries the localised tooltip", () => {
		const popup = openShortcuts(ENABLED);

		assert.equal(popup.shortcutRows()[0].removeButton.title, enMessages.extPopupRemoveShortcut.message);
	});
});

describe("Turning shortcuts off disables everything below the checkbox", () => {
	function disable(popup) {
		popup.element("shortcutsOn").checked = false;
		popup.fire("shortcutsOn", "change");
	}

	it("disables both inputs of every row", () => {
		const popup = openShortcuts(ENABLED);

		disable(popup);

		const disabled = popup.shortcutRows().map((row) => [row.keyInput.disabled, row.resultInput.disabled]);
		assert.deepEqual(disabled, [[true, true], [true, true]]);
	});

	it("disables the delete button of every row", () => {
		const popup = openShortcuts(ENABLED);

		disable(popup);

		assert.deepEqual(popup.shortcutRows().map((row) => row.removeButton.disabled), [true, true]);
	});

	const buttons = ["addShortcut", "saveShortcuts"];

	for (const id of buttons) {
		it(`disables #${id}`, () => {
			const popup = openShortcuts(ENABLED);

			disable(popup);

			assert.equal(popup.element(id).disabled, true);
		});
	}

	// Save is disabled along with the rest, so the checkbox is the one control that stores itself.
	it("stores the off state right away", () => {
		const popup = openShortcuts(ENABLED);

		disable(popup);

		assert.deepEqual(popup.sent.at(-1), { save_prefs: "all", shortcutsOn: 0 });
	});

	it("stays on the shortcut screen instead of reloading", () => {
		const popup = openShortcuts(ENABLED);

		disable(popup);

		assert.deepEqual(popup.reloads, []);
		assert.equal(popup.element("shortcutScreen").style.display, "");
	});

	it("re-enables everything when it is switched back on", () => {
		const popup = openShortcuts(ENABLED);

		disable(popup);
		popup.element("shortcutsOn").checked = true;
		popup.fire("shortcutsOn", "change");

		assert.equal(popup.shortcutRows()[0].keyInput.disabled, false);
		assert.equal(popup.element("saveShortcuts").disabled, false);
		assert.deepEqual(popup.sent.at(-1), { save_prefs: "all", shortcutsOn: 1 });
	});

	it("starts disabled when the pref is already off", () => {
		const popup = openShortcuts({ shortcutsOn: 0, shortcuts: STORED });

		assert.equal(popup.element("saveShortcuts").disabled, true);
		assert.equal(popup.shortcutRows()[0].keyInput.disabled, true);
	});
});

describe("Save stores the rows and goes back", () => {
	it("sends every row with the toggle", () => {
		const popup = openShortcuts(ENABLED);
		popup.fire("addShortcut", "click");
		const added = popup.shortcutRows().at(-1);
		added.keyInput.value = "vn";
		added.resultInput.value = "Việt Nam";

		popup.fire("saveShortcuts", "click");

		assert.deepEqual(popup.sent.at(-1), {
			save_prefs: "all",
			shortcutsOn: 1,
			shortcuts: [
				{ key: "w", value: "ư" },
				{ key: "uow", value: "ươ" },
				{ key: "vn", value: "Việt Nam" },
			],
		});
	});

	it("sends an edited row as edited", () => {
		const popup = openShortcuts(ENABLED);
		popup.shortcutRows()[0].resultInput.value = "Ư";

		popup.fire("saveShortcuts", "click");

		assert.deepEqual(popup.sent.at(-1).shortcuts[0], { key: "w", value: "Ư" });
	});

	// Dropping the blank row is the background's job, so the popup must not filter it out first
	it("sends a row whose key was cleared, which is how one is deleted", () => {
		const popup = openShortcuts(ENABLED);
		popup.shortcutRows()[0].keyInput.value = "";

		popup.fire("saveShortcuts", "click");

		assert.deepEqual(popup.sent.at(-1).shortcuts[0], { key: "", value: "ư" });
	});

	it("closes the modal", () => {
		const popup = openShortcuts(ENABLED);

		popup.fire("saveShortcuts", "click");

		assert.notEqual(popup.element("mainScreen").style.display, "none");
		assert.equal(popup.element("shortcutScreen").style.display, "none");
	});

	it("does not reload the popup, which would leave the screen", () => {
		const popup = openShortcuts(ENABLED);

		popup.fire("saveShortcuts", "click");

		assert.deepEqual(popup.reloads, []);
	});
});

describe("Back leaves the shortcut modal", () => {
	it("closes the modal", () => {
		const popup = openShortcuts(ENABLED);

		popup.fire("backToMain", "click");

		assert.notEqual(popup.element("mainScreen").style.display, "none");
		assert.equal(popup.element("shortcutScreen").style.display, "none");
	});

	it("stores nothing", () => {
		const popup = openShortcuts(ENABLED);
		popup.shortcutRows()[0].resultInput.value = "Ư";

		popup.fire("backToMain", "click");

		assert.deepEqual(popup.writes(), []);
		assert.deepEqual(popup.reloads, []);
	});

	it("keeps unsaved edits when the screen is reopened", () => {
		const popup = openShortcuts(ENABLED);
		popup.shortcutRows()[0].resultInput.value = "Ư";
		popup.fire("addShortcut", "click");
		popup.shortcutRows().at(-1).keyInput.value = "vn";

		popup.fire("backToMain", "click");
		popup.fire("openShortcuts", "click");

		assert.deepEqual(rowValues(popup), [["w", "Ư"], ["uow", "ươ"], ["vn", ""]]);
	});

	it("sends those kept edits when Save is pressed after reopening", () => {
		const popup = openShortcuts(ENABLED);
		popup.shortcutRows()[0].resultInput.value = "Ư";

		popup.fire("backToMain", "click");
		popup.fire("openShortcuts", "click");
		popup.fire("saveShortcuts", "click");

		assert.deepEqual(popup.sent.at(-1).shortcuts[0], { key: "w", value: "Ư" });
	});

	// Save and Add go disabled with the feature; Back must not, or the screen has no way out
	it("stays enabled when shortcuts are turned off", () => {
		const popup = openShortcuts({ shortcutsOn: 0, shortcuts: STORED });

		assert.equal(popup.element("backToMain").disabled, false);
		assert.equal(popup.element("saveShortcuts").disabled, true);
	});

	it("still navigates once the screen is reopened", () => {
		const popup = openShortcuts(ENABLED);

		popup.fire("backToMain", "click");
		popup.fire("openShortcuts", "click");
		popup.fire("backToMain", "click");

		assert.equal(popup.element("shortcutScreen").style.display, "none");
	});
});

describe("The shortcut screen labels come from the locale file", () => {
	const labels = [
		["txtOpenShortcuts", "extPopupOpenShortcuts"],
		["txtBack", "extPopupBack"],
		["txtShortcuts", "extPopupShortcuts"],
		["txtShortcutsOn", "extPopupShortcutsOn"],
		["txtAddShortcut", "extPopupAddShortcut"],
		["txtSaveShortcuts", "extPopupSaveShortcuts"],
	];

	for (const [elementId, messageKey] of labels) {
		it(`#${elementId} shows "${enMessages[messageKey].message}"`, () => {
			const popup = loadPopup({});

			assert.equal(popup.element(elementId).textContent, enMessages[messageKey].message);
		});
	}
});

describe("Clicking the scrim closes the shortcut modal", () => {
	it("closes when the click lands on the scrim itself", () => {
		const popup = openShortcuts(ENABLED);

		popup.fire("shortcutScreen", "click", { target: popup.element("shortcutScreen") });

		assert.equal(popup.element("shortcutScreen").style.display, "none");
	});

	it("stays open when the click lands inside the card", () => {
		const popup = openShortcuts(ENABLED);

		popup.fire("shortcutScreen", "click", { target: popup.element("shortcutList") });

		assert.equal(popup.element("shortcutScreen").style.display, "");
	});

	it("stores nothing, same as Back", () => {
		const popup = openShortcuts(ENABLED);
		popup.shortcutRows()[0].resultInput.value = "Ư";

		popup.fire("shortcutScreen", "click", { target: popup.element("shortcutScreen") });

		assert.deepEqual(popup.writes(), []);
	});
});

describe("Opening the modal moves focus off the main screen", () => {
	it("focuses Back", () => {
		const popup = openShortcuts(ENABLED);

		assert.equal(popup.element("backToMain").focused, true);
	});

	const inertCases = [
		["while the modal is open", (popup) => popup, true],
		["once Back closes it", (popup) => (popup.fire("backToMain", "click"), popup), false],
		["once Save closes it", (popup) => (popup.fire("saveShortcuts", "click"), popup), false],
	];

	for (const [label, act, inert] of inertCases) {
		it(`marks the main screen inert=${inert} ${label}`, () => {
			const popup = act(openShortcuts(ENABLED));

			assert.equal(popup.element("mainScreen").inert, inert);
		});
	}

	it("leaves the main screen alive on load", () => {
		const popup = loadPopup({ prefs: ENABLED });

		assert.equal(popup.element("mainScreen").inert, false);
	});
});

describe("Enter inside a row is the keyboard route to Add", () => {
	function enter(key = "Enter") {
		let prevented = false;
		return { key, preventDefault() { prevented = true; }, wasPrevented: () => prevented };
	}

	const fields = ["keyInput", "resultInput"];

	for (const field of fields) {
		it(`adds a row from the ${field}`, () => {
			const popup = openShortcuts(ENABLED);
			const before = popup.shortcutRows().length;

			popup.fireOn(popup.shortcutRows()[0][field], "keydown", enter());

			assert.equal(popup.shortcutRows().length, before + 1);
		});

		it(`focuses the new row's key field from the ${field}`, () => {
			const popup = openShortcuts(ENABLED);

			popup.fireOn(popup.shortcutRows()[0][field], "keydown", enter());
			const rows = popup.shortcutRows();

			assert.equal(rows.at(-1).keyInput.focused, true);
			assert.equal(rows.at(-1).keyInput.value, "");
		});

		it(`claims the event from the ${field}`, () => {
			const popup = openShortcuts(ENABLED);
			const event = enter();

			popup.fireOn(popup.shortcutRows()[0][field], "keydown", event);

			assert.equal(event.wasPrevented(), true);
		});
	}

	it("leaves every other key alone", () => {
		const popup = openShortcuts(ENABLED);
		const before = popup.shortcutRows().length;
		const event = enter("a");

		popup.fireOn(popup.shortcutRows()[0].keyInput, "keydown", event);

		assert.equal(popup.shortcutRows().length, before);
		assert.equal(event.wasPrevented(), false);
	});

	it("stores nothing until Save", () => {
		const popup = openShortcuts(ENABLED);

		popup.fireOn(popup.shortcutRows()[0].keyInput, "keydown", enter());

		assert.deepEqual(popup.writes(), []);
	});
});

describe("Add and Save share one footer row", () => {
	it("puts both buttons in the same parent", () => {
		const html = fs.readFileSync(path.join(import.meta.dirname, "..", "src", "popup.html"), "utf8");
		const footer = html.match(/<div class="buttonRow">\s*<button[^>]*id="addShortcut"[\s\S]*?<\/div>/);

		assert.ok(footer, "addShortcut is no longer the first button of a buttonRow");
		assert.match(footer[0], /id="saveShortcuts"/, "saveShortcuts left the row addShortcut is in");
	});
});

describe("Closing the modal puts focus back in the fast input", () => {
	const closers = [
		["Back", (popup) => popup.fire("backToMain", "click")],
		["Save", (popup) => popup.fire("saveShortcuts", "click")],
		["the scrim", (popup) => popup.fire("shortcutScreen", "click", { target: popup.element("shortcutScreen") })],
	];

	for (const [label, close] of closers) {
		it(`focuses the textarea after ${label}, whatever opened the modal`, () => {
			const popup = loadPopup({ prefs: ENABLED, demoText: "chào" });
			popup.element("openShortcuts").focus();

			popup.fire("openShortcuts", "click");
			assert.equal(popup.activeElement().id, "backToMain");
			close(popup);

			assert.equal(popup.activeElement().id, "inputDemo");
			assert.equal(popup.element("inputDemo").focused, true);
		});
	}

	it("leaves the autofocused textarea alone at load", () => {
		const popup = loadPopup({ demoText: "chào" });

		assert.equal(popup.activeElement().id, "inputDemo");
	});

	it("clears inert as it closes", () => {
		const popup = loadPopup({ prefs: ENABLED, demoText: "chào" });

		popup.fire("openShortcuts", "click");
		popup.fire("backToMain", "click");

		assert.equal(popup.element("mainScreen").inert, false);
		assert.equal(popup.activeElement().id, "inputDemo");
	});
});
