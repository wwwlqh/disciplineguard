// Local development: runs the Windows app's sign-in and bridge against server/dev.ts, with no browser.
//   node src/dev.ts <email> <terminal id>...
// It signs in through the dev outbox, onboards a fresh user, presses "Allow" with the web session, protects the
// given terminals (the portable test copy's id is its folder name, e.g. dg-mt5-portable), then serves the bridge.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { Bridge, type AppState } from './bridge.ts';
import { signIn } from './signin.ts';

const API = process.env.DG_API ?? 'http://127.0.0.1:8787';
const [email = 'ea-test@test.dev', ...terminals] = process.argv.slice(2);
const commonFiles = join(process.env.APPDATA ?? '', 'MetaQuotes', 'Terminal', 'Common', 'Files');
const stateFile = new URL('../.dev-state.json', import.meta.url);

async function call(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie, 'x-dg': '1' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, headers: res.headers };
}

async function webSession(): Promise<string> {
  const r = await call('POST', '/v1/auth/email', { email });
  if (r.status !== 200) throw new Error(`sign-in ${r.status} ${JSON.stringify(r.data)}`);
  const mail = ((await call('GET', '/dev/outbox')).data as any[]).find((m) => m.to_email === email);
  const code = /code is (\d{6})/.exec(mail.body)![1];
  const v = await call('POST', '/v1/auth/verify', { email, code });
  const cookie = v.headers.get('set-cookie')!.split(';')[0];
  const me = (await call('GET', '/api/me', undefined, cookie)).data;
  if (!me.onboarding?.done) {
    await call('POST', '/api/onboarding/apply', {
      tz: 'UTC', reset: { preset: 'midnight' }, riskNotice: true, analyticsConsent: false,
      rules: { R1: { on: true, max: 2 }, R9: { on: true } },
      notes: [{ text: 'Stand up and breathe before you chase this.', tag: 'any' }], plan: 'close the chart for 10 minutes',
    }, cookie);
  }
  return cookie;
}

let state: AppState = existsSync(stateFile)
  ? JSON.parse(readFileSync(stateFile, 'utf8'))
  : { api: API, protected: [], links: {}, baseline: true };
const save = (s: AppState) => writeFileSync(stateFile, JSON.stringify(s, null, 2));

if (!state.appToken) {
  const cookie = await webSession();
  const signed = await signIn({
    api: API, appUrl: API, name: hostname(), version: '0.1.0-dev',
    // Stands in for the browser: press Allow with the web session, then follow the redirect to the loopback.
    open: async (url) => {
      const q = new URL(url).searchParams;
      const allow = await call('POST', '/api/desktop/allow', { challenge: q.get('challenge'), name: q.get('name') }, cookie);
      await fetch(`http://127.0.0.1:${q.get('port')}/cb?code=${allow.data.code}`);
    },
  });
  state = { ...state, appToken: signed.token, email: signed.email };
}
state.protected = [...new Set([...state.protected, ...terminals])];
save(state);

const bridge = new Bridge(state, { commonFiles, save });
console.log(`Serving the bridge for ${state.protected.join(', ') || '(no terminals yet)'} as ${state.email}. Ctrl+C to stop.`);
setInterval(() => void bridge.tick().catch((e) => console.error(e)), 1000);
