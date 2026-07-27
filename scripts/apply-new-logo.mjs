import sharp from "sharp";
import path from "path";

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, "public", "brand", "new-logo-source.png");
const BRAND_GRADIENT_SVG = (size) => `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#052a1c"/>
        <stop offset="30%" stop-color="#0b5e39"/>
        <stop offset="56%" stop-color="#128a55"/>
        <stop offset="100%" stop-color="#1560bd"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#g)"/>
  </svg>
`;

async function main() {
  const meta = await sharp(SOURCE).metadata();
  console.log("source size", meta.width, meta.height);

  // 1. logo-mark-light.png — transparent, padded into a square canvas (matches the
  //    existing 600x600 square convention every usage site sizes against).
  const squarePad = 620;
  const fitSize = Math.round(squarePad * 0.86);
  const logoLightBuf = await sharp(SOURCE).resize(fitSize, fitSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await sharp({ create: { width: squarePad, height: squarePad, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: logoLightBuf, gravity: "center" }])
    .png()
    .toFile(path.join(ROOT, "public", "brand", "logo-mark-light.png"));
  console.log("wrote logo-mark-light.png");

  // 2. logo-mark.png — same mark, opaque white background, 512x512 (used on the print
  //    PDF header and the topbar company chip, both white/light contexts).
  const size512 = 512;
  const fit512 = Math.round(size512 * 0.8);
  const logo512Buf = await sharp(SOURCE).resize(fit512, fit512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await sharp({ create: { width: size512, height: size512, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: logo512Buf, gravity: "center" }])
    .png()
    .toFile(path.join(ROOT, "public", "brand", "logo-mark.png"));
  console.log("wrote logo-mark.png");

  // 3. PWA app icons — full-bleed brand gradient background (same treatment as before,
  //    just with the new mark).
  for (const size of [192, 512]) {
    const logoSize = Math.round(size * 0.72);
    const logoBuf = await sharp(SOURCE).resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
    await sharp(Buffer.from(BRAND_GRADIENT_SVG(size)))
      .composite([{ input: logoBuf, gravity: "center" }])
      .png()
      .toFile(path.join(ROOT, "public", "icons", `icon-${size}.png`));
    console.log(`wrote icon-${size}.png`);
  }
  const appleSize = 180;
  const appleLogoSize = Math.round(appleSize * 0.72);
  const appleLogoBuf = await sharp(SOURCE).resize(appleLogoSize, appleLogoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await sharp(Buffer.from(BRAND_GRADIENT_SVG(appleSize)))
    .composite([{ input: appleLogoBuf, gravity: "center" }])
    .png()
    .toFile(path.join(ROOT, "public", "icons", "apple-touch-icon.png"));
  console.log("wrote apple-touch-icon.png");

  // 4. Browser-tab favicon (src/app/icon.png, 256x256) — transparent, browsers render
  //    fine against the tab bar's own background.
  const favSize = 256;
  const favLogoSize = Math.round(favSize * 0.9);
  const favLogoBuf = await sharp(SOURCE).resize(favLogoSize, favLogoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await sharp({ create: { width: favSize, height: favSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: favLogoBuf, gravity: "center" }])
    .png()
    .toFile(path.join(ROOT, "src", "app", "icon.png"));
  console.log("wrote src/app/icon.png");

  // 5. Watermark source for the invoice PDF background — a large, low-opacity, single-
  //    color-ish faded version (kept as its own file so print-shell/invoice can position
  //    it precisely with CSS, rather than baking opacity into the master brand asset).
  await sharp(SOURCE)
    .resize(900, 900, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(ROOT, "public", "brand", "logo-watermark.png"));
  console.log("wrote logo-watermark.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
