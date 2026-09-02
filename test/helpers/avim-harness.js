/**
 * Each loadEngine() evaluates the real src/scripts in a fresh node:vm context, which
 * isolates the shared engine globals per test without modifying src/.
 */

import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const SCRIPTS_DIR = path.join(import.meta.dirname, "..", "..", "src", "scripts");
const AVIM_PATH = path.join(SCRIPTS_DIR, "avim-ext.js");

const avimSource = fs.readFileSync(AVIM_PATH, "utf8");

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
		sandbox.__timers.push({ callback, delay });
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
		activeElement: null,
		// Both apply paths go through execCommand, so the fake DOM has to honour insertText: on the
		// focused field for an input, on the current range for a contenteditable's text node.
		execCommand(command, ui, text) {
			if (command !== "insertText") {
				return false;
			}
			const field = sandbox.document.activeElement;
			if (field && (typeof field.value === "string")) {
				const start = field.selectionStart;
				field.value = field.value.slice(0, start) + text + field.value.slice(field.selectionEnd);
				field.setSelectionRange(start + text.length, start + text.length);
				return true;
			}
			if (!sandbox.__selection) {
				return false;
			}
			const range = sandbox.__selection.getRangeAt(0);
			const node = range.startContainer;
			node.deleteData(range.startOffset, range.endOffset - range.startOffset);
			node.insertData(range.startOffset, text);
			const caret = range.startOffset + text.length;
			range.setStart(node, caret);
			range.setEnd(node, caret);
			return true;
		},
	};
	// ifMoz announces its rewrite as beforeinput before applying it; nothing here claims the edit
	sandbox.InputEvent = class {
		constructor(type, init) {
			Object.assign(this, { type }, init);
		}
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

function loadEngine(config = {}) {
	// a misspelled key would otherwise be dropped and the test would silently use the default
	const unknown = Object.keys(config).filter((key) => !CONFIG_KEYS.includes(key));
	if (unknown.length > 0) {
		throw new Error(`unknown harness config key: ${unknown.join(", ")}`);
	}
	const settings = { ...DEFAULT_CONFIG, ...config };
	const sandbox = createSandbox();
	vm.createContext(sandbox);
	vm.runInContext(avimSource, sandbox, { filename: AVIM_PATH });

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

function createInput({
	type = "textarea",
	id = "",
	name = "",
	readOnly = false,
	value = "",
	// getEditorObject falls back to innerText whenever value is "" (falsy), so this must exist
	innerText = "",
	caret = value.length,
	caretEnd = caret,
} = {}) {
	return {
		type,
		id,
		name,
		readOnly,
		isContentEditable: false,
		value,
		innerText,
		selectionStart: caret,
		selectionEnd: caretEnd,
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
function pressKey(context, element, char, { ctrl = false, alt = false } = {}) {
	let prevented = false;
	context.document.activeElement = element;
	context.keyPressHandler({
		target: element,
		which: char.charCodeAt(0),
		ctrlKey: ctrl,
		altKey: alt,
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
	context.document.activeElement = element;
	context.keyPressHandler({
		target: element,
		which: char.charCodeAt(0),
		ctrlKey: false,
		altKey: false,
		preventDefault() {
			calls += 1;
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
function type(sequence, config = {}) {
	return typeInto(loadEngine(config), createInput(config.element), sequence);
}

/** unV/repSign/retKC throw until main() has run once, because it assigns AVIMObj.SFJRX. */
function primeMethodTables(context) {
	pressKey(context, createInput({ value: "a", caret: 1 }), "s");
	return context;
}

function createEditableHost(text, caret, caretEnd = caret) {
	const node = new FakeText(text);
	// ifMoz reads target.parentNode.wi then target.parentNode.parentNode.wi, so both levels must exist
	const host = {
		isContentEditable: true,
		id: "",
		name: "",
		parentNode: { wi: undefined, parentNode: { wi: undefined } },
		dispatchEvent: () => true,
	};
	node.parentNode = host;
	const range = new FakeRange(node, caret, caretEnd);
	const selection = {
		getRangeAt: () => range,
		removeAllRanges() {},
		addRange() {},
	};
	return { node, host, range, selection };
}

function typeContentEditableDetailed(sequence, config = {}) {
	const context = loadEngine(config);
	const { value = "", caret: initialCaret } = config.element ?? {};
	let text = value;
	let caret = initialCaret ?? text.length;

	for (const char of sequence) {
		// the keypress target is the contenteditable element; the range points at the text node inside it
		const editable = createEditableHost(text, caret);
		context.__selection = editable.selection;
		context.document.activeElement = editable.host;
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
			caret += 1;
		}
	}
	return { text, caret };
}

function typeContentEditable(sequence, config) {
	return typeContentEditableDetailed(sequence, config).text;
}

/** `toneKeys` must be in TONE_TABLE order: sắc, huyền, hỏi, ngã, nặng. */
function toneMatrixCases(baseSequences, toneKeys) {
	return Object.entries(TONE_TABLE).flatMap(([vowel, accented]) =>
		[...toneKeys].map((toneKey, index) => ({
			vowel,
			sequence: baseSequences[vowel] + toneKey,
			expected: accented[index],
		})),
	);
}

export {
	METHOD,
	TONE_TABLE,
	toneMatrixCases,
	AVIM_PATH,
	FakeText,
	FakeRange,
	loadEngine,
	createInput,
	pressKey,
	countPreventDefaultCalls,
	pressKeyUp,
	capturedMessages,
	clearCapturedMessages,
	runTimersWithDelay,
	typeInto,
	type,
	primeMethodTables,
	createEditableHost,
	typeContentEditable,
	typeContentEditableDetailed,
};
