/** Stored as strings because chrome.storage.local.get uses the default's type to fill blanks. */
const DEFAULT_PREFS = {
	method: '0',
	onOff: '1',
	ckSpell: '1',
	oldAccent: '1',
	shortcutsOn: '0'
};

const PREF_KEYS = Object.keys(DEFAULT_PREFS);

/** The two Telex helpers the engine itself does not produce, plus how they are capitalised. */
const DEFAULT_SHORTCUTS = [
	{ key: 'w', value: 'ư' },
	{ key: 'W', value: 'Ư' },
	{ key: 'uow', value: 'ươ' },
	{ key: 'Uow', value: 'Ươ' },
	{ key: 'UOW', value: 'ƯƠ' }
];

const SHORTCUTS_KEY = 'shortcuts';

/** A blank key matches every word, so an empty row is a deletion rather than a rule. */
function cleanShortcuts(list) {
	if (!Array.isArray(list)) {
		return DEFAULT_SHORTCUTS;
	}
	return list
		.filter((entry) => entry && (typeof entry.key === 'string') && (entry.key.length > 0))
		.map((entry) => ({ key: entry.key, value: String(entry.value ?? '') }));
}

async function getShortcuts() {
	const stored = await chrome.storage.local.get({ [SHORTCUTS_KEY]: JSON.stringify(DEFAULT_SHORTCUTS) });
	try {
		return cleanShortcuts(JSON.parse(stored[SHORTCUTS_KEY]));
	} catch (error) {
		return DEFAULT_SHORTCUTS;
	}
}

const BADGE = {
	on: { text: 'on', color: [0, 255, 0, 255] },
	off: { text: 'off', color: [255, 0, 0, 255] }
};

/** Every consumer wants numbers, so the stored strings are parsed here once. */
async function getPrefs() {
	const [stored, shortcuts] = await Promise.all([
		chrome.storage.local.get(DEFAULT_PREFS),
		getShortcuts()
	]);
	return {
		...Object.fromEntries(PREF_KEYS.map((key) => [key, Number.parseInt(stored[key], 10)])),
		shortcuts
	};
}

async function updateIcon(prefs) {
	const badge = prefs.onOff === 1 ? BADGE.on : BADGE.off;
	await Promise.all([
		chrome.action.setBadgeText({ text: badge.text }),
		chrome.action.setBadgeBackgroundColor({ color: badge.color })
	]);
}

async function updateAllTabs(prefs) {
	const tabs = await chrome.tabs.query({});
	// A tab with no content script (chrome://, the web store) rejects; that is expected, not an error.
	await Promise.all(tabs.map((tab) => chrome.tabs.sendMessage(tab.id, prefs).catch(() => {})));
	await updateIcon(prefs);
}

async function turnAvim() {
	const { onOff } = await getPrefs();
	await chrome.storage.local.set({ onOff: onOff === 1 ? '0' : '1' });
	await updateAllTabs(await getPrefs());
}

async function savePrefs(request) {
	const changed = PREF_KEYS.filter((key) => request[key] !== undefined);
	const written = Object.fromEntries(changed.map((key) => [key, String(request[key])]));
	if (request[SHORTCUTS_KEY] !== undefined) {
		written[SHORTCUTS_KEY] = JSON.stringify(cleanShortcuts(request[SHORTCUTS_KEY]));
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

	if (request.turn_avim) {
		turnAvim().then(() => sendResponse());
		return true;
	}
});

getPrefs().then(updateIcon);
