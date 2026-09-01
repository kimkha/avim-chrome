"use strict";

/**
 * Each loadEngine() evaluates the real src/scripts in a fresh node:vm context, which
 * isolates the shared engine globals per test without modifying src/.
 */

const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const SCRIPTS_DIR = path.join(__dirname, "..", "..", "src", "scripts");
const AVIM_PATH = path.join(SCRIPTS_DIR, "avim.js");
const EXTENSION_PATH = path.join(SCRIPTS_DIR, "extension.js");

const avimSource = fs.readFileSync(AVIM_PATH, "utf8");
const extensionSource = fs.readFileSync(EXTENSION_PATH, "utf8");

const METHOD = {
	AUTO: 0,
	TELEX: 1,
	VNI: 2,
	VIQR: 3,
	VIQR_STAR: 4,
};

/** Correct Vietnamese output for each base vowel, ordered: sắc, huyền, hỏi, ngã, nặng. */
const TONE_TABLE = {
	"a": "áàảãạ",
	"â": "ấầẩẫậ",
	"ă": "ắằẳẵặ",
	"e": "éèẻẽẹ",
	"ê": "ếềểễệ",
	"i": "íìỉĩị",
	"o": "óòỏõọ",
	"ô": "ốồổỗộ",
	"ơ": "ớờởỡợ",
	"u": "úùủũụ",
	"ư": "ứừửữự",
	"y": "ýỳỷỹỵ",
};

const DEFAULT_CONFIG = {
	method: METHOD.TELEX,
	onOff: 1,
	checkSpell: 1,
	oldAccent: 1,
};

class FakeText {
	constructor(data) {
		this.data = data;
		this.nodeType = 3;
	}

	deleteData(offset, count) {
		this.data = this.data.slice(0, offset) + this.data.slice(offset + count);
	}

	insertData(offset, text) {
		this.data = this.data.slice(0, offset) + text + this.data.slice(offset);
	}
}

class FakeRange {
	constructor(node, startOffset, endOffset) {
		this.startContainer = node;
		this.endContainer = node;
		this.startOffset = startOffset;
		this.endOffset = endOffset;
	}

	setStart(node, offset) {
		this.startContainer = node;
		this.startOffset = offset;
	}

	setEnd(node, offset) {
		this.endContainer = node;
		this.endOffset = offset;
	}
}

function createSandbox() {
	const sandbox = {
		clearTimeout: () => {},
		console: { log() {}, warn() {}, error() {} },
	};
	sandbox.__selection = null;
	sandbox.__messages = [];
	sandbox.__timers = [];
	// AVIMAJAXFix reschedules itself up to 100 times; a real timer would outlive the test
	sandbox.setTimeout = (callback, delay) => {
		sandbox.__timers.push({ callback: callback, delay: delay });
		return sandbox.__timers.length;
	};
	sandbox.chrome = {
		runtime: {
			// deliberately never invokes the callback: loadEngine drives configAVIM itself
			sendMessage(message) {
				sandbox.__messages.push(message);
			},
			onMessage: { addListener() {} },
		},
	};
	sandbox.document = {
		getElementsByTagName: () => [],
		addEventListener() {},
		removeEventListener() {},
		createRange: () => new FakeRange(new FakeText(""), 0, 0),
	};
	sandbox.window = {
		document: sandbox.document,
		getSelection: () => sandbox.__selection || null,
	};
	return sandbox;
}

function pressKeyUp(context, keyCode) {
	context.keyUpHandler({ which: keyCode });
}

/** Messages are built inside the vm realm, so deepStrictEqual rejects them without this copy. */
function capturedMessages(context) {
	return JSON.parse(JSON.stringify(context.__messages));
}

function clearCapturedMessages(context) {
	context.__messages.length = 0;
}

/** Runs only the timers registered with exactly `delay` ms, so unrelated ones stay pending. */
function runTimersWithDelay(context, delay) {
	const due = context.__timers.filter((timer) => timer.delay === delay);
	context.__timers = context.__timers.filter((timer) => timer.delay !== delay);
	for (const timer of due) {
		timer.callback();
	}
}

const CONFIG_KEYS = [
	"method",
	"onOff",
	"checkSpell",
	"oldAccent",
	"exclude",
	"autoConfig",
	"element",
];

function loadEngine(config) {
	// a misspelled key would otherwise be dropped and the test would silently use the default
	const unknown = Object.keys(config || {}).filter((key) => CONFIG_KEYS.indexOf(key) < 0);
	if (unknown.length > 0) {
		throw new Error("unknown harness config key: " + unknown.join(", "));
	}
	const settings = Object.assign({}, DEFAULT_CONFIG, config);
	const sandbox = createSandbox();
	vm.createContext(sandbox);
	vm.runInContext(avimSource, sandbox, { filename: AVIM_PATH });
	vm.runInContext(extensionSource, sandbox, { filename: EXTENSION_PATH });

	if (settings.exclude) {
		sandbox.exclude = settings.exclude;
	}
	if (settings.autoConfig) {
		sandbox.AVIMAutoConfig = settings.autoConfig;
	}

	// same entry point the background service worker uses to push prefs into a content script
	sandbox.configAVIM({
		method: settings.method,
		onOff: settings.onOff,
		ckSpell: settings.checkSpell,
		oldAccent: settings.oldAccent,
	});
	return sandbox;
}

function createInput(options) {
	const opts = options || {};
	const value = opts.value || "";
	const caret = opts.caret === undefined ? value.length : opts.caret;
	return {
		type: opts.type === undefined ? "textarea" : opts.type,
		id: opts.id || "",
		name: opts.name || "",
		readOnly: Boolean(opts.readOnly),
		isContentEditable: false,
		value: value,
		// getEditorObject falls back to innerText whenever value is "" (falsy), so this must exist
		innerText: opts.innerText || "",
		selectionStart: caret,
		selectionEnd: opts.caretEnd === undefined ? caret : opts.caretEnd,
		scrollTop: 0,
		setSelectionRange(start, end) {
			this.selectionStart = start;
			this.selectionEnd = end;
		},
	};
}

/** What the browser does when a keypress is not cancelled. */
function insertChar(element, char) {
	const start = element.selectionStart;
	element.value = element.value.slice(0, start) + char + element.value.slice(element.selectionEnd);
	element.selectionStart = start + 1;
	element.selectionEnd = start + 1;
}

/** Dispatch one keypress through the real extension handler. Returns true if cancelled. */
function pressKey(context, element, char, modifiers) {
	const mods = modifiers || {};
	let prevented = false;
	context.keyPressHandler({
		target: element,
		which: char.charCodeAt(0),
		ctrlKey: Boolean(mods.ctrl),
		altKey: Boolean(mods.alt),
		preventDefault() {
			prevented = true;
		},
	});
	if (!prevented) {
		insertChar(element, char);
	}
	return prevented;
}

function countPreventDefaultCalls(context, element, char) {
	let calls = 0;
	context.keyPressHandler({
		target: element,
		which: char.charCodeAt(0),
		ctrlKey: false,
		altKey: false,
		preventDefault() {
			calls = calls + 1;
		},
	});
	return calls;
}

function typeInto(context, element, sequence) {
	for (const char of sequence) {
		pressKey(context, element, char);
	}
	return element.value;
}

/** Type a sequence into a fresh input and return the resulting value. */
function type(sequence, config) {
	const cfg = config || {};
	const context = loadEngine(cfg);
	const element = createInput(cfg.element);
	return typeInto(context, element, sequence);
}

/** unV/repSign/retKC throw until main() has run once, because it assigns AVIMObj.SFJRX. */
function primeMethodTables(context) {
	pressKey(context, createInput({ value: "a", caret: 1 }), "s");
	return context;
}

function createEditableHost(text, caret, caretEnd) {
	const node = new FakeText(text);
	// ifMoz reads target.parentNode.wi then target.parentNode.parentNode.wi, so both levels must exist
	const host = {
		isContentEditable: true,
		id: "",
		name: "",
		parentNode: { wi: undefined, parentNode: { wi: undefined } },
	};
	const range = new FakeRange(node, caret, caretEnd === undefined ? caret : caretEnd);
	const selection = {
		getRangeAt: () => range,
		removeAllRanges() {},
		addRange() {},
	};
	return { node: node, host: host, range: range, selection: selection };
}

function typeContentEditableDetailed(sequence, config) {
	const cfg = config || {};
	const element = cfg.element || {};
	const context = loadEngine(cfg);
	let text = element.value || "";
	let caret = element.caret === undefined ? text.length : element.caret;

	for (const char of sequence) {
		// the keypress target is the contenteditable element; the range points at the text node inside it
		const editable = createEditableHost(text, caret);
		context.__selection = editable.selection;
		let prevented = false;
		context.keyPressHandler({
			target: editable.host,
			which: char.charCodeAt(0),
			ctrlKey: false,
			altKey: false,
			preventDefault() {
				prevented = true;
			},
		});
		if (prevented) {
			text = editable.node.data;
			caret = editable.range.endOffset;
		} else {
			text = editable.node.data.slice(0, caret) + char + editable.node.data.slice(caret);
			caret = caret + 1;
		}
	}
	return { text: text, caret: caret };
}

function typeContentEditable(sequence, config) {
	return typeContentEditableDetailed(sequence, config).text;
}

/** `toneKeys` must be in TONE_TABLE order: sắc, huyền, hỏi, ngã, nặng. */
function toneMatrixCases(baseSequences, toneKeys) {
	const cases = [];
	for (const vowel of Object.keys(TONE_TABLE)) {
		const accented = TONE_TABLE[vowel];
		for (let i = 0; i < toneKeys.length; i++) {
			cases.push({
				vowel: vowel,
				sequence: baseSequences[vowel] + toneKeys[i],
				expected: accented[i],
			});
		}
	}
	return cases;
}

module.exports = {
	METHOD: METHOD,
	TONE_TABLE: TONE_TABLE,
	toneMatrixCases: toneMatrixCases,
	AVIM_PATH: AVIM_PATH,
	EXTENSION_PATH: EXTENSION_PATH,
	FakeText: FakeText,
	FakeRange: FakeRange,
	loadEngine: loadEngine,
	createInput: createInput,
	pressKey: pressKey,
	countPreventDefaultCalls: countPreventDefaultCalls,
	pressKeyUp: pressKeyUp,
	capturedMessages: capturedMessages,
	clearCapturedMessages: clearCapturedMessages,
	runTimersWithDelay: runTimersWithDelay,
	typeInto: typeInto,
	type: type,
	primeMethodTables: primeMethodTables,
	createEditableHost: createEditableHost,
	typeContentEditable: typeContentEditable,
	typeContentEditableDetailed: typeContentEditableDetailed,
};
