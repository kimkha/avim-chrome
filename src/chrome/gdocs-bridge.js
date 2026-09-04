/**
 * Google Docs adapter, main-world half.
 *
 * Docs draws the document to <canvas> and keeps no text in the DOM. Setting
 * _docs_annotate_canvas_by_ext before kix_core boots makes it hand out
 * window._docs_annotate_getAnnotatedText, which exposes the document as plain text with a caret —
 * the shape the engine already reads off an <input>. That is a page global, invisible from an
 * isolated content script, hence this half. The two talk through one hidden node, strings only, so
 * that nothing crosses worlds by structured clone and either side can read synchronously.
 */
(() => {
	// Docs exposes the API only when this is set before kix_core reads it, and it never checks the
	// value against a real extension, so the published id is what ships.
	window._docs_annotate_canvas_by_ext = "opgbbffpdglhkpglnlkiclakjlpiedoh";

	const NODE_ID = "avim-gdocs-bridge";
	const EVENT_READ = "avim:gdocs:read";
	const EVENT_WRITE = "avim:gdocs:write";
	const IFRAME_SELECTOR = "iframe.docs-texteventtarget-iframe";
	// The engine only ever looks at the word in front of the caret, and publishing a whole document
	// per keystroke would copy the entire text twice.
	const TAIL = 64;

	let node = null;
	let annotated = null;
	let acquiring = false;

	/** Created on first use: documentElement is not guaranteed to exist at document_start. */
	function bridgeNode() {
		if (node && node.isConnected) {
			return node;
		}
		node = document.getElementById(NODE_ID);
		if (!node) {
			node = document.createElement("div");
			node.id = NODE_ID;
			node.hidden = true;
			document.documentElement.appendChild(node);
		}
		return node;
	}

	/** Docs throws until the document has a live caret, so every read is another chance. */
	function acquire() {
		if (acquiring || (typeof window._docs_annotate_getAnnotatedText !== "function")) {
			return;
		}
		let pending;
		try {
			pending = window._docs_annotate_getAnnotatedText();
		} catch (error) {
			return;
		}
		acquiring = true;
		Promise.resolve(pending)
			.then((next) => {
				annotated = (next && (typeof next.getText === "function")) ? next : null;
			})
			.catch(() => {
				annotated = null;
			})
			.finally(() => {
				acquiring = false;
			});
	}

	function publish() {
		const target = bridgeNode();
		target.dataset.avimOk = "0";
		if (!annotated) {
			acquire();
			return;
		}

		let text;
		let selection;
		try {
			text = annotated.getText();
			selection = annotated.getSelection()[0];
		} catch (error) {
			// The cached object died with the editor it came from; take a fresh one
			annotated = null;
			acquire();
			return;
		}
		if (!selection) {
			return;
		}

		const base = Math.max(0, selection.end - TAIL);
		target.textContent = text.slice(base, selection.end);
		target.dataset.avimBase = String(base);
		target.dataset.avimStart = String(selection.start);
		target.dataset.avimEnd = String(selection.end);
		target.dataset.avimOk = "1";
	}

	/**
	 * Replaces one span of the document. execCommand("insertText") returns false here and changes
	 * nothing even with both documents focused, so the edit is announced as beforeinput, which Docs
	 * claims and applies to its own model — and which keeps the run's formatting, unlike a paste.
	 */
	function apply() {
		const target = bridgeNode();
		const live = annotated;
		if (!live) {
			return;
		}
		let edit;
		try {
			edit = JSON.parse(target.dataset.avimWrite);
		} catch (error) {
			return;
		}
		const iframe = document.querySelector(IFRAME_SELECTOR);
		const editable = iframe?.contentDocument?.querySelector("[contenteditable=\"true\"]");
		if (!editable) {
			return;
		}

		try {
			live.setSelection(edit.from, edit.to);
		} catch (error) {
			annotated = null;
			return;
		}
		editable.dispatchEvent(new InputEvent("beforeinput", {
			inputType: "insertText",
			data: edit.text,
			bubbles: true,
			cancelable: true,
			composed: true
		}));

		// Docs leaves the text it just inserted selected, so the next keystroke would overwrite the
		// whole word. It only settles its own selection once this dispatch has returned.
		const caret = edit.from + edit.text.length;
		setTimeout(() => {
			try {
				live.setSelection(caret, caret);
			} catch (error) {
				annotated = null;
			}
		}, 0);
	}

	document.addEventListener(EVENT_READ, publish, false);
	document.addEventListener(EVENT_WRITE, apply, false);
})();
