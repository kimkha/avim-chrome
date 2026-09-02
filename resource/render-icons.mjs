// Rasterises resource/avim.svg into src/icons/*.png. Run with `node resource/render-icons.mjs`.
//
// No font is needed: the Đ is already an outlined path in the SVG, traced from DejaVu Sans Bold
// Oblique (Ubuntu fonts-dejavu-extra). Re-outlining it needs that TTF and fontTools; the glyph
// element records which face it came from.
//
// Two knobs per output size:
//   crop       artwork zoom. Renders at size*crop then centre-crops back to size, so the keycap
//              fills more of the square. 1.25 reproduces the framing of the icons Inkscape
//              exported as "drawing" rather than "page"; 128 was exported as page, hence 1.
//   glyphScale optical sizing of the Đ alone, independent of the keycap. Large icons can carry a
//              proportionally smaller glyph than small icons, which is the only way to keep the
//              letter legible at 16px without a fatter keycap.
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SVG = path.join(import.meta.dirname, 'avim.svg');
const OUT = path.join(import.meta.dirname, '..', 'src', 'icons');

// Optical sizing is derived, not hand-tuned. The glyph keeps its drawn size at 128px and grows as
// the icon shrinks, reaching GLYPH_SCALE_MAX at 16px where the Đ fills the keycap face.
//
// GLYPH_SCALE_MAX was measured, not guessed: rendering the keycap without the glyph at 512px and
// classifying its light inner face against its dark frame, 1.5 is the largest scale whose glyph ink
// still lands entirely on the face. 1.55 puts 60 pixels through the frame.
//
// The ramp is linear in 1/size, so each halving of the icon adds roughly the same amount of glyph.
const SIZES = [16, 24, 32, 48, 128];
const GLYPH_SCALE_MAX = 1.5;
const GLYPH_SCALE_MIN_AT = 128;
const GLYPH_SCALE_MAX_AT = 16;

// 1.25 reproduces the framing Inkscape produced when exporting the drawing rather than the page;
// 128 was exported as the page, so it stays at 1.
function cropFor(size) {
	return size === 128 ? 1 : 1.25;
}

function glyphScaleFor(size) {
	const span = 1 / GLYPH_SCALE_MAX_AT - 1 / GLYPH_SCALE_MIN_AT;
	const t = (1 / size - 1 / GLYPH_SCALE_MIN_AT) / span;
	const clamped = Math.min(Math.max(t, 0), 1);
	return Number((1 + clamped * (GLYPH_SCALE_MAX - 1)).toFixed(4));
}

function resolveChromium() {
	const override = process.env.AVIM_CHROME_PATH;
	const executablePath = override ?? chromium.executablePath();
	if (!existsSync(executablePath)) {
		throw new Error(`no chromium at ${executablePath}; run \`npx playwright install chromium\``);
	}
	return executablePath;
}

async function render(browser, { size, crop, glyphScale }) {
	const box = Math.round(size * crop);
	const page = await browser.newPage({ viewport: { width: box, height: box }, deviceScaleFactor: 1 });
	await page.goto(pathToFileURL(SVG).href, { waitUntil: 'load' });

	await page.evaluate(
		({ box, glyphScale }) => {
			const root = document.documentElement;
			root.setAttribute('width', String(box));
			root.setAttribute('height', String(box));
			if (glyphScale === 1) {
				return;
			}
			const glyph = document.getElementById('glyph');
			const { x, y, width, height } = glyph.getBBox();
			const cx = x + width / 2;
			const cy = y + height / 2;
			const scale = `translate(${cx} ${cy}) scale(${glyphScale}) translate(${-cx} ${-cy})`;
			glyph.setAttribute('transform', scale);
			// linearGradient4020 is userSpaceOnUse, so it lives in the glyph's user space: without
			// the same transform premultiplied onto it the fill collapses to a flat colour.
			const gradient = document.getElementById('linearGradient4020');
			const existing = gradient.getAttribute('gradientTransform') ?? '';
			gradient.setAttribute('gradientTransform', `${scale} ${existing}`.trim());
		},
		{ box, glyphScale },
	);

	const offset = (box - size) / 2;
	const png = await page.screenshot({
		omitBackground: true,
		type: 'png',
		clip: { x: offset, y: offset, width: size, height: size },
	});
	await writeFile(path.join(OUT, `icon${size}.png`), png);
	await page.close();
	return `icon${size}.png ${size}x${size} (rendered ${box}px, crop ${crop}, glyph ${glyphScale})`;
}

const browser = await chromium.launch({
	executablePath: resolveChromium(),
	headless: true,
	args: ['--no-sandbox'],
});
for (const size of SIZES) {
	console.log(await render(browser, { size, crop: cropFor(size), glyphScale: glyphScaleFor(size) }));
}
await browser.close();
