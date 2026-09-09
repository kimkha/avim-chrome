/**
 * Fetches Chromium's linux-chromeos build, which test/chromeos-ime.test.js needs to get a real ash
 * session. Not a devDependency: it is a 293 MB zip that unpacks to 1.3 GB and is not on npm.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { CACHE } from "./chromeos-harness.js";

// Rebuilt daily, and the old Linux_ChromiumOS bucket has been dead since 2014. Pin a revision with
// AVIM_CROS_REVISION to reproduce a run.
const BUCKET = "https://commondatastorage.googleapis.com/chromium-browser-snapshots/Linux_ChromiumOS_Full";

function latestRevision() {
	return execFileSync("curl", ["-sS", "--max-time", "60", `${BUCKET}/LAST_CHANGE`], {
		encoding: "utf8",
	}).trim();
}

const revision = process.env.AVIM_CROS_REVISION || latestRevision();
const binary = path.join(CACHE, "chrome-chromeos", "chrome");

if (fs.existsSync(binary)) {
	console.log(`already there: ${binary}`);
} else {
	const archive = path.join(CACHE, "chrome-chromeos.zip");
	fs.mkdirSync(CACHE, { recursive: true });
	console.log(`downloading revision ${revision}`);
	execFileSync(
		"curl",
		["-sS", "-L", "--max-time", "900", "-o", archive, `${BUCKET}/${revision}/chrome-chromeos.zip`],
		{ stdio: "inherit" },
	);
	execFileSync("unzip", ["-q", "-o", archive, "-d", CACHE], { stdio: "inherit" });
	fs.rmSync(archive, { force: true });
	if (!fs.existsSync(binary)) {
		throw new Error(`extracted revision ${revision} but ${binary} is missing`);
	}
	console.log(`ready: ${binary}`);
}

console.log(`\nrun the suite with: yarn build && yarn test:chromeos`);
