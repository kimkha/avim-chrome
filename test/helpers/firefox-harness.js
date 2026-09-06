/**
 * Drives real Firefox over plain WebDriver so the Firefox-shaped zip is exercised, not assumed.
 * Chromium coverage lives in browser-harness.js; playwright cannot load extensions in Firefox.
 */

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE = path.join(os.homedir(), ".cache", "avim-firefox-test");

/** Pinned so the popup lives at a known moz-extension:// origin; Firefox randomises it otherwise. */
const EXTENSION_UUID = "b7f3a1c2-4d5e-4a6b-8c9d-0e1f2a3b4c5d";
const GECKO_ID = "mozilla@kimkha.com";

function firefoxBinary() {
	return process.env.AVIM_FIREFOX_PATH || path.join(CACHE, "firefox", "firefox");
}

function geckodriverBinary() {
	return process.env.AVIM_GECKODRIVER_PATH || path.join(CACHE, "geckodriver");
}

function firefoxPackage() {
	const dist = path.join(ROOT, "dist");
	if (!fs.existsSync(dist)) {
		return null;
	}
	const zip = fs.readdirSync(dist).find((name) => /^avim-firefox-.*\.zip$/.test(name));
	return zip ? path.join(dist, zip) : null;
}

function resolveFirefox() {
	const missing = [["firefox", firefoxBinary()], ["geckodriver", geckodriverBinary()]]
		.filter(([, binary]) => !fs.existsSync(binary))
		.map(([label, binary]) => `no ${label} at ${binary}; run \`yarn firefox:install\``);
	const zip = firefoxPackage();
	const reason = missing[0] ?? (zip ? null : "no dist/avim-firefox-*.zip; run `yarn build`");
	if (!reason) {
		return { zip };
	}
	// CI sets this so a missing binary fails the build instead of skipping green and proving nothing.
	if (process.env.AVIM_REQUIRE_FIREFOX) {
		throw new Error(`AVIM_REQUIRE_FIREFOX is set but ${reason}`);
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

/**
 * Firefox 155 gates chrome context behind -remote-allow-system-access, and geckodriver rejects
 * that flag when it arrives through capabilities, so it has to come from the binary itself.
 */
function writeLauncher(directory) {
	const launcher = path.join(directory, "firefox-with-system-access");
	fs.writeFileSync(launcher, `#!/bin/sh\nexec ${firefoxBinary()} -remote-allow-system-access "$@"\n`);
	fs.chmodSync(launcher, 0o755);
	return launcher;
}

async function launchFirefoxExtension(zip) {
	const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "avim-firefox-"));
	const port = await freePort();
	const driver = spawn(geckodriverBinary(), ["--port", String(port), "--log", "fatal"], {
		stdio: ["ignore", "ignore", "ignore"],
	});
	const base = `http://127.0.0.1:${port}`;

	async function send(method, route, body) {
		const response = await fetch(base + route, {
			method,
			headers: { "Content-Type": "application/json" },
			body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
		});
		const payload = await response.json();
		if (payload.value?.error) {
			throw new Error(`${payload.value.error}: ${payload.value.message}`);
		}
		return payload.value;
	}

	for (let attempt = 0; attempt < 80; attempt++) {
		try {
			await fetch(base + "/status");
			break;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
	}

	const session = await send("POST", "/session", {
		capabilities: {
			alwaysMatch: {
				"moz:firefoxOptions": {
					binary: writeLauncher(workspace),
					args: ["-headless"],
					prefs: {
						"extensions.webextensions.uuids": JSON.stringify({ [GECKO_ID]: EXTENSION_UUID }),
						"xpinstall.signatures.required": false,
					},
				},
			},
		},
	});
	const id = session.sessionId;
	const route = (suffix) => `/session/${id}${suffix}`;

	const addonId = await send("POST", route("/moz/addon/install"), { path: zip, temporary: true });

	// geckodriver refuses POST /url for moz-extension://, so the popup has to be opened privileged.
	await send("POST", route("/moz/context"), { context: "chrome" });
	await send("POST", route("/execute/sync"), {
		script: `Services.wm.getMostRecentWindow("navigator:browser").openTrustedLinkIn(arguments[0], "tab"); return true;`,
		args: [`moz-extension://${EXTENSION_UUID}/popup.html`],
	});
	await send("POST", route("/moz/context"), { context: "content" });

	let popupUrl = null;
	for (let attempt = 0; attempt < 40 && !popupUrl; attempt++) {
		await new Promise((resolve) => setTimeout(resolve, 250));
		for (const handle of await send("GET", route("/window/handles"))) {
			await send("POST", route("/window"), { handle });
			const url = await send("GET", route("/url"));
			if (String(url).startsWith("moz-extension://")) {
				popupUrl = url;
				break;
			}
		}
	}

	async function find(css) {
		const element = await send("POST", route("/element"), { using: "css selector", value: css });
		return element["element-6066-11e4-a52e-4f735466cecf"];
	}

	return {
		addonId,
		popupUrl,
		evaluate: (script, ...args) => send("POST", route("/execute/sync"), { script, args }),
		evaluateAsync: (script, ...args) => send("POST", route("/execute/async"), { script, args }),
		find,
		async click(css) {
			await send("POST", route(`/element/${await find(css)}/click`));
		},
		async type(css, text) {
			const element = await find(css);
			await send("POST", route(`/element/${element}/clear`));
			await send("POST", route(`/element/${element}/value`), { text });
		},
		settle: (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms)),
		async close() {
			await send("DELETE", route("")).catch(() => {});
			driver.kill();
			fs.rmSync(workspace, { recursive: true, force: true });
		},
	};
}

export { resolveFirefox, launchFirefoxExtension, CACHE, EXTENSION_UUID, GECKO_ID };
