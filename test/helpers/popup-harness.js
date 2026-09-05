/**
 * Runs the real src/chrome/popup.js in a fresh node:vm context per test. The fake DOM is built
 * from the ids actually present in src/popup.html, so a getElementById for an id the page does not
 * have returns null and fails loudly instead of silently passing.
 */

import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const SRC = path.join(import.meta.dirname, "..", "..", "src");
const POPUP_JS = path.join(SRC, "chrome", "popup.js");

const popupSource = fs.readFileSync(POPUP_JS, "utf8");
const popupHtml = fs.readFileSync(path.join(SRC, "popup.html"), "utf8");
const enMessages = JSON.parse(fs.readFileSync(path.join(SRC, "_locales", "en", "messages.json"), "utf8"));

const ELEMENT_IDS = [...popupHtml.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);

const DEFAULT_PREFS = {
	method: 0,
	onOff: 1,
	ckSpell: 1,
	oldAccent: 1,
	shortcutsOn: 0,
	shortcuts: [],
};

function createElement(id, tagName = "div") {
	return {
		id,
		tagName,
		type: "",
		name: "",
		value: "",
		checked: false,
		disabled: false,
		placeholder: "",
		textContent: "",
		focused: false,
		selected: false,
		style: {},
		children: [],
		listeners: {},
		addEventListener(event, handler) {
			this.listeners[event] = this.listeners[event] || [];
			this.listeners[event].push(handler);
		},
		appendChild(child) {
			this.children.push(child);
			return child;
		},
		removeChild(child) {
			this.children = this.children.filter((entry) => entry !== child);
			return child;
		},
		focus() {
			this.focused = true;
		},
		select() {
			this.selected = true;
		},
	};
}

/**
 * @param {object} options
 * @param {object} options.prefs         what the background replies to `get_prefs`
 * @param {boolean} options.clipboardFails  make navigator.clipboard.writeText reject
 */
function loadPopup({ prefs: overrides = {}, clipboardFails = false } = {}) {
	const prefs = { ...DEFAULT_PREFS, ...overrides };

	const elements = new Map(ELEMENT_IDS.map((id) => [id, createElement(id)]));
	const sent = [];
	const clipboardWrites = [];
	const execCommands = [];
	const reloads = [];
	const rejection = new Error("Document is not focused.");
	let pendingClipboard = Promise.resolve();

	const sandbox = {
		console: { log() {}, warn() {}, error() {} },
		Promise,
		chrome: {
			runtime: {
				sendMessage(message, callback) {
					// copied into this realm: a vm-created object fails deepStrictEqual on prototype
					sent.push(JSON.parse(JSON.stringify(message)));
					if (message.get_prefs) {
						callback(prefs);
						return;
					}
					callback({});
				},
			},
			i18n: {
				getMessage(name) {
					return enMessages[name] ? enMessages[name].message : "";
				},
			},
		},
		document: {
			getElementById(id) {
				return elements.get(id) ?? null;
			},
			createElement(tagName) {
				return createElement("", tagName);
			},
			execCommand(command) {
				execCommands.push(command);
				return true;
			},
		},
		navigator: {
			clipboard: {
				writeText(text) {
					clipboardWrites.push(text);
					pendingClipboard = clipboardFails ? Promise.reject(rejection) : Promise.resolve();
					return pendingClipboard;
				},
			},
		},
	};
	sandbox.window = {
		document: sandbox.document,
		location: {
			reload() {
				reloads.push(true);
			},
		},
	};

	vm.createContext(sandbox);
	vm.runInContext(popupSource, sandbox, { filename: POPUP_JS });

	function element(id) {
		const found = elements.get(id);
		if (!found) {
			throw new Error(`popup.html has no #${id}`);
		}
		return found;
	}

	function fire(id, event) {
		const target = element(id);
		const handlers = target.listeners[event] || [];
		if (handlers.length === 0) {
			throw new Error(`#${id} has no ${event} listener`);
		}
		for (const handler of handlers) {
			handler();
		}
	}

	function shortcutRows() {
		return element("shortcutList").children.map((row) => {
			const [keyInput, resultInput] = row.children.filter((child) => child.tagName === "input");
			const [removeButton] = row.children.filter((child) => child.tagName === "button");
			return { row, keyInput, resultInput, removeButton };
		});
	}

	/** Runs the listeners of an element the page built itself, which has no id to look up. */
	function fireOn(target, event) {
		const handlers = target.listeners[event] || [];
		if (handlers.length === 0) {
			throw new Error(`the ${target.tagName} has no ${event} listener`);
		}
		for (const handler of handlers) {
			handler();
		}
	}

	return {
		element,
		fire,
		fireOn,
		shortcutRows,
		// what popup.js left for the engine to skip; avim-ext.js owns this global in the real popup
		excluded: () => sandbox.exclude ?? [],
		sent,
		clipboardWrites,
		execCommands,
		reloads,
		// the fallback runs in a rejection handler, so tests must let the microtask queue drain
		settled: () => pendingClipboard.catch(() => {}),
	};
}

export {
	loadPopup,
	ELEMENT_IDS,
	enMessages,
};
