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

			it("switches the input method without reloading itself", async () => {
				const popup = await extension.context.newPage();
				await popup.goto(`chrome-extension://${extension.extensionId}/popup.html`);
				await popup.waitForTimeout(400);
				// A reload would wipe this, so it is the proof the page survived the change
				await popup.evaluate(() => {
					window.__survived = true;
				});

				await popup.locator("#vni").click();
				await popup.waitForFunction(() => document.getElementById("vni").checked);
				const seen = {
					survived: await popup.evaluate(() => window.__survived === true),
					offCleared: await popup.evaluate(() => document.getElementById("off").checked === false),
					typedInVni: await typeUntil(popup, "#inputDemo", "chao2", "chào"),
				};

				// Put the shared profile back before asserting: every later test types Telex
				await popup.locator("#auto").click();
				await popup.waitForFunction(() => document.getElementById("auto").checked);
				await popup.close();

				assert.equal(seen.survived, true, "the popup reloaded instead of updating in place");
				assert.equal(seen.offCleared, true);
				assert.equal(seen.typedInVni, "chào");
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

		describe("Search hands the fast input to the browser", () => {
			async function openPopup() {
				const popup = await extension.context.newPage();
				await popup.goto(`chrome-extension://${extension.extensionId}/popup.html`);
				return popup;
			}

			it("opens a tab at a typed URL", async () => {
				const popup = await openPopup();
				const opened = [];
				const collect = (page) => opened.push(page);
				extension.context.on("page", collect);

				await popup.fill("#inputDemo", `${server.origin}/`);
				await popup.click("#searchDemo");
				await popup.waitForTimeout(600);
				extension.context.off("page", collect);

				assert.equal(opened.length, 1);
				await opened[0].waitForLoadState("domcontentloaded");
				assert.equal(new URL(opened[0].url()).origin, new URL(server.origin).origin);
				await opened[0].close();
				await popup.close();
			});

			// Stubbed on purpose: a real query needs the network. Chrome owns the query itself.
			it("asks the default search engine for plain text", async () => {
				const popup = await openPopup();
				await popup.evaluate(() => {
					window.__searchCalls = [];
					chrome.search.query = (queryInfo) => window.__searchCalls.push(queryInfo);
				});

				await popup.fill("#inputDemo", "xin chào");
				await popup.click("#searchDemo");

				assert.deepEqual(await popup.evaluate(() => window.__searchCalls), [
					{ text: "xin chào", disposition: "NEW_TAB" },
				]);
				await popup.close();
			});

			it("treats a scheme it does not know as a search, never as a URL", async () => {
				const popup = await openPopup();
				await popup.evaluate(() => {
					window.__searchCalls = [];
					window.__createdTabs = [];
					chrome.search.query = (queryInfo) => window.__searchCalls.push(queryInfo);
					chrome.tabs.create = (properties) => window.__createdTabs.push(properties);
				});

				await popup.fill("#inputDemo", "javascript://evil");
				await popup.click("#searchDemo");

				assert.deepEqual(await popup.evaluate(() => window.__createdTabs), []);
				assert.equal((await popup.evaluate(() => window.__searchCalls)).length, 1);
				await popup.close();
			});
		});

		describe("The fast input survives the popup closing", () => {
			it("comes back converted, focused and fully selected", async () => {
				const first = await extension.context.newPage();
				await first.goto(`chrome-extension://${extension.extensionId}/popup.html`);
				assert.equal(await typeUntil(first, "#inputDemo", "tieengs Vieejt", "tiếng Việt"), "tiếng Việt");
				await first.waitForTimeout(400);
				await first.close();

				const second = await extension.context.newPage();
				await second.goto(`chrome-extension://${extension.extensionId}/popup.html`);
				await second.waitForTimeout(400);

				assert.deepEqual(await second.evaluate(() => {
					const element = document.getElementById("inputDemo");
					return {
						value: element.value,
						focused: document.activeElement === element,
						selectedAll: element.selectionStart === 0 && element.selectionEnd === element.value.length,
					};
				}), { value: "tiếng Việt", focused: true, selectedAll: true });
				await second.close();
			});

			it("remembers an emptied field, so clearing sticks", async () => {
				const first = await extension.context.newPage();
				await first.goto(`chrome-extension://${extension.extensionId}/popup.html`);
				await first.fill("#inputDemo", "");
				await first.waitForTimeout(400);
				await first.close();

				const second = await extension.context.newPage();
				await second.goto(`chrome-extension://${extension.extensionId}/popup.html`);
				await second.waitForTimeout(400);

				assert.equal(await second.inputValue("#inputDemo"), "");
				await second.close();
			});
		});

		describe("The shortcut modal sits over a main screen that cannot be reached", () => {
			async function openModal() {
				const popup = await extension.context.newPage();
				await popup.goto(`chrome-extension://${extension.extensionId}/popup.html`);
				await popup.fill("#inputDemo", "");
				await popup.click("#openShortcuts");
				await popup.waitForTimeout(150);
				return popup;
			}
			const focused = (popup) => popup.evaluate(() => document.activeElement.id);

			it("moves focus to Back and marks the main screen inert", async () => {
				const popup = await openModal();

				assert.equal(await focused(popup), "backToMain");
				assert.equal(await popup.evaluate(() => document.getElementById("mainScreen").inert), true);
				await popup.close();
			});

			it("keeps the main screen visible behind the scrim", async () => {
				const popup = await openModal();

				assert.equal(await popup.locator("#mainScreen").isVisible(), true);
				await popup.close();
			});

			// focus() still lands inside an inert subtree; only the keystrokes are refused.
			it("swallows keystrokes aimed at the textarea behind it", async () => {
				const popup = await openModal();

				await popup.evaluate(() => document.getElementById("inputDemo").focus());
				await popup.keyboard.type("chaof", { delay: 15 });

				assert.equal(await popup.inputValue("#inputDemo"), "");
				await popup.close();
			});

			const closers = [
				["Back", async (popup) => popup.click("#backToMain")],
				["a click on the scrim", async (popup) => popup.mouse.click(20, 208)],
			];

			for (const [label, close] of closers) {
				it(`closes on ${label} and leaves the textarea ready to type`, async () => {
					const popup = await openModal();

					await close(popup);
					await popup.waitForTimeout(150);
					await popup.keyboard.type("chaof", { delay: 15 });

					assert.equal(await popup.evaluate(() => document.getElementById("shortcutScreen").style.display), "none");
					assert.equal(await popup.evaluate(() => document.getElementById("mainScreen").inert), false);
					assert.equal(await popup.inputValue("#inputDemo"), "chào");
					await popup.close();
				});
			}

			it("adds a row on Enter and puts the caret in it, so Tab and Enter are enough", async () => {
				const popup = await openModal();
				if (!(await popup.locator("#shortcutsOn").isChecked())) {
					await popup.check("#shortcutsOn");
				}
				// earlier suites leave rows filled in, so start from one this test owns
				await popup.click("#addShortcut");
				await popup.waitForTimeout(150);
				const inputs = popup.locator("#shortcutList input");
				const before = await inputs.count();

				await inputs.nth(before - 2).click();
				await popup.keyboard.type("zz", { delay: 15 });
				await popup.keyboard.press("Tab");
				await popup.keyboard.type("Vieejt Nam", { delay: 15 });
				await popup.keyboard.press("Enter");
				await popup.waitForTimeout(200);

				const values = await inputs.evaluateAll((els) => els.map((el) => el.value));
				assert.equal(values.length, before + 2);
				assert.deepEqual(values.slice(-4), ["zz", "Việt Nam", "", ""]);
				assert.equal(
					await popup.evaluate(() => [...document.querySelectorAll("#shortcutList input")].indexOf(document.activeElement)),
					values.length - 2,
				);
				await popup.close();
			});
		});

		describe("Tapping Ctrl twice with the popup open", () => {
			async function tapCtrlTwice(popup) {
				await popup.click("#inputDemo");
				await popup.keyboard.press("Control");
				await popup.waitForTimeout(60);
				await popup.keyboard.press("Control");
				await popup.waitForTimeout(500);
			}
			async function typed(popup) {
				await popup.fill("#inputDemo", "");
				await popup.click("#inputDemo");
				await popup.keyboard.type("chaof", { delay: 15 });
				return popup.inputValue("#inputDemo");
			}
			const radios = (popup) => popup.evaluate(() => ({
				off: document.getElementById("off").checked,
				auto: document.getElementById("auto").checked,
			}));

			// Leaves AVIM back on, because the suites after this one expect it.
			it("turns the popup's own controls off and on again", async () => {
				const popup = await extension.context.newPage();
				await popup.goto(`chrome-extension://${extension.extensionId}/popup.html`);
				await popup.waitForTimeout(300);
				assert.deepEqual(await radios(popup), { off: false, auto: true });
				assert.equal(await typed(popup), "chào");

				await tapCtrlTwice(popup);

				assert.deepEqual(await radios(popup), { off: true, auto: false });
				assert.equal(await typed(popup), "chaof");

				await tapCtrlTwice(popup);

				assert.deepEqual(await radios(popup), { off: false, auto: true });
				assert.equal(await typed(popup), "chào");
				await popup.close();
			});

			it("ignores the Ctrl that ends the Ctrl+Shift+V shortcut", async () => {
				const popup = await extension.context.newPage();
				await popup.goto(`chrome-extension://${extension.extensionId}/popup.html`);
				await popup.waitForTimeout(300);
				await popup.click("#inputDemo");

				await popup.keyboard.press("Control+Shift+V");
				await popup.waitForTimeout(60);
				await popup.keyboard.press("Control");
				await popup.waitForTimeout(500);

				assert.deepEqual(await radios(popup), { off: false, auto: true });
				assert.equal(await typed(popup), "chào");
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

		describe("A URL pattern row turns AVIM off for one site", () => {
			let extensionPage;

			// Every write goes through the real background, so the push to each tab is exercised too
			const savePatterns = (patterns) =>
				extensionPage.evaluate(
					(rows) => new Promise((done) => {
						chrome.runtime.sendMessage({ save_prefs: "all", patterns: rows }, () => done());
					}),
					patterns,
				);

			/** tabs.query hands back ids but no urls without the "tabs" permission, so each tab is asked. */
			const findFixtureTab = (origin) =>
				extensionPage.evaluate(
					(prefix) => new Promise((done) => {
						chrome.tabs.query({}, async (tabs) => {
							for (const tab of tabs) {
								const state = await new Promise((reply) => {
									chrome.tabs.sendMessage(tab.id, { get_tab_pattern: "all" }, { frameId: 0 }, (answer) => {
										void chrome.runtime.lastError;
										reply(answer ?? null);
									});
								});
								if (state && state.url.startsWith(prefix)) {
									done({ tabId: tab.id, state });
									return;
								}
							}
							done(null);
						});
					}),
					origin,
				);

			const badgeOf = (tabId) =>
				extension.context.serviceWorkers()[0].evaluate(async (id) => ({
					text: await chrome.action.getBadgeText({ tabId: id }),
					color: await chrome.action.getBadgeBackgroundColor({ tabId: id }),
				}), tabId);

			before(async () => {
				extensionPage = await extension.context.newPage();
				await extensionPage.goto(`chrome-extension://${extension.extensionId}/popup.html`);
			});

			after(async () => {
				await savePatterns([]);
				if (extensionPage) {
					await extensionPage.close();
				}
			});

			it("stops converting on the site the row names", async () => {
				await savePatterns([{ pattern: new URL(server.origin).host, mode: "off" }]);

				assert.equal(await typeUntil(page, "#textarea", "chaof", "chaof"), "chaof");
			});

			it("converts again once the row is gone", async () => {
				await savePatterns([{ pattern: new URL(server.origin).host, mode: "off" }]);
				await savePatterns([]);

				assert.equal(await typeUntil(page, "#textarea", "chaof", "chào"), "chào");
			});

			it("leaves the site alone when the row names another host", async () => {
				await savePatterns([{ pattern: "not-this-host.test", mode: "off" }]);

				assert.equal(await typeUntil(page, "#textarea", "chaof", "chào"), "chào");
			});

			it("answers the popup with the row that won and its mode", async () => {
				const host = new URL(server.origin).host;
				await savePatterns([{ pattern: host, mode: "off" }]);

				const found = await findFixtureTab(server.origin);

				assert.ok(found, "no tab answered get_tab_pattern");
				assert.equal(found.state.pattern, host);
				assert.equal(found.state.mode, "off");
			});

			it("offers a ready-made pattern when no row matches yet", async () => {
				await savePatterns([]);

				const found = await findFixtureTab(server.origin);

				assert.equal(found.state.pattern, `*://${new URL(server.origin).host}/*`);
				assert.equal(found.state.mode, "default");
			});

			it("switches the site off with the very pattern it offered", async () => {
				await savePatterns([]);
				const offered = (await findFixtureTab(server.origin)).state.pattern;

				await savePatterns([{ pattern: offered, mode: "off" }]);

				assert.equal(await typeUntil(page, "#textarea", "chaof", "chaof"), "chaof");
			});

			// sender.tab.id is readable with no "tabs" permission, which is what keeps this per-tab
			it("washes out the badge of the tab a row decided", async () => {
				await savePatterns([{ pattern: new URL(server.origin).host, mode: "off" }]);
				const found = await findFixtureTab(server.origin);

				const badge = await badgeOf(found.tabId);

				assert.equal(badge.text, "off");
				assert.deepEqual(badge.color, [251, 211, 188, 255]);
			});

			it("puts the solid badge back when no row decides the tab", async () => {
				await savePatterns([]);
				const found = await findFixtureTab(server.origin);

				const badge = await badgeOf(found.tabId);

				assert.equal(badge.text, "on");
				assert.deepEqual(badge.color, [0, 128, 0, 255]);
			});
		});

		describe("A row decides a whole tab, frame by frame", () => {
			let extensionPage;
			const savePatterns = (patterns) =>
				extensionPage.evaluate(
					(rows) => new Promise((done) => {
						chrome.runtime.sendMessage({ save_prefs: "all", patterns: rows }, () => done());
					}),
					patterns,
				);

			before(async () => {
				extensionPage = await extension.context.newPage();
				await extensionPage.goto(`chrome-extension://${extension.extensionId}/popup.html`);
				// Anchored to the top page only: a frame matching this had to have read window.top
				const root = `/^${server.origin.replace(/[.:/]/g, (char) => `\\${char}`)}\\/$/`;
				await savePatterns([{ pattern: root, mode: "off" }]);
			});

			after(async () => {
				await savePatterns([]);
				if (extensionPage) {
					await extensionPage.close();
				}
			});

			it("switches the top frame off", async () => {
				assert.equal(await typeUntil(page, "#textarea", "chaof", "chaof"), "chaof");
			});

			it("switches a same-origin iframe off with it, whose own URL never matched", async () => {
				const nested = { frame: "#sameOrigin", selector: "#nested" };

				assert.equal(await typeUntil(page, nested, "chaof", "chaof"), "chaof");
			});

			it("leaves a cross-origin iframe converting, because it cannot read the top URL", async () => {
				const nested = { frame: "#crossOrigin", selector: "#nested" };

				assert.equal(await typeUntil(page, nested, "chaof", "chào"), "chào");
			});
		});

		describe("Tapping Ctrl three times turns just this site off", () => {
			let extensionPage;
			const host = () => new URL(server.origin).host;

			const readPrefs = () =>
				extensionPage.evaluate(() => new Promise((done) => {
					chrome.runtime.sendMessage({ get_prefs: "all" }, done);
				}));

			const write = (payload) =>
				extensionPage.evaluate(
					(body) => new Promise((done) => {
						chrome.runtime.sendMessage({ save_prefs: "all", ...body }, () => done());
					}),
					payload,
				);

			// The gesture crosses two background round trips, so the write is polled for
			async function waitForPatterns(count) {
				for (let attempt = 0; attempt < 20; attempt++) {
					const prefs = await readPrefs();
					if (prefs.patterns.length === count) {
						return prefs;
					}
					await page.waitForTimeout(100);
				}
				return readPrefs();
			}

			async function tapCtrl(times) {
				await page.locator("#textarea").click();
				for (let i = 0; i < times; i++) {
					await page.keyboard.down("Control");
					await page.keyboard.up("Control");
				}
			}

			const forgetTaps = () => page.waitForTimeout(400);

			before(async () => {
				extensionPage = await extension.context.newPage();
				await extensionPage.goto(`chrome-extension://${extension.extensionId}/popup.html`);
			});

			after(async () => {
				await write({ patterns: [], onOff: 1 });
				if (extensionPage) {
					await extensionPage.close();
				}
			});

			it("stops converting on this site while the panel switch stays on", async () => {
				await write({ patterns: [], onOff: 1 });
				await forgetTaps();

				await tapCtrl(3);
				const prefs = await waitForPatterns(1);

				assert.equal(prefs.onOff, 1, "the panel switch was left flipped");
				assert.deepEqual(prefs.patterns, [{ pattern: `*://${host()}/*`, mode: "off" }]);
				assert.equal(await typeUntil(page, "#textarea", "chaof", "chaof"), "chaof");
			});

			it("hands the site back to the panel on the next three taps", async () => {
				await write({ patterns: [{ pattern: `*://${host()}/*`, mode: "off" }], onOff: 1 });
				await forgetTaps();

				await tapCtrl(3);

				for (let attempt = 0; attempt < 20; attempt++) {
					const prefs = await readPrefs();
					if (prefs.patterns[0]?.mode === "default") {
						break;
					}
					await page.waitForTimeout(100);
				}
				const prefs = await readPrefs();

				assert.equal(prefs.onOff, 1);
				assert.deepEqual(prefs.patterns, [{ pattern: `*://${host()}/*`, mode: "default" }]);
				assert.equal(await typeUntil(page, "#textarea", "chaof", "chào"), "chào");
			});

			it("still flips only the panel switch on two taps", async () => {
				await write({ patterns: [], onOff: 1 });
				await forgetTaps();

				await tapCtrl(2);
				await page.waitForTimeout(500);
				const prefs = await readPrefs();

				assert.equal(prefs.onOff, 0);
				assert.deepEqual(prefs.patterns, []);
			});
		});
	});
}
