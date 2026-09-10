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
 * @param {boolean} options.noPageOpen   make the page push reject, as it does with no popup open
 * @param {string} options.platform      what runtime.getPlatformInfo reports: "cros" is ChromeOS
 * @param {boolean} options.noWindow     make tabs.create reject, as it does before any window exists
 */
function loadBackground({
	stored = {},
	tabs = [1, 2],
	mutedTabs = [],
	noPageOpen = false,
	platform = "linux",
	noWindow = false,
} = {}) {
	const storage = { ...stored };
	const pushedToTabs = [];
	const pushedToPages = [];
	const openedTabs = [];
	const badge = {};
	const tabBadges = new Map();
	let onMessage = null;
	let onInstalled = null;
	let onStartup = null;

	function badgeFor(tabId) {
		if (tabId === undefined) {
			return badge;
		}
		if (!tabBadges.has(tabId)) {
			tabBadges.set(tabId, {});
		}
		return tabBadges.get(tabId);
	}

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
				async create({ url }) {
					if (noWindow) {
						throw new Error("No current window");
					}
					openedTabs.push(url);
					return { id: 99 };
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
				async setBadgeText({ text, tabId }) {
					badgeFor(tabId).text = text;
				},
				async setBadgeBackgroundColor({ color, tabId }) {
					badgeFor(tabId).color = [...color];
				},
				async setBadgeTextColor({ color, tabId }) {
					badgeFor(tabId).textColor = [...color];
				},
			},
			runtime: {
				async getPlatformInfo() {
					return { os: platform };
				},
				getURL(page) {
					return `chrome-extension://avim/${page}`;
				},
				onInstalled: {
					addListener(handler) {
						onInstalled = handler;
					},
				},
				onStartup: {
					addListener(handler) {
						onStartup = handler;
					},
				},
				sendMessage(prefs) {
					if (noPageOpen) {
						return Promise.reject(new Error("Receiving end does not exist."));
					}
					pushedToPages.push(JSON.parse(JSON.stringify(prefs)));
					return Promise.resolve();
				},
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
	function send(message, sender = {}) {
		return new Promise((resolve, reject) => {
			const reply = (response) => {
				resolve(response === undefined ? undefined : JSON.parse(JSON.stringify(response)));
			};
			const keepsChannelOpen = onMessage(message, sender, reply);
			if (keepsChannelOpen !== true) {
				reject(new Error(`background.js ignored ${JSON.stringify(message)}`));
			}
		});
	}

	/** Chrome fires this for a fresh install and for an update alike. */
	async function install(details = { reason: "install" }) {
		onInstalled(details);
		await new Promise((resolve) => setTimeout(resolve, 0));
	}

	async function restart() {
		onStartup();
		await new Promise((resolve) => setTimeout(resolve, 0));
	}

	return {
		send,
		install,
		restart,
		storage,
		pushedToTabs,
		pushedToPages,
		openedTabs,
		badge,
		tabBadge: (id) => tabBadges.get(id),
	};
}

export { loadBackground };
