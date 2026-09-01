"use strict";

/**
 * Chrome ships no test runner for third-party extensions: chrome.test needs a C++ ExtensionApiTest
 * harness inside a Chromium build, so the documented path is a browser driver with
 * --load-extension. This harness is that path, kept to the cases a fake DOM cannot model — real
 * injection, real Selection ranges, shadow-root retargeting, iframes and the system clipboard.
 */

const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");

const NESTED_PAGE = '<!DOCTYPE html><html><body><textarea id="nested"></textarea></body></html>';

function outerPage(altOrigin) {
	return `<!DOCTYPE html><html><body>
<textarea id="textarea"></textarea>
<input id="bare">
<input id="text" type="text">
<input id="search" type="search">
<input id="tel" type="tel">
<input id="emailType" type="email">
<input id="url" type="url">
<input id="password" type="password">
<input id="email">
<input id="byName" name="email">
<div id="editable" contenteditable="true"></div>
<div id="spaced" contenteditable="true">xin </div>
<div id="controlled" contenteditable="true"></div>
<textarea id="eventProbe"></textarea>
<div id="host"></div>
<div id="slot"></div>
<iframe id="sameOrigin" src="/nested"></iframe>
<iframe id="crossOrigin" src="${altOrigin}/nested"></iframe>
<iframe id="designMode"></iframe>
<script>
	document.getElementById("host").attachShadow({ mode: "open" }).innerHTML =
		'<textarea id="shadowTextarea"></textarea><input id="shadowText" type="text">';
	var dynamic = document.createElement("textarea");
	dynamic.id = "dynamic";
	document.getElementById("slot").appendChild(dynamic);
	document.getElementById("designMode").contentDocument.designMode = "on";
	window.__inputEvents = 0;
	document.getElementById("eventProbe").addEventListener("input", function () {
		window.__inputEvents++;
	});

	// #controlled stands in for Slate/Draft-style editors such as Discord's message box: it keeps
	// its own model and re-renders the DOM from it on every input event.
	var controlled = document.getElementById("controlled");
	var model = "";
	controlled.addEventListener("beforeinput", function (event) {
		if (event.data) {
			model += event.data;
		}
	});
	controlled.addEventListener("input", function () {
		if (controlled.textContent !== model) {
			controlled.textContent = model;
		}
		if (controlled.firstChild) {
			var range = document.createRange();
			range.setStart(controlled.firstChild, controlled.firstChild.data.length);
			range.collapse(true);
			var selection = getSelection();
			selection.removeAllRanges();
			selection.addRange(range);
		}
	});
	window.__resetControlled = function () {
		model = "";
		controlled.textContent = "";
	};
</script>
</body></html>`;
}

function resolveChromium() {
	let chromium;
	try {
		chromium = require("playwright-core").chromium;
	} catch {
		return { skip: "playwright-core is not installed; run `yarn install`" };
	}

	let executablePath = process.env.AVIM_CHROME_PATH;
	if (!executablePath) {
		try {
			executablePath = chromium.executablePath();
		} catch (error) {
			return { skip: `playwright cannot locate chromium: ${error.message}` };
		}
	}
	if (!fs.existsSync(executablePath)) {
		return { skip: `no chromium at ${executablePath}; run \`npx playwright install chromium\`` };
	}
	return { chromium: chromium, executablePath: executablePath };
}

function extensionDirs() {
	return ["src", "build"].filter((dir) => fs.existsSync(path.join(ROOT, dir, "manifest.json")));
}

function serve(body) {
	const server = http.createServer((request, response) => {
		response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
		response.end(request.url === "/nested" ? NESTED_PAGE : body(server));
	});
	return server;
}

function listen(server) {
	return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
}

async function startFixtureServer() {
	// A second port is a second origin, which is all the cross-origin iframe case needs.
	const alt = serve(() => NESTED_PAGE);
	const altOrigin = await listen(alt);
	const main = serve(() => outerPage(altOrigin));
	const origin = await listen(main);

	return {
		origin: origin,
		altOrigin: altOrigin,
		close: async () => {
			await new Promise((resolve) => main.close(resolve));
			await new Promise((resolve) => alt.close(resolve));
		},
	};
}

async function launchExtension(launcher, dir) {
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "avim-browser-"));
	const extension = path.join(ROOT, dir);
	const context = await launcher.chromium.launchPersistentContext(profile, {
		executablePath: launcher.executablePath,
		headless: true,
		args: [
			`--disable-extensions-except=${extension}`,
			`--load-extension=${extension}`,
			"--no-sandbox",
		],
	});
	const worker =
		context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker", { timeout: 30000 }));

	return {
		context: context,
		extensionId: new URL(worker.url()).host,
		close: async () => {
			await context.close();
			fs.rmSync(profile, { recursive: true, force: true });
		},
	};
}

function locate(page, target) {
	const spec = typeof target === "string" ? { selector: target } : target;
	const scope = spec.frame ? page.frameLocator(spec.frame) : page;
	return scope.locator(spec.selector);
}

function readEditable(element) {
	return element.value === undefined ? element.textContent : element.value;
}

// The content script lands at document_idle and the popup boots off an async get_prefs, so the
// first keystrokes can predate the wiring. Retrying tells "slow" apart from "broken".
async function typeUntil(page, target, sequence, expected) {
	let value = "";
	for (let attempt = 0; attempt < 5; attempt++) {
		const locator = locate(page, target);
		await locator.evaluate((element) => {
			if (element.value === undefined) {
				element.textContent = "";
			} else {
				element.value = "";
			}
		});
		await locator.click();
		await page.keyboard.type(sequence, { delay: 15 });
		value = await locator.evaluate(readEditable);
		if (value === expected) {
			return value;
		}
		await page.waitForTimeout(400);
	}
	return value;
}

async function typeOnce(page, target, sequence) {
	const locator = locate(page, target);
	await locator.click();
	await page.keyboard.type(sequence, { delay: 15 });
	return locator.evaluate(readEditable);
}

module.exports = {
	resolveChromium: resolveChromium,
	extensionDirs: extensionDirs,
	startFixtureServer: startFixtureServer,
	launchExtension: launchExtension,
	typeUntil: typeUntil,
	typeOnce: typeOnce,
};
