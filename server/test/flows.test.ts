import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DAY, HOUR, MIN } from '@dg/core';
import { verify } from '../src/crypto.ts';
import { SIGNING_PUB, World } from './harness.ts';

describe('sign-in (SPEC §10.9)', () => {
  it('creates the user on the first code and sets an httpOnly session cookie', async () => {
    const w = new World();
    const r = await w.call('POST', '/v1/auth/email', { email: 'Trader@Example.com' });
    expect(r.status).toBe(200);
    const code = /code is (\d{6})/.exec(w.outbox()[0].body)![1];
    const v = await w.call('POST', '/v1/auth/verify', { email: 'trader@example.com', code });
    expect(v.status).toBe(200);
    expect(v.data.isNew).toBe(true);
    expect(v.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Lax/);
    // The code works once.
    expect((await w.call('POST', '/v1/auth/verify', { email: 'trader@example.com', code })).status).toBe(400);
  });

  it('the link works once and needs no code', async () => {
    const w = new World();
    await w.call('POST', '/v1/auth/email', { email: 'a@b.co', nonce: 'n1' });
    const link = /#t=([\w-]+)/.exec(w.outbox()[0].body)![1];
    const info = await w.call('POST', '/v1/auth/link-info', { token: link, nonce: 'other' });
    expect(info.data).toEqual({ email: 'a***@b.co', sameBrowser: false });
    expect((await w.call('POST', '/v1/auth/verify', { token: link })).status).toBe(200);
    expect((await w.call('POST', '/v1/auth/verify', { token: link })).status).toBe(400);
  });

  it('expires after 15 minutes', async () => {
    const w = new World();
    await w.call('POST', '/v1/auth/email', { email: 'a@b.co' });
    const code = /code is (\d{6})/.exec(w.outbox()[0].body)![1];
    w.t += 16 * MIN;
    expect((await w.call('POST', '/v1/auth/verify', { email: 'a@b.co', code })).status).toBe(400);
  });

  it('limits requests to 3 per email per hour', async () => {
    const w = new World();
    for (let i = 0; i < 3; i++) expect((await w.call('POST', '/v1/auth/email', { email: 'a@b.co' })).status).toBe(200);
    expect((await w.call('POST', '/v1/auth/email', { email: 'a@b.co' })).status).toBe(429);
  });

  it('rejects mutating API calls without the CSRF header', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    const r = await w.call('POST', '/api/break', {}, { cookie: web.cookie });
    expect(r.status).toBe(403);
  });
});

describe('Windows app connect (SPEC §9.5)', () => {
  it('exchanges an Allow code once, and only with the matching verifier', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    const verifier = 'x'.repeat(43);
    const challenge = createHash('sha256').update(verifier).digest('hex');
    const { code } = (await web.send('POST', '/api/desktop/allow', { challenge, name: 'DESKTOP-4F2' })).data;
    expect((await w.call('POST', '/v1/auth/desktop', { code, verifier: 'y'.repeat(43) })).status).toBe(400);
    const ok = await w.call('POST', '/v1/auth/desktop', { code, verifier });
    expect(ok.status).toBe(200);
    expect(ok.data.email).toBe('a***@b.co');
    expect(ok.data.user).toBe((w.db.db.prepare('SELECT id FROM users WHERE email = ?').get('a@b.co') as { id: string }).id);
    expect((await w.call('POST', '/v1/auth/desktop', { code, verifier })).status).toBe(400);
    expect(w.outbox().some((m) => m.to_email === 'a@b.co' && m.body.includes('DESKTOP-4F2'))).toBe(true);
  });

  it('expires the Allow code after 2 minutes', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    const verifier = 'x'.repeat(43);
    const challenge = createHash('sha256').update(verifier).digest('hex');
    const { code } = (await web.send('POST', '/api/desktop/allow', { challenge, name: 'PC' })).data;
    w.t += 3 * MIN;
    expect((await w.call('POST', '/v1/auth/desktop', { code, verifier })).status).toBe(400);
  });

  it('connects a terminal with no pairing step, rotates its token on reconnect, and never stores the account number', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.onboard();
    const ea = await web.connect('7654321', 'FTMO-Demo', 'mt5', 'TERM1');
    expect((await ea.sync()).status).toBe(200);
    const me = (await web.get('/api/me')).data;
    expect(me.connections).toHaveLength(1);
    expect(me.accounts[0].last3).toBe('321');
    const again = await web.connect('7654321', 'FTMO-Demo', 'mt5', 'TERM1');
    expect((await web.get('/api/me')).data.connections).toHaveLength(1);
    expect((await ea.sync()).status).toBe(401);
    expect((await again.sync()).status).toBe(200);
    const dump = JSON.stringify(w.db.db.prepare('SELECT * FROM trading_accounts').all()) + JSON.stringify(w.db.db.prepare('SELECT * FROM connections').all());
    expect(dump).not.toContain('7654321');
  });

  it('rejects terminal registration without a valid app token', async () => {
    const w = new World();
    const r = await w.call('POST', '/v1/desktop/terminals', { terminalId: 'TERM1', server: 's', login: '1' }, { authorization: 'Bearer ' + 'a'.repeat(40) });
    expect(r.status).toBe(401);
  });
});

describe('sync (SPEC §10.3)', () => {
  it('returns a signed rule cache that verifies with the public key, and omits it when unchanged', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.onboard();
    const ea = await web.connect();
    const r = await ea.sync();
    expect(r.status).toBe(200);
    const { payload, sig } = r.data.signed;
    expect(await verify(SIGNING_PUB, payload, sig)).toBe(true);
    const p = JSON.parse(payload);
    expect(p.rules.R1).toEqual({ on: true, max: 5 });
    expect(p.license.state).toBe('trial');
    expect(p.time.userResets.some((x: number) => x > w.t)).toBe(true);
    expect(p.notes[0].text).toBe('Stand up and breathe.');
    expect(p.magic).toBeGreaterThanOrEqual(700_000_000);
    const again = await ea.sync();
    expect(again.data.signed).toBeNull();
  });

  it('counts entries in the snapshot, deduplicates by ticket, and acks the sequence', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.onboard();
    const ea = await web.connect();
    await ea.sync();
    const entry = { type: 'entry', ticket: 111, symbol: 'EURUSD', side: 'buy', size: 0.5, source: 'panel' };
    const r = await ea.sync([entry, { ...entry }]);
    expect(r.data.snapshot.entries).toHaveLength(1);
    expect(r.data.ackedSeq).toBe(2);
    // CNT-07: a second EA on the same account reports the same deal: still one entry.
    const ea2 = await web.connect();
    await ea2.sync([{ ...entry, source: 'outside' }]);
    expect((await ea.sync()).data.snapshot.entries).toHaveLength(1);
  });

  it('a voided pending order stops counting (CNT-02)', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.onboard();
    const ea = await web.connect();
    await ea.sync([{ type: 'entry', ticket: 5, symbol: 'EURUSD', side: 'buy', size: 1, source: 'panel', pending: true }]);
    const r = await ea.sync([{ type: 'entry_void', ticket: 5 }]);
    expect(r.data.snapshot.entries).toHaveLength(0);
  });

  it('place anyway and outside violations become overrides; skips set the last skip', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.onboard();
    const ea = await web.connect();
    const r = await ea.sync([
      { type: 'pause', pauseId: 'p1', rules: ['R1'], title: 'R1', decision: 'place', sent: true, symbol: 'EURUSD', side: 'buy', size: 1, waitSec: 5 },
      { type: 'entry', ticket: 9, symbol: 'GBPUSD', side: 'sell', size: 1, source: 'outside', violations: ['R1'] },
      { type: 'pause', pauseId: 'p2', rules: ['R1'], title: 'R1', decision: 'skip', symbol: 'XAUUSD', side: 'buy', size: 1, waitSec: 15 },
    ]);
    expect(r.data.snapshot.overrides).toHaveLength(2);
    expect(r.data.snapshot.lastSkip).toMatchObject({ symbol: 'XAUUSD', waitSec: 15 });
  });

  it('breaks and done-for-today are never shortened (SPEC §6.5)', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.onboard();
    const ea = await web.connect();
    await web.send('POST', '/api/done-today');
    const r = await ea.sync([{ type: 'break', until: w.t + 15 * MIN }]);
    expect(r.data.snapshot.doneUntil).toBe(Date.UTC(2026, 9, 6));
    expect(r.data.snapshot.breakUntil).toBe(w.t + 15 * MIN);
    const r2 = await ea.sync([{ type: 'break', until: w.t + 5 * MIN }]);
    expect(r2.data.snapshot.breakUntil).toBe(w.t + 15 * MIN);
  });

  it('first On starts the trial and schedules the auto-lock (SET-03, SUB-01)', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.onboard();
    const ea = await web.connect();
    await ea.sync();
    const me = (await web.get('/api/me')).data;
    expect(me.user.firstOnAt).toBe(w.t);
    expect(me.user.lockAt).toBe(Date.UTC(2026, 9, 9)); // Monday 10:00 + 72 h → Friday 00:00
    // SUB-01: trial ends at the first reset after 14 days, and protection stays on until then.
    expect(me.license.trialEndsAt).toBe(Date.UTC(2026, 9, 20));
    const job = w.db.db.prepare("SELECT run_at FROM jobs WHERE kind = 'lock_notice'").get() as any;
    expect(job.run_at).toBe(Date.UTC(2026, 9, 8));
  });

  it('the day-start balance keeps the first report (SPEC §5.2)', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.onboard();
    const ea = await web.connect();
    const day = Date.UTC(2026, 9, 5);
    await ea.sync([{ type: 'day_start', dayStart: day, balance: 10000 }]);
    const r = await ea.sync([{ type: 'day_start', dayStart: day, balance: 9000 }]);
    const acct = Object.values(r.data.snapshot.accounts)[0] as any;
    expect(acct.dayStartBalance).toBe(10000);
  });

  it('a new MT login needs "Protect" and then counts', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.onboard();
    const ea = await web.connect();
    const other = { key: '999@X', platform: 'mt5', server: 'X', login: '999' };
    const r = await ea.sync([], {}, [ea.account, other]);
    expect(r.data.accounts.find((a: any) => a.key === '999@X').state).toBe('new');
    const r2 = await ea.sync([], {}, [ea.account, { ...other, protect: true }]);
    expect(r2.data.accounts.find((a: any) => a.key === '999@X').state).toBe('active');
  });

  it('an unknown token is 401; a deleted account is 410 account_deleted (SPEC §10.5)', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    const ea = await web.connect();
    expect((await w.call('POST', '/v1/sync', {}, { authorization: 'Bearer ' + 'x'.repeat(40) })).status).toBe(401);
    w.db.db.prepare('UPDATE users SET deleted_at = 1').run();
    const r = await ea.sync();
    expect(r.status).toBe(410);
    expect(r.data.status).toBe('account_deleted');
  });
});

describe('rule changes through the API (SPEC §6)', () => {
  it('setup mode applies at once; after lock, looser waits and stricter applies now', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.onboard();
    const put = (max: number, dryRun = false) => web.send('PUT', '/api/settings', { key: 'rule:R1', value: { on: true, max }, dryRun });
    expect((await put(8)).data.appliesAt).toBe('now');
    expect((await web.send('POST', '/api/lock', { firstName: 'Alex', understood: true })).status).toBe(200);
    // CHG-02: 10:00 → pending, 00:00 tonight.
    const dry = await put(10, true);
    expect(dry.data).toEqual({ direction: 'looser', appliesAt: Date.UTC(2026, 9, 6) });
    await put(10);
    let me = (await web.get('/api/me')).data;
    expect(me.rules.R1.max).toBe(8);
    expect(me.pending[0]).toMatchObject({ key: 'rule:R1', effectiveAt: Date.UTC(2026, 9, 6) });
    // Every protected change sends a security email.
    expect(w.outbox()[0].subject).toContain('a change to your account');
    // The server activates it on the first read after effective_at.
    w.t = Date.UTC(2026, 9, 6, 0, 1);
    me = (await web.get('/api/me')).data;
    expect(me.rules.R1.max).toBe(10);
    expect(me.pending).toHaveLength(0);
    // CHG-06: stricter applies now and drops a pending loosening.
    await put(20);
    await put(4);
    me = (await web.get('/api/me')).data;
    expect(me.rules.R1.max).toBe(4);
    expect(me.pending).toHaveLength(0);
  });

  it('CHG-18: a scheduled change can be cancelled at once', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.onboard();
    await web.send('POST', '/api/lock', { firstName: 'Alex', understood: true });
    await web.send('PUT', '/api/settings', { key: 'rule:R1', value: { on: false, max: 5 } });
    expect((await web.get('/api/me')).data.pending).toHaveLength(1);
    await web.send('POST', '/api/settings/cancel', { key: 'rule:R1' });
    const me = (await web.get('/api/me')).data;
    expect(me.pending).toHaveLength(0);
    expect(me.rules.R1.on).toBe(true);
  });

  it('SET-02: setup-mode cool-off after a real pause', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.onboard();
    const ea = await web.connect();
    w.t = Date.UTC(2026, 9, 5, 10, 14);
    await ea.sync([{ type: 'pause', pauseId: 'x', rules: ['R1'], decision: 'skip', symbol: 'EURUSD', side: 'buy', size: 1 }]);
    w.t = Date.UTC(2026, 9, 5, 10, 20);
    const r = await web.send('PUT', '/api/settings', { key: 'rule:R1', value: { on: true, max: 8 } });
    expect(r.data.appliesAt).toBe(Date.UTC(2026, 9, 5, 10, 44));
  });

  it('SET-05: setup mode never restarts', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.onboard();
    await web.send('POST', '/api/lock', { firstName: 'Alex', understood: true });
    await web.connect();
    expect((await web.get('/api/me')).data.user.setupMode).toBe(false);
    expect((await web.send('POST', '/api/onboarding/apply', {})).status).toBe(409);
  });

  it('validates ranges', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    expect((await web.send('PUT', '/api/settings', { key: 'rule:R1', value: { on: true, max: 0 } })).status).toBe(400);
    expect((await web.send('PUT', '/api/settings', { key: 'popup', value: { show: 'always' } })).status).toBe(400);
    expect((await web.send('PUT', '/api/settings', { key: 'tz', value: 'Mars/Base' })).status).toBe(400);
  });

  it('onboards with no note or plan typed', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    expect((await web.send('POST', '/api/onboarding/apply', { tz: 'UTC', reset: { preset: 'midnight' }, analyticsConsent: false, choices: ['too_many'] })).status).toBe(200);
    const me = (await web.get('/api/me')).data;
    expect(me.notes).toEqual([]);
    expect(me.plan).toBe('');
  });
});

describe('accounts, coverage and plans', () => {
  it('CHG-21/22: removing an active account is scheduled; an Ended one is immediate', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.onboard();
    await web.send('POST', '/api/lock', { firstName: 'A', understood: true });
    const ea = await web.connect();
    await ea.sync();
    const id = (await web.get('/api/me')).data.accounts[0].id;
    const r = await web.send('DELETE', `/api/accounts/${id}`);
    expect(r.data.appliesAt).toBe(Date.UTC(2026, 9, 6));
    expect((await web.get('/api/me')).data.accounts).toHaveLength(1);
    w.t = Date.UTC(2026, 9, 6, 0, 5);
    expect((await web.get('/api/me')).data.accounts).toHaveLength(0);
  });

  it('SUB-04: the 11th account is refused with the cap', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    const ea = await web.connect('100');
    const accts = [ea.account];
    for (let i = 1; i < 10; i++) accts.push({ key: `${100 + i}@S`, platform: 'mt5', server: 'S', login: String(100 + i), protect: true });
    await ea.sync([], {}, accts);
    const r = await ea.sync([], {}, [...accts, { key: '999@S', platform: 'mt5', server: 'S', login: '999', protect: true }]);
    expect(r.data.accounts.find((a: any) => a.key === '999@S').state).toBe('cap');
  });

  it('SEC-02 / SUB-03: the same account under another login tells the first; a reused trial account is not enforced', async () => {
    const w = new World();
    const a = await w.signIn('a@b.co');
    await a.connect('555', 'Srv');
    const b = await w.signIn('b@b.co');
    const eb = await b.connect('555', 'Srv');
    expect(w.outbox().some((m) => m.to_email === 'a@b.co' && m.subject.includes('another login'))).toBe(true);
    expect((await a.get('/api/me')).data.accounts).toHaveLength(0);
    const r = await eb.sync();
    expect(r.data.accounts[0].state).toBe('not_enforced');
  });

  it('COV-01: an entry reported from a coverage gap is marked unprotected and shown on Today', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.onboard();
    const ea = await web.connect();
    w.t = Date.UTC(2026, 9, 5, 11, 0);
    await ea.sync();
    // No heartbeat 11:00–11:40.
    w.t = Date.UTC(2026, 9, 5, 11, 40);
    await ea.sync([{ type: 'entry', ticket: 77, symbol: 'EURUSD', side: 'buy', size: 1, source: 'outside', t: Date.UTC(2026, 9, 5, 11, 20) }]);
    const today = (await web.get('/api/today')).data;
    expect(today.outside[0].unprotected).toBe(true);
    const gap = today.coverage.gaps.find((g: any) => g.from <= Date.UTC(2026, 9, 5, 11, 20) && g.to > Date.UTC(2026, 9, 5, 11, 20));
    expect(gap).toMatchObject({ trades: 1 });
    expect(today.week.keptToday).toBe(false);
  });

  it('SUB-06: a refund keeps protection until max(next reset, +12 h)', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.connect();
    const userId = (w.db.db.prepare('SELECT id FROM users').get() as any).id;
    const send = async (event: string, attrs: object) => {
      const raw = JSON.stringify({ meta: { event_name: event, custom_data: { user_id: userId, plan: 'earlybird_yearly' } }, data: { id: 'sub_1', type: 'subscriptions', attributes: attrs } });
      const sig = createHmac('sha256', 'whsec').update(raw).digest('hex');
      return w.call('POST', '/v1/webhooks/lemonsqueezy', raw, { 'x-signature': sig });
    };
    expect((await w.call('POST', '/v1/webhooks/lemonsqueezy', '{}', { 'x-signature': 'bad' })).status).toBe(401);
    await send('subscription_created', { status: 'active', renews_at: '2027-10-05T10:00:00Z', customer_id: 1, updated_at: 'a' });
    let me = (await web.get('/api/me')).data;
    expect(me.license.state).toBe('active');
    w.t = Date.UTC(2026, 9, 5, 20, 0);
    await send('subscription_payment_refunded', { status: 'active', updated_at: 'b' });
    me = (await web.get('/api/me')).data;
    expect(me.license.validUntil).toBe(Date.UTC(2026, 9, 6, 8, 0));
  });

  it('SUB-02: never connected, the trial ends at the first reset after day 21', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    w.t += 21 * DAY + HOUR;
    expect((await web.get('/api/me')).data.license.state).toBe('trial');
    w.t = Date.UTC(2026, 9, 27, 0, 30);
    const me = (await web.get('/api/me')).data;
    expect(me.license.state).toBe('ended');
    expect(me.license.validUntil).toBe(Date.UTC(2026, 9, 27));
  });

  it('owner metrics are only for owners', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    expect((await web.get('/api/owner/metrics')).status).toBe(404);
    const owner = await w.signIn('owner@test.dev');
    const m = await owner.get('/api/owner/metrics');
    expect(m.status).toBe(200);
    expect(m.data.funnel.signups).toBe(2);
  });
});
