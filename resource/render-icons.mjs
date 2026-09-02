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

// Optical sizing is derived, not hand-tuned. At 128px the glyph is left exactly as drawn. As the
// icon shrinks it both grows and slides onto the centre of the key's face, reaching GLYPH_SCALE_MAX
// fully centred at 16px, where the Đ fills the key.
//
// Re-centring is the part that matters: as drawn, the glyph sits 30.6 units left and 34.4 units
// above the centre of the face (in the 256 viewBox) and covers only 38% x 35% of it. Scaling about
// its own centre therefore drives it into the top-left frame while it is still small — that is why
// an earlier attempt measured a ceiling of 1.5 and left the 16px glyph looking undersized.
//
// GLYPH_SCALE_MAX was measured: rendering the key with the glyph hidden at 512px separates its light
// face from its dark frame, and with re-centring 2.55 is the largest scale keeping half a pixel of
// clearance at 16px. It touches the frame at 2.8.
const SIZES = [16, 24, 32, 48, 128];
const GLYPH_SCALE_MAX = 2.55;
const GLYPH_SCALE_MIN_AT = 128;
const GLYPH_SCALE_MAX_AT = 16;

// Bounding box of the key's top face in viewBox units, taken from the path196/path221 pair.
const FACE = { x: 52.4, y: 32.0, width: 151.1, height: 149.1 };

// 1.25 reproduces the framing Inkscape produced when exporting the drawing rather than the page;
// 128 was exported as the page, so it stays at 1.
function cropFor(size) {
	return size === 128 ? 1 : 1.25;
}

// 0 at 128px, 1 at 16px, linear in 1/size so each halving of the icon adds about the same amount.
function rampFor(size) {
	const span = 1 / GLYPH_SCALE_MAX_AT - 1 / GLYPH_SCALE_MIN_AT;
	const t = (1 / size - 1 / GLYPH_SCALE_MIN_AT) / span;
	return Math.min(Math.max(t, 0), 1);
}

function resolveChromium() {
	const override = process.env.AVIM_CHROME_PATH;
	const executablePath = override ?? chromium.executablePath();
	if (!existsSync(executablePath)) {
		throw new Error(`no chromium at ${executablePath}; run \`npx playwright install chromium\``);
	}
	return executablePath;
}

async function render(browser, { size, crop, ramp }) {
	const box = Math.round(size * crop);
	const page = await browser.newPage({ viewport: { width: box, height: box }, deviceScaleFactor: 1 });
	await page.goto(pathToFileURL(SVG).href, { waitUntil: 'load' });

	const scale = 1 + ramp * (GLYPH_SCALE_MAX - 1);
	await page.evaluate(
		({ box, scale, ramp, FACE }) => {
			const root = document.documentElement;
			root.setAttribute('width', String(box));
			root.setAttribute('height', String(box));
			if (ramp === 0) {
				return;
			}
			const glyph = document.getElementById('glyph');
			const bbox = glyph.getBBox();
			const cx = bbox.x + bbox.width / 2;
			const cy = bbox.y + bbox.height / 2;
			const shiftX = (FACE.x + FACE.width / 2 - cx) * ramp;
			const shiftY = (FACE.y + FACE.height / 2 - cy) * ramp;
			const transform =
				`translate(${shiftX} ${shiftY}) translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`;
			glyph.setAttribute('transform', transform);
			// linearGradient4020 is userSpaceOnUse, so it lives in the glyph's user space: without
			// the same transform premultiplied onto it the fill collapses to a flat colour.
			const gradient = document.getElementById('linearGradient4020');
			const existing = gradient.getAttribute('gradientTransform') ?? '';
			gradient.setAttribute('gradientTransform', `${transform} ${existing}`.trim());
		},
		{ box, scale, ramp, FACE },
	);

	const offset = (box - size) / 2;
	const png = await page.screenshot({
		omitBackground: true,
		type: 'png',
		clip: { x: offset, y: offset, width: size, height: size },
	});
	await writeFile(path.join(OUT, `icon${size}.png`), png);
	await page.close();
	return `icon${size}.png ${size}x${size} (rendered ${box}px, crop ${crop}, glyph x${scale.toFixed(3)}, centred ${(ramp * 100).toFixed(0)}%)`;
}

const browser = await chromium.launch({
	executablePath: resolveChromium(),
	headless: true,
	args: ['--no-sandbox'],
});
for (const size of SIZES) {
	console.log(await render(browser, { size, crop: cropFor(size), ramp: rampFor(size) }));
}
await browser.close();
