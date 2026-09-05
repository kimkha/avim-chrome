import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import {
	resolveChromium,
	extensionDirs,
	launchExtension,
} from "./helpers/browser-harness.js";

const ROOT = path.join(import.meta.dirname, "..");

/** Real Docs needs a Google login and cannot be automated. */
const DOCS_PAGE = `<!DOCTYPE html><html><body>
<div id="model"></div>
<script>
(() => {
	let text = "\\u0003";
	let selStart = 1;
	let selEnd = 1;
	// Retires every object already handed out, as Docs does when it rebuilds its model
	let generation = 0;
	const mirror = () => { document.getElementById("model").textContent = text; };
	mirror();

	function wireIframe() {
		const frame = document.createElement("iframe");
		frame.className = "docs-texteventtarget-iframe";
		document.body.appendChild(frame);

		const fdoc = frame.contentDocument;
		const editable = fdoc.createElement("div");
		editable.setAttribute("contenteditable", "true");
		editable.tabIndex = 0;
		fdoc.body.appendChild(editable);

		editable.addEventListener("keypress", (event) => {
			if (event.key.length !== 1) { return; }
			event.preventDefault();
			text = text.slice(0, selStart) + event.key + text.slice(selEnd);
			selStart += 1;
			selEnd = selStart;
			editable.textContent = "";
			mirror();
		});

		editable.addEventListener("beforeinput", (event) => {
			if (event.inputType !== "insertText") { return; }
			event.preventDefault();
			const from = selStart;
			text = text.slice(0, from) + event.data + text.slice(selEnd);
			selStart = from;
			selEnd = from + event.data.length;
			mirror();
		});

		return frame;
	}

	let frame = wireIframe();

	const annotatedAt = (issued) => {
		const live = () => {
			if (issued !== generation) { throw new Error("annotated object retired"); }
		};
		return {
			getText: () => { live(); return text; },
			getSelection: () => { live(); return [{ start: selStart, end: selEnd }]; },
			setSelection: (start, end) => { live(); selStart = start; selEnd = end; },
		};
	};

	window._docs_annotate_getAnnotatedText = () => Promise.resolve(annotatedAt(generation));
	window.__avimRetireAnnotated = () => { generation += 1; };
	window.__avimReplaceIframe = () => { frame.remove(); frame = wireIframe(); };
	window.__avimSetText = (value) => {
		text = value;
		selStart = value.length;
		selEnd = selStart;
		mirror();
	};
})();
</script>
</body></html>`;

const BRIDGE_PATH = path.join("chrome", "gdocs-bridge.js");

function startServer() {
	const server = http.createServer((request, response) => {
		response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
		response.end(DOCS_PAGE);
	});
	return new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () =>
			resolve({
				origin: `http://127.0.0.1:${server.address().port}`,
				close: () => new Promise((done) => server.close(done)),
			}));
	});
}

const launcher = await resolveChromium();

for (const dir of extensionDirs()) {
	describe(`${dir}/ against a stand-in for Google Docs`, { skip: launcher.skip }, () => {
		let extension;
		let server;
		let page;

		before(async () => {
			server = await startServer();
			extension = await launchExtension(launcher, dir);
			page = await extension.context.newPage();
			// Read out of the directory under test, so build/ exercises the minified copy.
			await page.addInitScript({
				content: fs.readFileSync(path.join(ROOT, dir, BRIDGE_PATH), "utf8"),
			});
		});

		after(async () => {
			await extension?.close();
			await server?.close();
		});

		const model = () => page.locator("#model").textContent();
		const editable = () => page
			.frameLocator("iframe.docs-texteventtarget-iframe")
			.locator("[contenteditable=\"true\"]");

		async function focusEditor() {
			await page.locator("body").click();
			await editable().click();
		}

		/** The content script lands at document_idle and boots off an async get_prefs. */
		async function typeUntilSettled(sequence, expected) {
			let text = "";
			for (let attempt = 0; attempt < 5; attempt++) {
				await page.goto(server.origin);
				await focusEditor();
				await page.keyboard.type(sequence, { delay: 30 });
				await page.waitForTimeout(150);
				text = await model();
				if (text === expected) {
					return text;
				}
				await page.waitForTimeout(400);
			}
			return text;
		}

		/** Each attempt reloads, so every one gets a fresh session and its own first keystroke. */
		async function pressUntilSettled(preset, key, expected) {
			let text = "";
			for (let attempt = 0; attempt < 5; attempt++) {
				await page.goto(server.origin);
				await focusEditor();
				await page.evaluate((value) => window.__avimSetText(value), preset);
				await page.keyboard.press(key);
				await page.waitForTimeout(150);
				text = await model();
				if (text === expected) {
					return text;
				}
				await page.waitForTimeout(400);
			}
			return text;
		}

		async function converting() {
			const text = await typeUntilSettled("chaof", "\u0003chào");
			assert.equal(text, "\u0003chào", "AVIM never converted, so there is nothing to disrupt");
		}

		it("sets the annotation flag in the page's own world", async () => {
			await page.goto(server.origin);
			assert.equal(
				await page.evaluate(() => window._docs_annotate_canvas_by_ext),
				"opgbbffpdglhkpglnlkiclakjlpiedoh",
			);
		});

		it("converts on the session's first keystroke", async () => {
			assert.equal(await pressUntilSettled("\u0003chao", "f", "\u0003chào"), "\u0003chào");
		});

		it("converts a word Docs itself typed", async () => {
			assert.equal(await typeUntilSettled("chaof", "\u0003chào"), "\u0003chào");
		});

		// Without the bridge collapsing the caret, the next keystroke replaces the word.
		it("keeps typing after a conversion", async () => {
			assert.equal(await typeUntilSettled("chaof ok", "\u0003chào ok"), "\u0003chào ok");
		});

		it("converts a second word in the same line", async () => {
			assert.equal(await typeUntilSettled("xin chaof", "\u0003xin chào"), "\u0003xin chào");
		});

		it("takes a fresh annotated object when the cached one is retired", async () => {
			await converting();
			await page.evaluate(() => window.__avimRetireAnnotated());
			await page.keyboard.type(" chaof", { delay: 30 });
			await page.waitForTimeout(400);
			assert.equal(await model(), "\u0003chào chào");
		});

		it("reattaches when the text-event iframe is replaced", async () => {
			await converting();
			await page.evaluate(() => window.__avimReplaceIframe());
			await focusEditor();
			await page.keyboard.type(" chaof", { delay: 30 });
			await page.waitForTimeout(400);
			assert.equal(await model(), "\u0003chào chào");
		});
	});
}
