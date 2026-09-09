/**
 * The ChromeOS input method loop. The engine never sees a caret here: the composition buffer is the
 * text before it, so these tests are the buffer state machine — what gets composed, what gets
 * committed, and which keys fall through to the app.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { loadIme } from "./helpers/ime-harness.js";

const TELEX = { method: "1" };
const VNI = { method: "2" };
const VIQR = { method: "3" };

describe("Composing a word", () => {
	it("composes the transform instead of committing it", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		const consumed = await ime.type("chaof");

		assert.deepEqual(consumed, [true, true, true, true, true]);
		assert.equal(ime.composed(), "chào");
		assert.deepEqual(ime.committed(), []);
	});

	it("commits the word when a space ends it", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		await ime.type("chaof");
		const consumed = await ime.press(" ");

		assert.equal(consumed, true, "the space is ours to type, or the app inserts it at the old caret");
		assert.deepEqual(ime.committed(), ["chào "]);
		assert.equal(ime.composed(), null);
	});

	it("starts the next word from empty", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		await ime.type("chaof ");
		await ime.type("tieengs");

		assert.deepEqual(ime.committed(), ["chào "]);
		assert.equal(ime.composed(), "tiếng");
	});

	// The engine double-applies a key it can already see: "cha" plus a would come out "châ" twice over.
	it("never hands the engine the key it is about to apply", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		await ime.type("chaa");

		assert.equal(ime.composed(), "châ");
	});

	// The buffer is empty on the first key, and the engine cannot read an empty editor at all.
	it("takes the first key without asking the engine", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		const consumed = await ime.press("c");

		assert.equal(consumed, true);
		assert.equal(ime.composed(), "c");
	});

	it("leaves a boundary key alone when no word is being composed", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		const consumed = await ime.press(" ");

		assert.equal(consumed, false, "with nothing composed the app types its own space");
		assert.deepEqual(ime.committed(), []);
	});

	/**
	 * The hardest engine invariant: repeating a key escapes the transform, and it does so by rewriting
	 * the text while reporting that it did not mean to type the key.
	 */
	it("escapes the transform when a key repeats", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		await ime.type("aaa");

		assert.equal(ime.composed(), "aa");
	});
});

describe("Editing what is composed", () => {
	it("shortens the composition on backspace", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		await ime.type("cha");
		const consumed = await ime.press("Backspace");

		assert.equal(consumed, true);
		assert.equal(ime.composed(), "ch");
	});

	it("clears the composition once backspace empties it", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		await ime.press("c");
		await ime.press("Backspace");

		assert.equal(ime.composed(), null);
	});

	it("gives backspace back to the app when nothing is composed", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		assert.equal(await ime.press("Backspace"), false);
	});
});

describe("Keys that belong to the app", () => {
	it("commits the word and passes Enter through", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		await ime.type("chaof");
		const consumed = await ime.press("Enter");

		assert.equal(consumed, false, "Enter does more than insert text");
		assert.deepEqual(ime.committed(), ["chào"], "the newline is the app's to add, not ours");
	});

	it("commits the word before an arrow key moves the caret", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		await ime.type("chaof");
		const consumed = await ime.press("Left");

		assert.equal(consumed, false);
		assert.deepEqual(ime.committed(), ["chào"]);
	});

	it("keeps its hands off a Ctrl chord", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		await ime.type("chaof");
		const consumed = await ime.press("a", { ctrlKey: true });

		assert.equal(consumed, false);
		assert.deepEqual(ime.committed(), ["chào"]);
	});

	// A comma never reaches the engine, but it still ends the word.
	it("commits the word and lets the app type a comma", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		await ime.type("chaof");
		const consumed = await ime.press(",");

		assert.equal(consumed, false);
		assert.deepEqual(ime.committed(), ["chào"]);
	});

	it("does nothing at all while AVIM is switched off", async () => {
		const ime = loadIme({ stored: { ...TELEX, onOff: "0" } });
		await ime.start();

		const consumed = await ime.type("chaof");

		assert.deepEqual(consumed, [false, false, false, false, false]);
		assert.deepEqual(ime.committed(), []);
	});
});

describe("The input method comes from the pref, not the engineID", () => {
	it("transforms VNI digits when the pref says VNI", async () => {
		const ime = loadIme({ stored: VNI });
		await ime.start();

		await ime.type("a1");

		assert.equal(ime.composed(), "á");
	});

	/** VIQR spends punctuation on tone marks, so a tone key must not be read as a word boundary. */
	it("keeps composing when VIQR spends a full stop on a tone", async () => {
		const ime = loadIme({ stored: VIQR });
		await ime.start();

		await ime.type("a.");

		assert.equal(ime.composed(), "ạ");
		assert.deepEqual(ime.committed(), []);
	});

	it("offers every method in the menu and ticks the current one", async () => {
		const ime = loadIme({ stored: VNI });
		await ime.start();

		const items = ime.menu();

		assert.deepEqual(items.map((item) => item.id), [
			"avim-method-0",
			"avim-method-1",
			"avim-method-2",
			"avim-method-3",
			"avim-method-4",
		]);
		assert.deepEqual(items.map((item) => item.style), Array(5).fill("radio"));
		assert.deepEqual(items.filter((item) => item.checked).map((item) => item.id), ["avim-method-2"]);
	});

	it("switches method from the menu and tells the content script", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		await ime.fire("onMenuItemActivated", "avim", "avim-method-2");
		await ime.type("a1");

		assert.equal(ime.storage.method, "2");
		assert.equal(ime.composed(), "á");
		assert.deepEqual(ime.pushedToTabs.at(-1)?.prefs.method, 2);
	});

	// An IME has no tab, so the push background.js sends content scripts never reaches it.
	it("picks up a method the popup changed, through storage", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		await ime.send({ save_prefs: "all", method: 2 });
		await ime.type("a1");

		assert.equal(ime.composed(), "á");
	});
});

describe("Context lifecycle", () => {
	it("drops the composition on reset without committing it", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		await ime.type("chaof");
		await ime.fire("onReset", "avim");

		assert.deepEqual(ime.committed(), [], "the app already threw the composition away");
		await ime.press("c");
		assert.equal(ime.composed(), "c");
	});

	it("starts clean in the next field", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		await ime.type("cha");
		await ime.fire("onBlur", 7);
		await ime.fire("onFocus", { contextID: 8 });
		await ime.press("t");

		assert.equal(ime.composed(), "t");
	});

	it("composes into the field that has focus", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start({ contextID: 42 });

		await ime.press("c");

		assert.equal(ime.calls.at(-1).contextID, 42);
	});
});

/**
 * Fixing a word that is already in the field. A composition-only IME cannot: once the word is
 * committed it belongs to the app. Reading the text around the caret is what buys it back, and it is
 * the one thing Unikey's IME does not do.
 */
describe("Adopting the word before the caret", () => {
	it("puts the tone on a word typed earlier", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();
		await ime.field("hoa");

		const consumed = await ime.press("f");

		assert.equal(consumed, true);
		assert.equal(ime.composed(), "hòa");
	});

	it("takes the word out of the field before composing it back", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();
		await ime.field("hoa");

		await ime.press("f");

		assert.deepEqual(ime.writes(), ["deleteSurroundingText", "setComposition"], "order matters");
		assert.deepEqual(ime.deletes(), [
			{ call: "deleteSurroundingText", engineID: "avim", contextID: 7, offset: -3, length: 3 },
		]);
	});

	it("adopts only the last word, not the whole line", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();
		await ime.field("xin chao ban hoa");

		await ime.press("f");

		assert.equal(ime.composed(), "hòa");
		assert.equal(ime.deletes()[0].length, 3);
	});

	it("reads the word before the caret, not the text after it", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();
		await ime.field("hoa binh", 3);

		await ime.press("f");

		assert.equal(ime.composed(), "hòa");
		assert.equal(ime.deletes()[0].length, 3);
	});

	it("keeps composing from the adopted word", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();
		await ime.field("ngu");

		await ime.press("o");
		await ime.press("w");
		await ime.press("i");

		assert.equal(ime.composed(), "ngươi", "the adopted word stays in hand for the keys after it");
		assert.equal(ime.deletes()[0].length, 3, "adopted once, on the first key");
	});

	it("commits when the adopted word plus the key ends it", async () => {
		const ime = loadIme({ stored: { ...TELEX, shortcutsOn: "1", shortcuts: JSON.stringify([{ key: "vn", value: "Việt Nam" }]) } });
		await ime.start();
		await ime.field("vn");

		const consumed = await ime.press(" ");

		assert.equal(consumed, true);
		assert.deepEqual(ime.committed(), ["Việt Nam "]);
		assert.equal(ime.deletes()[0].length, 2);
	});

	// Nothing to fix, so nothing may be rewritten: the delete would be visible for no reason.
	it("leaves the field alone when the key changes nothing", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();
		await ime.field("hoa");

		const consumed = await ime.press(" ");

		assert.equal(consumed, false);
		assert.deepEqual(ime.writes(), []);
	});

	it("starts a fresh word after a boundary", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();
		await ime.field("hoa ");

		await ime.press("b");

		assert.equal(ime.composed(), "b");
		assert.deepEqual(ime.deletes(), []);
	});

	it("does not touch a word while a selection is open", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();
		await ime.selection("hoa", 0, 3);

		await ime.press("f");

		assert.deepEqual(ime.deletes(), [], "the selection is what the key replaces, not the word");
		assert.equal(ime.composed(), "f");
	});

	it("waits for fresh surrounding text after its own commit", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();
		await ime.field("hoa");

		await ime.press("f");
		await ime.press(" ");
		await ime.press("f");

		assert.deepEqual(ime.committed(), ["hòa "]);
		assert.equal(ime.composed(), "f", "stale text would have adopted the committed word again");
	});

	it("has nothing to adopt before the OS reports the field", async () => {
		const ime = loadIme({ stored: TELEX });
		await ime.start();

		await ime.press("f");

		assert.deepEqual(ime.deletes(), []);
		assert.equal(ime.composed(), "f");
	});

	/** VIQR spends a full stop on a tone, so a boundary-looking key still has a word to fix. */
	it("fixes a word with a VIQR tone key", async () => {
		const ime = loadIme({ stored: VIQR });
		await ime.start();
		await ime.field("hoa");

		const consumed = await ime.press(".");

		assert.equal(consumed, true);
		assert.equal(ime.composed(), "họa");
	});
});
