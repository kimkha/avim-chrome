/**
 * Runs the real src/chrome/background.js, src/scripts/avim-engine.js and src/chrome/ime.js together
 * in one node:vm context, the way the service worker loads them, against a fake chrome.input.ime.
 *
 * background.js pulls the other two in with importScripts, so the fake below provides that too: the
 * guard in background.js, the load order, and ime.js calling back into background's own helpers are
 * all exercised rather than assumed.
 */

import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const SRC = path.join(import.meta.dirname, "..", "..", "src");

/** Copies out of the vm realm, or deepStrictEqual fails on the prototype of a vm-created object. */
function plain(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * @param {object} options
 * @param {object} options.stored  what chrome.storage.local already holds
 * @param {number[]} options.tabs  ids of the open tabs
 */
function loadIme({ stored = {}, tabs = [1] } = {}) {
	const storage = { ...stored };
	const calls = [];
	const listeners = new Map();
	const pushedToTabs = [];
	let storageChanged = null;
	let onMessage = null;

	const event = (name) => ({
		addListener(handler) {
			listeners.set(name, handler);
		},
	});

	const record = (name) => async (details) => {
		calls.push({ call: name, ...plain(details) });
	};

	const sandbox = {
		console: { log() {}, warn() {}, error() {} },
		Promise,
		chrome: {
			storage: {
				local: {
					async get(defaults) {
						const entries = Object.entries(defaults);
						return Object.fromEntries(entries.map(([key, blank]) => [key, storage[key] ?? blank]));
					},
					async set(values) {
						const changes = Object.fromEntries(
							Object.entries(values).map(([key, value]) => [key, { newValue: value }]),
						);
						Object.assign(storage, values);
						if (storageChanged) {
							await storageChanged(changes, "local");
						}
					},
				},
				onChanged: {
					addListener(handler) {
						storageChanged = handler;
					},
				},
			},
			tabs: {
				async query() {
					return tabs.map((id) => ({ id }));
				},
				async sendMessage(id, prefs) {
					pushedToTabs.push({ id, prefs: plain(prefs) });
				},
			},
			action: {
				async setBadgeText() {},
				async setBadgeBackgroundColor() {},
				async setBadgeTextColor() {},
			},
			runtime: {
				sendMessage() {
					return Promise.resolve();
				},
				onMessage: {
					addListener(handler) {
						onMessage = handler;
					},
				},
			},
			input: {
				ime: {
					setComposition: record("setComposition"),
					clearComposition: record("clearComposition"),
					commitText: record("commitText"),
					deleteSurroundingText: record("deleteSurroundingText"),
					setMenuItems: record("setMenuItems"),
					onActivate: event("onActivate"),
					onDeactivated: event("onDeactivated"),
					onFocus: event("onFocus"),
					onBlur: event("onBlur"),
					onReset: event("onReset"),
					onKeyEvent: event("onKeyEvent"),
					onSurroundingTextChanged: event("onSurroundingTextChanged"),
					onMenuItemActivated: event("onMenuItemActivated"),
				},
			},
		},
	};

	sandbox.importScripts = (...files) => {
		for (const file of files) {
			const resolved = path.resolve(path.join(SRC, "chrome"), file);
			vm.runInContext(fs.readFileSync(resolved, "utf8"), sandbox, { filename: resolved });
		}
	};

	vm.createContext(sandbox);
	vm.runInContext(fs.readFileSync(path.join(SRC, "chrome", "background.js"), "utf8"), sandbox, {
		filename: "background.js",
	});

	const fire = (name, ...args) => {
		const handler = listeners.get(name);
		if (!handler) {
			throw new Error(`ime.js registered no ${name} listener`);
		}
		return handler(...args);
	};

	/** ime.js writes compositions through a promise chain; let it drain before anything is read. */
	const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

	/** What the field holds around a collapsed caret, as the OS reports it. */
	async function field(text, caret = text.length) {
		await fire("onSurroundingTextChanged", "avim", { text, anchor: caret, focus: caret, offset: 0 });
	}

	/** Same, with a selection open, which is when the word before the caret is not the target. */
	async function selection(text, anchor, focus) {
		await fire("onSurroundingTextChanged", "avim", { text, anchor, focus, offset: 0 });
	}

	/** keydown then keyup, because the real API sends both and only one may act. */
	async function press(key, modifiers = {}) {
		const down = await fire("onKeyEvent", "avim", { type: "keydown", key, code: `Key${key}`, ...modifiers });
		const up = await fire("onKeyEvent", "avim", { type: "keyup", key, code: `Key${key}`, ...modifiers });
		if (up !== false) {
			throw new Error(`keyup for ${key} was consumed; it must always fall through`);
		}
		await settle();
		return down;
	}

	async function type(text, modifiers = {}) {
		const consumed = [];
		for (const char of text) {
			consumed.push(await press(char, modifiers));
		}
		return consumed;
	}

	/** The composition text as the app would see it, or null once nothing is being composed. */
	function composed() {
		for (let at = calls.length - 1; at >= 0; at--) {
			const entry = calls[at];
			if (entry.call === "setComposition") {
				return entry.text;
			}
			if ((entry.call === "clearComposition") || (entry.call === "commitText")) {
				return null;
			}
		}
		return null;
	}

	const committed = () => calls.filter((entry) => entry.call === "commitText").map((entry) => entry.text);

	/** What the popup sends background.js, so a pref the popup changed reaches the IME the real way. */
	function send(message) {
		return new Promise((resolve, reject) => {
			const open = onMessage(message, {}, (response) => resolve(plain(response)));
			if (open !== true) {
				reject(new Error(`background.js ignored ${JSON.stringify(message)}`));
			}
		});
	}

	async function start({ contextID = 7 } = {}) {
		await fire("onActivate", "avim");
		await fire("onFocus", { contextID });
	}

	return {
		start,
		send,
		field,
		selection,
		press,
		type,
		fire,
		composed,
		committed,
		calls,
		storage,
		pushedToTabs,
		menu: () => calls.filter((entry) => entry.call === "setMenuItems").at(-1)?.items,
		/** Just the composition traffic, in the order the OS received it. */
		writes: () => calls.filter((entry) => entry.call !== "setMenuItems").map((entry) => entry.call),
		deletes: () => calls.filter((entry) => entry.call === "deleteSurroundingText"),
		reset: () => calls.splice(0, calls.length),
	};
}

export { loadIme };
