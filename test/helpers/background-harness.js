/**
 * Runs the real src/chrome/background.js in a fresh node:vm context per test, against a fake chrome
 * whose storage is a flat record of strings, the way chrome.storage.local actually behaves.
 */

import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const BACKGROUND_JS = path.join(import.meta.dirname, "..", "..", "src", "chrome", "background.js");

const backgroundSource = fs.readFileSync(BACKGROUND_JS, "utf8");

/**
 * @param {object} options
 * @param {object} options.stored       what chrome.storage.local already holds
 * @param {number[]} options.tabs       ids of the open tabs
 * @param {number[]} options.mutedTabs  tabs that reject, as one with no content script does
 */
function loadBackground({ stored = {}, tabs = [1, 2], mutedTabs = [] } = {}) {
	const storage = { ...stored };
	const pushedToTabs = [];
	const badge = {};
	let onMessage = null;

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
						Object.assign(storage, values);
					},
				},
			},
			tabs: {
				async query() {
					return tabs.map((id) => ({ id }));
				},
				async sendMessage(id, prefs) {
					if (mutedTabs.includes(id)) {
						throw new Error(`Could not establish connection to tab ${id}`);
					}
					// copied into this realm: a vm-created object fails deepStrictEqual on prototype
					pushedToTabs.push({ id, prefs: JSON.parse(JSON.stringify(prefs)) });
				},
			},
			action: {
				async setBadgeText({ text }) {
					badge.text = text;
				},
				async setBadgeBackgroundColor({ color }) {
					badge.color = [...color];
				},
			},
			runtime: {
				onMessage: {
					addListener(handler) {
						onMessage = handler;
					},
				},
			},
		},
	};

	vm.createContext(sandbox);
	vm.runInContext(backgroundSource, sandbox, { filename: "background.js" });

	/** Resolves with what the service worker hands to sendResponse, copied into this realm. */
	function send(message) {
		return new Promise((resolve, reject) => {
			const reply = (response) => {
				resolve(response === undefined ? undefined : JSON.parse(JSON.stringify(response)));
			};
			const keepsChannelOpen = onMessage(message, {}, reply);
			if (keepsChannelOpen !== true) {
				reject(new Error(`background.js ignored ${JSON.stringify(message)}`));
			}
		});
	}

	return { send, storage, pushedToTabs, badge };
}

export { loadBackground };
