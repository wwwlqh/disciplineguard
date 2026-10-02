// Shared by the end-to-end tests: the real server handler (server/dev.ts, empty database) on a free port, the extension
// built against it in Chromium, the trader signed in on the web and onboarded (at most 1 trade a day, a daily loss limit
// of 100, a 2-second wait), and the extension signed in with Allow. Each test serves its stand-in page at the real URL.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';

const here = import.meta.dirname;
let failed = false;

export function check(ok: unknown, what: string) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed = true;
}

export async function until<T>(f: () => Promise<T | undefined | false>, what: string, ms = 15_000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await f().catch(() => undefined);
    if (v) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out: ${what}`);
}

/** A real mouse click at the control, like the trader's (the pause covering the page is the point). */
export async function press(page: Page, sel: string) {
  const box = (await page.locator(sel).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(150);
}

type Call = (method: string, path: string, body?: unknown, cookie?: string) => Promise<{ status: number; data: any; cookie?: string }>;

export interface E2E {
  ctx: BrowserContext;
  /** The trader's web session. */
  cookie: string;
  call: Call;
  /** The extension's rule cache. */
  cache(): Promise<any>;
}

/** Runs one end-to-end test with the stand-in `fixture` served at `site`, then exits with the result. */
export async function runE2E(name: string, site: string, fixture: string, test: (t: E2E) => Promise<void>): Promise<never> {
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
  const call: Call = async (method, path, body, cookie) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie, 'x-dg': '1' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json().catch(() => null), cookie: res.headers.get('set-cookie')?.split(';')[0] };
  };

  const profile = mkdtempSync(join(tmpdir(), `dg-ext-${name}-`));
  const out = `test-dist-${name}`;
  let ctx: BrowserContext | undefined;
  try {
    const pub = (await call('GET', '/v1/pubkey')).data.ed25519;
    const b = spawnSync(process.execPath, ['build.ts'], { cwd: join(here, '..'), env: { ...process.env, DG_API: API, DG_PUBKEY: pub, DG_TEST: '1', DG_OUT: out }, stdio: 'inherit' });
    if (b.status !== 0) throw new Error('build failed');
    const ext = join(here, '..', out);

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
    const html = readFileSync(join(here, fixture), 'utf8');
    await ctx.route(site, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
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
    await test({ ctx, cookie, call, cache });
  } catch (e) {
    console.log('FAIL', (e as Error).message);
    failed = true;
  } finally {
    await ctx?.close();
    server.kill();
    rmSync(profile, { recursive: true, force: true });
    rmSync(join(here, '..', out), { recursive: true, force: true });
  }
  process.exit(failed ? 1 : 0);
}
