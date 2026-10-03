// Trader alerts shown by the Windows app (SPEC §11).
import { describe, expect, it } from 'vitest';
import { MIN } from '@dg/core';
import { runScheduled } from '../src/jobs.ts';
import { World, type Web } from './harness.ts';

async function setup() {
  const w = new World();
  const web = await w.signIn('a@b.co');
  await web.onboard({ rules: { R1: { on: true, max: 5 }, R8: { on: true, restHours: 0, allAccounts: false } } });
  const ea = await web.connect();
  await ea.sync(); // the EA is running: coverage starts
  const poll = async (after?: number) => (await w.call('POST', '/v1/desktop/alerts', { after }, { authorization: `Bearer ${web.desktopToken}` })).data;
  const cursor = (await poll()).cursor as number;
  const cron = async () => {
    await runScheduled(w.env, { waitUntil: (p) => void w.pending.push(p) });
    await Promise.all(w.pending);
  };
  return { w, web, ea, poll, cursor, cron };
}

const broke = (ticket: number, violations = ['R1']) => ({ type: 'entry', ticket, symbol: 'EURUSD', side: 'buy', size: 1, source: 'history', label: 'mobile', violations });

describe('alerts (SPEC §11.2)', () => {
  it('the app gets new alerts after its cursor, and a new install does not replay old ones', async () => {
    const { ea, poll, cursor } = await setup();
    await ea.sync([{ type: 'limit_reached', loss: 310, limit: 300 }]);
    await ea.sync([{ type: 'limit_reached', loss: 320, limit: 300 }]);
    const r = await poll(cursor);
    expect(r.alerts).toHaveLength(1);
    expect(r.alerts[0]).toMatchObject({ kind: 'limit', title: 'Daily loss limit reached' });
    expect(r.alerts[0].text).toContain('−$310 of $300');
    expect((await poll(r.cursor)).alerts).toHaveLength(0);
    expect((await poll()).alerts).toHaveLength(0);
  });

  it('one message per alert per 30 minutes, then one roll-up', async () => {
    const { w, ea, poll, cursor, cron } = await setup();
    await ea.sync([broke(1)]);
    w.t += 5 * MIN;
    await ea.sync([broke(2), broke(3)]);
    let r = await poll(cursor);
    expect(r.alerts.map((a: any) => a.kind)).toEqual(['broke']);
    expect(r.alerts[0]).toMatchObject({ title: 'A trade went past your rule', text: 'Buy 1 EURUSD on your phone went past "Max trades per day". It counts toward today.' });
    w.t += 26 * MIN;
    await cron();
    r = await poll(r.cursor);
    expect(r.alerts.map((a: any) => a.text)).toContain('2 more trades went past a rule since 10:00.');
  });

  it('a trade after the daily loss limit has its own alert', async () => {
    const { ea, poll, cursor } = await setup();
    await ea.sync([broke(4, ['R8', 'R1'])]);
    const r = await poll(cursor);
    expect(r.alerts.map((a: any) => [a.kind, a.title])).toEqual([['after_limit', 'Trade after your daily loss limit']]);
  });

  it('the rule-break alert can be turned off, and the old "outside" choice carries over', async () => {
    const { web, ea, poll, cursor } = await setup();
    await web.send('PUT', '/api/alerts', { on: { broke: false } });
    await ea.sync([broke(5)]);
    expect((await poll(cursor)).alerts).toHaveLength(0);
    const { alertPrefs } = await import('../src/alerts.ts');
    expect(alertPrefs(JSON.stringify({ on: { outside: false } })).on.broke).toBe(false);
  });

  it('a trade within the rules sends no alert', async () => {
    const { ea, poll, cursor } = await setup();
    await ea.sync([{ type: 'entry', ticket: 6, symbol: 'EURUSD', side: 'buy', size: 1, source: 'history', violations: [] }]);
    expect((await poll(cursor)).alerts).toHaveLength(0);
  });

  it('the summary goes 60 minutes after the last trade', async () => {
    const { w, ea, poll, cursor, cron } = await setup();
    await ea.sync([{ type: 'entry', ticket: 1, symbol: 'EURUSD', side: 'buy', size: 1, source: 'click' }]);
    for (let i = 0; i < 6; i++) {
      w.t += 5 * MIN;
      await ea.sync(); // heartbeats: DisciplineGuard stayed on
    }
    await ea.sync([{ type: 'entry', ticket: 2, symbol: 'EURUSD', side: 'buy', size: 1, source: 'click' }]);
    w.t += 45 * MIN;
    await cron();
    expect((await poll(cursor)).alerts).toHaveLength(0);
    w.t += 20 * MIN;
    await cron();
    const r = await poll(cursor);
    expect(r.alerts).toHaveLength(1);
    expect(r.alerts[0]).toMatchObject({ kind: 'summary', text: 'Today: 2 trades · 0 past a rule · rules kept.' });
  });

  it('protection off is alerted after 10 minutes unless the account is covered again', async () => {
    const { w, ea, poll, cursor, cron } = await setup();
    await ea.sync([{ type: 'protection_off', reason: 'removed' }]);
    w.t += 11 * MIN;
    await cron();
    const r = await poll(cursor);
    expect(r.alerts.map((a: any) => a.kind)).toEqual(['off']);
    expect(r.alerts[0].title).toMatch(/^DisciplineGuard is off on MT5/);
  });

  it('a test alert reaches the app', async () => {
    const { web, poll, cursor } = await setup();
    await (web as Web).send('POST', '/api/alerts/test');
    expect((await poll(cursor)).alerts[0]).toMatchObject({ kind: 'test' });
  });
});
