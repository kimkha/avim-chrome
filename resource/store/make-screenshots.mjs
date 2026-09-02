// Builds Chrome Web Store screenshots at the required 1280x800, one set per locale.
// Run with `node resource/store/make-screenshots.mjs`.
//
// The extension is loaded into real Chromium and driven with real keystrokes, so the Vietnamese in
// every shot is produced by the engine rather than typed into a mockup.
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

// Chrome resolves _locales from --lang, so the popup screenshots come out genuinely localised.
const LOCALES = {
	en: {
		lang: 'en-US',
		url: 'notes.example.com/new',
		title: 'Weekend plan',
		body: 'Hẹn gặp lúc bảy giờ ở quán cà phê cũ. Nhớ mang theo cuốn sổ màu xanh.',
		captions: {
			hero: ['Type Vietnamese on any website', 'No system-wide input method, no keyboard layout to switch'],
			methods: ['Telex, VNI or VIQR', 'Pick one in the popup — the choice is kept for every tab'],
			typing: ['Just type the way you already do', 'Tone marks appear as you go, in any text field'],
			scratch: ['A quick scratchpad in the popup', 'Type a line, copy it, or remove the accents'],
		},
		annotate: { from: 'chaof', to: 'chào', label: 'you type (Telex)' },
		scratch: { before: 'Đường vô xứ Nghệ quanh quanh', after: 'Duong vo xu Nghe quanh quanh' },
		scratchLabels: ['typed', 'after removing accents'],
	},
	vi: {
		lang: 'vi',
		url: 'ghichu.example.com/moi',
		title: 'Kế hoạch cuối tuần',
		body: 'Hẹn gặp lúc bảy giờ ở quán cà phê cũ. Nhớ mang theo cuốn sổ màu xanh.',
		captions: {
			hero: ['Gõ tiếng Việt trên mọi trang web', 'Không cần bộ gõ hệ thống, không cần đổi bố cục bàn phím'],
			methods: ['Telex, VNI hay VIQR', 'Chọn trong popup — được ghi nhớ cho mọi tab'],
			typing: ['Cứ gõ như bạn vẫn gõ', 'Dấu hiện ra ngay khi gõ, trong mọi khung nhập liệu'],
			scratch: ['Ô gõ nhanh ngay trong popup', 'Gõ một dòng, sao chép hoặc bỏ dấu'],
		},
		annotate: { from: 'chaof', to: 'chào', label: 'bạn gõ (Telex)' },
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
	return { origin: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}

function assertTyped(where, actual, expected) {
	if (actual !== expected) {
		throw new Error(`${where}: engine produced ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
	}
}

// popup.html loads avim-ext.js as a page script, and its AVIMAJAXFix rescans for iframes 100 times
// at 100ms intervals. Until that finishes the page never holds a stable frame, and screenshots time
// out at random. ajaxCounter is a top-level binding in the same world, so the end is observable
// rather than guessed at.
async function waitForRescan(page) {
	await page.waitForFunction(() => typeof ajaxCounter === 'number' && ajaxCounter >= 100, {
		timeout: 25000,
	});
}

// The demo page runs the same loop in an isolated world, where ajaxCounter cannot be read, so the
// screenshot is simply retried.
async function stableShot(page, options = {}) {
	let lastError;
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			return await page.screenshot({ type: 'png', timeout: 8000, ...options });
		} catch (error) {
			lastError = error;
			await page.waitForTimeout(2500);
		}
	}
	throw lastError;
}

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
	.chrome { height: 40px; background: #e8eaf2; display: flex; align-items: center; padding: 0 14px; gap: 7px; }
	.chrome i { width: 11px; height: 11px; border-radius: 50%; background: #c3c7d6; }
	.pill {
		flex: 1; margin: 0 14px; height: 24px; border-radius: 14px; background: #fff;
		color: #6b7080; font-size: 12px; display: flex; align-items: center; padding: 0 12px;
	}
	.tool { display: flex; align-items: center; gap: 5px; }
	.tool img { width: 22px; height: 22px; display: block; }
	.badge { background: #14a44a; color: #fff; font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 3px; }
	.popup {
		background: #fff; border-radius: 10px; overflow: hidden;
		box-shadow: 0 24px 60px rgba(15, 10, 50, .5); transform-origin: top right;
	}
	.popup img { display: block; }
	.float { position: absolute; }
	.callout {
		position: absolute; display: flex; align-items: center; gap: 14px;
		background: #14122e; border-radius: 12px; padding: 14px 22px;
		box-shadow: 0 16px 40px rgba(10, 6, 40, .5); font-size: 26px; font-weight: 700;
	}
	.callout .k { font-family: "DejaVu Sans Mono", ui-monospace, monospace; color: #b9b2ff; }
	.callout .arrow { opacity: .5; font-weight: 400; }
	.callout .v { color: #7ef0a8; }
	.callout small { display: block; font-size: 11px; font-weight: 600; opacity: .55; text-transform: uppercase; letter-spacing: .8px; }
	.pair { display: flex; gap: 26px; align-items: stretch; }
	.strip { background: #14122e; border-radius: 12px; padding: 18px 22px; box-shadow: 0 16px 40px rgba(10, 6, 40, .45); }
	.strip small { display: block; font-size: 11px; font-weight: 700; opacity: .55; text-transform: uppercase; letter-spacing: .8px; margin-bottom: 8px; }
	.strip b { font-size: 21px; font-weight: 600; }
`;

async function poster(page, body) {
	await page.setContent(
		`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${POSTER_CSS}</style></head><body>${body}</body></html>`,
	);
	await page.waitForLoadState('load');
	await page.waitForTimeout(250);
	return stableShot(page, { animations: 'disabled' });
}

function windowFrame({ pageShot, iconUri, url, width = PAGE_W, height = PAGE_H, inner = '' }) {
	return `<div class="window" style="width:${width}px">
		<div class="chrome"><i></i><i></i><i></i>
			<div class="pill">${url}</div>
			<div class="tool"><img src="${iconUri}"><span class="badge">on</span></div>
		</div>
		<img src="${pageShot}" width="${width}" height="${height}">
		${inner}
	</div>`;
}

async function build(locale, cfg, origin) {
	const dir = path.join(OUT, locale);
	await mkdir(dir, { recursive: true });

	const profile = await mkdtemp(path.join(tmpdir(), `shot-${locale}-`));
	const ctx = await chromium.launchPersistentContext(profile, {
		executablePath: resolveChromium(),
		headless: true,
		viewport: { width: WIDTH, height: HEIGHT },
		// The posters scale the popup up, so capture it at 2x or the upscale looks soft next to
		// the CSS-rendered headlines.
		deviceScaleFactor: 2,
		args: [
			`--disable-extensions-except=${SRC}`,
			`--load-extension=${SRC}`,
			'--no-sandbox',
			`--lang=${cfg.lang}`,
		],
	});
	const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 15000 }));
	const extensionId = new URL(worker.url()).host;
	const iconUri = dataUri(await readFile(path.join(SRC, 'icons', 'icon32.png')));

	const demo = await ctx.newPage();
	await demo.setViewportSize({ width: PAGE_W, height: PAGE_H });
	await demo.goto(origin);
	await demo.waitForTimeout(500);
	for (const [selector, text] of [['#title', cfg.title], ['#body', cfg.body]]) {
		await demo.click(selector);
		await demo.keyboard.type(TELEX[text] ?? text, { delay: 12 });
	}
	await demo.waitForTimeout(250);
	const typed = { title: await demo.inputValue('#title'), body: await demo.inputValue('#body') };
	assertTyped(`${locale} #title`, typed.title, cfg.title);
	assertTyped(`${locale} #body`, typed.body, cfg.body);
	const pageShot = dataUri(await stableShot(demo));

	const popup = await ctx.newPage();
	await popup.setViewportSize({ width: 330, height: 470 });
	await popup.goto(`chrome-extension://${extensionId}/popup.html`);
	await waitForRescan(popup);
	await popup.click('#telex');
	const popupShot = dataUri(await stableShot(popup));

	await popup.click('#inputDemo');
	await popup.keyboard.type(TELEX[cfg.scratch.before], { delay: 14 });
	await popup.waitForTimeout(250);
	const scratchTyped = await popup.inputValue('#inputDemo');
	assertTyped(`${locale} scratchpad`, scratchTyped, cfg.scratch.before);
	const popupScratch = dataUri(await stableShot(popup));
	await popup.click('#removeAccent');
	await popup.waitForTimeout(250);
	const scratchStripped = await popup.inputValue('#inputDemo');
	assertTyped(`${locale} remove-accent`, scratchStripped, cfg.scratch.after);

	const composer = await chromium.launch({
		executablePath: resolveChromium(),
		headless: true,
		args: ['--no-sandbox'],
	});
	const stage = await composer.newPage({
		viewport: { width: WIDTH, height: HEIGHT },
		deviceScaleFactor: 1,
	});

	const head = (key) => `<h1>${cfg.captions[key][0]}</h1><h2>${cfg.captions[key][1]}</h2>`;
	const shots = [
		[
			'01-hero.png',
			`${head('hero')}<div class="stage">
				<div style="position:relative">
					${windowFrame({ pageShot, iconUri, url: cfg.url, height: 470 })}
					<div class="float popup" style="top:52px; right:14px; width:264px">
						<img src="${popupShot}" width="264">
					</div>
				</div>
			</div>`,
		],
		[
			'02-methods.png',
			`${head('methods')}<div class="stage">
				<div class="popup" style="width:396px"><img src="${popupShot}" width="396"></div>
			</div>`,
		],
		[
			'03-typing.png',
			`${head('typing')}<div class="stage">
				<div style="position:relative">
					${windowFrame({ pageShot, iconUri, url: cfg.url, height: 440 })}
					<div class="callout" style="bottom:-26px; left:50%; transform:translateX(-50%)">
						<div><small>${cfg.annotate.label}</small><span class="k">${cfg.annotate.from}</span></div>
						<span class="arrow">&rarr;</span>
						<div><small>&nbsp;</small><span class="v">${cfg.annotate.to}</span></div>
					</div>
				</div>
			</div>`,
		],
		[
			'04-scratchpad.png',
			`${head('scratch')}<div class="stage"><div class="pair">
				<div class="popup" style="width:300px"><img src="${popupScratch}" width="300"></div>
				<div style="display:flex; flex-direction:column; justify-content:center; gap:18px">
					<div class="strip"><small>${cfg.scratchLabels[0]}</small><b>${scratchTyped}</b></div>
					<div class="strip"><small>${cfg.scratchLabels[1]}</small><b>${scratchStripped}</b></div>
				</div>
			</div></div>`,
		],
	];

	for (const [name, body] of shots) {
		await writeFile(path.join(dir, name), await poster(stage, body));
	}

	await composer.close();
	await ctx.close();
	return { typed, scratchTyped, scratchStripped, count: shots.length };
}

const demoServer = await serveDemo();
try {
	for (const [locale, cfg] of Object.entries(LOCALES)) {
		const result = await build(locale, cfg, demoServer.origin);
		console.log(`${locale}: ${result.count} shots -> resource/store/screenshots/${locale}/`);
		console.log(`   engine produced title  : ${result.typed.title}`);
		console.log(`   engine produced body   : ${result.typed.body}`);
		console.log(`   scratchpad typed       : ${result.scratchTyped}`);
		console.log(`   scratchpad stripped    : ${result.scratchStripped}`);
	}
} finally {
	demoServer.close();
}
