// Records the TradingView demo clip on the signed-in Paper Trading chart (never a real broker).
// Needs the live-test extension build (see live.js) and a DisciplineGuard account over its trade limit.
// Usage: EXT=../../clients/extension/live-dist OUT=<dir> node record.js
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const ext = path.resolve(process.env.EXT);
  const ctx = await chromium.launchPersistentContext(path.resolve(__dirname, '.profile'), {
    headless: false,
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: process.env.OUT, size: { width: 1280, height: 720 } },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  const chart = ctx.pages()[0] || (await ctx.newPage());
  await chart.goto('https://www.tradingview.com/chart/');
  await chart.waitForTimeout(9000);
  // Hide the account name and TradingView's promo banner in the clip.
  await chart.addStyleTag({ content: '[data-qa-id="account-selector"] { filter: blur(6px); } [class*="toast"], [class*="banner"] { display: none !important; }' });
  // A visible cursor: recordings don't draw the mouse.
  await chart.evaluate(() => {
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(15,118,110,.35);border:2px solid #0f766e;pointer-events:none;left:-40px;top:-40px;transition:transform .1s';
    document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => (c.style.transform = 'scale(.6)'), true);
    addEventListener('mouseup', () => (c.style.transform = ''), true);
  });
  const connect = chart.locator('button:has-text("Connect")');
  if (await connect.count()) { await connect.first().click(); await chart.waitForTimeout(3000); }
  if (!(await chart.locator('[data-name="order-panel"]').count())) {
    await chart.mouse.move(500, 300);
    await chart.keyboard.press('Shift+T');
    await chart.waitForTimeout(2000);
  }
  await chart.locator('[data-name="side-control-buy"]').click();
  await chart.mouse.move(300, 200);
  await chart.waitForTimeout(3000);
  const box = await chart.locator('[data-name="place-and-modify-button"]').boundingBox();
  await chart.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
  await chart.waitForTimeout(600);
  await chart.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await chart.waitForTimeout(6500);
  const skip = await chart.locator('dg-pause button.skip').boundingBox();
  await chart.mouse.move(skip.x + skip.width / 2, skip.y + skip.height / 2, { steps: 25 });
  await chart.waitForTimeout(500);
  await chart.mouse.click(skip.x + skip.width / 2, skip.y + skip.height / 2);
  await chart.waitForTimeout(2500);
  const video = chart.video();
  await ctx.close();
  console.log('video', await video.path());
})().catch((e) => { console.error(e.message); process.exit(1); });
