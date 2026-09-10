/**
 * The page chrome/background.js opens once on ChromeOS. An IME does nothing until the user adds it
 * in Settings → Inputs, so this is the difference between a working extension and a store review
 * saying nothing happened.
 */

(function () {
	/** Ids read as `txt<Key>`, messages as `extSetup<Key>`, the same pairing popup.js uses. */
	const LABEL_KEYS = ["Title", "Intro", "Step1", "Step2", "Step3", "Open", "NoteTitle", "Note"];

	/** Deep link into the input-method list. Measured: an extension may open it with tabs.create. */
	const INPUT_SETTINGS_URL = "chrome://os-settings/osLanguages/input";

	function loadText() {
		for (const key of LABEL_KEYS) {
			document.getElementById(`txt${key}`).textContent = chrome.i18n.getMessage(`extSetup${key}`);
		}
	}

	function init() {
		loadText();
		document.getElementById("openInputSettings").addEventListener("click", () => {
			chrome.tabs.create({ url: INPUT_SETTINGS_URL });
		});
	}

	document.addEventListener("DOMContentLoaded", init);
})();
