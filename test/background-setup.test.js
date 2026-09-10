/**
 * Onboarding. A ChromeOS input method does nothing at all until the user adds it in Settings →
 * Inputs, so the extension has to say so; anywhere else that page would be about a feature the user
 * cannot have.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { loadBackground } from "./helpers/background-harness.js";

const SETUP_PAGE = "chrome-extension://avim/setup.html";

describe("Opening the setup page after install", () => {
	it("opens it on ChromeOS", async () => {
		const background = loadBackground({ platform: "cros" });

		await background.install();

		assert.deepEqual(background.openedTabs, [SETUP_PAGE]);
	});

	for (const platform of ["linux", "mac", "win", "android"]) {
		it(`stays quiet on ${platform}`, async () => {
			const background = loadBackground({ platform });

			await background.install();

			assert.deepEqual(background.openedTabs, []);
		});
	}

	it("opens it for an update too, so existing users hear about IME mode", async () => {
		const background = loadBackground({ platform: "cros" });

		await background.install({ reason: "update", previousVersion: "1.0.0" });

		assert.deepEqual(background.openedTabs, [SETUP_PAGE]);
	});

	it("opens it once and never again", async () => {
		const background = loadBackground({ platform: "cros" });

		await background.install();
		await background.install({ reason: "update", previousVersion: "1.0.0" });

		assert.deepEqual(background.openedTabs, [SETUP_PAGE]);
	});

	it("remembers across a restarted service worker", async () => {
		const first = loadBackground({ platform: "cros" });
		await first.install();

		const second = loadBackground({ platform: "cros", stored: first.storage });
		await second.install();

		assert.deepEqual(second.openedTabs, []);
	});

	/**
	 * Measured on ChromeOS: an extension that installs before any window exists gets "No current
	 * window" from tabs.create. Marking it seen anyway would bury the page for good.
	 */
	it("does not count an install it could not show", async () => {
		const background = loadBackground({ platform: "cros", noWindow: true });

		await background.install();

		assert.deepEqual(background.openedTabs, []);
		assert.equal(background.storage.imeSetupSeen, undefined);
	});

	it("shows it at the next browser start instead", async () => {
		const failed = loadBackground({ platform: "cros", noWindow: true });
		await failed.install();

		const later = loadBackground({ platform: "cros", stored: failed.storage });
		await later.restart();

		assert.deepEqual(later.openedTabs, [SETUP_PAGE]);
	});

	it("does not show it again at a later start", async () => {
		const background = loadBackground({ platform: "cros" });

		await background.install();
		await background.restart();

		assert.deepEqual(background.openedTabs, [SETUP_PAGE]);
	});

	it("leaves the prefs alone", async () => {
		const background = loadBackground({ platform: "cros" });

		await background.install();
		const prefs = await background.send({ get_prefs: true });

		assert.equal(prefs.method, 0);
		assert.equal(prefs.onOff, 1);
	});
});
