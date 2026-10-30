// Builds the logo files the site uses from the original artwork (a logo on a white background):
//   public/brand/logo-full.png        emblem and wordmark, transparent background
//   public/brand/logo-emblem.png      just the round emblem, square, transparent
//   public/brand/favicon-32.png, favicon-64.png, apple-touch-icon.png
// Usage: node scripts/make-logo.js
const sharp = require('sharp');
const path = require('path');

const dir = path.join(__dirname, '..', 'public', 'brand');
const SRC = path.join(dir, 'cashpilot-logo-original.webp');

async function main() {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const px = Buffer.from(data);

  // Turn the white backdrop into transparency. The darkest channel says how far a pixel is from white; edge pixels
  // are partly white, so their colour is un-mixed from white to avoid a pale halo on dark backgrounds.
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const r = px[o], g = px[o + 1], b = px[o + 2];
    let a = Math.min(1, Math.max(0, (255 - Math.min(r, g, b) - 6) / 54));
    if (a < 0.12) a = 0;
    alpha[i] = a;
    if (a === 0) { px[o] = px[o + 1] = px[o + 2] = 0; px[o + 3] = 0; continue; }
    if (a < 1) {
      for (let k = 0; k < 3; k++) px[o + k] = Math.max(0, Math.min(255, Math.round((px[o + k] - 255 * (1 - a)) / a)));
    }
    px[o + 3] = Math.round(a * 255);
  }

  // Find the content rows, then split the emblem (top block) from the wordmark below it.
  const rowHas = new Array(height).fill(false);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (alpha[y * width + x] > 0.3) { rowHas[y] = true; break; }
  const blocks = [];
  let start = -1, gap = 0;
  for (let y = 0; y < height; y++) {
    if (rowHas[y]) { if (start < 0) start = y; gap = 0; }
    else if (start >= 0 && ++gap > 5) { blocks.push([start, y - gap]); start = -1; gap = 0; }
  }
  if (start >= 0) blocks.push([start, height - 1]);
  if (!blocks.length) throw new Error('no logo found');

  const colsOf = (y0, y1) => {
    let min = width, max = -1;
    for (let y = y0; y <= y1; y++) for (let x = 0; x < width; x++) if (alpha[y * width + x] > 0.3) { if (x < min) min = x; if (x > max) max = x; }
    return [min, max];
  };
  const [ey0, ey1] = blocks[0];
  const [ex0, ex1] = colsOf(ey0, ey1);
  const [fy0, fy1] = [blocks[0][0], blocks[blocks.length - 1][1]];
  const [fx0, fx1] = colsOf(fy0, fy1);
  console.log('blocks', blocks, 'emblem', { ex0, ex1, ey0, ey1 }, 'full', { fx0, fx1, fy0, fy1 });

  const full = sharp(px, { raw: { width, height, channels: 4 } });
  const pad = 14;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  await full.clone().extract({
    left: clamp(fx0 - pad, 0, width - 1), top: clamp(fy0 - pad, 0, height - 1),
    width: clamp(fx1 - fx0 + 1 + pad * 2, 1, width), height: clamp(fy1 - fy0 + 1 + pad * 2, 1, height),
  }).png().toFile(path.join(dir, 'logo-full.png'));

  // Square emblem: centre it on a transparent canvas.
  const ew = ex1 - ex0 + 1, eh = ey1 - ey0 + 1, side = Math.max(ew, eh) + pad * 2;
  const emblemBuf = await full.clone().extract({ left: ex0, top: ey0, width: ew, height: eh }).png().toBuffer();
  const emblem = await sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: emblemBuf, left: Math.round((side - ew) / 2), top: Math.round((side - eh) / 2) }]).png().toBuffer();

  await sharp(emblem).resize(512, 512).png().toFile(path.join(dir, 'logo-emblem.png'));
  await sharp(emblem).resize(64, 64).png().toFile(path.join(dir, 'favicon-64.png'));
  await sharp(emblem).resize(32, 32).png().toFile(path.join(dir, 'favicon-32.png'));
  // iPhone home-screen icons do not support transparency, so this one sits on white.
  await sharp({ create: { width: 180, height: 180, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: await sharp(emblem).resize(148, 148).png().toBuffer(), left: 16, top: 16 }]).png().toFile(path.join(dir, 'apple-touch-icon.png'));
  console.log('logo files written to', dir);
}

main().catch((e) => { console.error(e); process.exit(1); });
