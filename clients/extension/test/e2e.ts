// End to end: the built extension in Chromium, the real server handler (server/dev.ts, empty database), and a
// stand-in TradingView chart (test/fixture.html served at the TradingView URL). Usage: npm run e2e
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';

const here = import.meta.dirname;
const port: number = await new Promise((resolve) => {
  const s = createServer().listen(0, '127.0.0.1', () => {
    const p = (s.address() as { port: number }).port;
    s.close(() => resolve(p));
  });
});
const API = `http://localhost:${port}`;
const server = spawn(process.execPath, ['dev.ts'], {
  cwd: join(here, '../../../server'),
  env: { ...process.env, PORT: String(port), DG_DB: ':memory:', APP_URL: API },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise<void>((resolve, reject) => {
  server.stdout!.on('data', (d: Buffer) => d.toString().includes('dev API on') && resolve());
  server.on('exit', (code) => reject(new Error(`server exited (${code})`)));
});

let failed = false;
function check(ok: unknown, what: string) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed = true;
}

async function call(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie, 'x-dg': '1' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null), cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

async function until<T>(f: () => Promise<T | undefined | false>, what: string, ms = 15_000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await f().catch(() => undefined);
    if (v) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out: ${what}`);
}

const profile = mkdtempSync(join(tmpdir(), 'dg-ext-'));
let ctx: BrowserContext | undefined;
try {
  const pub = (await call('GET', '/v1/pubkey')).data.ed25519;
  const b = spawnSync(process.execPath, ['build.ts'], { cwd: join(here, '..'), env: { ...process.env, DG_API: API, DG_PUBKEY: pub, DG_TEST: '1', DG_OUT: 'test-dist' }, stdio: 'inherit' });
  if (b.status !== 0) throw new Error('build failed');
  const ext = join(here, '..', 'test-dist');

  // The trader signs in on the web and onboards: at most 1 trade a day, a daily loss limit of 100, a 2-second wait.
  const email = 'e2e@test.dev';
  await call('POST', '/v1/auth/email', { email });
  const mail = (await call('GET', '/dev/outbox')).data.find((m: any) => m.to_email === email);
  const code = /code is (\d{6})/.exec(mail.body)![1];
  const cookie = (await call('POST', '/v1/auth/verify', { email, code })).cookie!;
  const popup = { show: 'breaks', wait: 2, lossWait: { on: false, seconds: 15, withinMinutes: 30 }, growing: { on: false, step: 5, cap: 45 }, typeConfirm: { mode: 'off', n: 3 }, skipCard: true, keyboardPlace: false };
  const ob = await call('POST', '/api/onboarding/apply', { tz: 'UTC', reset: { preset: 'midnight' }, rules: { R1: { on: true, max: 1 }, R8: { on: true, restHours: 12 } }, defaults: { r8: { unit: 'amount', value: 100 } }, popup }, cookie);
  check(ob.status === 200, 'onboarded with R1 max 1 and R8 100');

  ctx = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  const fixture = readFileSync(join(here, 'fixture.html'), 'utf8');
  await ctx.route('https://www.tradingview.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: fixture }));
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  const extId = new URL(sw.url()).host;

  // Sign in the extension: Allow in the web app hands a code to the extension; PKCE redeems it.
  const pop = await ctx.newPage();
  await pop.goto(`chrome-extension://${extId}/popup.html`);
  const allowTab = ctx.waitForEvent('page', (p: Page) => p.url().includes('/allow?'));
  await pop.evaluate(() => chrome.runtime.sendMessage({ type: 'sign_in' }));
  const allow = await allowTab;
  const q = new URL(allow.url()).searchParams;
  check(q.get('ext') === extId && /^[0-9a-f]{64}$/.test(q.get('challenge') ?? ''), 'sign-in opens Allow with the extension id and a PKCE challenge');
  const granted = await call('POST', '/api/desktop/allow', { challenge: q.get('challenge'), name: q.get('name') }, cookie);
  const handed = await allow.evaluate(([id, c]) => chrome.runtime.sendMessage(id, { type: 'dg_code', code: c }), [extId, granted.data.code] as const);
  check(handed?.ok === true, 'the web app hands the code to the extension');

  const cache = () => pop.evaluate(() => chrome.storage.local.get('dg_cache').then((v) => v.dg_cache as any));

  // The chart: the extension reads the account, registers it and syncs the rules.
  const chart = await ctx.newPage();
  await chart.goto('https://www.tradingview.com/chart/');
  await until(async () => (await cache())?.status === 'on', 'extension On');
  const me = (await call('GET', '/api/me', undefined, cookie)).data;
  check(me.accounts.length === 1 && me.accounts[0].platform === 'tv' && me.accounts[0].last3 === 'der', 'the Paper Trading account is protected (last 3 only)');

  const pillText = () => chart.locator('dg-pill .text').textContent();
  await until(async () => (await pillText())?.startsWith('On · 0 of 1 trades'), 'the pill shows On and the trade meter');
  check(true, 'the pill shows On and the trade meter');

  const sent = () => chart.evaluate(() => (window as any).sent as number);
  // A real mouse click at the control, like the trader's (the pause covering the page is the point).
  const press = async (sel: string) => {
    const box = (await chart.locator(sel).boundingBox())!;
    await chart.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await chart.waitForTimeout(150);
  };
  const pauseOpen = () => chart.locator('dg-pause dialog[open]').count();

  // Trade 1 keeps the rule: straight through, and counted.
  await press('#submit');
  check((await sent()) === 1 && (await pauseOpen()) === 0, 'a trade within the rules goes straight through');
  await until(async () => (await cache())?.snapshot?.entries?.length === 1, 'the entry reaches the server');

  // Trade 2 breaks R1: held, the page never sees the click. Esc skips.
  await press('#submit');
  check((await sent()) === 1 && (await pauseOpen()) === 1, 'trade 2 is held with the pause');
  check((await chart.locator('dg-pause .head').textContent())?.includes('trade 2 today'), 'the pause names the rule');
  check(await chart.locator('dg-pause button.place').isDisabled(), 'Place anyway waits');
  await chart.keyboard.press('Escape');
  check((await pauseOpen()) === 0 && (await sent()) === 1, 'Esc skips; nothing sent');

  // Closing is never paused.
  let closed = false;
  await chart.exposeFunction('dgClosed', () => (closed = true));
  await chart.evaluate(() => document.getElementById('close')!.addEventListener('click', () => (window as any).dgClosed()));
  await press('#close');
  check(closed && (await pauseOpen()) === 0, 'a close goes straight through');

  // Trade 3: Place anyway after the wait, then the trader's own click sends it.
  await press('#submit');
  await chart.waitForTimeout(2300);
  await chart.locator('dg-pause button.place').click();
  check((await pauseOpen()) === 0 && (await sent()) === 1, 'Place anyway closes the pause and does not click for the trader');
  await press('#submit');
  check((await sent()) === 2, "the trader's next click on the same order goes through");
  await press('#submit');
  check((await pauseOpen()) === 1 && (await sent()) === 2, 'the pass is used once');
  await chart.keyboard.press('Escape');

  const today = await until(async () => {
    const d = (await call('GET', '/api/today', undefined, cookie)).data;
    return d.pauses.length >= 3 && d.pauses.some((p: any) => p.decision === 'place') && d;
  }, 'pauses reach the server');
  check(today.pauses.filter((p: any) => p.decision === 'skip').length === 2, 'two skips logged');
  check(today.meters.tradesToday === 2, 'two trades counted today');
  check(today.outside.length === 0, 'guarded trades filling in the positions table are not counted again');

  // A trade from outside the guarded buttons (the DOM, say) appears in the positions table: counted, and over R1.
  await chart.evaluate(() => (window as any).setPosition('ETHUSD', 'sell', 2));
  const out = await until(async () => {
    const d = (await call('GET', '/api/today', undefined, cookie)).data;
    return d.outside.length === 1 && d.outside[0];
  }, 'the outside entry reaches the server');
  check(out.symbol === 'ETHUSD' && out.side === 'sell' && out.size === 2 && out.violations.includes('R1'), 'an outside entry is counted as a violation of R1');

  // Closing it loses 50: the close and its net reach the server.
  await chart.evaluate(() => {
    (window as any).setPosition('ETHUSD', 'sell', 0);
    (window as any).setSummary(99_950, 99_950);
  });
  const close = await until(async () => (await cache())?.snapshot?.closes?.[0], 'the close reaches the server');
  check(close.net === -50 && close.size === 2, 'a close is logged with its net');

  // Floating loss takes today's loss to 110, past the 100 limit: the server is told and the next trade is paused for R8.
  await chart.evaluate(() => (window as any).setSummary(99_950, 99_890));
  const acct = await until(async () => {
    const d = (await call('GET', '/api/today', undefined, cookie)).data;
    return d.accounts[0]?.inLimit && d.accounts[0];
  }, 'the daily loss limit reaches the server');
  check(acct.inLimit, 'reaching the daily loss limit is reported');
  await press('#submit');
  check((await pauseOpen()) === 1 && (await sent()) === 2, 'after the loss limit, a new trade is paused');
  check(/down \$110.*daily limit is \$100/.test((await chart.locator('dg-pause .head').textContent()) ?? ''), 'the pause names the daily loss limit');
  await chart.keyboard.press('Escape');
} catch (e) {
  console.log('FAIL', (e as Error).message);
  failed = true;
} finally {
  await ctx?.close();
  server.kill();
  rmSync(profile, { recursive: true, force: true });
  rmSync(join(here, '..', 'test-dist'), { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
