// Live check of the product extension on a signed-in TradingView Paper Trading chart (never a real broker).
// Needs: server/dev.ts on :8791, and `EXT=../../clients/extension/live-dist node launch.js` running.
const { chromium } = require('playwright');
const API = 'http://localhost:8791';
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed = true;
};
async function call(method, path, body, cookie) {
  const r = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie, 'x-dg': '1' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => null), cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(f, what, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await f().catch(() => undefined);
    if (v) return v;
    await sleep(300);
  }
  throw new Error('timed out: ' + what);
}

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
  const ctx = browser.contexts()[0];
  const chart = ctx.pages().find((p) => p.url().includes('tradingview.com'));
  const shot = (n) => chart.screenshot({ path: `${process.env.SHOTS}/live-${n}.png` });

  // Paper Trading connected, the trading panel and the order panel open.
  const connect = chart.locator('button:has-text("Connect")');
  if (await connect.count()) {
    await connect.first().click();
    await chart.waitForTimeout(3000);
  }
  if (!(await chart.locator('[data-qa-id="account-selector"]').count())) {
    await chart.locator('#footer-chart-panel button:has-text("Paper Trading")').first().click();
    await chart.waitForTimeout(2000);
  }
  if (!(await chart.locator('[data-name="order-panel"]').count())) {
    await chart.locator('[data-name="buy-order-button"]').click();
    await chart.waitForTimeout(2000);
  }

  // A DisciplineGuard account: at most 1 trade a day, 3-second wait.
  const email = `live${Date.now()}@test.dev`;
  await call('POST', '/v1/auth/email', { email });
  const mail = (await call('GET', '/dev/outbox')).data.find((m) => m.to_email === email);
  const cookie = (await call('POST', '/v1/auth/verify', { email, code: /code is (\d{6})/.exec(mail.body)[1] })).cookie;
  const popup = { show: 'breaks', wait: 3, lossWait: { on: false, seconds: 15, withinMinutes: 30 }, growing: { on: false, step: 5, cap: 45 }, typeConfirm: { mode: 'off', n: 3 }, skipCard: true, keyboardPlace: false };
  const ob = await call('POST', '/api/onboarding/apply', { tz: 'UTC', reset: { preset: 'midnight' }, rules: { R1: { on: true, max: 1 } }, popup }, cookie);
  check(ob.status === 200, 'DisciplineGuard account with max 1 trade a day');

  // Sign the extension in (Allow + PKCE).
  const sw = ctx.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://')) ?? (await ctx.waitForEvent('serviceworker'));
  const extId = new URL(sw.url()).host;
  const pop = await ctx.newPage();
  await pop.goto(`chrome-extension://${extId}/popup.html`);
  const allowTab = ctx.waitForEvent('page', (p) => p.url().includes('/allow?'));
  await pop.evaluate(() => chrome.runtime.sendMessage({ type: 'sign_in' }));
  const allow = await allowTab;
  const q = new URL(allow.url()).searchParams;
  const granted = await call('POST', '/api/desktop/allow', { challenge: q.get('challenge'), name: q.get('name') }, cookie);
  const handed = await allow.evaluate(([id, c]) => chrome.runtime.sendMessage(id, { type: 'dg_code', code: c }), [extId, granted.data.code]);
  check(handed && handed.ok, 'extension signed in');
  await allow.close();
  await chart.bringToFront();
  const cache = () => pop.evaluate(() => chrome.storage.local.get('dg_cache').then((v) => v.dg_cache));

  const me = await until(async () => {
    const d = (await call('GET', '/api/me', undefined, cookie)).data;
    return d.accounts.length > 0 && d;
  }, 'account registered', 40000);
  await until(async () => (await cache())?.status === 'on' && Object.keys((await cache()).accounts).length > 0, 'extension On', 90000);
  check(me.accounts.length === 1 && me.accounts[0].platform === 'tv', `Paper Trading account protected (${me.accounts[0]?.server} …${me.accounts[0]?.last3})`);

  const posText = () => chart.evaluate(() => [...document.querySelectorAll('table[data-name$=".positions-table"] tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ')).join(' / '));
  const pauseOpen = () => chart.locator('dg-pause dialog[open]').count();
  const press = async (sel) => {
    // TradingView closes the order panel after an order; the chart's Buy button opens it again (one-click off).
    if (sel.includes('place-and-modify') || sel.includes('side-control')) {
      if (!(await chart.locator(sel).count())) {
        await chart.locator('[data-name="buy-order-button"]').click();
        await chart.waitForTimeout(1500);
      }
    }
    const box = await chart.locator(sel).first().boundingBox();
    await chart.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await chart.waitForTimeout(400);
  };
  const submitText = async () => (await chart.locator('[data-name="place-and-modify-button"]').innerText()).replace(/\s+/g, ' ');

  // BTCUSD (open on weekends), Market, 1 unit.
  await press('#header-toolbar-symbol-search');
  await chart.keyboard.type('BTCUSD', { delay: 40 });
  await chart.waitForTimeout(1500);
  await chart.keyboard.press('Enter');
  await chart.waitForTimeout(3000);
  await press('button#Market');
  // Start flat: sell any BTCUSD long (a close, which DisciplineGuard never pauses).
  const longQty = async () => {
    const m = /BTCUSD Long ([\d.,]+)/.exec(await posText());
    return m ? m[1].replace(/,/g, '') : null;
  };
  const flatten = async () => {
    const q = await longQty();
    if (!q) return;
    await press('[data-name="side-control-sell"]');
    await chart.locator('#quantity-field').first().fill(q);
    await chart.waitForTimeout(400);
    await press('[data-name="place-and-modify-button"]');
    await chart.waitForTimeout(2500);
  };
  await flatten();
  await press('[data-name="side-control-buy"]');
  await chart.locator('#quantity-field').first().fill('1');
  await chart.waitForTimeout(400);
  check(/^Buy 1 BTCUSD/i.test(await submitText()), `order panel reads "${await submitText()}"`);

  // Trade 1: within the rules.
  const before = await posText();
  await press('[data-name="place-and-modify-button"]');
  await chart.waitForTimeout(2500);
  check((await pauseOpen()) === 0 && (await posText()) !== before, `trade 1 went straight through (positions: ${await posText()})`);
  await shot(1);
  await until(async () => (await cache())?.snapshot?.entries?.length === 1, 'entry synced', 90000);

  // Trade 2: breaks max 1 a day, so it is held.
  const p2 = await posText();
  await chart.waitForTimeout(2000);
  await press('[data-name="place-and-modify-button"]');
  await chart.waitForTimeout(1200);
  check((await pauseOpen()) === 1, 'trade 2 held with the pause');
  check(((await chart.locator('dg-pause .head').textContent()) || '').includes('trade 2 today'), `pause says: "${await chart.locator('dg-pause .head').textContent()}"`);
  await shot(2);
  await chart.waitForTimeout(1500);
  check((await posText()) === p2, 'no order reached TradingView while paused');
  await chart.keyboard.press('Escape');
  await chart.waitForTimeout(800);
  check((await pauseOpen()) === 0 && (await posText()) === p2, 'Esc skipped; still no order');

  // Trade 3: Place anyway after the wait, then the trader clicks Buy once more.
  await press('[data-name="place-and-modify-button"]');
  await chart.waitForTimeout(3400);
  const placeBox = await chart.locator('dg-pause button.place').boundingBox();
  await chart.mouse.click(placeBox.x + placeBox.width / 2, placeBox.y + placeBox.height / 2);
  await chart.waitForTimeout(600);
  check((await pauseOpen()) === 0 && (await posText()) === p2, 'Place anyway: pause closed, no click made for the trader');
  await shot(3);
  await press('[data-name="place-and-modify-button"]');
  await chart.waitForTimeout(2500);
  check((await posText()) !== p2, `the trader's own click sent it (positions: ${await posText()})`);

  // Closing: selling the whole long is an exit, never paused.
  await press('[data-name="side-control-sell"]');
  await chart.locator('#quantity-field').first().fill((await longQty()) || '2');
  await chart.waitForTimeout(500);
  const sellText = await submitText();
  await press('[data-name="place-and-modify-button"]');
  await chart.waitForTimeout(2500);
  check((await pauseOpen()) === 0, `"${sellText}" closing the long went straight through (positions: ${(await posText()) || 'none'})`);
  await shot(4);

  const today = await until(async () => {
    const d = (await call('GET', '/api/today', undefined, cookie)).data;
    return d.pauses.length >= 2 && d;
  }, 'pauses on the server', 90000);
  check(today.pauses.some((p) => p.decision === 'skip') && today.pauses.some((p) => p.decision === 'place'), 'skip and place anyway logged on the server');
  console.log('trades counted today:', today.meters.tradesToday);
  await pop.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log('FAIL', e.message.split('\n')[0]);
  process.exit(1);
});
