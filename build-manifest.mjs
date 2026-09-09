// Kept out of build.mjs so the test suite can import it: `yarn test` installs nothing, and build.mjs
// pulls in terser, yazl and htmlclean.

// ChromeOS-only keys. Firefox has no chrome.input.ime, so `input` is an unknown permission there and
// AMO's validator flags it.
const CROS_KEYS = ['input_components'];
const CROS_PERMISSIONS = ['input'];

// Firefox MV3 runs background.scripts (it ignores service_worker) and needs the gecko id; the
// Chrome Web Store and Edge Partner Center reject background.scripts under MV3, and Chromium
// ignores browser_specific_settings. One source manifest, shaped per store here.
export function manifestFor(target, manifest) {
	const shaped = structuredClone(manifest);
	if (target !== 'firefox') {
		delete shaped.browser_specific_settings;
		return shaped;
	}
	// Same file, loaded as a non-persistent event page rather than a service worker.
	shaped.background = { scripts: [manifest.background.service_worker] };
	for (const key of CROS_KEYS) {
		delete shaped[key];
	}
	shaped.permissions = shaped.permissions.filter((name) => !CROS_PERMISSIONS.includes(name));
	return shaped;
}
