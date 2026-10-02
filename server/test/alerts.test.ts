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

  it('close outside trades: one alert with the result instead of the outside alert', async () => {
    const { web, ea, poll, cursor } = await setup();
    const closing = (ticket: number, violations = ['R1']) => ({ ...outside(ticket), violations, autoClose: true });
    const result = (ticket: number, r: string, extra: Record<string, unknown> = {}) => ({ type: 'auto_close', ticket, result: r, violations: ['R1'], label: 'MT mobile', symbol: 'EURUSD', side: 'buy', size: 1, ...extra });
    await ea.sync([closing(5), result(5, 'closed')]);
    let r = await poll(cursor);
    expect(r.alerts).toHaveLength(1);
    expect(r.alerts[0]).toMatchObject({ kind: 'closed', title: 'Outside trade closed', text: 'A trade placed on MT mobile went past "Max trades per day". DisciplineGuard closed it.' });
    // A replay changes nothing.
    await ea.sync([result(5, 'closed')]);
    expect((await poll(r.cursor)).alerts).toHaveLength(0);
    // A failed close is sent at once, even inside the 30-minute window.
    await ea.sync([closing(6), result(6, 'failed', { reason: 'Market is closed' })]);
    r = await poll(r.cursor);
    expect(r.alerts.map((a: any) => [a.kind, a.title, a.text])).toEqual([
      ['closed', "Couldn't close an outside trade", `A trade placed on MT mobile went past "Max trades per day", and DisciplineGuard couldn't close it (Market is closed). Close it in MetaTrader.`],
    ]);
    // A stop loss added in time: the usual outside alert, once the EA knows.
    await ea.sync([closing(7, ['R9'])]);
    expect((await poll(r.cursor)).alerts).toHaveLength(0);
    await ea.sync([result(7, 'kept', { violations: ['R9'] })]);
    r = await poll(r.cursor);
    expect(r.alerts.map((a: any) => a.text)).toEqual(['A trade placed on MT mobile went past "Stop loss required". It counts toward today.']);
    // Turned off before it closed: the usual outside alert too (held in the 30-minute window after the one above).
    await ea.sync([closing(8), result(8, 'off')]);
    expect((await poll(r.cursor)).alerts).toHaveLength(0);
    // Unknown results are ignored, and the entry keeps waiting for a real one.
    await ea.sync([closing(9), result(9, 'exploded')]);
    // Today shows what happened to each.
    const today = (await web.get('/api/today')).data;
    expect(today.outside.map((o: any) => o.autoClose).sort()).toEqual(['closed', 'failed', 'kept', 'off', 'pending']);
  });

  it('the closed-trade alert can be turned off', async () => {
    const { web, ea, poll, cursor } = await setup();
    await web.send('PUT', '/api/alerts', { on: { closed: false } });
    await ea.sync([{ ...outside(5), autoClose: true }, { type: 'auto_close', ticket: 5, result: 'closed', violations: ['R1'] }]);
    expect((await poll(cursor)).alerts).toHaveLength(0);
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
