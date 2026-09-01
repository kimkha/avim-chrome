(() => {
	/** Each key maps to a #txt<Key> element in popup.html and an extPopup<Key> locale message. */
	const LABEL_KEYS = [
		"Sel",
		"Auto",
		"Telex",
		"Vni",
		"Viqr",
		"ViqrStar",
		"Off",
		"SpellCheck",
		"Tips",
		"TipsCtrl",
		"Demo",
		"DemoCopy",
		"RemoveAccent"
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

	const $g = (id) => document.getElementById(id);

	/** The background stores the prefs and pushes them to every tab; the reload re-reads them. */
	function savePrefs(prefs) {
		chrome.runtime.sendMessage({ save_prefs: "all", ...prefs }, () => {
			window.location.reload();
		});
	}

	function loadText() {
		for (const key of LABEL_KEYS) {
			$g(`txt${key}`).innerHTML = chrome.i18n.getMessage(`extPopup${key}`);
		}
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
		inputDemo.focus();
		inputDemo.select();
	}

	function showPrefs(prefs) {
		$g("spellCheck").checked = prefs.ckSpell === 1;
		if (prefs.onOff === 0) {
			$g("off").checked = true;
			return;
		}
		const selected = Object.keys(METHOD_RADIOS).find((id) => METHOD_RADIOS[id] === prefs.method);
		if (selected) {
			$g(selected).checked = true;
		}
	}

	const selectMethod = (method) => () => savePrefs({ method, onOff: 1 });

	function init() {
		loadText();
		chrome.runtime.sendMessage({ get_prefs: "all" }, showPrefs);

		for (const [id, method] of Object.entries(METHOD_RADIOS)) {
			$g(id).addEventListener("click", selectMethod(method));
		}
		$g("off").addEventListener("click", () => savePrefs({ onOff: 0 }));
		$g("spellCheck").addEventListener("change", () => {
			savePrefs({ ckSpell: $g("spellCheck").checked ? 1 : 0 });
		});

		$g("demoCopy").addEventListener("click", copyAllDemo);
		$g("removeAccent").addEventListener("click", removeAccent);
	}

	init();
})();
