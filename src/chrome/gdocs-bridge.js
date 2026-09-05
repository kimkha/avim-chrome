/** Main-world half. Strings only through a hidden node: event detail would need Firefox cloneInto. */
(() => {
	// Docs never validates this, so any string works; ship the published Chrome id.
	window._docs_annotate_canvas_by_ext = "opgbbffpdglhkpglnlkiclakjlpiedoh";

	const NODE_ID = "avim-gdocs-bridge";
	const EVENT_READ = "avim:gdocs:read";
	const EVENT_WRITE = "avim:gdocs:write";
	const IFRAME_SELECTOR = "iframe.docs-texteventtarget-iframe";
	// Publishing the whole document would copy the text on every keystroke.
	const TAIL = 64;

	let node = null;
	let annotated = null;
	let acquiring = false;

	/** documentElement need not exist at document_start. */
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

	/** Docs throws until the document has a live caret, so every read retries. */
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

	/** execCommand does nothing here even with both documents focused; a paste would lose formatting. */
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

		// Docs only settles its own selection after this dispatch returns.
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
