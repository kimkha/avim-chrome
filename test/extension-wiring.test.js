"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(__dirname, "..", "src");

function read(relative) {
	return fs.readFileSync(path.join(SRC, relative), "utf8");
}

function exists(relative) {
	return fs.existsSync(path.join(SRC, relative));
}

const manifest = JSON.parse(read("manifest.json"));
const locales = fs.readdirSync(path.join(SRC, "_locales"));
const messages = Object.fromEntries(
	locales.map((locale) => [locale, JSON.parse(read(path.join("_locales", locale, "messages.json")))]),
);
const htmlPages = fs.readdirSync(SRC).filter((name) => name.endsWith(".html"));

function scriptSrcs(html) {
	return [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
}

describe("Every file the manifest points at exists", () => {
	const referenced = [
		...Object.values(manifest.icons),
		manifest.action.default_icon,
		manifest.action.default_popup,
		manifest.background.service_worker,
		...manifest.content_scripts.flatMap((entry) => entry.js),
	];

	for (const file of referenced) {
		it(`${file}`, () => {
			assert.ok(exists(file), `manifest references missing file: ${file}`);
		});
	}
});

describe("Every script tag in an HTML page points at a real file", () => {
	for (const page of htmlPages) {
		for (const src of scriptSrcs(read(page))) {
			it(`${page} -> ${src}`, () => {
				assert.ok(exists(src), `${page} references missing script: ${src}`);
			});
		}
	}
});

describe("popup.html loads the same engine bundle as the content script", () => {
	// The regression this guards: popup.html once loaded avim.js but not extension.js, so the
	// popup had the engine with none of the event wiring and silently typed plain ASCII. The
	// bundled build hid it, because it concatenated both files into the one name popup.html asked
	// for. Any future split of the content script must be mirrored here.
	const declared = manifest.content_scripts[0].js;
	const loaded = scriptSrcs(read("popup.html")).filter((src) => src.startsWith("scripts/"));

	it("loads every content script, in the same order", () => {
		assert.deepEqual(loaded, declared);
	});
});

describe("Locales agree on which messages exist", () => {
	const [reference, ...others] = locales;

	it(`has more than one locale to compare (found: ${locales.join(", ")})`, () => {
		assert.ok(others.length > 0);
	});

	for (const locale of others) {
		it(`${locale} declares exactly the keys ${reference} declares`, () => {
			assert.deepEqual(Object.keys(messages[locale]).sort(), Object.keys(messages[reference]).sort());
		});
	}

	for (const locale of locales) {
		it(`${locale} has no blank message`, () => {
			const blank = Object.keys(messages[locale]).filter((key) => !messages[locale][key].message.trim());
			assert.deepEqual(blank, []);
		});
	}
});

describe("Every message placeholder resolves in every locale", () => {
	const used = new Set();
	for (const placeholder of read("manifest.json").matchAll(/__MSG_(\w+)__/g)) {
		used.add(placeholder[1]);
	}
	for (const page of htmlPages) {
		for (const placeholder of read(page).matchAll(/__MSG_(\w+)__/g)) {
			used.add(placeholder[1]);
		}
	}

	it("finds placeholders to check", () => {
		assert.ok(used.size > 0);
	});

	for (const locale of locales) {
		it(`${locale} defines all of them`, () => {
			const missing = [...used].filter((key) => !(key in messages[locale]));
			assert.deepEqual(missing, []);
		});
	}
});

describe("popup.js labels line up with popup.html and the locale files", () => {
	// loadText() builds ids as "txt" + key and message names as "extPopup" + key, so a key added to
	// one side only fails silently at runtime: the label just stays as the hardcoded Vietnamese
	// fallback, or throws on a missing element.
	const popupSource = read(path.join("chrome", "popup.js"));
	const declaration = popupSource.match(/var keys = \[([^\]]+)\]/);
	const popupHtml = read("popup.html");

	it("still builds its label list from a literal array", () => {
		assert.ok(declaration, "loadText() no longer declares `var keys = [...]`; update this test");
	});

	const keys = declaration[1].split(",").map((entry) => entry.trim().replace(/^"|"$/g, ""));

	for (const key of keys) {
		it(`txt${key} exists in popup.html`, () => {
			assert.match(popupHtml, new RegExp(`id="txt${key}"`), `popup.html has no #txt${key}`);
		});

		for (const locale of locales) {
			it(`extPopup${key} exists in ${locale}`, () => {
				assert.ok(`extPopup${key}` in messages[locale], `${locale} has no extPopup${key}`);
			});
		}
	}
});
