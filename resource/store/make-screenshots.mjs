// Builds Chrome Web Store screenshots at the required 1280x800, one set per locale.
// Run with `node resource/store/make-screenshots.mjs`.
//
// The extension is loaded into real Chromium and driven with real keystrokes, so the Vietnamese in
// every shot is produced by the engine rather than typed into a mockup. Every string of Vietnamese
// is asserted against what the engine actually produced, so a regression breaks the build instead
// of shipping a screenshot of raw keystrokes.
//
// Composition is done by rendering an HTML poster and screenshotting that, which keeps the whole
// pipeline in playwright-core: CSS already gives us shadows, gradients and web fonts.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';


const HERE = import.meta.dirname;
const SRC = path.join(HERE, '..', '..', 'src');
const DEMO = path.join(HERE, 'demo-page.html');
const OUT = path.join(HERE, 'screenshots');

const WIDTH = 1280;
const HEIGHT = 800;
const PAGE_W = 1120;
const PAGE_H = 560;

// Mirrors BADGE in chrome/background.js: the washed-out pair marks a tab a URL row decided. Every
// shot seeds a row for the demo host, so onPattern is the badge those tabs really carry.
const BADGE = {
	on: { text: 'on', bg: '#008000', fg: '#fff' },
	onPattern: { text: 'on', bg: '#c7f0e2', fg: '#000' },
};

// Chrome resolves _locales from --lang, so the popup screenshots come out genuinely localised.
const LOCALES = {
	en: {
		lang: 'en-US',
		host: 'notes.example.com',
		path: '/new',
		title: 'Weekend plan',
		body: 'Hẹn gặp lúc bảy giờ ở quán cà phê cũ. Nhớ mang theo cuốn sổ màu xanh.',
		captions: {
			hero: ['Type Vietnamese on any website', 'No system-wide input method, no keyboard layout to switch'],
			typing: ['Just type the way you already do', 'Telex, VNI or VIQR — pick one, then type as usual'],
			sites: ['On where you want it, off where you do not', 'Choose which sites it runs on, or press Ctrl three times for the open one'],
			scratch: ['A quick scratchpad in the popup', 'Type a line, then copy it, search it, or drop the accents'],
		},
		typedLabel: 'you type',
		scratch: { before: 'Đường vô xứ Nghệ quanh quanh', after: 'Duong vo xu Nghe quanh quanh' },
		scratchLabels: ['typed', 'after Remove accents'],
	},
	vi: {
		lang: 'vi',
		host: 'ghichu.example.com',
		path: '/moi',
		title: 'Kế hoạch cuối tuần',
		body: 'Hẹn gặp lúc bảy giờ ở quán cà phê cũ. Nhớ mang theo cuốn sổ màu xanh.',
		captions: {
			hero: ['Gõ tiếng Việt trên mọi trang web', 'Không cần bộ gõ hệ thống, không cần đổi bố cục bàn phím'],
			typing: ['Cứ gõ như bạn vẫn gõ', 'Telex, VNI hay VIQR — chọn một kiểu rồi gõ như thường'],
			sites: ['Bật nơi cần, tắt nơi không cần', 'Chọn trang nào được gõ, hoặc nhấn Ctrl 3 lần cho trang đang mở'],
			scratch: ['Ô gõ nhanh ngay trong popup', 'Gõ một dòng rồi sao chép, tìm kiếm hoặc bỏ dấu'],
		},
		typedLabel: 'bạn gõ',
		scratch: { before: 'Đường vô xứ Nghệ quanh quanh', after: 'Duong vo xu Nghe quanh quanh' },
		scratchLabels: ['đã gõ', 'sau khi Đổi không dấu'],
	},
};

// Telex keystrokes; the engine turns these into the accented text seen in the shots.
const TELEX = {
	'Weekend plan': 'Weekend plan',
	'Kế hoạch cuối tuần': 'Kees hoachj cuoois tuaanf',
	'Hẹn gặp lúc bảy giờ ở quán cà phê cũ. Nhớ mang theo cuốn sổ màu xanh.':
		'Hejn gawpj lucs bayr giowf owr quans caf phee cux. Nhows mang theo cuoons soor mauf xanh.',
	'Đường vô xứ Nghệ quanh quanh': 'DDuwowngf voo xuws Ngheej quanh quanh',
};

// One word, three input methods, so the shot teaches the methods and the typing in one frame.
const METHOD_MATRIX = [
	{ radio: 'telex', label: 'Telex', keys: 'chaof' },
	{ radio: 'vni', label: 'VNI', keys: 'chao2' },
	{ radio: 'viqr', label: 'VIQR', keys: 'chao`' },
];

const MATRIX_WORD = 'chào';

function resolveChromium() {
	const executablePath = process.env.AVIM_CHROME_PATH ?? chromium.executablePath();
	if (!existsSync(executablePath)) {
		throw new Error(`no chromium at ${executablePath}; run \`npx playwright install chromium\``);
	}
	return executablePath;
}

// The content script only matches http/https, so a file:// demo page would be left untransformed
// and the screenshots would silently show raw keystrokes.
async function serveDemo() {
	const html = await readFile(DEMO);
	const server = createServer((_request, response) => {
		response.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
		response.end(html);
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	return { port: server.address().port, close: () => server.close() };
}

function assertTyped(where, actual, expected) {
	if (actual !== expected) {
		throw new Error(`${where}: engine produced ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
	}
}

// The popup reads its preferences over messaging, so the radios are unchecked for the first frames
// and a shot taken too early shows no input method selected.
async function waitForPrefs(page) {
	await page.waitForFunction(
		() => ['auto', 'telex', 'vni', 'viqr', 'viqrStar', 'off'].some((id) => document.getElementById(id)?.checked),
		{ timeout: 15000 },
	);
}

/** The popup sizes itself in CSS, so measuring beats hardcoding a viewport that clips a column. */
async function fitPopup(page) {
	// documentElement stretches to the viewport, so the body is what carries the popup's real size.
	const size = await page.evaluate(() => {
		const rect = document.body.getBoundingClientRect();
		return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
	});
	await page.setViewportSize(size);
	return size;
}

// Screenshots still time out occasionally on a busy machine, so each one is simply retried.
async function retryShot(page, take) {
	let lastError;
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			return await take();
		} catch (error) {
			lastError = error;
			await page.waitForTimeout(2500);
		}
	}
	throw lastError;
}

const stableShot = (page, options = {}) =>
	retryShot(page, () => page.screenshot({ type: 'png', timeout: 8000, ...options }));

/** An element shot leaves out the scrim behind a modal, which only muddies the poster. */
const stableElementShot = (page, selector, options = {}) =>
	retryShot(page, () => page.locator(selector).screenshot({ type: 'png', timeout: 8000, ...options }));

function dataUri(buffer) {
	return `data:image/png;base64,${buffer.toString('base64')}`;
}

const POSTER_CSS = `
	* { box-sizing: border-box; margin: 0; }
	body {
		width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
		font: 16px/1.4 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
		background: radial-gradient(120% 120% at 12% -10%, #8f83e8 0%, #5a49c4 42%, #3b2e8f 100%);
		color: #fff; display: flex; flex-direction: column; align-items: center;
	}
	h1 { font-size: 40px; font-weight: 700; letter-spacing: -.7px; margin-top: 52px; text-align: center; }
	h2 { font-size: 19px; font-weight: 400; opacity: .82; margin-top: 12px; text-align: center; }
	.stage { flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; position: relative; }
	.window {
		border-radius: 12px 12px 0 0; overflow: hidden; background: #fff;
		box-shadow: 0 30px 70px rgba(15, 10, 50, .45); position: relative;
	}
	/** Cropping the page shot keeps its aspect ratio; resizing the img would squash the text. */
	.viewport { overflow: hidden; }
	.chrome { height: 40px; background: #e8eaf2; display: flex; align-items: center; padding: 0 14px; gap: 7px; }
	.chrome i { width: 11px; height: 11px; border-radius: 50%; background: #c3c7d6; }
	.pill {
		flex: 1; margin: 0 14px; height: 24px; border-radius: 14px; background: #fff;
		color: #6b7080; font-size: 12px; display: flex; align-items: center; padding: 0 12px;
	}
	.tool { display: flex; align-items: center; gap: 5px; }
	.tool img { width: 22px; height: 22px; display: block; }
	.badge { font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 3px; }
	.popup {
		background: #fff; border-radius: 10px; overflow: hidden;
		box-shadow: 0 24px 60px rgba(15, 10, 50, .5);
	}
	.popup img { display: block; }
	.float { position: absolute; }
	.card {
		background: #14122e; border-radius: 14px; box-shadow: 0 16px 40px rgba(10, 6, 40, .5);
	}
	.matrix { display: flex; flex-direction: column; gap: 12px; padding: 20px 26px; }
	.line { display: grid; grid-template-columns: 66px 132px 24px auto; align-items: center; gap: 16px; }
	.line .m { font-size: 12px; font-weight: 700; opacity: .5; text-transform: uppercase; letter-spacing: .8px; }
	.line .k { font-family: "DejaVu Sans Mono", ui-monospace, monospace; font-size: 24px; font-weight: 700; color: #b9b2ff; }
	.line .arrow { font-size: 20px; opacity: .45; }
	.line .v { font-size: 24px; font-weight: 700; color: #7ef0a8; }
	.pair { display: flex; gap: 26px; align-items: stretch; }
	.strip {
		flex: 1; display: flex; flex-direction: column; justify-content: center;
		padding: 18px 22px;
	}
	.strip small { display: block; font-size: 12px; font-weight: 700; opacity: .55; text-transform: uppercase; letter-spacing: .8px; margin-bottom: 8px; }
	.strip b { font-size: 24px; font-weight: 600; }
`;

async function poster(page, body) {
	await page.setContent(
		`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${POSTER_CSS}</style></head><body>${body}</body></html>`,
	);
	await page.waitForLoadState('load');
	await page.waitForTimeout(250);
	return stableShot(page, { animations: 'disabled' });
}

function windowFrame({ pageShot, iconUri, url, badge, width = PAGE_W, height = PAGE_H, inner = '' }) {
	return `<div class="window" style="width:${width}px">
		<div class="chrome"><i></i><i></i><i></i>
			<div class="pill">${url}</div>
			<div class="tool"><img src="${iconUri}"><span class="badge" style="background:${badge.bg};color:${badge.fg}">${badge.text}</span></div>
		</div>
		<div class="viewport" style="height:${height}px">
			<img src="${pageShot}" width="${PAGE_W}" height="${PAGE_H}">
		</div>
		${inner}
	</div>`;
}

/**
 * Drives the real popup and the real page, and hands back every image and every string the poster
 * needs. Nothing here is composed; that happens afterwards from these captures.
 */
async function capture(ctx, extensionId, cfg, origin) {
	const demo = await ctx.newPage();
	await demo.setViewportSize({ width: PAGE_W, height: PAGE_H });
	await demo.goto(origin);
	await demo.waitForTimeout(500);

	const popup = await ctx.newPage();
	await popup.goto(`chrome-extension://${extensionId}/popup.html`);
	await waitForPrefs(popup);
	const popupSize = await fitPopup(popup);

	// Clicking the radio is the real path: the popup saves, the background pushes, the page follows.
	for (const method of METHOD_MATRIX) {
		await popup.bringToFront();
		await popup.click(`#${method.radio}`);
		await popup.waitForTimeout(250);
		await demo.bringToFront();
		await demo.fill('#title', '');
		await demo.click('#title');
		await demo.keyboard.type(method.keys, { delay: 14 });
		await demo.waitForTimeout(150);
		assertTyped(`${cfg.lang} ${method.label}`, await demo.inputValue('#title'), MATRIX_WORD);
	}

	await popup.bringToFront();
	await popup.click('#telex');
	await popup.waitForTimeout(250);

	await demo.bringToFront();
	await demo.fill('#title', '');
	for (const [selector, text] of [['#title', cfg.title], ['#body', cfg.body]]) {
		await demo.click(selector);
		await demo.keyboard.type(TELEX[text] ?? text, { delay: 12 });
	}
	await demo.waitForTimeout(250);
	const typed = { title: await demo.inputValue('#title'), body: await demo.inputValue('#body') };
	assertTyped(`${cfg.lang} #title`, typed.title, cfg.title);
	assertTyped(`${cfg.lang} #body`, typed.body, cfg.body);
	const pageShot = dataUri(await stableShot(demo));

	await popup.bringToFront();
	await popup.click('#openPatterns');
	await popup.waitForTimeout(250);
	const popupModal = dataUri(await stableElementShot(popup, '#patternScreen .modal'));
	await popup.click('#backFromPatterns');
	await popup.waitForTimeout(250);

	await popup.click('#inputDemo');
	await popup.keyboard.type(TELEX[cfg.scratch.before], { delay: 14 });
	await popup.waitForTimeout(250);
	const scratchTyped = await popup.inputValue('#inputDemo');
	assertTyped(`${cfg.lang} scratchpad`, scratchTyped, cfg.scratch.before);
	const popupScratch = dataUri(await stableShot(popup));
	await popup.click('#removeAccent');
	await popup.waitForTimeout(250);
	const scratchStripped = await popup.inputValue('#inputDemo');
	assertTyped(`${cfg.lang} remove-accent`, scratchStripped, cfg.scratch.after);

	// The quick per-site setting asks the ACTIVE tab for its URL, so the popup has to boot while the
	// demo page is the active tab; opened as the active tab itself it has no content script to ask.
	await popup.fill('#inputDemo', '');
	await popup.waitForTimeout(250);
	await demo.bringToFront();
	await popup.reload();
	await waitForPrefs(popup);
	let quickPattern = null;
	try {
		await popup.waitForSelector('#quickPattern:not([hidden])', { timeout: 5000 });
		quickPattern = await popup.textContent('#quickPattern');
	} catch {
		quickPattern = null;
	}
	const popupMain = dataUri(await stableShot(popup));

	return { pageShot, popupMain, popupModal, popupScratch, typed, scratchTyped, scratchStripped, popupSize, quickPattern };
}

function compose(cfg, shot, iconUri) {
	const url = `${cfg.host}${cfg.path}`;
	const head = (key) => `<h1>${cfg.captions[key][0]}</h1><h2>${cfg.captions[key][1]}</h2>`;
	const frame = (options) => windowFrame({ pageShot: shot.pageShot, iconUri, url, ...options });

	const lines = METHOD_MATRIX.map((method) => `<div class="line">
		<span class="m">${method.label}</span>
		<span class="k">${method.keys.replace(/`/g, '&#96;')}</span>
		<span class="arrow">&rarr;</span>
		<span class="v">${MATRIX_WORD}</span>
	</div>`).join('');

	return [
		[
			'01-hero.png',
			`${head('hero')}<div class="stage" style="align-items:flex-end">
				<div style="position:relative; width:1160px">
					${frame({ badge: BADGE.onPattern })}
					<div class="float popup" style="top:28px; right:-24px; width:480px">
						<img src="${shot.popupMain}" width="480">
					</div>
				</div>
			</div>`,
		],
		[
			'02-typing.png',
			`${head('typing')}<div class="stage">
				<div style="position:relative">
					${frame({ badge: BADGE.onPattern, height: 540 })}
					<div class="card matrix float" style="top:50%; right:34px; transform:translateY(-50%)">
						<div class="line"><span class="m"></span><span class="m">${cfg.typedLabel}</span><span></span><span class="m">AVIM</span></div>
						${lines}
					</div>
				</div>
			</div>`,
		],
		[
			'03-sites.png',
			`${head('sites')}<div class="stage" style="align-items:flex-end">
				<div style="position:relative; width:1160px">
					${frame({ badge: BADGE.onPattern })}
					<div class="float popup" style="top:40px; right:-10px; width:470px; border-radius:12px">
						<img src="${shot.popupModal}" width="470">
					</div>
				</div>
			</div>`,
		],
		[
			'04-scratchpad.png',
			`${head('scratch')}<div class="stage"><div class="pair">
				<div class="popup" style="width:660px"><img src="${shot.popupScratch}" width="660"></div>
				<div style="display:flex; flex-direction:column; gap:24px">
					<div class="card strip"><small>${cfg.scratchLabels[0]}</small><b>${shot.scratchTyped}</b></div>
					<div class="card strip"><small>${cfg.scratchLabels[1]}</small><b>${shot.scratchStripped}</b></div>
				</div>
			</div></div>`,
		],
	];
}

async function build(locale, cfg, port) {
	const dir = path.join(OUT, locale);
	await mkdir(dir, { recursive: true });

	const profile = await mkdtemp(path.join(tmpdir(), `shot-${locale}-`));
	const ctx = await chromium.launchPersistentContext(profile, {
		executablePath: resolveChromium(),
		headless: true,
		viewport: { width: WIDTH, height: HEIGHT },
		// Capturing at 2x makes the popup PNG twice the CSS width, which is the ceiling a poster can
		// display it at before the upscale goes soft.
		deviceScaleFactor: 2,
		args: [
			`--disable-extensions-except=${SRC}`,
			`--load-extension=${SRC}`,
			'--no-sandbox',
			`--lang=${cfg.lang}`,
			// Gives the demo page a real hostname, so the address bar and the pattern rows agree.
			`--host-resolver-rules=MAP ${cfg.host} 127.0.0.1:${port}`,
		],
	});
	const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 15000 }));
	const extensionId = new URL(worker.url()).host;
	const iconUri = dataUri(await readFile(path.join(SRC, 'icons', 'icon32.png')));

	// Seeded before the demo page loads so the row is already the one that decided the tab.
	const patterns = [
		{ pattern: cfg.host, mode: 'on' },
		{ pattern: '*.example.org', mode: 'off' },
		{ pattern: '/\\/admin\\//', mode: 'off' },
	];
	await worker.evaluate(
		(json) => chrome.storage.local.set({ patterns: json }),
		JSON.stringify(patterns),
	);

	const shot = await capture(ctx, extensionId, cfg, `http://${cfg.host}${cfg.path}`);

	const composer = await chromium.launch({
		executablePath: resolveChromium(),
		headless: true,
		args: ['--no-sandbox'],
	});
	const stage = await composer.newPage({
		viewport: { width: WIDTH, height: HEIGHT },
		deviceScaleFactor: 1,
	});

	const shots = compose(cfg, shot, iconUri);
	for (const [name, body] of shots) {
		await writeFile(path.join(dir, name), await poster(stage, body));
	}

	await composer.close();
	await ctx.close();
	return { ...shot, count: shots.length };
}

const demoServer = await serveDemo();
try {
	for (const [locale, cfg] of Object.entries(LOCALES)) {
		const result = await build(locale, cfg, demoServer.port);
		console.log(`${locale}: ${result.count} shots -> resource/store/screenshots/${locale}/`);
		console.log(`   popup measured at      : ${result.popupSize.width}x${result.popupSize.height}`);
		console.log(`   engine produced title  : ${result.typed.title}`);
		console.log(`   engine produced body   : ${result.typed.body}`);
		console.log(`   scratchpad typed       : ${result.scratchTyped}`);
		console.log(`   scratchpad stripped    : ${result.scratchStripped}`);
		console.log(`   quick per-site setting : ${result.quickPattern ?? 'NOT SHOWN'}`);
	}
} finally {
	demoServer.close();
}
