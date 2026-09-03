import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import {
	resolveChromium,
	startFrameworkEditorServer,
	launchExtension,
	typeUntil,
} from "./helpers/browser-harness.js";

/**
 * The editors AVIM has to share a contenteditable with, run for real instead of mocked. Slate is
 * #30 itself and CKEditor reverts the same way; the other three are the regression guard, because
 * they reconcile a silent DOM edit and an announcement meant for the reverters corrupts them.
 */

const CDN = "https://esm.sh/slate@0.112.0";

async function resolveCdn() {
	try {
		const response = await fetch(CDN, { method: "HEAD", signal: AbortSignal.timeout(10000) });
		return response.ok ? {} : { skip: `${CDN} answered ${response.status}` };
	} catch (error) {
		return { skip: `no network for ${CDN}: ${error.message}` };
	}
}

const RECONCILING = [
	["Lexical, as Facebook and Messenger use", "lexical", "#lexical"],
	["Quill", "quill", "#quillRoot .ql-editor"],
	["ProseMirror", "prosemirror", "#pmRoot .ProseMirror"],
];

const launcher = await resolveChromium();
const cdn = await resolveCdn();

// src/ only: browser-smoke already runs the whole surface against build/ as well.
describe("Editor frameworks, loaded from the CDN", { skip: launcher.skip ?? cdn.skip }, () => {
	let extension;
	let server;
	let page;

	before(async () => {
		server = await startFrameworkEditorServer();
		extension = await launchExtension(launcher, "src");
		page = await extension.context.newPage();
		await page.goto(server.origin);
		await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
		assert.deepEqual(await page.evaluate(() => window.__loadErrors), [], "an editor failed to load");
		// Same gate as browser-smoke: without it a failure below could just be a late content script
		const ready = await typeUntil(page, "#ready", "chaof", "chào");
		assert.equal(ready, "chào", "content script never attached; every result below is noise");
	});

	after(async () => {
		if (extension) {
			await extension.close();
		}
		if (server) {
			await server.close();
		}
	});

	async function retype(name, selector, sequence, delay = 30) {
		const locator = page.locator(selector);
		await locator.click();
		// One Ctrl+A/Delete round is not always enough: the editor applies it asynchronously, and
		// typing into a half-cleared model produced garbage measurements. Poll until truly empty.
		for (let round = 0; round < 5; round++) {
			await page.keyboard.press("Control+A");
			await page.keyboard.press("Delete");
			await page.waitForTimeout(150);
			if (await page.evaluate((key) => window.__modelText[key](), name) === "") {
				break;
			}
		}
		await page.keyboard.type(sequence, { delay });
		await page.waitForTimeout(300);

		return {
			dom: await locator.evaluate((element) => element.value ?? element.textContent),
			model: await page.evaluate((key) => window.__modelText[key](), name),
		};
	}

	// Slate re-renders from its own model, so a DOM edit it never saw would be reverted. Slate
	// hosts are recognised by their DOM attributes and announced to as one targeted insertText
	// from the very first conversion, so the model always agrees and nothing is lost.
	it("Slate keeps every conversion, in the DOM and in its model", async () => {
		const first = await retype("slate", "#slate", "tieengs Vieejt");
		assert.equal(first.dom, "tiếng Việt", "correct from the very first conversion in the host");
		assert.equal(first.model, "tiếng Việt", "and the model agrees, which is the point of #30");

		const again = await retype("slate", "#slate", "tieengs Vieejt");
		assert.equal(again.dom, "tiếng Việt");
		assert.equal(again.model, "tiếng Việt");

		// the exact report in #30: on Discord the diacritics vanished at the space AFTER the word
		const spaced = await retype("slate", "#slate", "chaof anh");
		assert.equal(spaced.dom, "chào anh");
		assert.equal(spaced.model, "chào anh");

		// Enter right after the tone: what a chat box sends must already carry the diacritics
		const entered = await retype("slate", "#slate", "chaof\n");
		assert.equal(entered.model, "chào\n");
	});

	it("Slate survives everyday typing around the happy path", async () => {
		// escape sequences: repeating the modifier key takes the transform back (memory of #3810)
		const escaped = await retype("slate", "#slate", "vaof ddd");
		assert.equal(escaped.model, "vào dd");
		const doubled = await retype("slate", "#slate", "aaa");
		assert.equal(doubled.model, "aa");

		// correcting a typo with backspace, then finishing the word
		await retype("slate", "#slate", "chao");
		await page.keyboard.press("Backspace");
		await page.keyboard.type("of", { delay: 30 });
		await page.waitForTimeout(300);
		assert.equal(await page.evaluate(() => window.__modelText.slate()), "chào");

		// clicking back into the middle of a line to add a missing tone
		await retype("slate", "#slate", "chao xin");
		for (let i = 0; i < 4; i++) {
			await page.keyboard.press("ArrowLeft");
		}
		await page.keyboard.type("f", { delay: 30 });
		await page.waitForTimeout(300);
		assert.equal(await page.evaluate(() => window.__modelText.slate()), "chào xin");

		// arrowing back inside a word to add a missed letter: kho|ng + o -> không
		await retype("slate", "#slate", "khong em");
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press("ArrowLeft");
		}
		await page.keyboard.type("o", { delay: 30 });
		await page.waitForTimeout(300);
		assert.equal(await page.evaluate(() => window.__modelText.slate()), "không em");
		await page.keyboard.type("o", { delay: 30 });
		await page.waitForTimeout(300);
		assert.equal(await page.evaluate(() => window.__modelText.slate()), "khoong em",
			"repeating the key mid-word escapes the transform");

		// VNI: the default method is auto, so digit modifiers must work too
		const vni = await retype("slate", "#slate", "chao2 anh");
		assert.equal(vni.model, "chào anh");

		// pasting a bare word, then adding the tone by keyboard
		await retype("slate", "#slate", "");
		await page.evaluate(() => {
			const data = new DataTransfer();
			data.setData("text/plain", "chao");
			document.getElementById("slate").dispatchEvent(new ClipboardEvent("paste", {
				clipboardData: data, bubbles: true, cancelable: true,
			}));
		});
		await page.waitForTimeout(200);
		await page.keyboard.type("f", { delay: 30 });
		await page.waitForTimeout(300);
		assert.equal(await page.evaluate(() => window.__modelText.slate()), "chào");
	});

	it("Slate keeps up with typing at full speed", async () => {
		const rushed = await retype("slate", "#slate", "tieengs Vieejt", 0);
		assert.equal(rushed.model, "tiếng Việt");
	});

	for (const [label, name, selector] of RECONCILING) {
		it(`${label} converts on the first try, in the DOM and in its model`, async () => {
			const typed = await retype(name, selector, "tieengs Vieejt");

			assert.equal(typed.dom, "tiếng Việt");
			assert.equal(typed.model, "tiếng Việt");
		});
	}

	// A controlled input diverges the same way a model-backed editor does, just without an editor:
	// the page reads the component's state, so assigning el.value showed the user "chào" while the
	// form submitted "chao". React makes it worse than silent — its value tracker swallows an input
	// event dispatched after the assignment, so the obvious fix does not work and execCommand is
	// what does.
	for (const [label, selector] of [["input", "#reactInput"], ["textarea", "#reactArea"]]) {
		it(`a controlled React ${label} gets the diacritics in its own state`, async () => {
			const typed = await retype("reactField", selector, "tieengs Vieejt");

			assert.equal(typed.dom, "tiếng Việt");
			assert.equal(typed.model, "tiếng Việt", "the DOM can be right while the app reads this");
		});
	}

	// CKEditor reverts a silent DOM edit exactly like Slate, and it builds the insertion target
	// from getTargetRanges() alone — with no range it drops the insertion and keeps the deletes.
	// So it gets the same announcement as Slate, whose one insertText carries the target range.
	it("CKEditor keeps the diacritics, in the DOM and in its model", async () => {
		const typed = await retype("ckeditor", ".ck-editor__editable", "tieengs Vieejt");
		assert.equal(typed.dom, "tiếng Việt");
		assert.equal(typed.model, "tiếng Việt");

		const spaced = await retype("ckeditor", ".ck-editor__editable", "chaof anh");
		assert.equal(spaced.model, "chào anh");

		const escaped = await retype("ckeditor", ".ck-editor__editable", "vaof ddd");
		assert.equal(escaped.model, "vào dd");
	});
});
