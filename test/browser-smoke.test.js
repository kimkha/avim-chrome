import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import {
	resolveChromium,
	extensionDirs,
	startFixtureServer,
	launchExtension,
	typeUntil,
	typeOnce,
} from "./helpers/browser-harness.js";

const CONVERTS = [
	["a textarea", "#textarea"],
	["an input with no type attribute", "#bare"],
	['input[type="text"]', "#text"],
	['input[type="search"]', "#search"],
	['input[type="tel"]', "#tel"],
	["a textarea inserted after load", "#dynamic"],
	["an empty contenteditable div", "#editable"],
	["a textarea in a same-origin iframe", { frame: "#sameOrigin", selector: "#nested" }],
	["a textarea in a cross-origin iframe", { frame: "#crossOrigin", selector: "#nested" }],
	["a designMode iframe", { frame: "#designMode", selector: "body" }],
];

const LEAVES_ALONE = [
	['input[type="email"]', "#emailType"],
	['input[type="url"]', "#url"],
	['input[type="password"]', "#password"],
	['an input whose id is "email"', "#email"],
	['an input whose name is "email"', "#byName"],
];

const launcher = await resolveChromium();

for (const dir of extensionDirs()) {
	describe(`${dir}/ loaded in Chromium`, { skip: launcher.skip }, () => {
		let extension;
		let server;
		let page;

		before(async () => {
			server = await startFixtureServer();
			extension = await launchExtension(launcher, dir);
			page = await extension.context.newPage();
			await page.goto(server.origin);
			// Gate the suite on the content script being live, so a "leaves it alone" case cannot
			// pass just because the extension had not attached yet.
			const ready = await typeUntil(page, "#textarea", "chaof", "chào");
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

		describe("The popup", () => {
			it("converts telex in its demo textarea", async () => {
				const popup = await extension.context.newPage();
				const failures = [];
				popup.on("pageerror", (error) => failures.push(error.message));
				popup.on("requestfailed", (request) => failures.push(`failed request: ${request.url()}`));
				await popup.goto(`chrome-extension://${extension.extensionId}/popup.html`);

				const typed = await typeUntil(popup, "#inputDemo", "tieengs Vieejt", "tiếng Việt");

				assert.equal(typed, "tiếng Việt");
				assert.deepEqual(failures, []);
				await popup.close();
			});

			it("puts Copy All on the real system clipboard", async () => {
				const popup = await extension.context.newPage();
				await popup.goto(`chrome-extension://${extension.extensionId}/popup.html`);
				const typed = await typeUntil(popup, "#inputDemo", "tieengs Vieejt", "tiếng Việt");
				await popup.click("#demoCopy");
				await popup.waitForTimeout(300);

				// clipboard.readText cannot verify this: permissions are ungrantable on the
				// extension's opaque origin, so the only proof is pasting somewhere else.
				const sink = await extension.context.newPage();
				await sink.goto(server.origin);
				await sink.click("#text");
				await sink.keyboard.press("Control+V");
				const pasted = await sink.locator("#text").evaluate((element) => element.value);

				assert.equal(pasted, typed);
				await sink.close();
				await popup.close();
			});
		});

		describe("The content script converts in", () => {
			for (const [label, target] of CONVERTS) {
				it(label, async () => {
					assert.equal(await typeUntil(page, target, "chaof", "chào"), "chào");
				});
			}
		});

		describe("The content script leaves alone", () => {
			for (const [label, target] of LEAVES_ALONE) {
				it(label, async () => {
					await page.locator(target).evaluate((element) => {
						element.value = "";
					});
					assert.equal(await typeOnce(page, target, "chaof"), "chaof");
				});
			}
		});

		describe("Known issue: an input inside a shadow root never reaches AVIM", () => {
			// A document-level capture listener sees e.target retargeted to the shadow host, a DIV
			// whose .type is undefined, so keyPressHandler bails before the engine runs. A fix means
			// reading e.composedPath()[0] instead of e.target.
			const cases = [
				["a textarea in an open shadow root", "#host >> #shadowTextarea"],
				["an input in an open shadow root", "#host >> #shadowText"],
			];

			for (const [label, target] of cases) {
				it(`${label} stays as typed`, async () => {
					assert.equal(await typeOnce(page, target, "chaof"), "chaof");
				});
			}
		});

		describe("A word split across elements is still one word", () => {
			// An editor splits a word for anything inline — bold, a mention, an emoji — and Slate,
			// Lexical and ProseMirror wrap every leaf in its own span. Reading only the caret's text
			// node loses the start of the word, and with it the modifier: ngu<b>oi</b> came out
			// "nguời" because the engine never saw a u to horn.
			const cases = [
				["bold in the middle", "#splitBold"],
				["two sibling spans", "#splitSpans"],
			];

			for (const [label, target] of cases) {
				it(`${label} gives "người"`, async () => {
					const editable = page.locator(target);
					await editable.click();
					await page.keyboard.press("Control+End");
					await page.keyboard.type("wf", { delay: 15 });

					assert.equal(await editable.evaluate((element) => element.textContent), "người");
				});
			}

			it("does not reach back into the previous block", async () => {
				const editable = page.locator("#blocks");
				await editable.click();
				await page.keyboard.press("Control+End");
				await page.keyboard.type("f", { delay: 15 });

				const lines = await editable.evaluate((element) =>
					[...element.children].map((child) => child.textContent));
				assert.deepEqual(lines, ["xin", "chào"], 'joining the blocks would spell-check "xinchao"');
			});
		});

		describe("Known issue: a contenteditable ending in a space loses it", () => {
			// ifMoz stashes everything after the caret, deletes to the end of the text node, then
			// re-inserts. Chrome puts the caret before a trailing collapsed space, so that space is
			// what gets stashed and it does not survive the round trip. Losing it also merges the two
			// words, which then fails the spell check and blocks the tone.
			it('typing "chaof" after "xin " gives "xinchaof", not "xin chào"', async () => {
				const editable = page.locator("#spaced");
				await editable.evaluate((element) => {
					element.textContent = "xin ";
				});
				await editable.click();
				await page.keyboard.press("Control+End");
				await page.keyboard.type("chaof", { delay: 15 });

				assert.equal(await editable.evaluate((element) => element.textContent), "xinchaof");
			});

			it("the same edit in a textarea keeps the space and converts", async () => {
				const textarea = page.locator("#eventProbe");
				await textarea.evaluate((element) => {
					element.value = "xin ";
				});
				await textarea.click();
				await page.keyboard.press("Control+End");
				await page.keyboard.type("chaof", { delay: 15 });

				assert.equal(await textarea.evaluate((element) => element.value), "xin chào");
			});
		});

		describe("A framework-controlled contenteditable keeps the diacritics (#30)", () => {
			// Discord's message box is Slate, which re-renders from its own model and so reverts a
			// DOM edit it never saw. AVIM cannot ask which editors do that, so it watches for one
			// revert and switches that host to announcing its rewrite as backspaces plus an
			// insertion. The revert is only visible one keystroke late, which costs the conversion
			// that exposed it. Space is when a lost accent used to become obvious.
			it("loses only the conversion that exposes the host, then stays correct", async () => {
				const textOf = () => page.locator("#controlled").evaluate((element) => element.textContent);

				await page.evaluate(() => window.__resetControlled());
				await page.locator("#controlled").click();
				await page.keyboard.type("tieengs ", { delay: 15 });
				assert.equal(await textOf(), "tiéng ", "the ê is lost while the host is still unknown");

				await page.evaluate(() => window.__resetControlled());
				await page.locator("#controlled").click();
				await page.keyboard.type("tieengs ", { delay: 15 });
				assert.equal(await textOf(), "tiếng ", "the same host is now announced to");
			});

			it("the same keystrokes in a plain contenteditable keep the diacritics", async () => {
				// Chrome stores a trailing space in a contenteditable as &nbsp; so it stays visible.
				assert.equal(await typeUntil(page, "#editable", "tieengs ", "tiếng\u00a0"), "tiếng\u00a0");
			});

			it("fires an input event for the converted keystroke, for editors that read the DOM", async () => {
				await page.locator("#editable").evaluate((element) => {
					element.textContent = "";
					window.__editableInputEvents = 0;
				});
				await page.locator("#editable").click();
				await page.keyboard.type("chaof", { delay: 15 });

				assert.equal(await page.locator("#editable").evaluate((element) => element.textContent), "chào");
				assert.equal(await page.evaluate(() => window.__editableInputEvents), 5);
			});
		});

		describe("A converted keystroke in an input fires an input event", () => {
			// Assigning el.value fires nothing, so a controlled component kept the raw keystrokes.
			// React is worse than silent about it: its value tracker swallows an input event
			// dispatched after the assignment, because the assignment already moved the value it
			// compares against. Going through execCommand is what makes the edit real.
			it("reports 5 input events for the 5 keystrokes of chaof", async () => {
				await page.locator("#eventProbe").evaluate((element) => {
					element.value = "";
					window.__inputEvents = 0;
				});

				assert.equal(await typeOnce(page, "#eventProbe", "chaof"), "chào");
				assert.equal(await page.evaluate(() => window.__inputEvents), 5);
			});
		});
	});
}
