// Test harness: the Worker handler on in-memory SQLite with a controllable clock.
import { createHash, generateKeyPairSync } from 'node:crypto';
import { join } from 'node:path';
import { NodeD1 } from '../src/d1-node.ts';
import { handle } from '../src/index.ts';
import type { Env } from '../src/env.ts';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
export const SIGNING_PUB = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
const SIGNING_KEY = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

export class World {
  db = new NodeD1();
  t = Date.UTC(2026, 9, 5, 10, 0); // Monday 5 Oct 2026 10:00 UTC
  env: Env;
  pending: Promise<unknown>[] = [];
  constructor(extra: Partial<Env> = {}) {
    this.db.migrate(join(import.meta.dirname, '..', 'migrations'));
    this.env = {
      DB: this.db, APP_URL: 'https://app.test', HMAC_SECRET: 'test-secret', SIGNING_KEY, SIGNING_PUB, DEV: '1',
      OWNER_EMAILS: 'owner@test.dev', LS_WEBHOOK_SECRET: 'whsec', LS_CHECKOUT_EARLYBIRD: 'https://s.lemonsqueezy.com/buy/eb',
      NOW: () => this.t, ...extra,
    };
  }
  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const h = new Headers({ 'content-type': 'application/json', ...headers });
    const req = new Request(`https://app.test${path}`, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const res = await handle(req, this.env, { waitUntil: (p) => void this.pending.push(p) });
    await Promise.all(this.pending);
    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {}
    return { status: res.status, data, headers: res.headers };
  }
  /** A fetch that reaches this handler, for client code under test (the Windows app's bridge). */
  fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await handle(new Request(input, init), this.env, { waitUntil: (p) => void this.pending.push(p) });
    await Promise.all(this.pending);
    return res;
  }) as typeof fetch;
  outbox(): { to_email: string; subject: string; body: string }[] {
    return this.db.db.prepare('SELECT to_email, subject, body FROM outbox_email ORDER BY id DESC').all() as any;
  }
  /** Signs in (creating the user) and returns a web client. */
  async signIn(email: string): Promise<Web> {
    const r = await this.call('POST', '/v1/auth/email', { email });
    if (r.status !== 200) throw new Error(`sign-in request failed ${r.status} ${JSON.stringify(r.data)}`);
    const mail = this.outbox().find((m) => m.to_email === email)!;
    const code = /code is (\d{6})/.exec(mail.body)![1];
    const v = await this.call('POST', '/v1/auth/verify', { email, code });
    if (v.status !== 200) throw new Error(`verify failed ${v.status}`);
    const cookie = v.headers.get('set-cookie')!.split(';')[0];
    return new Web(this, cookie);
  }
}

export class Web {
  desktopToken?: string;
  terminals = 0;
  constructor(
    public w: World,
    public cookie: string,
  ) {}
  get(path: string) {
    return this.w.call('GET', path, undefined, { cookie: this.cookie });
  }
  send(method: string, path: string, body?: unknown) {
    return this.w.call(method, path, body ?? {}, { cookie: this.cookie, 'x-dg': '1' });
  }
  async onboard(extra: Record<string, unknown> = {}) {
    const r = await this.send('POST', '/api/onboarding/apply', {
      tz: 'UTC', reset: { preset: 'midnight' }, riskNotice: true, analyticsConsent: false,
      rules: { R1: { on: true, max: 5 } }, notes: [{ text: 'Stand up and breathe.', tag: 'any' }], plan: 'close the chart for 10 minutes', ...extra,
    });
    if (r.status !== 200) throw new Error(`onboard ${r.status} ${JSON.stringify(r.data)}`);
  }
  /** Signs in the Windows app with "Allow" and returns its token (SPEC §9.5). */
  async allowDesktop(name = 'DESKTOP-TEST'): Promise<string> {
    const verifier = 'v'.repeat(43);
    const challenge = createHash('sha256').update(verifier).digest('hex');
    const allow = await this.send('POST', '/api/desktop/allow', { challenge, name });
    if (allow.status !== 200) throw new Error(`allow ${allow.status} ${JSON.stringify(allow.data)}`);
    const r = await this.w.call('POST', '/v1/auth/desktop', { code: allow.data.code, verifier, version: '1.0.0' });
    if (r.status !== 200) throw new Error(`desktop ${r.status} ${JSON.stringify(r.data)}`);
    return r.data.token;
  }
  /** Connects an MT terminal through the Windows app and returns the EA's client. */
  async connect(login = '1234567', server = 'FTMO-Demo', kind = 'mt5', terminalId = `TERM${++this.terminals}`): Promise<Ea> {
    this.desktopToken ??= await this.allowDesktop();
    const r = await this.w.call('POST', '/v1/desktop/terminals', { terminalId, kind, server, login, broker: 'FTMO', currency: 'USD', build: 'abc', version: '1.0.0' }, { authorization: `Bearer ${this.desktopToken}` });
    if (r.status !== 200) throw new Error(`terminal ${r.status} ${JSON.stringify(r.data)}`);
    return new Ea(this.w, r.data.token, { key: `${login}@${server}`, platform: kind, server, login, currency: 'USD', netting: false, balance: 10000, equity: 10000 });
  }
}

export class Ea {
  seq = 0;
  signedHash = '';
  constructor(
    public w: World,
    public token: string,
    public account: Record<string, unknown>,
  ) {}
  sync(events: Record<string, unknown>[] = [], extra: Record<string, unknown> = {}, accounts?: Record<string, unknown>[]) {
    const evs = events.map((e) => ({ id: `e${Math.random().toString(36).slice(2, 12)}`, seq: ++this.seq, acct: this.account.key, t: this.w.t, ...e }));
    return this.w
      .call('POST', '/v1/sync', { v: 1, role: 'primary', version: '1.0.0', signedHash: this.signedHash, accounts: accounts ?? [this.account], events: evs, ...extra }, { authorization: `Bearer ${this.token}` })
      .then((r) => {
        if (r.data?.signedHash) this.signedHash = r.data.signedHash;
        return r;
      });
  }
}
