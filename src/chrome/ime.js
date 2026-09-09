/**
 * AVIM as a ChromeOS input method. Same engine as the content script, different surface: instead of
 * rewriting the DOM it owns a composition buffer, so Slate, CKEditor 5, shadow DOM and every other
 * framework problem the content script fights simply does not arise. Loaded by background.js, which
 * only imports this file where chrome.input.ime exists.
 *
 * The engine has no idea a caret exists: hand it the text before the caret plus the key just typed
 * and it hands back what the text should become. Here that text is the composition buffer.
 */

const IME_ENGINE_ID = "avim";

const METHOD_MENU_PREFIX = "avim-method-";

/** Index is the `method` pref the engine reads. */
const METHOD_LABELS = ["Tự động", "Telex", "VNI", "VIQR", "VIQR*"];

/** Enter and Tab do more than insert text, so the app always gets them; the engine sees keypress
 * codes, where they are the control characters. */
const CONTROL_CHARS = { Enter: "\r", Tab: "\t" };

/** VIQR spends Alt+\ and Alt+~ on tone marks; every other modifier chord belongs to the app. */
const VIQR_ALT_KEYS = ["\\", "~"];

let contextID = null;
let buffer = "";
/** What the field holds around the caret, or null while unknown: see onSurroundingTextChanged. */
let surrounding = null;
/** Composition writes are async but must land in call order, deleting before replacing. */
let pending = Promise.resolve();

function queue(work) {
	pending = pending.then(work).catch(() => {});
}

function methodMenu() {
	return METHOD_LABELS.map((label, index) => ({
		id: `${METHOD_MENU_PREFIX}${index}`,
		label,
		style: "radio",
		checked: method === index,
	}));
}

/**
 * The popup cannot be reached while a composition is in flight — it lives in the browser toolbar and
 * switching windows to it destroys the composition — so the method is also switchable from here.
 */
async function showMenu(engineID) {
	await chrome.input.ime.setMenuItems({ engineID, items: methodMenu() });
}

/**
 * onKeyEvent has to answer synchronously, so the prefs the engine reads are globals kept warm here.
 * A key that arrives before the first read lands (cold service worker) is transformed with the
 * defaults, which is what Unikey and Laban Key do too.
 */
async function loadPrefs() {
	const prefs = await getPrefs();
	method = prefs.method;
	onOff = prefs.onOff;
	checkSpell = prefs.ckSpell;
	oldAccent = prefs.oldAccent;
	shortcutMap = prefs.shortcutsOn === 1 ? buildShortcutMap(prefs.shortcuts) : new Map();
	if (AVIMObj === null) {
		AVIMObj = new AVIM();
	}
}

function render() {
	if (contextID === null) {
		return;
	}
	if (buffer === "") {
		queue(() => chrome.input.ime.clearComposition({ contextID }));
		return;
	}
	queue(() => chrome.input.ime.setComposition({ contextID, text: buffer, cursor: buffer.length }));
}

/** Ends the word: what is composed becomes real text, and the buffer starts over. */
function commit(text) {
	buffer = "";
	if ((contextID === null) || (text === "")) {
		return;
	}
	// The field is about to change, so what we know about it is stale until the next event.
	surrounding = null;
	queue(() => chrome.input.ime.commitText({ contextID, text }));
}

/**
 * Hands back the word already sitting before the caret, so a tone key can still fix a word typed
 * earlier — the thing a composition-only IME cannot do. Empty when there is no word there, when a
 * selection is open, or whenever the field's contents are not currently known.
 */
function wordBeforeCaret() {
	if ((surrounding === null) || (buffer !== "")) {
		return "";
	}
	return wordBefore(surrounding.text.slice(0, surrounding.caret));
}

/** Takes the word out of the field and into the composition, ours to rewrite from here on. */
function adopt(length) {
	surrounding = null;
	queue(() => chrome.input.ime.deleteSurroundingText({
		engineID: IME_ENGINE_ID,
		contextID,
		offset: -length,
		length,
	}));
}

function typedChar(keyData) {
	return CONTROL_CHARS[keyData.key] ?? (keyData.key.length === 1 ? keyData.key : null);
}

/**
 * True once the key ended up appended untouched: the word is over. A tone key looks like punctuation
 * but is consumed by the engine, so VIQR "a" + "." composes on as "ạ" rather than committing.
 */
function endsWord(char, want) {
	return notWord(char) && want.endsWith(char);
}

function handleKey(keyData) {
	if (keyData.ctrlKey || (keyData.altKey && !VIQR_ALT_KEYS.includes(keyData.key))) {
		commit(buffer);
		return false;
	}
	if (onOff === 0) {
		commit(buffer);
		return false;
	}
	if (keyData.key === "Backspace") {
		if (buffer === "") {
			return false;
		}
		buffer = buffer.slice(0, -1);
		render();
		return true;
	}

	const char = typedChar(keyData);
	// Arrows, Escape, the function row, a modifier on its own: nothing to type, so end the word.
	if (char === null) {
		commit(buffer);
		return false;
	}
	if (CONTROL_CHARS[keyData.key]) {
		const edit = shortcutEdit(buffer, char);
		commit(edit === null ? buffer : edit.text);
		return false;
	}
	if (buffer === "") {
		const tail = wordBeforeCaret();
		const fixed = tail === "" ? null : rewriteBefore(tail, char, char.charCodeAt(0));
		// A letter continues the word that is already there; punctuation only claims it when the engine
		// spends the key on a tone, so a space after existing text is left well alone.
		if ((fixed !== null) && (!notWord(char) || (fixed !== tail + char))) {
			adopt(tail.length);
			if (endsWord(char, fixed)) {
				commit(fixed);
			} else {
				buffer = fixed;
				render();
			}
			return true;
		}
		// The engine cannot read an empty editor, and a boundary key alone starts no word anyway.
		if (notWord(char)) {
			return false;
		}
		buffer = char;
		render();
		return true;
	}

	const want = rewriteBefore(buffer, char, char.charCodeAt(0));
	// A comma and its like: the engine never sees them and no shortcut fired, so they are the app's.
	if (want === null) {
		commit(buffer);
		return false;
	}
	if (endsWord(char, want)) {
		commit(want);
		return true;
	}
	buffer = want;
	render();
	return true;
}

function registerIme() {
	const ime = chrome.input.ime;

	ime.onActivate.addListener(async (engineID) => {
		await loadPrefs();
		await showMenu(engineID);
	});

	ime.onDeactivated.addListener(() => {
		contextID = null;
		buffer = "";
	});

	ime.onFocus.addListener(async (context) => {
		contextID = context.contextID;
		buffer = "";
		surrounding = null;
		await loadPrefs();
	});

	ime.onBlur.addListener(() => {
		contextID = null;
		buffer = "";
		surrounding = null;
	});

	// The app threw the composition away; committing here would put back what it just dropped.
	ime.onReset.addListener(() => {
		buffer = "";
		surrounding = null;
	});

	// `focus` is the caret; it differs from `anchor` only while a selection is open. Fires on focus, on
	// caret moves and after every change, including the ones we make ourselves.
	ime.onSurroundingTextChanged.addListener((engineID, info) => {
		const collapsed = info.anchor === info.focus;
		surrounding = collapsed ? { text: info.text, caret: info.focus - info.offset } : null;
	});

	ime.onKeyEvent.addListener((engineID, keyData) => {
		// Every key arrives twice; acting on both would transform it twice.
		if (keyData.type !== "keydown") {
			return false;
		}
		return handleKey(keyData);
	});

	ime.onMenuItemActivated.addListener(async (engineID, menuID) => {
		if (!menuID.startsWith(METHOD_MENU_PREFIX)) {
			return;
		}
		// The popup writes prefs the same way, so a method picked here reaches the content script too.
		await savePrefs({ method: Number(menuID.slice(METHOD_MENU_PREFIX.length)) });
		await loadPrefs();
		await showMenu(engineID);
	});

	// An IME has no tab, so the push background.js sends content scripts never arrives here.
	chrome.storage.onChanged.addListener(async (changes, area) => {
		if (area !== "local") {
			return;
		}
		await loadPrefs();
		await showMenu(IME_ENGINE_ID);
	});
}

registerIme();
