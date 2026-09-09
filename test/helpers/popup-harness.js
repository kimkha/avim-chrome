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
	patterns: [],
};

const DEFAULT_TAB_PATTERN = { url: "https://example.test/page", pattern: "*://example.test/*", mode: "default" };

function createElement(id, tagName = "div", onFocus) {
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
			if (onFocus) {
				onFocus(this);
			}
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
 * @param {string} options.demoText      what the background replies to `get_demo_text`
 * @param {boolean} options.deferDemoText  hold that reply back until deliverDemoText() is called
 * @param {boolean} options.clipboardFails  make navigator.clipboard.writeText reject
 * @param {object} options.tabPattern    what the active tab's content script replies to get_tab_pattern
 * @param {boolean} options.noContentScript  make that reply fail, as a chrome:// tab does
 * @param {boolean} options.noActiveTab  make tabs.query come back empty
 */
function loadPopup({
	prefs: overrides = {},
	demoText = "",
	deferDemoText = false,
	clipboardFails = false,
	tabPattern = DEFAULT_TAB_PATTERN,
	noContentScript = false,
	noActiveTab = false,
} = {}) {
	const prefs = { ...DEFAULT_PREFS, ...overrides };
	const ACTIVE_TAB_ID = 7;
	let tabState = tabPattern;

	let activeElement = null;
	function noteFocus(element) {
		if (activeElement) {
			activeElement.focused = false;
		}
		activeElement = element;
	}

	const elements = new Map(ELEMENT_IDS.map((id) => [id, createElement(id, "div", noteFocus)]));
	const sent = [];
	const pushListeners = [];
	const clipboardWrites = [];
	const execCommands = [];
	const reloads = [];
	const searchQueries = [];
	let pendingDemoText = null;
	const createdTabs = [];
	const tabQueries = [];
	const tabMessages = [];
	const rejection = new Error("Document is not focused.");
	let pendingClipboard = Promise.resolve();

	const sandbox = {
		console: { log() {}, warn() {}, error() {} },
		Promise,
		chrome: {
			runtime: {
				onMessage: {
					addListener(listener) {
						pushListeners.push(listener);
					},
				},
				sendMessage(message, callback) {
					// copied into this realm: a vm-created object fails deepStrictEqual on prototype
					sent.push(JSON.parse(JSON.stringify(message)));
					if (message.get_prefs) {
						callback(prefs);
						return;
					}
					if (message.get_demo_text) {
						if (deferDemoText) {
							pendingDemoText = callback;
							return;
						}
						callback(demoText);
						return;
					}
					// Stands in for the engine recomputing: the saved row for this exact tab wins
					if (message.patterns !== undefined && tabState) {
						const saved = message.patterns.find((row) => row.pattern === tabState.pattern);
						tabState = { ...tabState, mode: saved ? saved.mode : "default" };
					}
					callback({});
				},
			},
			i18n: {
				getMessage(name) {
					return enMessages[name] ? enMessages[name].message : "";
				},
			},
			search: {
				query(queryInfo) {
					searchQueries.push(JSON.parse(JSON.stringify(queryInfo)));
				},
			},
			tabs: {
				create(properties) {
					createdTabs.push(JSON.parse(JSON.stringify(properties)));
				},
				query(queryInfo, callback) {
					tabQueries.push(JSON.parse(JSON.stringify(queryInfo)));
					callback(noActiveTab ? [] : [{ id: ACTIVE_TAB_ID }]);
				},
				sendMessage(tabId, message, options, callback) {
					tabMessages.push({
						tabId,
						message: JSON.parse(JSON.stringify(message)),
						options: JSON.parse(JSON.stringify(options)),
					});
					// lastError is how Chrome reports a tab with no listener, and it clears after
					sandbox.chrome.runtime.lastError = noContentScript
						? { message: "Could not establish connection. Receiving end does not exist." }
						: undefined;
					callback(noContentScript ? undefined : JSON.parse(JSON.stringify(tabState)));
					sandbox.chrome.runtime.lastError = undefined;
				},
			},
		},
		document: {
			get activeElement() {
				return activeElement;
			},
			getElementById(id) {
				return elements.get(id) ?? null;
			},
			createElement(tagName) {
				return createElement("", tagName, noteFocus);
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

	function fire(id, event, eventObject) {
		const target = element(id);
		const handlers = target.listeners[event] || [];
		if (handlers.length === 0) {
			throw new Error(`#${id} has no ${event} listener`);
		}
		for (const handler of handlers) {
			handler(eventObject);
		}
	}

	function shortcutRows() {
		return element("shortcutList").children.map((row) => {
			const [keyInput, resultInput] = row.children.filter((child) => child.tagName === "input");
			const [removeButton] = row.children.filter((child) => child.tagName === "button");
			return { row, keyInput, resultInput, removeButton };
		});
	}

	function patternRows() {
		return element("patternList").children.map((row) => {
			const [patternInput] = row.children.filter((child) => child.tagName === "input");
			const [modeSelect] = row.children.filter((child) => child.tagName === "select");
			const [removeButton] = row.children.filter((child) => child.tagName === "button");
			return { row, patternInput, modeSelect, removeButton };
		});
	}

	/** Runs the listeners of an element the page built itself, which has no id to look up. */
	function fireOn(target, event, eventObject) {
		const handlers = target.listeners[event] || [];
		if (handlers.length === 0) {
			throw new Error(`the ${target.tagName} has no ${event} listener`);
		}
		for (const handler of handlers) {
			handler(eventObject);
		}
	}

	return {
		element,
		activeElement: () => activeElement,
		pushPrefs: (prefs) => pushListeners.forEach((listener) => listener(prefs)),
		fire,
		deliverDemoText: () => pendingDemoText(demoText),
		fireOn,
		shortcutRows,
		patternRows,
		tabQueries,
		tabMessages,
		tabPattern: () => tabState,
		// what popup.js left for the engine to skip; avim-engine.js owns this global in the real popup
		excluded: () => sandbox.exclude ?? [],
		sent,
		writes: () => sent.filter((message) => !message.get_prefs && !message.get_demo_text),
		searchQueries,
		createdTabs,
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
