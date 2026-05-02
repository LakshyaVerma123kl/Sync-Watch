const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

const sourcePath = 'C:\\Users\\Lakshya\\.gemini\\antigravity\\brain\\3ec71937-7e48-4653-8e2f-4d3774f25946\\syncwatch_logo_1777706511738.png';
const iconsDir = path.join(__dirname, 'extension', 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir);
}

async function resizeIcons() {
  try {
    const image = await Jimp.read(sourcePath);
    await image.clone().resize(16, 16).writeAsync(path.join(iconsDir, 'icon16.png'));
    await image.clone().resize(48, 48).writeAsync(path.join(iconsDir, 'icon48.png'));
    await image.clone().resize(128, 128).writeAsync(path.join(iconsDir, 'icon128.png'));
    console.log('Icons generated successfully.');
  } catch (error) {
    console.error('Error generating icons:', error);
  }
}

resizeIcons();
