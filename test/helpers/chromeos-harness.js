/**
 * Runs the built extension inside ChromeOS's ash shell, the only place chrome.input.ime exists.
 * Chromium's linux-chromeos build is a real ash session on a plain X display, so a Chromebook is
 * not needed; ChromeOS Flex in a VM is not an option on a host without KVM.
 *
 * Coverage split: browser-harness.js is desktop Chromium, firefox-harness.js is Firefox, this is
 * ChromeOS. Only this one reports os == "cros" and exposes the IME API.
 */

import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE = path.join(os.homedir(), ".cache", "avim-cros-test");

const CDP_TIMEOUT_MS = 45000;

function ashBinary() {
	return process.env.AVIM_CROS_PATH || path.join(CACHE, "chrome-chromeos", "chrome");
}

function onPath(command) {
	return (process.env.PATH || "")
		.split(path.delimiter)
		.some((dir) => dir && fs.existsSync(path.join(dir, command)));
}

async function resolveChromeOs() {
	const build = path.join(ROOT, "build");
	const reasons = [
		!fs.existsSync(path.join(build, "manifest.json")) && "no build/manifest.json; run `yarn build`",
		!fs.existsSync(ashBinary()) && `no ash-chrome at ${ashBinary()}; run \`yarn cros:install\``,
		!onPath("Xvfb") && "Xvfb is not on PATH; ash-chrome needs an X display",
		!onPath("xdotool") && "xdotool is not on PATH; only real keystrokes reach an IME",
	].filter(Boolean);
	try {
		await import("playwright-core");
	} catch {
		reasons.push("playwright-core is not installed; run `yarn install`");
	}
	const reason = reasons[0];
	if (!reason) {
		return { build };
	}
	// CI sets this so a missing piece fails the build instead of skipping green and proving nothing.
	if (process.env.AVIM_REQUIRE_CROS) {
		throw new Error(`AVIM_REQUIRE_CROS is set but ${reason}`);
	}
	return { skip: reason };
}

async function freePort() {
	const probe = net.createServer();
	await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
	const { port } = probe.address();
	await new Promise((resolve) => probe.close(resolve));
	return port;
}

/** X has no "give me any display" flag that survives spawn, so claim an unused lock file. */
function freeDisplay() {
	for (let display = 90; display < 200; display++) {
		if (!fs.existsSync(`/tmp/.X${display}-lock`)) {
			return display;
		}
	}
	throw new Error("no free X display between :90 and :199");
}

async function waitForCdp(port) {
	const deadline = Date.now() + CDP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/json/version`);
			if (response.ok) {
				return;
			}
		} catch {
			// ash is still booting
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error(`ash-chrome did not open a CDP port within ${CDP_TIMEOUT_MS}ms`);
}

/** The service worker is the only target that names the extension, and it idles out after ~30s. */
async function findExtensionId(port) {
	const deadline = Date.now() + 20000;
	while (Date.now() < deadline) {
		const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
		for (const target of targets) {
			const match = /^chrome-extension:\/\/([a-p]{32})\/chrome\/background\.js$/.exec(target.url ?? "");
			if (match) {
				return match[1];
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error("no chrome-extension://…/chrome/background.js target; the extension did not load");
}

async function launchChromeOs(build) {
	const { chromium } = await import("playwright-core");
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "avim-cros-"));
	const display = freeDisplay();
	const port = await freePort();

	const xvfb = spawn("Xvfb", [`:${display}`, "-screen", "0", "1400x900x24"], { stdio: "ignore" });
	const ash = spawn(
		ashBinary(),
		[
			`--user-data-dir=${path.join(profile, "profile")}`,
			"--no-sandbox",
			"--ozone-platform=x11",
			// Without a signed-in user ash stops at the login screen and loads no extension.
			"--login-user=stub-user@example.com",
			"--login-profile=user",
			`--remote-debugging-port=${port}`,
			`--load-extension=${build}`,
		],
		{ env: { ...process.env, DISPLAY: `:${display}` }, stdio: "ignore" },
	);

	async function close() {
		ash.kill();
		xvfb.kill();
		fs.rmSync(profile, { recursive: true, force: true });
	}

	try {
		await waitForCdp(port);
		const extensionId = await findExtensionId(port);
		const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
		const context = browser.contexts()[0];
		let settings = null;

		/**
		 * The private API, because Ctrl+Space needs a window manager for ash to see the accelerator and
		 * `settings.language.current_input_method` in the profile is reset at init.
		 */
		async function currentInputMethod() {
			settings = settings ?? (await openPage(context, "chrome://os-settings/"));
			return settings.evaluate(
				() => new Promise((resolve) => chrome.inputMethodPrivate.getCurrentInputMethod(resolve)),
			);
		}

		async function setInputMethod(imeId) {
			settings = settings ?? (await openPage(context, "chrome://os-settings/"));
			return settings.evaluate(async (target) => {
				chrome.languageSettingsPrivate.addInputMethod(target);
				await new Promise((resolve) => setTimeout(resolve, 800));
				await new Promise((resolve) => chrome.inputMethodPrivate.setCurrentInputMethod(target, resolve));
				await new Promise((resolve) => setTimeout(resolve, 400));
				return new Promise((resolve) => chrome.inputMethodPrivate.getCurrentInputMethod(resolve));
			}, imeId);
		}

		return {
			extensionId,
			/** For XTEST tools: real keystrokes are the only ones an IME gets to transform. */
			display: `:${display}`,
			/** _ext_ime_<extension_id><engine_id>, the OS's name for our one input_components entry. */
			imeId: `_ext_ime_${extensionId}avim`,
			setInputMethod,
			currentInputMethod,
			/** xdotool key names, so "space" and "BackSpace" rather than " " and "Backspace". */
			async typeKeys(page, keys, { delay = 120 } = {}) {
				for (const key of keys) {
					execFileSync("xdotool", ["key", "--clearmodifiers", key], {
						env: { ...process.env, DISPLAY: `:${display}` },
					});
					await page.waitForTimeout(delay);
				}
				await page.waitForTimeout(400);
			},
			/** Extension APIs answer only from the extension's own origin. */
			openExtensionPage: (page = "popup.html") => openPage(context, `chrome-extension://${extensionId}/${page}`),
			openUrl: (url) => openPage(context, url),
			/** languageSettingsPrivate and friends are bound to WebUI origins only. */
			openSettings: () => openPage(context, "chrome://os-settings/"),
			/** Where background.js runs. */
			serviceWorker: () => waitForServiceWorker(context, extensionId),
			async close() {
				await browser.close().catch(() => {});
				await close();
			},
		};
	} catch (error) {
		await close();
		throw error;
	}
}

async function openPage(context, url) {
	const page = await context.newPage();
	await page.goto(url);
	return page;
}

/** MV3 stops the worker after ~30 s idle, so it may have to be woken and waited for again. */
async function waitForServiceWorker(context, extensionId) {
	const prefix = `chrome-extension://${extensionId}/`;
	const deadline = Date.now() + 10000;
	while (Date.now() < deadline) {
		const worker = context.serviceWorkers().find((candidate) => candidate.url().startsWith(prefix));
		if (worker) {
			return worker;
		}
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error("the extension service worker never appeared");
}

/** A page served over http, so the content script runs on it as it would anywhere else. */
async function serveTextField(html = "<!doctype html><meta charset=utf-8><body><input id=probe>") {
	const server = http.createServer((request, response) => {
		response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
		response.end(html);
	});
	const origin = await new Promise((resolve) =>
		server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)),
	);
	return { origin, close: () => new Promise((resolve) => server.close(resolve)) };
}

export { resolveChromeOs, launchChromeOs, serveTextField, CACHE, ashBinary };
