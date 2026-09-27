// Evaluates a JS file on the open TradingView tab and prints the result. Usage: node ev.js script.js [shot.png]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const page = browser.contexts()[0].pages().find((p) => p.url().includes('tradingview.com'));
  const out = await page.evaluate(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
  if (process.argv[3]) await page.screenshot({ path: process.argv[3] });
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
