import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import {
	resolveChromium,
	extensionDirs,
	startFixtureServer,
	launchExtension,
	typeUntil,
	typeOnce,
	readEditable,
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

		describe("Shortcut keys ship switched off", () => {
			it("ships no rows at all, so a word is left as typed", async () => {
				assert.equal(await typeUntil(page, "#textarea", "vn ", "vn "), "vn ");
			});

			it("offers one blank row, greyed out, ready to be switched on", async () => {
				const popup = await extension.context.newPage();
				await popup.goto(`chrome-extension://${extension.extensionId}/popup.html`);
				await popup.click("#openShortcuts");

				assert.equal(await popup.locator("#shortcutsOn").isChecked(), false);
				assert.equal(await popup.locator("#saveShortcuts").isDisabled(), true);
				const values = await popup.locator("#shortcutList input").evaluateAll((els) => els.map((el) => el.value));
				assert.deepEqual(values, ["", ""]);
				await popup.close();
			});
		});

		describe("A shortcut expands on the key that ends the word", () => {
			before(async () => {
				const popup = await extension.context.newPage();
				await popup.goto(`chrome-extension://${extension.extensionId}/popup.html`);
				await popup.click("#openShortcuts");
				await popup.check("#shortcutsOn");
				const inputs = popup.locator("#shortcutList input");
				await inputs.nth(0).fill("vn");
				await inputs.nth(1).fill("Việt Nam");
				await popup.click("#saveShortcuts");
				await popup.waitForTimeout(300);
				await popup.close();
			});

			// A space typed into a contenteditable becomes an NBSP, so those cases keep a letter after it
			const cases = [
				["a space in a textarea", "#textarea", "vn ", "Việt Nam "],
				["a comma in a textarea", "#textarea", "vn,", "Việt Nam,"],
				["a full stop in a textarea", "#textarea", "vn.", "Việt Nam."],
				["mid-sentence in a textarea", "#textarea", "xin vn ", "xin Việt Nam "],
				["a space in a contenteditable", "#editable", "vn x", "Việt Nam x"],
				["a comma in a contenteditable", "#editable", "vn,", "Việt Nam,"],
				["a space in a same-origin iframe", { frame: "#sameOrigin", selector: "#nested" }, "vn ", "Việt Nam "],
			];

			for (const [label, target, sequence, expected] of cases) {
				it(`${label} gives "${expected}"`, async () => {
					assert.equal(await typeUntil(page, target, sequence, expected), expected);
				});
			}

			it("waits for the boundary key, leaving the bare word alone", async () => {
				assert.equal(await typeUntil(page, "#textarea", "vn", "vn"), "vn");
			});

			it("matches the whole word only", async () => {
				assert.equal(await typeUntil(page, "#textarea", "avn ", "avn "), "avn ");
			});

			it("leaves telex to the engine", async () => {
				assert.equal(await typeUntil(page, "#textarea", "chaof ", "chào "), "chào ");
			});

			// A Slate host rebuilds its text from its own model, so it only ever sees the beforeinput.
			// Comma, not space: re-rendering leaves a collapsed trailing space Chrome cannot put the
			// caret after, so the next letter lands in front of it — the same quirk as #spaced below.
			it("expands in a Slate host", async () => {
				await page.evaluate(() => window.__resetControlled());
				await page.locator("#controlled").click();
				await page.keyboard.type("vn,", { delay: 15 });

				assert.equal(await page.locator("#controlled").evaluate((element) => element.textContent), "Việt Nam,");
			});

			// The engine runs in the popup too, so the key field is in `exclude` and the result is not
			it("takes a Telex-looking key in the key field and Telex in the result field", async () => {
				const popup = await extension.context.newPage();
				await popup.goto(`chrome-extension://${extension.extensionId}/popup.html`);
				await popup.click("#openShortcuts");
				await popup.click("#addShortcut");
				const inputs = popup.locator("#shortcutList input");
				const added = await inputs.count();

				await inputs.nth(added - 2).click();
				await popup.keyboard.type("uw", { delay: 15 });
				await inputs.nth(added - 1).click();
				await popup.keyboard.type("uw", { delay: 15 });

				assert.equal(await inputs.nth(added - 2).inputValue(), "uw");
				assert.equal(await inputs.nth(added - 1).inputValue(), "ư");
				await popup.close();
			});

			it("leaves a selected word to be replaced by the raw key", async () => {
				const editable = page.locator("#editable");
				await editable.evaluate((element) => {
					element.textContent = "vn";
					element.focus();
					const range = document.createRange();
					range.selectNodeContents(element);
					const selection = getSelection();
					selection.removeAllRanges();
					selection.addRange(range);
				});

				await page.keyboard.type("x", { delay: 15 });

				assert.equal(await editable.evaluate((element) => element.textContent), "x");
			});
		});

		// The only check that the whole loop is wired: popup -> storage -> background -> tab.
		describe("A shortcut added in the popup reaches an open tab", () => {
			it("expands what was just saved", async () => {
				const popup = await extension.context.newPage();
				await popup.goto(`chrome-extension://${extension.extensionId}/popup.html`);
				await popup.click("#openShortcuts");
				await popup.click("#addShortcut");
				const inputs = popup.locator("#shortcutList input");
				const added = await inputs.count();
				await inputs.nth(added - 2).fill("vnn");
				await inputs.nth(added - 1).fill("Việt Nam");
				await popup.click("#saveShortcuts");
				await popup.waitForTimeout(300);

				assert.equal(await popup.locator("#mainScreen").isVisible(), true);
				assert.equal(await typeUntil(page, "#textarea", "vnn ", "Việt Nam "), "Việt Nam ");
				await popup.close();
			});

			it("keeps it after the popup is reopened", async () => {
				const popup = await extension.context.newPage();
				await popup.goto(`chrome-extension://${extension.extensionId}/popup.html`);
				await popup.click("#openShortcuts");
				const values = await popup.locator("#shortcutList input").evaluateAll((els) => els.map((el) => el.value));

				assert.deepEqual(values.slice(-2), ["vnn", "Việt Nam"]);
				await popup.close();
			});
		});

		describe("An input inside a shadow root converts too", () => {
			// A document-level capture listener sees e.target retargeted to the shadow host, a DIV
			// whose .type is undefined, so keyPressHandler reads e.composedPath()[0] instead.
			const cases = [
				["a textarea in an open shadow root", "#host >> #shadowTextarea"],
				["an input in an open shadow root", "#host >> #shadowText"],
				["a contenteditable in an open shadow root", "#host >> #shadowEditable"],
			];

			for (const [label, target] of cases) {
				it(`${label} gives "chào"`, async () => {
					assert.equal(await typeUntil(page, target, "chaof", "chào"), "chào");
				});
			}
		});

		describe("An iframe added after load still converts", () => {
			it("a designMode iframe inserted dynamically", async () => {
				await page.evaluate(() => {
					const frame = document.createElement("iframe");
					frame.id = "lateDesignMode";
					document.body.append(frame);
					frame.contentDocument.designMode = "on";
				});

				const target = { frame: "#lateDesignMode", selector: "body" };
				assert.equal(await typeUntil(page, target, "chaof", "chào"), "chào");
			});

			it("a designMode iframe inserted inside another iframe, a second later", async () => {
				// The observer does not cross document boundaries; this lands on the child frame's
				// own content script instance (all_frames), long after its initial scan.
				await page.waitForTimeout(1000);
				await page.frameLocator("#sameOrigin").locator("body").evaluate(() => {
					const frame = document.createElement("iframe");
					frame.id = "nestedDesignMode";
					document.body.append(frame);
					frame.contentDocument.designMode = "on";
				});

				const target = { frame: ["#sameOrigin", "#nestedDesignMode"], selector: "body" };
				assert.equal(await typeUntil(page, target, "chaof", "chào"), "chào");
			});
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

			it("does not reach back across a soft line break", async () => {
				const editable = page.locator("#softBreak");
				await editable.click();
				await page.keyboard.press("Control+End");
				await page.keyboard.type("f", { delay: 15 });

				assert.equal(await editable.evaluate((element) => element.innerHTML), "xin<br>chào");
			});

			it("does not reach back across an emoji image, and the emoji survives", async () => {
				const editable = page.locator("#emojiSplit");
				await editable.click();
				await page.keyboard.press("Control+End");
				await page.keyboard.type("f", { delay: 15 });

				assert.equal(await editable.evaluate((element) => element.textContent), "hichào",
					'joining the words would spell-check "hichao" and lose the tone');
				assert.equal(await editable.evaluate((element) => element.querySelectorAll("img").length), 1);
			});

			it("does not reach back into an uneditable chip, and the chip survives", async () => {
				const editable = page.locator("#chipSplit");
				await editable.click();
				await page.keyboard.press("Control+End");
				await page.keyboard.type("f", { delay: 15 });

				assert.equal(await editable.evaluate((element) => element.textContent), "hi@tokenchào");
				assert.equal(await editable.evaluate((element) => element.querySelector("span").textContent), "@token");
			});
		});

		describe("A tone typed with the caret in the middle of a word", () => {
			it('"chaoX" with the caret after "chao" becomes "chàoX"', async () => {
				await page.locator("#midWord").evaluate((element) => {
					const range = document.createRange();
					range.setStart(element.firstChild, 4);
					range.collapse(true);
					const sel = window.getSelection();
					sel.removeAllRanges();
					sel.addRange(range);
					element.focus();
				});
				await page.keyboard.type("f", { delay: 15 });

				assert.equal(await page.locator("#midWord").evaluate((element) => element.textContent), "chàoX");
			});

			// Fixing a missed letter after the fact: "khong em", arrow back to after the o, add the
			// o. The rewrite lands inside the word, with "ng em" still after the caret.
			const surfaces = [
				["a textarea", "#textarea"],
				["a text input", "#text"],
				["a contenteditable div", "#editable"],
			];

			for (const [label, selector] of surfaces) {
				it(`arrowing back into "khong em" and adding the o gives "không em" in ${label}`, async () => {
					const editable = page.locator(selector);
					await editable.click();
					await page.keyboard.press("Control+A");
					await page.keyboard.press("Delete");
					await page.keyboard.type("khong em", { delay: 15 });
					for (let i = 0; i < 5; i++) {
						await page.keyboard.press("ArrowLeft");
					}
					await page.keyboard.type("o", { delay: 15 });
					assert.equal(await editable.evaluate(readEditable), "không em");

					await page.keyboard.type("o", { delay: 15 });
					assert.equal(await editable.evaluate(readEditable), "khoong em",
						"repeating the key mid-word escapes the transform");
				});
			}
		});

		describe("A word after a trailing space", () => {
			// Chrome cannot place the caret after a trailing collapsed plain space, so new text lands
			// before it and Chrome drops the space — measured identically with the extension removed.
			// Not an AVIM bug: a space the user types becomes an NBSP and both realistic flows work.
			it('typing the space yourself: "xin chaof" gives "xin chào"', async () => {
				const editable = page.locator("#spaced");
				await editable.evaluate((element) => {
					element.textContent = "";
				});
				await editable.click();
				await page.keyboard.type("xin chaof", { delay: 15 });

				assert.equal(await editable.evaluate((element) => element.textContent), "xin chào");
			});

			it('after a preset NBSP: "chaof" gives "xin chào"', async () => {
				const editable = page.locator("#spaced");
				await editable.evaluate((element) => {
					element.textContent = "xin\u00a0";
				});
				await editable.click();
				await page.keyboard.press("Control+End");
				await page.keyboard.type("chaof", { delay: 15 });

				assert.equal(await editable.evaluate((element) => element.textContent), "xin chào");
			});

			it("after a preset plain space, Chrome itself eats the space and merges the words", async () => {
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
			// DOM edit it never saw. Slate hosts are recognised by their DOM attributes and
			// announced to as one targeted insertText, so the model applies the rewrite itself.
			it("announces to a Slate host from the very first conversion", async () => {
				const textOf = () => page.locator("#controlled").evaluate((element) => element.textContent);

				await page.evaluate(() => window.__resetControlled());
				await page.locator("#controlled").click();
				await page.keyboard.type("tieengs ", { delay: 15 });
				assert.equal(await textOf(), "tiếng ", "correct from the first conversion in the host");

				await page.evaluate(() => window.__resetControlled());
				await page.locator("#controlled").click();
				await page.keyboard.type("tieengs ", { delay: 15 });
				assert.equal(await textOf(), "tiếng ");
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
