(() => {
	/** Each key maps to a #txt<Key> element in popup.html and an extPopup<Key> locale message. */
	const LABEL_KEYS = [
		"Title",
		"Search",
		"Sel",
		"Auto",
		"Telex",
		"Vni",
		"Viqr",
		"ViqrStar",
		"Off",
		"SpellCheck",
		"OpenShortcuts",
		"Tips",
		"TipsCtrl",
		"Demo",
		"DemoCopy",
		"RemoveAccent",
		"Back",
		"Shortcuts",
		"ShortcutsOn",
		"AddShortcut",
		"SaveShortcuts"
	];

	/** Radio element id -> the method number the engine expects. */
	const METHOD_RADIOS = {
		auto: 0,
		telex: 1,
		vni: 2,
		viqr: 3,
		viqrStar: 4
	};

	const COMBINING_MARKS = /[\u0300-\u036f]/g;

	const EXPLICIT_URL = /^https?:\/\/\S+$/i;

	/** A host with an ASCII tld, so a Vietnamese phrase like "tiếng.việt" is still a search. */
	const BARE_HOST = /^[^\s/?#]+\.[a-z]{2,}(?:[/?#]\S*)?$/i;

	/**
	 * Key fields carry this name so the engine, which runs here too, skips them: Telex would turn
	 * a key like "uw" into "ư". It seeds `exclude` at load, hence the script order in popup.html.
	 */
	const SHORTCUT_KEY_FIELD = "avimShortcutKey";

	const shortcutRows = [];

	const $g = (id) => document.getElementById(id);

	/**
	 * The background stores the prefs and pushes them to every tab; the reload re-reads them.
	 * The shortcut screen opts out, because a reload would drop back to the main screen.
	 */
	function savePrefs(prefs, { reload = true } = {}) {
		chrome.runtime.sendMessage({ save_prefs: "all", ...prefs }, () => {
			if (reload) {
				window.location.reload();
			}
		});
	}

	function loadText() {
		for (const key of LABEL_KEYS) {
			$g(`txt${key}`).textContent = chrome.i18n.getMessage(`extPopup${key}`);
		}
	}

	function saveDemoText() {
		chrome.runtime.sendMessage({ save_demo_text: $g("inputDemo").value }, () => {});
	}

	/** The read is async, so a keystroke that beat it must win rather than be overwritten. */
	function showDemoText(text) {
		const inputDemo = $g("inputDemo");
		if (inputDemo.value !== "") {
			return;
		}
		inputDemo.value = text ?? "";
		inputDemo.focus();
		inputDemo.select();
	}

	function searchDemo() {
		const text = $g("inputDemo").value.replace(/\s+/g, " ").trim();
		if (text === "") {
			return;
		}
		if (EXPLICIT_URL.test(text)) {
			chrome.tabs.create({ url: text });
			return;
		}
		if (BARE_HOST.test(text)) {
			chrome.tabs.create({ url: `https://${text}` });
			return;
		}
		chrome.search.query({ text, disposition: "NEW_TAB" });
	}

	function copyAllDemo() {
		const inputDemo = $g("inputDemo");
		inputDemo.focus();
		inputDemo.select();
		navigator.clipboard.writeText(inputDemo.value).catch(() => {
			document.execCommand("copy");
		});
	}

	function removeAccent() {
		const inputDemo = $g("inputDemo");
		inputDemo.value = inputDemo.value
			.normalize("NFD")
			.replace(COMBINING_MARKS, "")
			.replace(/đ/g, "d")
			.replace(/Đ/g, "D");
		saveDemoText();
		inputDemo.focus();
		inputDemo.select();
	}

	const isShortcutModalOpen = () => $g("shortcutScreen").style.display !== "none";

	function showShortcutModal(open) {
		const wasOpen = isShortcutModalOpen();
		$g("shortcutScreen").style.display = open ? "" : "none";
		$g("mainScreen").inert = open;
		if (open) {
			$g("backToMain").focus();
			return;
		}
		if (wasOpen) {
			$g("inputDemo").focus();
		}
	}

	function closeModalOnBackdrop(event) {
		if (event.target === $g("shortcutScreen")) {
			showShortcutModal(false);
		}
	}

	function addRowFromEnter(event) {
		if (event.key !== "Enter") {
			return;
		}
		event.preventDefault();
		addShortcutRow().keyInput.focus();
	}

	function createShortcutInput(value, hint, name) {
		const input = document.createElement("input");
		input.type = "text";
		input.name = name;
		input.value = value;
		input.placeholder = chrome.i18n.getMessage(hint);
		input.className = "shortcutInput";
		input.addEventListener("keydown", addRowFromEnter);
		return input;
	}

	function removeShortcutRow(entry) {
		$g("shortcutList").removeChild(entry.row);
		shortcutRows.splice(shortcutRows.indexOf(entry), 1);
		if (shortcutRows.length === 0) {
			addShortcutRow();
		}
	}

	function addShortcutRow({ key = "", value = "" } = {}) {
		const row = document.createElement("div");
		row.className = "shortcutRow";
		const arrow = document.createElement("span");
		arrow.className = "shortcutArrow";
		arrow.textContent = "→";
		const keyInput = createShortcutInput(key, "extPopupShortcutKeyHint", SHORTCUT_KEY_FIELD);
		// Left nameless on purpose, so the engine stays on and a result can be typed in Telex
		const resultInput = createShortcutInput(value, "extPopupShortcutResultHint", "");
		const removeButton = document.createElement("button");
		removeButton.type = "button";
		removeButton.className = "button shortcutRemove";
		removeButton.textContent = "✕";
		removeButton.title = chrome.i18n.getMessage("extPopupRemoveShortcut");
		row.appendChild(keyInput);
		row.appendChild(arrow);
		row.appendChild(resultInput);
		row.appendChild(removeButton);
		$g("shortcutList").appendChild(row);
		const entry = { row, keyInput, resultInput, removeButton };
		shortcutRows.push(entry);
		removeButton.addEventListener("click", () => removeShortcutRow(entry));
		applyShortcutsEnabled();
		return entry;
	}

	/** Turning the feature off disables Save too, so the checkbox has to store itself. */
	function applyShortcutsEnabled() {
		const off = !$g("shortcutsOn").checked;
		for (const row of shortcutRows) {
			row.keyInput.disabled = off;
			row.resultInput.disabled = off;
			row.removeButton.disabled = off;
		}
		$g("addShortcut").disabled = off;
		$g("saveShortcuts").disabled = off;
	}

	function saveShortcuts() {
		savePrefs({
			shortcutsOn: $g("shortcutsOn").checked ? 1 : 0,
			shortcuts: shortcutRows.map((row) => ({ key: row.keyInput.value, value: row.resultInput.value }))
		}, { reload: false });
		showShortcutModal(false);
	}

	function showMethod(prefs) {
		const byMethod = Object.keys(METHOD_RADIOS).find((id) => METHOD_RADIOS[id] === prefs.method);
		const selected = prefs.onOff === 0 ? "off" : byMethod;
		for (const id of [...Object.keys(METHOD_RADIOS), "off"]) {
			$g(id).checked = id === selected;
		}
	}

	function showShortcuts(prefs) {
		$g("shortcutsOn").checked = prefs.shortcutsOn === 1;
		const stored = prefs.shortcuts ?? [];
		for (const entry of stored) {
			addShortcutRow(entry);
		}
		if (stored.length === 0) {
			addShortcutRow();
		}
	}

	function showControls(prefs) {
		$g("spellCheck").checked = prefs.ckSpell === 1;
		showMethod(prefs);
		$g("shortcutsOn").checked = prefs.shortcutsOn === 1;
		applyShortcutsEnabled();
	}

	function showPrefs(prefs) {
		showControls(prefs);
		showShortcuts(prefs);
	}

	const selectMethod = (method) => () => savePrefs({ method, onOff: 1 });

	function init() {
		loadText();
		showShortcutModal(false);
		globalThis.exclude = [...(globalThis.exclude ?? []), SHORTCUT_KEY_FIELD];
		chrome.runtime.sendMessage({ get_prefs: "all" }, showPrefs);
		chrome.runtime.sendMessage({ get_demo_text: "all" }, showDemoText);
		chrome.runtime.onMessage.addListener((pushed) => {
			if (pushed?.onOff !== undefined) {
				showControls(pushed);
			}
		});

		for (const [id, method] of Object.entries(METHOD_RADIOS)) {
			$g(id).addEventListener("click", selectMethod(method));
		}
		$g("off").addEventListener("click", () => savePrefs({ onOff: 0 }));
		$g("spellCheck").addEventListener("change", () => {
			savePrefs({ ckSpell: $g("spellCheck").checked ? 1 : 0 });
		});

		$g("inputDemo").addEventListener("input", saveDemoText);
		$g("searchDemo").addEventListener("click", searchDemo);
		$g("demoCopy").addEventListener("click", copyAllDemo);
		$g("removeAccent").addEventListener("click", removeAccent);

		$g("openShortcuts").addEventListener("click", () => showShortcutModal(true));
		$g("shortcutScreen").addEventListener("click", closeModalOnBackdrop);
		// Deliberately outside applyShortcutsEnabled(): turning shortcuts off would trap the screen
		$g("backToMain").addEventListener("click", () => showShortcutModal(false));
		$g("shortcutsOn").addEventListener("change", () => {
			applyShortcutsEnabled();
			savePrefs({ shortcutsOn: $g("shortcutsOn").checked ? 1 : 0 }, { reload: false });
		});
		$g("addShortcut").addEventListener("click", () => addShortcutRow());
		$g("saveShortcuts").addEventListener("click", saveShortcuts);
	}

	init();
})();
