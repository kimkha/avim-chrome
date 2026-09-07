import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import { resolveFirefox, launchFirefoxExtension, GECKO_ID } from "./helpers/firefox-harness.js";

const firefox = resolveFirefox();

describe("dist/avim-firefox zip loaded in Firefox", { skip: firefox.skip }, () => {
	let popup;

	before(async () => {
		popup = await launchFirefoxExtension(firefox.zip);
	});

	after(async () => {
		await popup?.close();
	});

	it("installs as a temporary add-on", () => {
		assert.equal(popup.addonId, GECKO_ID);
	});

	it("reaches the popup at its own moz-extension origin", () => {
		assert.match(String(popup.popupUrl), /^moz-extension:\/\/[\da-f-]+\/popup\.html$/);
	});

	it("builds the popup and loads preferences from the background script", async () => {
		const state = await popup.evaluate(`return {
			mainScreen: !!document.getElementById("mainScreen"),
			off: document.getElementById("off").checked,
			auto: document.getElementById("auto").checked,
		};`);
		assert.deepEqual(state, { mainScreen: true, off: false, auto: true });
	});

	it("localises the buttons the popup ships", async () => {
		const labels = await popup.evaluate(`return {
			search: document.getElementById("txtSearch").textContent,
			shortcuts: document.getElementById("txtShortcuts").textContent,
		};`);
		assert.equal(labels.search, "Search");
		assert.equal(labels.shortcuts, "Shortcut keys");
	});

	it("exposes the search API the Search button calls", async () => {
		const api = await popup.evaluate(`return {
			chromeSearch: typeof chrome?.search?.query,
			browserSearch: typeof browser?.search?.query,
			runtimeSend: typeof chrome?.runtime?.sendMessage,
		};`);
		assert.deepEqual(api, { chromeSearch: "function", browserSearch: "function", runtimeSend: "function" });
	});

	it("binds Ctrl+Shift+V to the reserved action command", async () => {
		const commands = await popup.evaluateAsync(`
			const done = arguments[0];
			(browser ?? chrome).commands.getAll().then(
				(all) => done(all.map((command) => [command.name, command.shortcut])),
				(error) => done([["error", error.message]]),
			);
		`);
		assert.deepEqual(commands, [["_execute_action", "Ctrl+Shift+V"]]);
	});

	it("supports the CSS and DOM features the popup relies on", async () => {
		const support = await popup.evaluate(`return {
			has: CSS.supports("selector(:has(*))"),
			backdropFilter: CSS.supports("backdrop-filter", "blur(3px)"),
			inert: "inert" in document.createElement("div"),
		};`);
		assert.deepEqual(support, { has: true, backdropFilter: true, inert: true });
	});

	it("converts Telex typed into the fast input", async () => {
		await popup.type("#inputDemo", "chaof tieengs Vieejt");
		await popup.settle();
		assert.equal(await popup.evaluate(`return document.getElementById("inputDemo").value;`), "chào tiếng Việt");
	});

	it("lays the popup out at the width and height Chromium reports", async () => {
		const box = await popup.evaluate(`
			const textarea = document.getElementById("inputDemo").getBoundingClientRect();
			return {
				bodyWidth: Math.round(document.body.getBoundingClientRect().width),
				textareaWidth: Math.round(textarea.width),
				textareaHeight: Math.round(textarea.height),
			};
		`);
		assert.equal(box.bodyWidth, 600);
		assert.equal(box.textareaWidth, 302);
		assert.ok(box.textareaHeight > 150, `fast input collapsed to its floor at ${box.textareaHeight}px`);
	});

	it("runs the tip across both columns, above them, without spreading the left column", async () => {
		const box = await popup.evaluate(`
			const tip = document.querySelector(".tip").getBoundingClientRect();
			const methods = document.querySelector(".paneMethods").getBoundingClientRect();
			const toggles = document.querySelector(".paneToggles").getBoundingClientRect();
			const scratch = document.querySelector(".paneScratch").getBoundingClientRect();
			return {
				spansBothColumns: Math.round(tip.left) === Math.round(methods.left)
					&& Math.round(tip.right) === Math.round(scratch.right),
				sitsAboveThem: Math.round(methods.top - tip.bottom),
				methodsToToggles: Math.round(toggles.top - methods.bottom),
			};
		`);
		assert.ok(box.spansBothColumns, "the tip no longer runs the full width");
		assert.equal(box.sitsAboveThem, 10);
		assert.equal(box.methodsToToggles, 10, `the left column spread to ${box.methodsToToggles}px`);
	});

	it("lines the four bottom buttons up in one row, both columns ending together", async () => {
		const box = await popup.evaluate(`
			const rows = [...document.querySelectorAll(".paneScratch .buttonRow")];
			const right = rows[rows.length - 1].getBoundingClientRect();
			const left = document.querySelector(".paneToggles .buttonRow").getBoundingClientRect();
			const toggles = document.querySelector(".paneToggles").getBoundingClientRect();
			const scratch = document.querySelector(".paneScratch").getBoundingClientRect();
			return {
				leftTop: Math.round(left.top),
				rightTop: Math.round(right.top),
				leftBottom: Math.round(toggles.bottom),
				rightBottom: Math.round(scratch.bottom),
			};
		`);
		assert.equal(box.rightTop, box.leftTop, "the fast input is no longer sized to line the buttons up");
		assert.equal(box.rightBottom, box.leftBottom);
	});

	it("opens the shortcut modal over a main screen that stays visible but inert", async () => {
		await popup.click("#openShortcuts");
		await popup.settle();
		const state = await popup.evaluate(`return {
			modal: getComputedStyle(document.getElementById("shortcutScreen")).display,
			mainInert: document.getElementById("mainScreen").inert,
			mainVisible: getComputedStyle(document.getElementById("mainScreen")).display !== "none",
			focus: document.activeElement?.id,
		};`);
		assert.deepEqual(state, { modal: "flex", mainInert: true, mainVisible: true, focus: "backToMain" });
	});

	it("returns focus to the fast input when the modal closes", async () => {
		await popup.click("#backToMain");
		await popup.settle();
		const state = await popup.evaluate(`return {
			modal: getComputedStyle(document.getElementById("shortcutScreen")).display,
			mainInert: document.getElementById("mainScreen").inert,
			focus: document.activeElement?.id,
		};`);
		assert.deepEqual(state, { modal: "none", mainInert: false, focus: "inputDemo" });
	});
});
