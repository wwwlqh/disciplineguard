// Runs a list of steps against the open TradingView tab, then saves a screenshot.
// Usage: node act.js steps.json shot.png
// Step forms: {"click": "css or text=..."}, {"clickXY": [x, y]}, {"press": "Enter"}, {"type": "text"},
//             {"wait": ms}, {"eval": "js expression"}, {"dump": "css"} (prints data-name/text of matches)
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const steps = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('tradingview.com')) || ctx.pages()[0];
  for (const s of steps) {
    try {
      if (s.click) await page.locator(s.click).first().click({ timeout: 5000 });
      else if (s.clickXY) await page.mouse.click(s.clickXY[0], s.clickXY[1]);
      else if (s.press) await page.keyboard.press(s.press);
      else if (s.type) await page.keyboard.type(s.type, { delay: 30 });
      else if (s.wait) await page.waitForTimeout(s.wait);
      else if (s.eval) console.log(JSON.stringify(await page.evaluate(s.eval), null, 1));
      else if (s.dump) {
        const rows = await page.$$eval(s.dump, els => els.slice(0, 80).map(e => {
          const r = e.getBoundingClientRect();
          return `${e.tagName.toLowerCase()} dn=${e.getAttribute('data-name') || ''} aria=${e.getAttribute('aria-label') || ''} ` +
                 `@${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} ` +
                 `"${(e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 50)}"`;
        }));
        console.log(rows.join('\n'));
      }
      console.log('ok', JSON.stringify(s));
    } catch (e) {
      console.log('FAIL', JSON.stringify(s), e.message.split('\n')[0]);
    }
  }
  if (process.argv[3]) await page.screenshot({ path: process.argv[3] });
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
