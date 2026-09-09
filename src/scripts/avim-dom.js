/*
 *  AVIM for Chrome: the DOM half. The transform itself lives in avim-engine.js, which this file
 *  needs loaded first; see that file for the copyright and the GPLv3 notice.
 */

/** The outermost editable ancestor: where an editor with its own model listens, and it survives
 * that editor re-rendering the text node out from under us between two dispatches. */
function editingHost(node) {
	let element = node.parentNode;
	let host = element;
	while (element && element.isContentEditable) {
		host = element;
		element = element.parentNode;
	}
	return host;
}

/** Tags an editor uses for a line: the word before the caret never reaches back past one. */
const BLOCK_TAGS = ["DIV", "P", "LI", "TD", "TH", "BLOCKQUOTE", "PRE", "SECTION", "ARTICLE", "DD", "DT", "H1", "H2", "H3", "H4", "H5", "H6"];

function blockOf(node, host) {
	let element = node.parentNode;
	while (element && (element !== host) && !BLOCK_TAGS.includes(element.nodeName)) {
		element = element.parentNode;
	}
	return element ?? host;
}

/** An embedded widget (emoji image, mention chip): part of the line but not of any word. */
function isUneditableIsland(element) {
	return (element.nodeType === 1) && (element.getAttribute("contenteditable") === "false");
}

/** The text node before `node`, in the same line of `host`. Walks with plain DOM links, so the
 * fake DOM the unit tests run on simply finds nothing and the caret's own node is all there is. */
function previousTextNode(host, node, block) {
	let current = node;
	while (current && (current !== host)) {
		if (!current.previousSibling) {
			current = current.parentNode;
			continue;
		}
		current = current.previousSibling;
		while (current.lastChild && !isUneditableIsland(current)) {
			current = current.lastChild;
		}
		if (current.nodeType === 3) {
			return blockOf(current, host) === block ? current : null;
		}
		// Anything that is not text — a <br>, an emoji <img>, an uneditable chip — ends the word.
		// Walking past one used to join the words around it and the diacritics stopped landing.
		return null;
	}
	return null;
}

/**
 * The text before the caret, in the pieces it is stored in. An editor splits a word across elements
 * for anything inline — bold, a mention, an emoji — and Slate, Lexical and ProseMirror wrap every
 * leaf in its own span, so reading the caret's text node alone loses the start of the word.
 */
function partsBeforeCaret(host, node, caret) {
	const parts = [{ node, text: node.data.slice(0, caret) }];
	const block = blockOf(node, host);
	let text = parts[0].text;
	while (![...text].some(notWord)) {
		const previous = previousTextNode(host, parts[0].node, block);
		if (!previous) {
			break;
		}
		parts.unshift({ node: previous, text: previous.data });
		text = previous.data + text;
	}
	return parts;
}

/** Where `offset` into the joined text sits: the piece holding it, and how far into that piece. */
function locate(parts, offset) {
	let remaining = offset;
	for (const part of parts) {
		if (remaining <= part.text.length) {
			return { node: part.node, offset: remaining };
		}
		remaining -= part.text.length;
	}
	const last = parts[parts.length - 1];
	return { node: last.node, offset: last.text.length };
}

/** Fires beforeinput on the editable. False when a listener claimed the edit for its own model. */
function emitBeforeInput(host, inputType, data, target) {
	return host.dispatchEvent(new InputEvent("beforeinput", {
		inputType,
		data,
		bubbles: true,
		cancelable: true,
		composed: true,
		targetRanges: target ? [target] : []
	}));
}

/**
 * Editors that re-render from their own model revert a DOM edit they never saw (Slate, so Discord;
 * CKEditor, so many a CMS). Ones with a MutationObserver reconciler keep it (Lexical, Quill,
 * ProseMirror) and mangle a synthetic beforeinput instead, so the channel has to be chosen per
 * host, and whether an editor survives one cannot be probed. An allowlist, keyed on what each
 * editor leaves in the DOM.
 */
function expectsAnnouncement(host) {
	if (typeof host.hasAttribute !== "function") {
		return false;
	}
	return host.hasAttribute("data-slate-editor") ||
		(host.querySelector("[data-slate-string]") !== null) ||
		!!host.classList?.contains("ck-editor__editable");
}

/**
 * Announces a rewrite as one insertText whose target range spans the rewritten tail. One event,
 * because a model-backed editor applies it asynchronously: anything dispatched after it aims at a
 * caret the editor has not moved yet. True when a listener claimed it.
 */
function announceRewrite(host, parts, before, after) {
	const head = commonPrefixLength(before, after);
	const from = locate(parts, head);
	const to = locate(parts, before.length);
	let target;
	try {
		target = new StaticRange({
			startContainer: from.node, startOffset: from.offset,
			endContainer: to.node, endOffset: to.offset
		});
	} catch (error) {
		return false;
	}
	return !emitBeforeInput(host, "insertText", after.slice(head), target);
}

function commonPrefixLength(before, after) {
	let head = 0;
	while ((head < before.length) && (head < after.length) && (before.charAt(head) === after.charAt(head))) {
		head++;
	}
	return head;
}

/**
 * Replaces value[head..caret) so the text before the caret becomes `after`, through execCommand.
 * Assigning .value instead fires nothing, and a controlled component then keeps the raw keystrokes:
 * React's _valueTracker even swallows an input event dispatched afterwards, because the assignment
 * already moved the value it compares against.
 */
function replaceValueBeforeCaret(el, before, after, caret) {
	const head = commonPrefixLength(before, after);
	const scrollTop = el.scrollTop;
	el.setSelectionRange(head, caret);
	const doc = el.ownerDocument ?? document;
	if (!doc.execCommand("insertText", false, after.slice(head))) {
		el.value = after + el.value.slice(caret);
		el.setSelectionRange(after.length, after.length);
	}
	el.scrollTop = scrollTop;
}

/**
 * Rewrites the text before the caret to `after`, from the first changed character on.
 *
 * A model-backed editor (Slate, CKEditor) is told in one targeted insertText beforeinput, which it
 * applies to its own model. Everyone else gets the edit itself, through execCommand, which fires
 * input but not beforeinput.
 */
function replaceBeforeCaret(host, sel, range, parts, before, after) {
	const head = commonPrefixLength(before, after);
	const replacement = after.slice(head);
	const from = locate(parts, head);
	const to = locate(parts, before.length);

	if (expectsAnnouncement(host) && announceRewrite(host, parts, before, after)) {
		return;
	}

	range.setStart(from.node, from.offset);
	range.setEnd(to.node, to.offset);
	sel.removeAllRanges();
	sel.addRange(range);
	const doc = from.node.ownerDocument ?? document;
	if (!doc.execCommand("insertText", false, replacement)) {
		// Silent, so a model-backed editor discards it; still better than losing the keystroke
		for (let at = parts.length - 1; at >= 0; at--) {
			const part = parts[at];
			if (part.node === from.node) {
				part.node.deleteData(from.offset, part.text.length - from.offset);
				part.node.insertData(from.offset, replacement);
				break;
			}
			part.node.deleteData(0, part.text.length);
		}
		const caret = from.offset + replacement.length;
		range.setStart(from.node, caret);
		range.setEnd(from.node, caret);
		sel.removeAllRanges();
		sel.addRange(range);
	}
}

/**
 * Handles a keypress inside a contenteditable or a designMode iframe, where there is no .value.
 * Editing the text node directly fires no events, so editors that re-render from their own model
 * (Slate, Draft, ProseMirror; Discord's message box is Slate) drop the diacritics (#30).
 */
function ifMoz(e) {
	const code = e.which;
	const avim = AVIMObj.AVIM ?? AVIMObj;
	const target = e.composedPath ? e.composedPath()[0] : e.target;
	const parent = target.parentNode;
	// A shadow root's parentNode is null, so the walk to the iframe marker must not explode there
	const cwi = parent.wi ?? parent.parentNode?.wi ?? window;
	if (e.ctrlKey || (e.altKey && (code !== 92) && (code !== 126))) {
		return;
	}
	syncPatterns();

	// Inside a shadow root the document selection ends at the host; the root holds the real one
	const root = target.getRootNode ? target.getRootNode() : document;
	const sel = (typeof root.getSelection === "function") ? root.getSelection() : cwi.getSelection();
	const range = (sel && sel.rangeCount) ? sel.getRangeAt(0) : document.createRange();
	const node = range.endContainer;

	const char = fromCharCode(code);
	avim.sk = char;
	if (onOff === 0) {
		return;
	}
	// The keystroke replaces a non-empty selection, so there is no word in front of it to transform
	if (range.startOffset !== range.endOffset) {
		return;
	}
	// An empty editable holds no text node to read back, and no word for a shortcut to match
	if (typeof node.data === "undefined") {
		return;
	}

	const caret = range.endOffset;
	const host = editingHost(node);
	// Text after the caret is left out, so the engine sees the caret as the end of the value
	const parts = partsBeforeCaret(host, node, caret);
	const before = parts.map((part) => part.text).join("");

	// A comma and its like never reach the engine but still end a word: the gate stops the engine,
	// not the shortcut.
	if (checkCode(code) || !range.startOffset) {
		const gated = shortcutEdit(before, char);
		if (gated) {
			replaceBeforeCaret(host, sel, range, parts, before, gated.text);
			if (gated.typesKey) {
				e.preventDefault();
			}
		}
		return;
	}

	const editor = createTextEditor(before);
	start(editor, e);
	// changed only decides who types the key. An escape sequence such as telex "aaa" rewrites the
	// word and leaves the key to the browser, so the rewrite has to be applied either way.
	const changed = avim.changed;
	avim.changed = false;
	// VIQR spends punctuation on tone marks, so a shortcut only ever gets a key the engine passed on
	const passed = editor.value === before;
	const edit = passed ? shortcutEdit(before, char) : null;
	let after = editor.value;
	if (edit) {
		after = edit.text;
	} else if (passed) {
		after = promoteHornPair(before, char);
	}
	if (after !== before) {
		replaceBeforeCaret(host, sel, range, parts, before, after);
	}
	if (changed || edit?.typesKey) {
		e.preventDefault();
	}
}

/** Punctuation below code 45 that still starts or continues a word. */
const TYPABLE_LOW_CODES = [32, 39, 40, 42, 43];

function checkCode(code) {
	if (onOff === 0) {
		return true;
	}
	if ((code < 45) && !TYPABLE_LOW_CODES.includes(code)) {
		return true;
	}
	return (code === 145) || (code === 255);
}



/* ---- User-defined shortcuts: whole words a word-boundary key expands ---- */

/** Entries with a blank key are dropped: such a key would match after every keystroke. */
function buildShortcutMap(list) {
	const map = new Map();
	for (const entry of list ?? []) {
		if (entry && (typeof entry.key === "string") && (entry.key.length > 0)) {
			map.set(entry.key, String(entry.value ?? ""));
		}
	}
	return map;
}

function wordBefore(text) {
	let at = text.length;
	while ((at > 0) && !notWord(text.charAt(at - 1))) {
		at--;
	}
	return text.slice(at);
}

/**
 * The text before the caret with a shortcut applied, or null when this keystroke completes none.
 * Matching mid-word would turn Telex "chuw" into "chuư" and leave the key itself unenterable.
 */
function shortcutRewrite(before, char) {
	if (!notWord(char)) {
		return null;
	}
	const word = wordBefore(before);
	const result = shortcutMap.get(word);
	return result === undefined ? null : before.slice(0, before.length - word.length) + result;
}

const CONTROL_KEYS = "\r\n\t";

/**
 * The same, plus who types the boundary key. A model-backed editor re-renders asynchronously, so a
 * key left to the browser lands at the pre-rewrite caret: "vn x" came out "Việt Namx ". Enter and
 * Tab do more than insert, so they stay the browser's.
 */
function shortcutEdit(before, char) {
	const expanded = shortcutRewrite(before, char);
	if (expanded === null) {
		return null;
	}
	if (CONTROL_KEYS.includes(char)) {
		return { text: expanded, typesKey: false };
	}
	return { text: expanded + char, typesKey: true };
}


/* ---- Chrome extension glue: prefs, event wiring, iframe scan ---- */
const extension = chrome.runtime;
const sendRequest = extension.sendMessage;

const INPUT_TYPES = ["textarea", "text", "search", "tel"];


/* ---- URL pattern overrides ---- */

/** A row the popup stores: `{ pattern, mode }` with mode "on", "off" or "default". */
let patterns = [];
let globalOnOff = 1;
let matchedUrl = "";
let matchedRow = null;

const AS_REGEX = /^\/(.+)\/([gimsuy]*)$/;
const GLOB_META = /[.*+?^${}()|[\]\\]/g;
const REGEX_META = /[*.+?^${}()|[\]\\]/g;
const HTTP_URL = /^https?:\/\//i;

/** A bare host gets a scheme and a path, so `canva.com` cannot match `https://canva.com.evil.test/`. */
function normalizePattern(pattern) {
	const withScheme = pattern.includes("://") ? pattern : `*://${pattern}`;
	const afterScheme = withScheme.slice(withScheme.indexOf("://") + 3);
	return afterScheme.includes("/") ? withScheme : `${withScheme}/`;
}

/** `/…/flags` is a real regex; anything else is a glob where `*` is the only wildcard. */
function patternToRegex(pattern) {
	const asRegex = AS_REGEX.exec(pattern);
	try {
		if (asRegex) {
			return new RegExp(asRegex[1], asRegex[2]);
		}
		const escaped = normalizePattern(pattern).replace(GLOB_META, "\\$&").replace(/\\\*/g, ".*");
		return new RegExp(`^${escaped}`, "i");
	} catch (e) {
		return null;
	}
}

/** Count of URL characters the row pins down. */
function patternWeight(pattern) {
	const asRegex = AS_REGEX.exec(pattern);
	if (asRegex) {
		return asRegex[1].replace(REGEX_META, "").length;
	}
	return normalizePattern(pattern).replace(/\*/g, "").length;
}

/** Heaviest row wins; a tie goes to the row the user put first. */
function matchPattern(rows, url) {
	let best = null;
	let bestWeight = -1;
	for (const row of rows) {
		if (!row || (typeof row.pattern !== "string") || (row.pattern === "")) {
			continue;
		}
		const regex = patternToRegex(row.pattern);
		if (!regex || !regex.test(url)) {
			continue;
		}
		const weight = patternWeight(row.pattern);
		if (weight > bestWeight) {
			best = row;
			bestWeight = weight;
		}
	}
	return best;
}

function hostPattern(url) {
	const host = url.replace(HTTP_URL, "").replace(/[/?#].*$/, "");
	return `*://${host}/*`;
}

/** Reading a cross-origin `window.top.location` throws, and that frame keeps its own URL. */
function urlForPatterns() {
	try {
		return window.top.location.href;
	} catch (e) {
		try {
			return location.href;
		} catch (noLocation) {
			return "";
		}
	}
}

/** A matched row with mode "default" carves an exception out rather than forcing a state. */
function isOverridden() {
	return Boolean(matchedRow) && (matchedRow.mode !== "default");
}

function applyPatterns() {
	matchedUrl = urlForPatterns();
	// http(s) only: popup.html loads this engine too, and a catch-all row would gag its scratchpad
	matchedRow = HTTP_URL.test(matchedUrl) ? matchPattern(patterns, matchedUrl) : null;
	onOff = isOverridden() ? (matchedRow.mode === "on" ? 1 : 0) : globalOnOff;
}

/** One badge per tab, so frames stay quiet. */
function reportPatterns() {
	if ((window.top !== window) || !HTTP_URL.test(matchedUrl)) {
		return;
	}
	sendRequest({ report_pattern: { onOff, overridden: isOverridden() } }, () => {});
}

/** A pushState route change keeps this content script alive, so the URL is re-read as keys arrive. */
function syncPatterns() {
	if (urlForPatterns() === matchedUrl) {
		return;
	}
	applyPatterns();
	reportPatterns();
}

/** Answers the popup's quick setting: the row that won, or the host to offer a new row for. */
function tabPatternState() {
	const url = urlForPatterns();
	if (!HTTP_URL.test(url)) {
		return { url, pattern: "", mode: "default" };
	}
	const row = matchPattern(patterns, url);
	return {
		url,
		pattern: row ? row.pattern : hostPattern(url),
		mode: row ? row.mode : "default"
	};
}


/** Attaches the contenteditable handler to every designMode iframe on the page. */
function AVIMInit(avim) {
	gdocsInit();
	for (const frame of document.getElementsByTagName("iframe")) {
		if (findIgnore(frame)) {
			continue;
		}
		// The document inside is often not ready (or not yet designMode) when the frame is first
		// seen; each load is another chance to attach. Re-adding the same listener is a no-op.
		frame.addEventListener("load", rescanIframes);
		try {
			const frameWindow = frame.contentWindow;
			const iframedit = frameWindow.document;
			iframedit.wi = frameWindow;
			if (upperCase(iframedit.designMode) === "ON") {
				iframedit.AVIM = avim;
				iframedit.addEventListener("keypress", ifMoz, false);
			}
		} catch (e) {
			// A cross-origin iframe throws on contentWindow.document; there is nothing to attach to
		}
	}
}

function findIgnore(el) {
	return exclude.some((entry) => (entry.length > 0) && ((el.name === entry) || (el.id === entry)));
}

function keyPressHandler(e) {
	// Inside a shadow root e.target is retargeted to the host element, whose .type is undefined,
	// so the real input never reaches the engine. composedPath()[0] crosses the shadow boundary.
	const el = e.composedPath ? e.composedPath()[0] : e.target;
	const code = e.which;
	if (e.ctrlKey) {
		return;
	}
	if (e.altKey && (code !== 92) && (code !== 126)) {
		return;
	}
	syncPatterns();
	if (!INPUT_TYPES.includes(el.type)) {
		if (el.isContentEditable) {
			ifMoz(e);
		}
		return;
	}
	if (onOff === 0) {
		return;
	}
	const char = fromCharCode(code);
	if (findIgnore(el) || el.readOnly) {
		return;
	}
	// The keystroke replaces a non-empty selection, so there is no word in front of it to transform
	if (el.selectionStart !== el.selectionEnd) {
		return;
	}

	const caret = el.selectionStart;
	const before = el.value.slice(0, caret);
	// A comma and its like never reach the engine but still end a word: the gate stops the engine,
	// not the shortcut.
	if (checkCode(code) || !caret) {
		const edit = shortcutEdit(before, char);
		if (edit) {
			replaceValueBeforeCaret(el, before, edit.text, caret);
			if (edit.typesKey) {
				e.preventDefault();
			}
		}
		return;
	}
	AVIMObj.sk = char;
	const editor = createTextEditor(before);
	start(editor, e);
	const changed = AVIMObj.changed;
	AVIMObj.changed = false;
	// VIQR spends punctuation on tone marks, so a shortcut only ever gets a key the engine passed on
	const passed = editor.value === before;
	const edit = passed ? shortcutEdit(before, char) : null;
	let after = editor.value;
	if (edit) {
		after = edit.text;
	} else if (passed) {
		after = promoteHornPair(before, char);
	}
	if (after !== before) {
		replaceValueBeforeCaret(el, before, after, caret);
	}
	if (changed || edit?.typesKey) {
		e.preventDefault();
	}
}

const CTRL_KEY_CODE = 17;

// Duplicated in chrome/gdocs-bridge.js — build.mjs minifies per file, so only literals survive.
const GDOCS_NODE_ID = "avim-gdocs-bridge";
const GDOCS_EVENT_READ = "avim:gdocs:read";
const GDOCS_EVENT_WRITE = "avim:gdocs:write";
const GDOCS_IFRAME_SELECTOR = "iframe.docs-texteventtarget-iframe";

function gdocsRead() {
	document.dispatchEvent(new CustomEvent(GDOCS_EVENT_READ));
}

function gdocsState() {
	gdocsRead();
	const node = document.getElementById(GDOCS_NODE_ID);
	if (!node || (node.dataset.avimOk !== "1")) {
		return null;
	}
	return {
		tail: node.textContent,
		base: Number(node.dataset.avimBase),
		selectionStart: Number(node.dataset.avimStart),
		selectionEnd: Number(node.dataset.avimEnd)
	};
}

function gdocsReplace(from, to, text) {
	const node = document.getElementById(GDOCS_NODE_ID);
	if (!node) {
		return;
	}
	node.dataset.avimWrite = JSON.stringify({ from, to, text });
	document.dispatchEvent(new CustomEvent(GDOCS_EVENT_WRITE));
}

/**
 * The text Docs should end up holding, or null when nothing should change. Docs has already typed
 * the key, so every branch has to say for itself whether the result still carries it.
 */
function gdocsWant(before, key, code) {
	// A comma and its like never reach the engine but still end a word: the gate stops the engine,
	// not the shortcut.
	if (checkCode(code)) {
		const gated = shortcutEdit(before, key);
		return gated === null ? null : gated.text + (gated.typesKey ? "" : key);
	}

	const editor = createTextEditor(before);
	AVIMObj.sk = key;
	start(editor, { which: code });
	const changed = AVIMObj.changed;
	AVIMObj.changed = false;
	// VIQR spends punctuation on tone marks, so a shortcut only ever gets a key the engine passed on
	const passed = editor.value === before;
	const edit = passed ? shortcutEdit(before, key) : null;
	if (edit) {
		return edit.text + (edit.typesKey ? "" : key);
	}
	// changed only means AVIM meant to type the key; Docs already did: "chaof" drops it, "aaa" keeps.
	const keyTail = changed ? "" : key;
	return passed ? promoteHornPair(before, key) + keyTail : editor.value + keyTail;
}

/** Nothing is prevented: reconciling against what Docs holds makes a lost race a no-op. */
function gdocsRewrite(key, code) {
	const state = gdocsState();
	if (!state || (state.selectionStart !== state.selectionEnd)) {
		return;
	}
	const caret = state.selectionEnd;
	const typed = state.tail;
	// Docs has not applied the key, applied something else, or the read tore
	if (!typed.endsWith(key) || ((caret - state.base) !== typed.length)) {
		return;
	}
	const before = typed.slice(0, -1);
	if (!before) {
		return;
	}

	const want = gdocsWant(before, key, code);
	if ((want === null) || (want === typed)) {
		return;
	}

	const head = commonPrefixLength(typed, want);
	gdocsReplace(state.base + head, caret, want.slice(head));
}

function gdocsKeyPress(e) {
	const code = e.which;
	syncPatterns();
	if ((onOff === 0) || e.ctrlKey || (e.altKey && (code !== 92) && (code !== 126))) {
		return;
	}
	const key = fromCharCode(code);
	// Starts acquisition now: its microtask lands before the rewrite below, so key one converts too.
	gdocsRead();
	setTimeout(() => gdocsRewrite(key, code), 0);
}

/** The flag lives on the iframe's document, which Docs replaces as the editor reloads. */
function gdocsInit() {
	if (typeof document.querySelector !== "function") {
		return;
	}
	const target = document.querySelector(GDOCS_IFRAME_SELECTOR)?.contentDocument;
	if (!target || target.avimGdocs) {
		return;
	}
	target.avimGdocs = true;
	target.addEventListener("keypress", gdocsKeyPress, true);
	gdocsRead();
}

const DOUBLE_TAP_MS = 300;

let ctrlTaps = 0;
let ctrlTapTimer = 0;
let isCtrlCombo = false;
/** Sampled before the double tap flips anything, so a third tap can reason about the real state. */
let stateBeforeTaps = { global: 1, pattern: "", mode: "default" };
let isFlipInFlight = false;
let isSiteTurnQueued = false;

/** A shortcut like Ctrl+Shift+V ends in a bare Ctrl keyup with shiftKey already false, so only keydown separates the two. */
function keyDownHandler(evt) {
	if (evt.which === CTRL_KEY_CODE) {
		isCtrlCombo = false;
		return;
	}
	isCtrlCombo = true;
	ctrlTaps = 0;
}

function withRow(rows, pattern, mode) {
	if (rows.some((row) => row && (row.pattern === pattern))) {
		return rows.map((row) => (row.pattern === pattern ? { pattern, mode } : row));
	}
	return [...rows, { pattern, mode }];
}

function turnSite() {
	const { global, pattern, mode } = stateBeforeTaps;
	if (pattern === "") {
		return;
	}
	const effective = mode === "default" ? global : (mode === "on" ? 1 : 0);
	const wanted = effective === 1 ? "off" : "on";
	const fromPanel = global === 1 ? "on" : "off";
	sendRequest({
		save_prefs: "all",
		onOff: global,
		// The panel already says what we want, so the row goes back to "default" instead of repeating it
		patterns: withRow(patterns, pattern, wanted === fromPanel ? "default" : wanted)
	}, () => {});
}

/** Tapping Ctrl twice within 300ms toggles AVIM everywhere; a third tap moves only this site. */
function keyUpHandler(evt) {
	if (evt.which !== CTRL_KEY_CODE) {
		ctrlTaps = 0;
		return;
	}
	if (isCtrlCombo) {
		isCtrlCombo = false;
		ctrlTaps = 0;
		return;
	}
	ctrlTaps += 1;
	clearTimeout(ctrlTapTimer);
	ctrlTapTimer = setTimeout(() => {
		ctrlTaps = 0;
	}, DOUBLE_TAP_MS);

	if (ctrlTaps === 2) {
		stateBeforeTaps = { global: globalOnOff, ...tabPatternState() };
		isFlipInFlight = true;
		sendRequest({ turn_avim: "onOff" }, (data) => {
			configAVIM(data);
			isFlipInFlight = false;
			if (isSiteTurnQueued) {
				isSiteTurnQueued = false;
				turnSite();
			}
		});
		return;
	}
	if (ctrlTaps === 3) {
		ctrlTaps = 0;
		// The reply proves the flip is stored, so restoring it cannot land ahead of the flip
		isSiteTurnQueued = isFlipInFlight;
		if (!isFlipInFlight) {
			turnSite();
		}
	}
}

function rescanIframes() {
	AVIMInit(AVIMObj);
}

let iframeObserver = null;

/** Rescans when a new iframe lands anywhere in the page, replacing 10 seconds of polling. */
function watchForIframes() {
	iframeObserver = new MutationObserver((mutations) => {
		const brought = (node) =>
			(upperCase(node.tagName ?? "") === "IFRAME") || Boolean(node.querySelector?.("iframe"));
		if (mutations.some((mutation) => [...mutation.addedNodes].some(brought))) {
			rescanIframes();
		}
	});
	iframeObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function removeOldAVIM() {
	if (iframeObserver) {
		iframeObserver.disconnect();
		iframeObserver = null;
	}
	document.removeEventListener("mouseup", rescanIframes, false);
	document.removeEventListener("keypress", keyPressHandler, true);
	document.removeEventListener("keydown", keyDownHandler, true);
	document.removeEventListener("keyup", keyUpHandler, true);

	AVIMInit(AVIMObj);
	AVIMObj = null;
}

function newAVIMInit() {
	if (AVIMObj) {
		removeOldAVIM();
	}

	AVIMObj = new AVIM();
	rescanIframes();
	watchForIframes();

	document.addEventListener("mouseup", rescanIframes, false);
	document.addEventListener("keydown", keyDownHandler, true);
	document.addEventListener("keyup", keyUpHandler, true);
	document.addEventListener("keypress", keyPressHandler, true);
}

/** The single entry point the background service worker uses to push prefs into a content script. */
function configAVIM(data) {
	if (data) {
		method = data.method;
		globalOnOff = data.onOff;
		checkSpell = data.ckSpell;
		oldAccent = data.oldAccent;
		patterns = Array.isArray(data.patterns) ? data.patterns : [];
		shortcutMap = data.shortcutsOn === 1 ? buildShortcutMap(data.shortcuts) : new Map();
		applyPatterns();
		reportPatterns();
	}

	newAVIMInit();
}

sendRequest({ get_prefs: "all" }, configAVIM);

extension.onMessage.addListener((message, sender, respond) => {
	if (message && message.get_tab_pattern) {
		respond(tabPatternState());
		return;
	}
	configAVIM(message);
});

