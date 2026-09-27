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

const outside = (ticket: number) => ({ type: 'entry', ticket, symbol: 'EURUSD', side: 'buy', size: 1, source: 'outside', label: 'MT mobile', violations: ['R1'] });

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
    await ea.sync([outside(1)]);
    w.t += 5 * MIN;
    await ea.sync([outside(2), outside(3)]);
    let r = await poll(cursor);
    expect(r.alerts.map((a: any) => a.kind)).toEqual(['outside']);
    expect(r.alerts[0].text).toContain('placed on MT mobile went past "Max trades per day"');
    w.t += 26 * MIN;
    await cron();
    r = await poll(r.cursor);
    expect(r.alerts.map((a: any) => a.text)).toContain('2 more outside trades went past a rule since 10:00.');
  });

  it('placed anyway is off by default; the trader can turn it on', async () => {
    const { web, ea, poll, cursor } = await setup();
    const pause = (id: string) => ({ type: 'pause', pauseId: id, rules: ['R1'], title: 'R1', decision: 'place', sent: true, symbol: 'EURUSD', side: 'buy', size: 0.5 });
    await ea.sync([pause('a')]);
    expect((await poll(cursor)).alerts).toHaveLength(0);
    await web.send('PUT', '/api/alerts', { on: { placed: true } });
    await ea.sync([pause('b')]);
    const r = await poll(cursor);
    expect(r.alerts.map((a: any) => a.text)).toEqual(['Buy 0.5 EURUSD past "Max trades per day".']);
  });

  it('the summary goes 60 minutes after the last trade', async () => {
    const { w, ea, poll, cursor, cron } = await setup();
    await ea.sync([{ type: 'entry', ticket: 1, symbol: 'EURUSD', side: 'buy', size: 1, source: 'panel' }]);
    for (let i = 0; i < 6; i++) {
      w.t += 5 * MIN;
      await ea.sync(); // heartbeats: DisciplineGuard stayed on
    }
    await ea.sync([{ type: 'entry', ticket: 2, symbol: 'EURUSD', side: 'buy', size: 1, source: 'panel' }]);
    w.t += 45 * MIN;
    await cron();
    expect((await poll(cursor)).alerts).toHaveLength(0);
    w.t += 20 * MIN;
    await cron();
    const r = await poll(cursor);
    expect(r.alerts).toHaveLength(1);
    expect(r.alerts[0]).toMatchObject({ kind: 'summary', text: 'Today: 2 trades · 0 pauses · rules kept.' });
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
