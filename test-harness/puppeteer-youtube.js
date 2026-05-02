const puppeteer = require('puppeteer');
const path = require('path');

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  const extensionPath = path.resolve(__dirname, '../extension');

  const browserArgs = [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    '--no-sandbox',
    '--disable-setuid-sandbox'
  ];

  console.log('Launching browser A...');
  const browserA = await puppeteer.launch({ headless: false, args: browserArgs });
  console.log('Launching browser B...');
  const browserB = await puppeteer.launch({ headless: false, args: browserArgs });

  try {
    const pageA = await browserA.newPage();
    const pageB = await browserB.newPage();

    const ytUrl = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
    
    console.log('Navigating both pages to YouTube...');
    await Promise.all([
      pageA.goto(ytUrl, { waitUntil: 'networkidle2' }),
      pageB.goto(ytUrl, { waitUntil: 'networkidle2' })
    ]);

    // Wait for extension to inject
    await delay(3000);

    console.log('Opening sidebars...');
    await pageA.evaluate(() => { document.querySelector('#syncwatch-overlay').classList.remove('minimized'); });
    await pageB.evaluate(() => { document.querySelector('#syncwatch-overlay').classList.remove('minimized'); });

    console.log('Creating room on Page A...');
    await pageA.evaluate(() => { document.querySelector('#sw-create-btn').click(); });
    await delay(1000);

    const roomId = await pageA.evaluate(() => document.querySelector('#sw-room-display').value);
    console.log(`Room created: ${roomId}`);

    console.log('Joining room on Page B...');
    await pageB.evaluate((rId) => {
      document.querySelector('#sw-room-input').value = rId;
      document.querySelector('#sw-join-btn').click();
    }, roomId);
    await delay(1000);

    console.log('Sending test message from A...');
    await pageA.evaluate(() => {
      const input = document.querySelector('#sw-chat-input');
      input.value = 'YouTube Test!';
      input.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter' }));
    });
    await delay(1000);

    const msgB = await pageB.evaluate(() => {
      const msgs = document.querySelectorAll('.sw-message');
      return msgs.length > 0 ? msgs[msgs.length - 1].innerText : null;
    });
    console.log(`Page B received chat: ${msgB.replace(/\\n/g, ' ')}`);

    console.log('Testing video sync (A playing)...');
    await pageA.evaluate(() => { document.querySelector('.html5-main-video').play(); });
    await delay(3000);

    const isPlayingB = await pageB.evaluate(() => { return !document.querySelector('.html5-main-video').paused; });
    console.log(`Page B video is playing: ${isPlayingB}`);

    console.log('Testing host lock (Claim host on A, pause on B)...');
    await pageA.evaluate(() => { document.querySelector('#sw-claim-host-btn').click(); });
    await delay(1000);
    
    await pageB.evaluate(() => { document.querySelector('.html5-main-video').pause(); });
    await delay(1000);

    const isPlayingBAfterPause = await pageB.evaluate(() => { return !document.querySelector('.html5-main-video').paused; });
    console.log(`Page B video is still playing (resisted pause): ${isPlayingBAfterPause}`);

    console.log('Test completed successfully.');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browserA.close();
    await browserB.close();
  }
})();
