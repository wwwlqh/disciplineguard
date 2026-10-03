// Records the TradingView demo clip on the signed-in Paper Trading chart (never a real broker).
// Needs server/dev.ts on :8791 (PORT=8791 DG_DB=:memory:) and the extension built against it into live-dist
// (DG_API=http://localhost:8791 DG_PUBKEY=<dev SIGNING_PUB> DG_TEST=1 DG_OUT=live-dist node build.ts).
// It makes a DisciplineGuard account capped at 1 trade a day, places trade 1, then records trade 2: the pause, Skip.
// Usage: EXT=../../clients/extension/live-dist OUT=<dir> node record.js   → prints the clip's start and end in the video.
const { chromium } = require('playwright');
const path = require('path');

const API = 'http://localhost:8791';
async function call(method, p, body, cookie) {
  const r = await fetch(API + p, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie, 'x-dg': '1' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(f, what, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await f().catch(() => undefined);
    if (v) return v;
    await sleep(300);
  }
  throw new Error('timed out: ' + what);
}

(async () => {
  const ext = path.resolve(process.env.EXT);
  const t0 = Date.now();
  const ctx = await chromium.launchPersistentContext(path.resolve(__dirname, '.profile'), {
    headless: false,
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: process.env.OUT, size: { width: 1280, height: 720 } },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  const chart = ctx.pages()[0] || (await ctx.newPage());
  await chart.goto('https://www.tradingview.com/chart/');
  await chart.waitForTimeout(9000);
  if (!(await chart.locator('[data-qa-id="account-selector"], button:has-text("Connect"), #footer-chart-panel button:has-text("Paper Trading")').count()))
    throw new Error('TradingView is not signed in on this profile');

  // A DisciplineGuard account: at most 1 trade a day, a 5-second wait.
  const email = `clip${Date.now()}@test.dev`;
  await call('POST', '/v1/auth/email', { email });
  const mail = (await call('GET', '/dev/outbox')).data.find((m) => m.to_email === email);
  const cookie = (await call('POST', '/v1/auth/verify', { email, code: /code is (\d{6})/.exec(mail.body)[1] })).cookie;
  const popup = { show: 'breaks', wait: 5, lossWait: { on: false, seconds: 15, withinMinutes: 30 }, growing: { on: false, step: 5, cap: 45 }, typeConfirm: { mode: 'off', n: 3 }, skipCard: true, keyboardPlace: false };
  await call('POST', '/api/onboarding/apply', { tz: 'UTC', reset: { preset: 'midnight' }, rules: { R1: { on: true, max: 1 } }, popup }, cookie);

  // Sign the extension in (Allow + PKCE).
  const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker'));
  const extId = new URL(sw.url()).host;
  const pop = await ctx.newPage();
  await pop.goto(`chrome-extension://${extId}/popup.html`);
  const allowTab = ctx.waitForEvent('page', (p) => p.url().includes('/allow?'));
  await pop.evaluate(() => chrome.runtime.sendMessage({ type: 'sign_in' }));
  const allow = await allowTab;
  const q = new URL(allow.url()).searchParams;
  const granted = await call('POST', '/api/desktop/allow', { challenge: q.get('challenge'), name: q.get('name') }, cookie);
  await allow.evaluate(([id, c]) => chrome.runtime.sendMessage(id, { type: 'dg_code', code: c }), [extId, granted.data.code]);
  await allow.close();
  await chart.bringToFront();
  const cache = () => pop.evaluate(() => chrome.storage.local.get('dg_cache').then((v) => v.dg_cache));

  // Paper Trading connected and the order panel open.
  const connect = chart.locator('button:has-text("Connect")');
  if (await connect.count()) { await connect.first().click(); await chart.waitForTimeout(3000); }
  if (!(await chart.locator('[data-qa-id="account-selector"]').count())) {
    await chart.locator('#footer-chart-panel button:has-text("Paper Trading")').first().click();
    await chart.waitForTimeout(2000);
  }
  await until(async () => (await cache())?.status === 'on' && Object.keys((await cache()).accounts ?? {}).length > 0, 'extension On', 120000);
  const openPanel = async () => {
    await chart.keyboard.press('Escape');
    await chart.mouse.move(500, 300);
    await chart.keyboard.press('Shift+T');
    await chart.waitForTimeout(2000);
  };
  const click = async (sel) => {
    const b = await chart.locator(sel).first().boundingBox();
    await chart.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await chart.waitForTimeout(500);
  };
  if (!(await chart.locator('[data-name="order-panel"]').count())) await openPanel();
  await click('#header-toolbar-symbol-search');
  await chart.keyboard.type('BTCUSD', { delay: 40 });
  await chart.waitForTimeout(1500);
  await chart.keyboard.press('Enter');
  await chart.waitForTimeout(3000);
  if (!(await chart.locator('[data-name="order-panel"]').count())) await openPanel();
  await click('button#Market');
  await click('[data-name="side-control-buy"]');
  await chart.locator('#quantity-field').first().fill('2');
  await chart.waitForTimeout(400);

  // Trade 1: within the rule, straight through.
  await click('[data-name="place-and-modify-button"]');
  await until(async () => (await cache())?.snapshot?.entries?.length === 1, 'trade 1 synced', 90000);
  await chart.waitForTimeout(3000);
  if (!(await chart.locator('[data-name="order-panel"]').count())) await openPanel();
  if (/^start/i.test(await chart.locator('[data-name="place-and-modify-button"]').innerText())) await click('[data-name="side-control-buy"]');

  // Hide the account name and TradingView's banners; draw the cursor (recordings don't).
  await chart.addStyleTag({ content: '[data-qa-id="account-selector"] { filter: blur(6px); } [class*="toast"], [class*="banner"] { display: none !important; }' });
  await chart.evaluate(() => {
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(47,211,227,.35);border:2px solid #0b98c0;pointer-events:none;left:-40px;top:-40px;transition:transform .1s';
    document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => (c.style.transform = 'scale(.6)'), true);
    addEventListener('mouseup', () => (c.style.transform = ''), true);
  });
  await chart.mouse.move(300, 200);
  await chart.waitForTimeout(2000);

  // The clip: trade 2, the pause, Skip.
  const start = (Date.now() - t0) / 1000;
  await chart.waitForTimeout(1500);
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
  const end = (Date.now() - t0) / 1000;

  // Leave the Paper Trading account flat: sell the BTCUSD long (a close, never paused).
  const pos = await chart.evaluate(() => [...document.querySelectorAll('table[data-name$=".positions-table"] tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ')).join(' / '));
  const m = /BTCUSD Long ([\d.,]+)/.exec(pos);
  if (m) {
    if (!(await chart.locator('[data-name="order-panel"]').count())) await openPanel();
    await click('[data-name="side-control-sell"]');
    await chart.locator('#quantity-field').first().fill(m[1].replace(/,/g, ''));
    await chart.waitForTimeout(400);
    await click('[data-name="place-and-modify-button"]');
    await chart.waitForTimeout(2500);
  }
  const video = chart.video();
  await ctx.close();
  console.log(JSON.stringify({ video: await video.path(), start, end, closed: m ? m[1] : null }));
})().catch((e) => { console.error(e.message); process.exit(1); });
