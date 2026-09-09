/**
 * What the ChromeOS half of the extension cannot be checked for anywhere else: that ash reports
 * os == "cros", that chrome.input.ime exists at all, and that the OS accepted our input_components
 * entry. Everything here is about registration; the transform itself is covered by the unit suites.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { launchChromeOs, resolveChromeOs, serveTextField } from "./helpers/chromeos-harness.js";

const ENGINE_ID = "avim";
const DISPLAY_NAME = "Vietnamese - AVIM";

const resolved = await resolveChromeOs();

describe("build/ loaded in ash-chrome", { skip: resolved.skip }, () => {
	let session;
	let extensionPage;

	before(async () => {
		session = await launchChromeOs(resolved.build);
		extensionPage = await session.openExtensionPage();
	});

	after(async () => {
		await session?.close();
	});

	it("really is ChromeOS, not desktop Chromium", async () => {
		const os = await extensionPage.evaluate(
			() => new Promise((resolve) => chrome.runtime.getPlatformInfo((info) => resolve(info.os))),
		);
		assert.equal(os, "cros");
	});

	// Missing members mean the ime.js loop has no way to run, whatever the manifest says.
	it("hands the extension the input method API", async () => {
		const api = await extensionPage.evaluate(() => {
			const ime = chrome.input?.ime;
			return ime
				? Object.fromEntries(
					[
						"setComposition",
						"commitText",
						"clearComposition",
						"deleteSurroundingText",
						"setMenuItems",
					].map((name) => [name, typeof ime[name]]),
				)
				: null;
		});
		assert.notEqual(api, null, "chrome.input.ime is undefined; is this really the ChromeOS build?");
		for (const [name, type] of Object.entries(api)) {
			assert.equal(type, "function", `chrome.input.ime.${name} is ${type}`);
		}
	});

	it("delivers the key and lifecycle events the loop listens for", async () => {
		const events = await extensionPage.evaluate(() =>
			["onActivate", "onFocus", "onBlur", "onReset", "onKeyEvent", "onSurroundingTextChanged",
				"onMenuItemActivated"].map((name) => [name, typeof chrome.input?.ime?.[name]?.addListener]),
		);
		for (const [name, type] of events) {
			assert.equal(type, "function", `chrome.input.ime.${name}.addListener is ${type}`);
		}
	});

	it("keeps the ChromeOS manifest keys through packaging", async () => {
		const manifest = await extensionPage.evaluate(() => chrome.runtime.getManifest());
		assert.ok(manifest.permissions.includes("input"));
		assert.equal(manifest.input_components.length, 1);
		assert.equal(manifest.input_components[0].id, ENGINE_ID);
	});

	// Behaviour, not identifiers: build/ is minified with mangle.toplevel, so every name ime.js and the
	// engine declare is gone. Registered listeners are the only thing left to observe from outside.
	it("pulls the IME loop into the service worker and registers it", async () => {
		const worker = await session.serviceWorker();
		const listening = await worker.evaluate(() => {
			const ime = chrome.input.ime;
			return Object.fromEntries(
				["onActivate", "onFocus", "onBlur", "onReset", "onKeyEvent", "onMenuItemActivated"].map(
					(name) => [name, ime[name].hasListeners()],
				),
			);
		});
		for (const [name, live] of Object.entries(listening)) {
			assert.equal(live, true, `nothing listens to ${name}; did importScripts run?`);
		}
	});

	it("listens for the prefs it cannot be pushed", async () => {
		const worker = await session.serviceWorker();
		assert.equal(await worker.evaluate(() => chrome.storage.onChanged.hasListeners()), true);
	});

	// The registry, not the settings UI: a shadow-DOM walk of chrome://os-settings returns stylesheet
	// text, and the osLanguages/input deep link does not render under a stub login.
	it("registers with the OS as a Vietnamese input method", async () => {
		const settings = await session.openSettings();
		const imes = await settings.evaluate(
			() =>
				new Promise((resolve) =>
					chrome.languageSettingsPrivate.getInputMethodLists((lists) =>
						resolve(lists.thirdPartyExtensionImes ?? []),
					),
				),
		);
		assert.equal(imes.length, 1, `expected only ours, got ${imes.map((ime) => ime.displayName).join(", ")}`);
		const [ime] = imes;
		assert.equal(ime.displayName, DISPLAY_NAME);
		assert.deepEqual(ime.languageCodes, ["vi"]);
		// _ext_ime_<extension_id><engine_id> is also what settings.language.preload_engines wants.
		assert.equal(ime.id, `_ext_ime_${session.extensionId}${ENGINE_ID}`);
	});
});

/**
 * The real thing: X keystrokes into ash, through the OS input pipeline, into a page. CDP key events
 * enter at the renderer, downstream of the IME, so they would prove nothing here.
 */
describe("Typing through the input method", { skip: resolved.skip }, () => {
	let session;
	let fixture;
	let page;
	let usKeyboard;

	before(async () => {
		session = await launchChromeOs(resolved.build);
		fixture = await serveTextField(
			"<!doctype html><meta charset=utf-8><body><input id=probe><div id=rich contenteditable></div>",
		);
		usKeyboard = await session.currentInputMethod();
		page = await session.openUrl(fixture.origin);
	});

	after(async () => {
		await session?.close();
		await fixture?.close();
	});

	/**
	 * Blur before clearing: an IME keeps its composition buffer across a value the page sets itself, so
	 * without the round trip through onBlur each case would start with the last one's word in hand.
	 */
	async function typeInto(keys) {
		await page.evaluate(() => {
			const field = document.getElementById("probe");
			field.blur();
			field.value = "";
		});
		await page.waitForTimeout(200);
		await page.evaluate(() => document.getElementById("probe").focus());
		await page.waitForTimeout(300);
		await session.typeKeys(page, keys);
		return page.evaluate(() => document.getElementById("probe").value);
	}

	/** Presets text the IME did not type, then puts the caret in it: the Step 4 starting point. */
	async function typeAfter(value, caret, keys, id = "probe") {
		await page.evaluate(({ value, caret, id }) => {
			const node = document.getElementById(id);
			node.blur();
			if (node.tagName === "INPUT") {
				node.value = value;
				node.focus();
				node.setSelectionRange(caret, caret);
				return;
			}
			node.textContent = value;
			node.focus();
			const range = document.createRange();
			range.setStart(node.firstChild ?? node, caret);
			range.collapse(true);
			const selection = getSelection();
			selection.removeAllRanges();
			selection.addRange(range);
		}, { value, caret, id });
		await page.waitForTimeout(600);
		await session.typeKeys(page, keys);
		return page.evaluate((id) => {
			const node = document.getElementById(id);
			return node.tagName === "INPUT" ? node.value : node.textContent;
		}, id);
	}

	it("switches the OS to AVIM", async () => {
		assert.equal(await session.setInputMethod(session.imeId), session.imeId);
	});

	it("types Vietnamese from Telex keystrokes", async () => {
		assert.equal(await typeInto(["c", "h", "a", "o", "f"]), "chào");
	});

	it("commits the word when the space lands", async () => {
		assert.equal(await typeInto(["c", "h", "a", "o", "f", "space"]), "chào ");
	});

	it("escapes the transform on a repeated key", async () => {
		assert.equal(await typeInto(["a", "a", "a"]), "aa");
	});

	it("takes a key back on backspace", async () => {
		assert.equal(await typeInto(["c", "h", "a", "o", "f", "BackSpace"]), "chà");
	});

	it("puts the tone on a word it never typed", async () => {
		assert.equal(await typeAfter("hoa", 3, ["f"]), "hòa");
	});

	it("fixes the word the caret is in, leaving the rest of the line", async () => {
		assert.equal(await typeAfter("hoa binh", 3, ["f"]), "hòa binh");
	});

	it("keeps spelling a word that was already there", async () => {
		assert.equal(await typeAfter("ngu", 3, ["o", "w", "i"]), "ngươi");
	});

	it("starts a new word rather than reaching across a space", async () => {
		assert.equal(await typeAfter("hoa ", 4, ["b", "a", "n"]), "hoa ban");
	});

	it("leaves existing text alone when the key changes nothing", async () => {
		assert.equal(await typeAfter("hoa", 3, ["space"]), "hoa ");
	});

	it("fixes a word in a contenteditable too", async () => {
		assert.equal(await typeAfter("hoa", 3, ["f"], "rich"), "hòa");
	});

	// Adopting a word puts it into an unfinished composition, so losing focus must not lose the text.
	it("keeps the word when focus leaves mid-composition", async () => {
		assert.equal(await typeAfter("hoa", 3, ["f"]), "hòa");
		await page.evaluate(() => document.getElementById("rich").focus());
		await page.waitForTimeout(600);
		assert.equal(await page.evaluate(() => document.getElementById("probe").value), "hòa");
	});

	/**
	 * The transform could plausibly run twice here — the page has the content script on it too. It does
	 * not: a key the IME consumes never reaches the page as a character keypress, which is the only
	 * thing the content script acts on. The US-keyboard case above it proves the content script is live.
	 */
	it("does not transform twice on a page the content script is on", async () => {
		assert.equal(await session.setInputMethod(usKeyboard), usKeyboard);
		assert.equal(await typeInto(["c", "h", "a", "o", "f", "space"]), "chào ", "content script is idle");

		assert.equal(await session.setInputMethod(session.imeId), session.imeId);
		assert.equal(await typeInto(["c", "h", "a", "o", "f", "space"]), "chào ");
	});
});
