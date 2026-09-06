/**
 * Fetches the Firefox and geckodriver binaries that test/firefox-smoke.test.js needs.
 * Kept out of devDependencies because the npm geckodriver package downloads to an
 * unpredictable cache directory, and Firefox is not on npm at all.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { CACHE } from "./firefox-harness.js";

/**
 * Both pinned: Firefox 155 needed a launch flag Firefox 128 did not, so a moving "latest" would
 * break this suite on Mozilla's release schedule. Override the version to test another one.
 */
const FIREFOX_VERSION = process.env.AVIM_FIREFOX_VERSION || "155.0.1";
const GECKODRIVER_VERSION = "0.37.1";

const FIREFOX_URL = `https://ftp.mozilla.org/pub/firefox/releases/${FIREFOX_VERSION}/linux-x86_64/en-US/firefox-${FIREFOX_VERSION}.tar.xz`;
const GECKODRIVER_URL = `https://github.com/mozilla/geckodriver/releases/download/v${GECKODRIVER_VERSION}/geckodriver-v${GECKODRIVER_VERSION}-linux64.tar.gz`;

function fetchAndExtract(url, archive, done) {
	if (fs.existsSync(done)) {
		console.log(`already there: ${done}`);
		return;
	}
	console.log(`downloading ${url}`);
	execFileSync("curl", ["-sS", "-L", "--max-time", "600", "-o", archive, url], { stdio: "inherit" });
	execFileSync("tar", ["xf", archive, "-C", CACHE], { stdio: "inherit" });
	fs.rmSync(archive, { force: true });
	if (!fs.existsSync(done)) {
		throw new Error(`extracted ${url} but ${done} is missing`);
	}
	console.log(`ready: ${done}`);
}

fs.mkdirSync(CACHE, { recursive: true });
fetchAndExtract(FIREFOX_URL, path.join(CACHE, "firefox.tar.xz"), path.join(CACHE, "firefox", "firefox"));
fetchAndExtract(GECKODRIVER_URL, path.join(CACHE, "geckodriver.tar.gz"), path.join(CACHE, "geckodriver"));
console.log(`\nrun the suite with: yarn test:firefox`);
