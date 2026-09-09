import { createWriteStream, existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import htmlclean from 'htmlclean';
import { minify } from 'terser';
import yazl from 'yazl';

import { manifestFor } from './build-manifest.mjs';

const SRC = 'src';
const BUILD = 'build';
const DIST = 'dist';

// `chrome` must survive mangling: the extension APIs are resolved by name at runtime.
// ecma 2020 lets terser keep modern output instead of downlevelling to ES5.
const TERSER_OPTIONS = {
	ecma: 2020,
	compress: { ecma: 2020 },
	format: { ecma: 2020 },
	mangle: { toplevel: true, eval: true, reserved: ['chrome'] },
};

// One mangle pass for the whole extension. terser records every top-level declaration it renames in
// `nameCache`, and renames a later file's free reference to the same name to match — so avim-dom.js
// keeps calling into avim-engine.js with both fully mangled, and no name has to be reserved by hand.
// The price is an order contract: a file may only be minified after everything it references.
const nameCache = {};

const SCRIPT_ORDER = ['scripts/avim-engine.js'];

const SCRIPT_TREES = ['scripts', 'chrome'];

// Copied verbatim into build/ under the same relative path. Absent trees are skipped.
const ASSET_TREES = ['icons', '_locales', 'fonts', 'styles', 'scripts/vendors'];

// Store-listing logos: kept in src/icons for the render pipeline and manual upload (Opera 64,
// Edge 300), but the manifest never references them, so they are dead weight inside the package.
const STORE_ONLY_ICONS = new Set(['icon64.png', 'icon300.png']);

async function walkEntries(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const child = path.join(dir, entry.name);
			if (!entry.isDirectory()) {
				return [{ file: child }];
			}
			return [{ directory: child }, ...(await walkEntries(child))];
		}),
	);
	return nested.flat();
}

async function walkFiles(dir) {
	const entries = await walkEntries(dir);
	return entries
		.filter((entry) => entry.file !== undefined)
		.map((entry) => entry.file)
		.sort();
}

async function jsFiles(dir) {
	if (!existsSync(dir)) {
		return [];
	}
	const files = await walkFiles(dir);
	return files.filter(
		(file) =>
			file.endsWith('.js') && !path.relative(dir, file).split(path.sep).includes('vendors'),
	);
}

async function writeOut(target, contents) {
	await mkdir(path.dirname(target), { recursive: true });
	await writeFile(target, contents);
}

async function minifyTo(source, target) {
	const { code } = await minify(source, { ...TERSER_OPTIONS, nameCache });
	await writeOut(target, code);
}

async function copyAssets() {
	for (const tree of ASSET_TREES) {
		if (existsSync(path.join(SRC, tree))) {
			await cp(path.join(SRC, tree), path.join(BUILD, tree), {
				recursive: true,
				filter: (source) => !STORE_ONLY_ICONS.has(path.basename(source)),
			});
		}
	}
}

async function buildHtml() {
	const pages = (await readdir(SRC)).filter((name) => name.endsWith('.html'));
	for (const page of pages) {
		const source = await readFile(path.join(SRC, page), 'utf8');
		await writeOut(path.join(BUILD, page), htmlclean(source));
	}
}

// Firefox MV3 runs background.scripts (it ignores service_worker) and needs the gecko id; the
// Chrome Web Store and Edge Partner Center reject background.scripts under MV3, and Chromium
// ignores browser_specific_settings. One source manifest, shaped per store in build-manifest.mjs.
async function writeManifest(target) {
	const manifest = JSON.parse(await readFile(path.join(SRC, 'manifest.json'), 'utf8'));
	const shaped = manifestFor(target, manifest);
	await writeOut(path.join(BUILD, 'manifest.json'), JSON.stringify(shaped, null, 2) + '\n');
}

async function scriptFiles() {
	const found = (
		await Promise.all(
			SCRIPT_TREES.map(async (tree) =>
				(await jsFiles(path.join(SRC, tree))).map((file) => path.relative(SRC, file)),
			),
		)
	).flat();
	const first = SCRIPT_ORDER.filter((name) => found.includes(name));
	return [...first, ...found.filter((name) => !first.includes(name))];
}

// Sequential, because every call reads and extends the shared nameCache.
async function buildScripts() {
	for (const relative of await scriptFiles()) {
		await minifyTo(await readFile(path.join(SRC, relative), 'utf8'), path.join(BUILD, relative));
	}
}

async function readVersion() {
	const [manifest, pkg] = await Promise.all([
		readFile(path.join(SRC, 'manifest.json'), 'utf8').then(JSON.parse),
		readFile('package.json', 'utf8').then(JSON.parse),
	]);
	// The release workflow derives the tag and asset name from the manifest, so a silent drift
	// would publish a wrongly named artifact.
	if (manifest.version !== pkg.version) {
		throw new Error(
			`version drift: src/manifest.json is ${manifest.version}, package.json is ${pkg.version}`,
		);
	}
	return manifest.version;
}

async function zipBuild(prefix, version) {
	const target = path.join(DIST, `${prefix}-${version}.zip`);
	const archive = new yazl.ZipFile();
	// Directory entries are emitted too, matching what a plain `zip -r` of build/ produces.
	for (const entry of await walkEntries(BUILD)) {
		if (entry.directory === undefined) {
			archive.addFile(entry.file, path.relative(BUILD, entry.file));
		} else {
			archive.addEmptyDirectory(path.relative(BUILD, entry.directory));
		}
	}
	archive.end();

	await mkdir(DIST, { recursive: true });
	const out = createWriteStream(target);
	archive.outputStream.pipe(out);
	await new Promise((resolve, reject) => {
		out.on('close', resolve);
		out.on('error', reject);
	});
	return target;
}

await rm(BUILD, { recursive: true, force: true });
await Promise.all([
	copyAssets(),
	buildHtml(),
	buildScripts(),
]);
const version = await readVersion();
// Firefox first, Chromium last: test:browser loads build/ via --load-extension in Chromium,
// which rejects background.scripts, so build/ must be left holding the Chromium manifest.
await writeManifest('firefox');
const firefox = await zipBuild('avim-firefox', version);
await writeManifest('chromium');
const chromium = await zipBuild('avim-chrome', version);
console.log(`built ${chromium}`);
console.log(`built ${firefox}`);
