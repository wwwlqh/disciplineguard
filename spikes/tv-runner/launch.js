// Opens Chromium with a live-test build of the extension on TradingView and keeps it open.
// Test scripts attach to it on port 9333. The profile keeps the TradingView login between runs.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  if (!process.env.EXT) throw new Error('Set EXT to the live-test build, e.g. EXT=../../clients/extension/live-dist');
  const ext = path.resolve(process.env.EXT);
  const ctx = await chromium.launchPersistentContext(path.resolve(__dirname, '.profile'), {
    headless: false,
    viewport: null,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--remote-debugging-port=9333'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto('https://www.tradingview.com/chart/');
  console.log('READY');
  await new Promise(() => {});
})();
