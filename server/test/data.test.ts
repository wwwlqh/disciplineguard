// Self-serve export and deletion (SPEC §12.6, §13.4).
import { describe, expect, it } from 'vitest';
import { MIN } from '@dg/core';
import { runScheduled } from '../src/jobs.ts';
import { World } from './harness.ts';

const link = (w: World) => /\/v1\/export\/([A-Za-z0-9_-]+)/.exec(w.outbox().find((m) => m.subject === 'DisciplineGuard: your data export')!.body)![1];

describe('export (SPEC §13.4)', () => {
  it('needs a fresh sign-in, emails a single-use link, and returns a ZIP with JSON and CSVs', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.onboard();
    const ea = await web.connect();
    await ea.sync([{ type: 'entry', ticket: 1, symbol: 'EURUSD', side: 'buy', size: 1, source: 'history', violations: ['R1'] }]);
    w.t += 11 * MIN;
    expect((await web.send('POST', '/api/export')).status).toBe(403);
    const fresh = await w.signIn('a@b.co');
    expect((await fresh.send('POST', '/api/export')).status).toBe(200);
    const tok = link(w);
    const r = await w.call('GET', `/v1/export/${tok}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/zip');
    for (const name of ['disciplineguard.json', 'trades.csv', 'rule-changes.csv']) expect(r.data).toContain(name);
    expect(r.data).toContain('EURUSD');
    expect(r.data).not.toContain('1234567');
    expect((await w.call('GET', `/v1/export/${tok}`)).status).toBe(410);
  });
});

describe('deletion (SPEC §12.6)', () => {
  it('in setup mode it is immediate; devices then get account_deleted', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.onboard();
    const ea = await web.connect();
    await ea.sync();
    expect((await web.send('POST', '/api/account/delete', { dryRun: true })).data.at).toBe('now');
    expect((await web.send('POST', '/api/account/delete', { confirm: 'nope' })).status).toBe(400);
    expect((await web.send('POST', '/api/account/delete', { confirm: 'DELETE' })).data.at).toBe('now');
    expect((await web.get('/api/me')).status).toBe(401);
    expect((await ea.sync()).status).toBe(410);
    expect(w.db.db.prepare('SELECT COUNT(*) AS n FROM events').get()).toMatchObject({ n: 0 });
    expect(w.outbox().some((m) => m.to_email === 'a@b.co' && m.subject === 'DisciplineGuard: account deleted')).toBe(true);
    // Signing up again is a new account without a new trial by email.
    const again = await w.signIn('a@b.co');
    expect((await again.get('/api/me')).data.user.email).toBe('a@b.co');
  });

  it('with protection active it waits like a loosening, and can be cancelled', async () => {
    const w = new World();
    const web = await w.signIn('a@b.co');
    await web.onboard();
    await web.send('POST', '/api/lock', { firstName: 'Alex', understood: true });
    const ea = await web.connect();
    await ea.sync();
    const r = await web.send('POST', '/api/account/delete', { confirm: 'DELETE' });
    expect(typeof r.data.at).toBe('number');
    expect((await web.get('/api/me')).data.user.deletionAt).toBe(r.data.at);
    await web.send('POST', '/api/account/delete/cancel');
    w.t = r.data.at + 1;
    await runScheduled(w.env, { waitUntil: (p) => void w.pending.push(p) });
    expect((await web.get('/api/me')).status).toBe(200);

    const r2 = await web.send('POST', '/api/account/delete', { confirm: 'DELETE' });
    w.t = r2.data.at + 1;
    await runScheduled(w.env, { waitUntil: (p) => void w.pending.push(p) });
    await Promise.all(w.pending);
    expect((await web.get('/api/me')).status).toBe(401);
  });
});
