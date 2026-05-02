const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Get the production URL from command line args
const productionUrl = process.argv[2];

if (!productionUrl || !productionUrl.startsWith('wss://')) {
  console.error('\x1b[31m%s\x1b[0m', '❌ Build Failed: You must provide your Render WebSocket URL.');
  console.error('Usage: node build.js wss://your-app-name.onrender.com\n');
  process.exit(1);
}

const EXTENSION_DIR = path.join(__dirname, 'extension');
const TEMP_DIR = path.join(__dirname, 'temp_build');
const OUTPUT_ZIP = path.join(__dirname, 'syncwatch-release.zip');

console.log(`\x1b[34m[1/3] Preparing build directory...\x1b[0m`);

// Create a temporary copy to modify the URL without destroying the local dev version
if (fs.existsSync(TEMP_DIR)) {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}
fs.cpSync(EXTENSION_DIR, TEMP_DIR, { recursive: true });

console.log(`\x1b[34m[2/3] Injecting Production URL (${productionUrl})...\x1b[0m`);
const bgScriptPath = path.join(TEMP_DIR, 'background', 'background.js');
let bgScript = fs.readFileSync(bgScriptPath, 'utf8');

// Replace localhost with the production URL
bgScript = bgScript.replace(
  /const SERVER_URL = 'ws:\/\/localhost:3000';/g, 
  `const SERVER_URL = '${productionUrl}';`
);
fs.writeFileSync(bgScriptPath, bgScript);

console.log(`\x1b[34m[3/3] Zipping package for Chrome Web Store...\x1b[0m`);
const output = fs.createWriteStream(OUTPUT_ZIP);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`\n\x1b[32m✅ Build Complete!\x1b[0m`);
  console.log(`\x1b[32mCreated: ${OUTPUT_ZIP} (${(archive.pointer() / 1024).toFixed(2)} KB)\x1b[0m`);
  console.log(`Ready to upload to the Chrome Web Store.`);
  
  // Clean up
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
});

archive.on('error', (err) => { throw err; });
archive.pipe(output);
archive.directory(TEMP_DIR, false);
archive.finalize();
