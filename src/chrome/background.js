/** Stored as strings because chrome.storage.local.get uses the default's type to fill blanks. */
const DEFAULT_PREFS = {
	method: '0',
	onOff: '1',
	ckSpell: '1',
	oldAccent: '1',
	shortcutsOn: '0'
};

const PREF_KEYS = Object.keys(DEFAULT_PREFS);

const SHORTCUTS_KEY = 'shortcuts';

const PATTERNS_KEY = 'patterns';

const PATTERN_MODES = ['on', 'off', 'default'];

const DEMO_TEXT_KEY = 'demoText';

/** A blank key is a row the user emptied out, which is how a shortcut is deleted. */
function cleanShortcuts(list) {
	if (!Array.isArray(list)) {
		return [];
	}
	return list
		.filter((entry) => entry && (typeof entry.key === 'string') && (entry.key.length > 0))
		.map((entry) => ({ key: entry.key, value: String(entry.value ?? '') }));
}

/** An unknown mode falls back to 'default', which leaves the tab on whatever the popup selected. */
function cleanPatterns(list) {
	if (!Array.isArray(list)) {
		return [];
	}
	return list
		.filter((entry) => entry && (typeof entry.pattern === 'string') && (entry.pattern.length > 0))
		.map((entry) => ({
			pattern: entry.pattern,
			mode: PATTERN_MODES.includes(entry.mode) ? entry.mode : 'default'
		}));
}

/** Popup-only scratchpad, kept out of getPrefs() so it is never broadcast to every tab. */
async function getDemoText() {
	const stored = await chrome.storage.local.get({ [DEMO_TEXT_KEY]: '' });
	return String(stored[DEMO_TEXT_KEY] ?? '');
}

async function saveDemoText(text) {
	await chrome.storage.local.set({ [DEMO_TEXT_KEY]: String(text ?? '') });
}

async function getShortcuts() {
	const stored = await chrome.storage.local.get({ [SHORTCUTS_KEY]: '[]' });
	try {
		return cleanShortcuts(JSON.parse(stored[SHORTCUTS_KEY]));
	} catch {
		return [];
	}
}

async function getPatterns() {
	const stored = await chrome.storage.local.get({ [PATTERNS_KEY]: '[]' });
	try {
		return cleanPatterns(JSON.parse(stored[PATTERNS_KEY]));
	} catch {
		return [];
	}
}

/** The washed-out pair marks a tab a URL row decided, next to the solid pair the popup set. */
const BADGE = {
	on: { text: 'on', color: [0, 128, 0, 255], textColor: [255, 255, 255, 255] },
	off: { text: 'off', color: [255, 0, 0, 255], textColor: [255, 255, 255, 255] },
	onPattern: { text: 'on', color: [199, 240, 226, 255], textColor: [0, 0, 0, 255] },
	offPattern: { text: 'off', color: [251, 211, 188, 255], textColor: [0, 0, 0, 255] }
};

/** Every consumer wants numbers, so the stored strings are parsed here once. */
async function getPrefs() {
	const [stored, shortcuts, patterns] = await Promise.all([
		chrome.storage.local.get(DEFAULT_PREFS),
		getShortcuts(),
		getPatterns()
	]);
	return {
		...Object.fromEntries(PREF_KEYS.map((key) => [key, Number.parseInt(stored[key], 10)])),
		shortcuts,
		patterns
	};
}

async function paintBadge(badge, tabId) {
	const scope = tabId === undefined ? {} : { tabId };
	await Promise.all([
		chrome.action.setBadgeText({ ...scope, text: badge.text }),
		chrome.action.setBadgeBackgroundColor({ ...scope, color: badge.color }),
		chrome.action.setBadgeTextColor({ ...scope, color: badge.textColor })
	]);
}

/** The default badge, which a tab with no content script to report keeps showing. */
async function updateIcon(prefs) {
	await paintBadge(prefs.onOff === 1 ? BADGE.on : BADGE.off);
}

async function showTabState(tabId, { onOff, overridden }) {
	const solid = onOff === 1 ? BADGE.on : BADGE.off;
	const pale = onOff === 1 ? BADGE.onPattern : BADGE.offPattern;
	await paintBadge(overridden ? pale : solid, tabId);
}

async function updateAllTabs(prefs) {
	const tabs = await chrome.tabs.query({});
	// A tab with no content script (chrome://, the web store) rejects; that is expected, not an error.
	await Promise.all(tabs.map((tab) => chrome.tabs.sendMessage(tab.id, prefs).catch(() => {})));
	// The popup is not a tab, so the query above never reaches it.
	await chrome.runtime.sendMessage(prefs).catch(() => {});
	await updateIcon(prefs);
}

async function turnAvim() {
	const { onOff } = await getPrefs();
	await chrome.storage.local.set({ onOff: onOff === 1 ? '0' : '1' });
	const flipped = await getPrefs();
	await updateAllTabs(flipped);
	return flipped;
}

async function savePrefs(request) {
	const changed = PREF_KEYS.filter((key) => request[key] !== undefined);
	const written = Object.fromEntries(changed.map((key) => [key, String(request[key])]));
	if (request[SHORTCUTS_KEY] !== undefined) {
		written[SHORTCUTS_KEY] = JSON.stringify(cleanShortcuts(request[SHORTCUTS_KEY]));
	}
	if (request[PATTERNS_KEY] !== undefined) {
		written[PATTERNS_KEY] = JSON.stringify(cleanPatterns(request[PATTERNS_KEY]));
	}
	await chrome.storage.local.set(written);
	await updateAllTabs(await getPrefs());
}

// Returning true keeps the message channel open until the promise settles and calls sendResponse.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.get_prefs) {
		getPrefs().then(sendResponse);
		return true;
	}

	if (request.save_prefs) {
		savePrefs(request).then(() => sendResponse());
		return true;
	}

	if (request.get_demo_text) {
		getDemoText().then(sendResponse);
		return true;
	}

	// Checked against undefined, not truthiness: clearing the scratchpad sends an empty string.
	if (request.save_demo_text !== undefined) {
		saveDemoText(request.save_demo_text).then(() => sendResponse());
		return true;
	}

	if (request.turn_avim) {
		turnAvim().then(sendResponse);
		return true;
	}

	// sender.tab.id needs no "tabs" permission, and a report from the popup's own engine has no tab
	if (request.report_pattern && sender.tab) {
		showTabState(sender.tab.id, request.report_pattern).then(() => sendResponse());
		return true;
	}
});

getPrefs().then(updateIcon);
