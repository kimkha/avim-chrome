import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(import.meta.dirname, "..", "src");

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

// MV3 accepts either a single path or a size -> path map for action.default_icon.
function iconPaths(icon) {
	return typeof icon === "string" ? [icon] : Object.values(icon);
}

describe("Every file the manifest points at exists", () => {
	const referenced = [
		...Object.values(manifest.icons),
		...iconPaths(manifest.action.default_icon),
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

	// popup.js appends its key-field name to globalThis.exclude, which avim-ext.js overwrites
	// wholesale when it loads. Later, and the popup's own shortcut fields are transformed again.
	it("loads the engine before its own popup.js", () => {
		const srcs = scriptSrcs(read("popup.html"));

		assert.ok(srcs.includes("scripts/avim-ext.js"), "popup.html no longer loads the engine");
		assert.ok(srcs.includes("chrome/popup.js"), "popup.html no longer loads chrome/popup.js");
		assert.ok(srcs.indexOf("scripts/avim-ext.js") < srcs.indexOf("chrome/popup.js"));
	});
});

describe("The Google Docs bridge is wired for the main world", () => {
	const bridge = manifest.content_scripts.find((entry) => entry.js.includes("chrome/gdocs-bridge.js"));

	// The popup test above reads content_scripts[0] as the engine entry
	it("keeps the engine as the first content script", () => {
		assert.deepEqual(manifest.content_scripts[0].js, ["scripts/avim-ext.js"]);
	});

	it("declares the bridge at all", () => {
		assert.ok(bridge, "no content script loads chrome/gdocs-bridge.js");
	});

	// An isolated world or a later run_at silently leaves Google Docs unsupported.
	it("runs it in the main world at document_start", () => {
		assert.equal(bridge.world, "MAIN");
		assert.equal(bridge.run_at, "document_start");
	});

	it("scopes it to Google Docs documents", () => {
		assert.deepEqual(bridge.matches, ["https://docs.google.com/document/*"]);
	});

	it("asks for a Firefox new enough for world:MAIN, which landed in 128", () => {
		assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, "128.0");
	});
});

describe("The manifest grants what the popup actually calls", () => {
	const popupSource = read(path.join("chrome", "popup.js"));

	const apis = [
		["chrome.search.query(", "search"],
	];

	for (const [call, permission] of apis) {
		it(`declares "${permission}" because popup.js calls ${call}`, () => {
			assert.ok(popupSource.includes(call), `popup.js no longer calls ${call}; drop this test`);
			assert.ok(
				manifest.permissions.includes(permission),
				`popup.js calls ${call} but the manifest does not request "${permission}"`,
			);
		});
	}

	it("asks for nothing beyond storage and search", () => {
		assert.deepEqual([...manifest.permissions].sort(), ["search", "storage"]);
	});
});

describe("The keyboard shortcut that opens the popup", () => {
	it("binds Ctrl+Shift+V to the reserved action command", () => {
		assert.deepEqual(manifest.commands._execute_action.suggested_key, { default: "Ctrl+Shift+V" });
	});

	it("suggests at most four shortcuts, which is all Chrome accepts", () => {
		assert.ok(Object.keys(manifest.commands).length <= 4);
	});

	it("uses a combination Chrome allows, so the binding is not silently dropped", () => {
		for (const [name, command] of Object.entries(manifest.commands)) {
			for (const [platform, combination] of Object.entries(command.suggested_key)) {
				const where = `${name}.${platform}`;
				assert.ok(/^(Ctrl|Alt|Command|MacCtrl)\+/.test(combination), `${where} must start with Ctrl or Alt`);
				assert.ok(!/Ctrl\+Alt/.test(combination), `${where} may not use Ctrl+Alt, which collides with AltGr`);
			}
		}
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
	const declaration = popupSource.match(/const LABEL_KEYS = \[([^\]]+)\]/);
	const popupHtml = read("popup.html");

	it("still builds its label list from a literal array", () => {
		assert.ok(declaration, "popup.js no longer declares `const LABEL_KEYS = [...]`; update this test");
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
