// Attaches to the running browser, reports page state and saves a screenshot.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('tradingview.com')) || ctx.pages()[0];
  const out = process.argv[2] || 'shot.png';
  const info = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    signInVisible: !!Array.from(document.querySelectorAll('button, a')).find(b => /^\s*sign in\s*$/i.test(b.innerText || '')),
    theme: document.documentElement.className,
  }));
  const exts = ctx.serviceWorkers().map(w => w.url()).concat(ctx.backgroundPages().map(p => p.url()));
  console.log(JSON.stringify({ ...info, extensionWorkers: exts }, null, 1));
  await page.screenshot({ path: out });
  await browser.close().catch(() => {});
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
