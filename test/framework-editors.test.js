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
 * #30 itself; the other three are the regression guard, because they reconcile a silent DOM edit
 * and an announcement meant for Slate corrupts them.
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

	async function retype(name, selector, sequence) {
		const locator = page.locator(selector);
		await locator.click();
		await page.keyboard.press("Control+A");
		await page.keyboard.press("Delete");
		await page.waitForTimeout(150);
		await page.keyboard.type(sequence, { delay: 30 });
		await page.waitForTimeout(300);

		return {
			dom: await locator.evaluate((element) => element.value ?? element.textContent),
			model: await page.evaluate((key) => window.__modelText[key](), name),
		};
	}

	// Slate re-renders from its own model, so it reverts the edit AVIM applies to the DOM. AVIM
	// cannot ask which editors do that, so it watches for one revert and then announces its rewrite
	// to that host as backspaces plus an insertion. A revert only shows up one keystroke late, so
	// the conversion that exposes the host is the one that pays for it.
	it("Slate loses only the conversion that exposes it, then stays correct", async () => {
		const learning = await retype("slate", "#slate", "tieengs Vieejt");
		assert.equal(learning.dom, "tiéng Việt", "the ê is lost while the host is still unknown");
		assert.equal(learning.model, "tiéng Việt", "and the model agrees, which is the point of #30");

		const adapted = await retype("slate", "#slate", "tieengs Vieejt");
		assert.equal(adapted.dom, "tiếng Việt");
		assert.equal(adapted.model, "tiếng Việt");

		// the exact report in #30: on Discord the diacritics vanished at the space AFTER the word
		const spaced = await retype("slate", "#slate", "chaof anh");
		assert.equal(spaced.dom, "chào anh");
		assert.equal(spaced.model, "chào anh");
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

	// CKEditor reverts a silent DOM edit exactly like Slate, so it is tempting to announce to it as
	// well, and it reads getTargetRanges() unconditionally: it drops the range-less insertion, keeps
	// the deletes and throws internally, which is worse than the diacritics it loses today. This
	// asserts the losing, so that anything that turns the announcement into a learned capability
	// instead of an allowlist fails here rather than on someone's CMS.
	it("Known issue: CKEditor loses the diacritics, and must not get worse than that", async () => {
		const typed = await retype("ckeditor", ".ck-editor__editable", "tieengs Vieejt");

		assert.equal(typed.dom, "tieng Viet");
		assert.equal(typed.model, "tieng Viet");
	});
});
