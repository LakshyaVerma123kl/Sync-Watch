/**
 * resize.js — generate extension icons from a source image.
 * Usage: node resize.js [source-image.png]
 *        Defaults to extension/icons/source.png if no arg given.
 */
const Jimp = require('jimp');
const fs   = require('fs');
const path = require('path');

const sourcePath = process.argv[2] ?? path.join(__dirname, 'extension', 'icons', 'source.png');
const iconsDir   = path.join(__dirname, 'extension', 'icons');

if (!fs.existsSync(sourcePath)) {
  console.error(`\x1b[31m❌ Source image not found: ${sourcePath}\x1b[0m`);
  console.error('   Usage: node resize.js <path-to-source.png>');
  process.exit(1);
}

if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

async function resizeIcons() {
  try {
    const image = await Jimp.read(sourcePath);

    const sizes = [16, 32, 48, 128];
    for (const size of sizes) {
      const outPath = path.join(iconsDir, `icon${size}.png`);
      await image.clone().resize(size, size).writeAsync(outPath);
      console.log(`  ✓ ${size}×${size} → ${outPath}`);
    }

    // Also write a generic icon.png (128px) for the manifest fallback
    await image.clone().resize(128, 128).writeAsync(path.join(iconsDir, 'icon.png'));
    console.log('\n\x1b[32m✅ Icons generated successfully.\x1b[0m');
  } catch (error) {
    console.error('\x1b[31m❌ Error generating icons:\x1b[0m', error.message);
    process.exit(1);
  }
}

resizeIcons();