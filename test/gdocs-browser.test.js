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

/**
 * A stand-in for Google Docs: the text lives in a variable, the editable is an empty div in an
 * about:blank iframe, and the only ways in are the annotation API and a beforeinput. Enough to
 * exercise the real bridge, whose whole job is to cross the isolated/main world boundary — the one
 * thing the node tests have to fake. Docs itself cannot be automated: it needs a Google login.
 */
const DOCS_PAGE = `<!DOCTYPE html><html><body>
<iframe class="docs-texteventtarget-iframe"></iframe>
<div id="model"></div>
<script>
(() => {
	let text = "\\u0003";
	let selStart = 1;
	let selEnd = 1;
	const mirror = () => { document.getElementById("model").textContent = text; };
	mirror();

	const frame = document.querySelector("iframe.docs-texteventtarget-iframe");
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

	window._docs_annotate_getAnnotatedText = () => Promise.resolve({
		getText: () => text,
		getSelection: () => [{ start: selStart, end: selEnd }],
		setSelection: (start, end) => { selStart = start; selEnd = end; },
	});
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
			// What the manifest does on docs.google.com: the bridge, main world, before page scripts.
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

		/** The content script lands at document_idle and boots off an async get_prefs. */
		async function typeUntilSettled(sequence, expected) {
			let text = "";
			for (let attempt = 0; attempt < 5; attempt++) {
				await page.goto(server.origin);
				await page.locator("body").click();
				const editable = page
					.frameLocator("iframe.docs-texteventtarget-iframe")
					.locator("[contenteditable=\"true\"]");
				await editable.click();
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

		it("sets the annotation flag in the page's own world", async () => {
			await page.goto(server.origin);
			assert.equal(
				await page.evaluate(() => window._docs_annotate_canvas_by_ext),
				"opgbbffpdglhkpglnlkiclakjlpiedoh",
			);
		});

		it("converts a word Docs itself typed", async () => {
			assert.equal(await typeUntilSettled("chaof", "\u0003chào"), "\u0003chào");
		});

		// Docs leaves the text it inserted selected, so without the bridge collapsing the caret the
		// next keystroke replaces the word instead of following it.
		it("keeps typing after a conversion", async () => {
			assert.equal(await typeUntilSettled("chaof ok", "\u0003chào ok"), "\u0003chào ok");
		});

		it("converts a second word in the same line", async () => {
			assert.equal(await typeUntilSettled("xin chaof", "\u0003xin chào"), "\u0003xin chào");
		});
	});
}
