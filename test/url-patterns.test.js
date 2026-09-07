import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { METHOD, createInput, loadEngine, type, typeInto } from "./helpers/avim-harness.js";

const TELEX = { method: METHOD.TELEX };

const rows = (...entries) => entries.map(([pattern, mode]) => ({ pattern, mode }));

// vm-created objects fail a strict deep-equal on their prototype, so they cross realms as JSON
const copy = (value) => JSON.parse(JSON.stringify(value));

const matches = (pattern, url) => Boolean(loadEngine().matchPattern(rows([pattern, "off"]), url));

describe("A bare host covers every page under it", () => {
	it("matches https", () => {
		assert.ok(matches("docs.google.com", "https://docs.google.com/document/d/1/edit"));
	});

	it("matches http, because the row names no scheme", () => {
		assert.ok(matches("docs.google.com", "http://docs.google.com/"));
	});

	it("matches the bare root", () => {
		assert.ok(matches("example.test", "https://example.test/"));
	});

	it("ignores the case of the host", () => {
		assert.ok(matches("Example.TEST", "https://example.test/"));
	});

	it("does not match a different host", () => {
		assert.ok(!matches("example.test", "https://other.test/"));
	});

	// The row gets a trailing slash for exactly this: a prefix match alone would accept the lookalike
	it("does not match a host that merely starts with it", () => {
		assert.ok(!matches("canva.com", "https://canva.com.evil.test/steal"));
	});

	it("does not match a subdomain it did not name", () => {
		assert.ok(!matches("google.com", "https://docs.google.com/"));
	});

	it("does match a subdomain once a wildcard asks for it", () => {
		assert.ok(matches("*.google.com", "https://docs.google.com/"));
	});
});

describe("A row can pin down a path", () => {
	it("matches deeper paths under the one it names", () => {
		assert.ok(matches("example.test/wiki", "https://example.test/wiki/Page"));
	});

	it("does not match a sibling path", () => {
		assert.ok(!matches("example.test/wiki", "https://example.test/forum/1"));
	});

	it("matches a wildcard in the middle", () => {
		assert.ok(matches("example.test/*/edit", "https://example.test/doc/9/edit"));
	});

	it("keeps a named scheme, so an http-only row skips https", () => {
		assert.ok(matches("http://example.test", "http://example.test/"));
		assert.ok(!matches("http://example.test", "https://example.test/"));
	});
});

describe("A row wrapped in slashes is a real regular expression", () => {
	it("matches what the expression matches", () => {
		assert.ok(matches("/^https:\\/\\/\\w+\\.example\\.test\\//", "https://mail.example.test/inbox"));
	});

	it("is unanchored unless the expression anchors itself", () => {
		assert.ok(matches("/inbox/", "https://mail.example.test/inbox"));
	});

	it("honours the flags after the closing slash", () => {
		assert.ok(matches("/INBOX/i", "https://mail.example.test/inbox"));
		assert.ok(!matches("/INBOX/", "https://mail.example.test/inbox"));
	});

	it("never matches when the expression does not compile, rather than throwing", () => {
		assert.doesNotThrow(() => matches("/(unclosed/", "https://example.test/"));
		assert.ok(!matches("/(unclosed/", "https://example.test/"));
	});
});

describe("The most specific row wins", () => {
	const pick = (list, url) => loadEngine().matchPattern(list, url);

	it("prefers the subdomain row over the wildcard row that also matches", () => {
		const list = rows(["*.google.com", "off"], ["docs.google.com", "on"]);

		assert.equal(pick(list, "https://docs.google.com/").mode, "on");
	});

	it("prefers the longer path row however the rows are ordered", () => {
		const deepFirst = rows(["example.test/wiki/Page", "on"], ["example.test", "off"]);
		const deepLast = rows(["example.test", "off"], ["example.test/wiki/Page", "on"]);
		const url = "https://example.test/wiki/Page";

		assert.equal(pick(deepFirst, url).mode, "on");
		assert.equal(pick(deepLast, url).mode, "on");
	});

	it("gives a tie to the row the user put first", () => {
		const list = rows(["example.test", "on"], ["example.test", "off"]);

		assert.equal(pick(list, "https://example.test/").mode, "on");
	});

	it("skips a row whose pattern is blank or missing", () => {
		const list = [{ pattern: "", mode: "off" }, {}, null, { pattern: "example.test", mode: "on" }];

		assert.equal(pick(list, "https://example.test/").mode, "on");
	});

	it("finds nothing when no row matches", () => {
		assert.equal(pick(rows(["other.test", "off"]), "https://example.test/"), null);
	});
});

describe("A matching row turns the engine off for that page only", () => {
	const OFF_ON_EXAMPLE = { ...TELEX, patterns: rows(["example.test", "off"]) };

	it("leaves what was typed alone on the page it names", () => {
		assert.equal(type("as", { ...OFF_ON_EXAMPLE, url: "https://example.test/page" }), "as");
	});

	it("still transforms on a page it does not name", () => {
		assert.equal(type("as", { ...OFF_ON_EXAMPLE, url: "https://other.test/page" }), "á");
	});

	it("transforms on the named page once the row is back to default", () => {
		const patterns = rows(["example.test", "default"]);

		assert.equal(type("as", { ...TELEX, patterns, url: "https://example.test/page" }), "á");
	});
});

describe("A row can force the engine on where the panel turned it off", () => {
	const GLOBALLY_OFF = { ...TELEX, onOff: 0 };

	it("types Vietnamese with the method the panel selected", () => {
		const patterns = rows(["example.test", "on"]);

		assert.equal(type("as", { ...GLOBALLY_OFF, patterns, url: "https://example.test/page" }), "á");
	});

	it("stays off where no row matches", () => {
		const patterns = rows(["other.test", "on"]);

		assert.equal(type("as", { ...GLOBALLY_OFF, patterns, url: "https://example.test/page" }), "as");
	});

	it("stays off when the matching row is set to default", () => {
		const patterns = rows(["example.test", "default"]);

		assert.equal(type("as", { ...GLOBALLY_OFF, patterns, url: "https://example.test/page" }), "as");
	});
});

describe("A default row carves an exception out of a broader row", () => {
	const patterns = rows(["*.google.com", "off"], ["docs.google.com", "default"]);

	it("leaves the broad match switched off", () => {
		assert.equal(type("as", { ...TELEX, patterns, url: "https://mail.google.com/" }), "as");
	});

	it("hands the exception back to the panel", () => {
		assert.equal(type("as", { ...TELEX, patterns, url: "https://docs.google.com/" }), "á");
	});
});

describe("The quick setting reads the state off the page it is asked about", () => {
	const ask = (config) => copy(loadEngine(config).tabPatternState());

	it("offers the host when no row matches yet", () => {
		const state = ask({ url: "https://example.test/some/page?q=1" });

		assert.deepEqual(state, {
			url: "https://example.test/some/page?q=1",
			pattern: "example.test",
			mode: "default",
		});
	});

	it("keeps the port, which is part of the host", () => {
		assert.equal(ask({ url: "http://localhost:3000/app" }).pattern, "localhost:3000");
	});

	it("reports the row that won, not the host", () => {
		const patterns = rows(["*.google.com", "off"], ["docs.google.com", "on"]);

		const state = ask({ patterns, url: "https://docs.google.com/document/d/1/edit" });

		assert.equal(state.pattern, "docs.google.com");
		assert.equal(state.mode, "on");
	});

	it("reports a row the user cycled back to default", () => {
		const patterns = rows(["example.test", "default"]);

		assert.equal(ask({ patterns, url: "https://example.test/" }).mode, "default");
	});

	it("offers no pattern for a page that is not http, so the popup hides the control", () => {
		assert.equal(ask({ url: "chrome-extension://abcdef/popup.html" }).pattern, "");
	});
});

describe("A row never reaches a page that is not http", () => {
	// popup.html loads this same engine, so a catch-all row must not gag its own scratchpad
	it("leaves the popup typing Vietnamese under a catch-all off row", () => {
		const patterns = rows(["*", "off"]);
		const url = "chrome-extension://abcdef/popup.html";

		assert.equal(type("as", { ...TELEX, patterns, url }), "á");
	});

	it("still applies that catch-all row to a real page", () => {
		const patterns = rows(["*", "off"]);

		assert.equal(type("as", { ...TELEX, patterns, url: "https://example.test/" }), "as");
	});
});

describe("The tab tells the background what to put on its badge", () => {
	const reports = (config) => copy(loadEngine(config).__messages).filter((message) => message.report_pattern);

	it("reports an override so the badge can be washed out", () => {
		const patterns = rows(["example.test", "off"]);

		assert.deepEqual(reports({ patterns, url: "https://example.test/" }), [
			{ report_pattern: { onOff: 0, overridden: true } },
		]);
	});

	it("reports no override when the page follows the panel", () => {
		assert.deepEqual(reports({ url: "https://example.test/" }), [
			{ report_pattern: { onOff: 1, overridden: false } },
		]);
	});

	it("says nothing at all from a page that is not http", () => {
		assert.deepEqual(reports({ url: "chrome-extension://abcdef/popup.html" }), []);
	});
});

describe("Double-tapping Ctrl still only moves the panel switch", () => {
	const patterns = rows(["example.test", "off"]);
	const PREFS = { method: METHOD.TELEX, ckSpell: 1, oldAccent: 1, shortcutsOn: 0, shortcuts: [], patterns };

	it("leaves the row in charge of the page it named", () => {
		const context = loadEngine({ ...TELEX, patterns, url: "https://example.test/" });
		const input = createInput();

		context.configAVIM({ ...PREFS, onOff: 0 });
		context.configAVIM({ ...PREFS, onOff: 1 });

		assert.equal(typeInto(context, input, "as"), "as");
	});

	it("still reaches a page no row named", () => {
		const context = loadEngine({ ...TELEX, patterns, url: "https://other.test/" });
		const input = createInput();

		context.configAVIM({ ...PREFS, onOff: 0 });

		assert.equal(typeInto(context, input, "as"), "as");
		assert.equal(typeInto(context, createInput(), "as"), "as");
	});
});
