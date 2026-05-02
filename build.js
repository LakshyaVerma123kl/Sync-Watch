#!/usr/bin/env node
/**
 * SyncWatch build script
 * Usage: node build.js wss://your-render-url.onrender.com
 */

const fs      = require('fs');
const path    = require('path');

const productionUrl = process.argv[2];

if (!productionUrl || !productionUrl.startsWith('wss://')) {
  console.error('\x1b[31m❌ Build Failed: Provide a valid wss:// URL.\x1b[0m');
  console.error('   Usage: node build.js wss://your-app.onrender.com\n');
  process.exit(1);
}

let archiver;
try {
  archiver = require('archiver');
} catch {
  console.error('\x1b[31m❌ Missing dependency: run `npm install` first.\x1b[0m');
  process.exit(1);
}

const SRC_DIR   = path.join(__dirname, 'extension');
const TEMP_DIR  = path.join(__dirname, 'temp_build');
const OUT_ZIP   = path.join(__dirname, 'syncwatch-release.zip');

console.log('\x1b[34m[1/3] Preparing build directory…\x1b[0m');
if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true, force: true });
fs.cpSync(SRC_DIR, TEMP_DIR, { recursive: true });

console.log(`\x1b[34m[2/3] Injecting production URL: ${productionUrl}\x1b[0m`);
const bgPath = path.join(TEMP_DIR, 'background', 'background.js');
let bg = fs.readFileSync(bgPath, 'utf8');

// Replace any ws:// or wss:// localhost reference
bg = bg.replace(
  /const SERVER_URL\s*=\s*['"`]wss?:\/\/localhost[^'"`]*['"`]/,
  `const SERVER_URL = '${productionUrl}'`
);
fs.writeFileSync(bgPath, bg);

console.log('\x1b[34m[3/3] Zipping for Chrome Web Store…\x1b[0m');
const output  = fs.createWriteStream(OUT_ZIP);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const kb = (archive.pointer() / 1024).toFixed(1);
  console.log(`\n\x1b[32m✅ Build complete! ${OUT_ZIP} (${kb} KB)\x1b[0m`);
  console.log('\x1b[32m   Upload syncwatch-release.zip to the Chrome Web Store.\x1b[0m\n');
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
});

archive.on('error', (err) => { throw err; });
archive.pipe(output);
archive.directory(TEMP_DIR, false);
archive.finalize();