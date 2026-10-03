// End to end: the built extension in Chromium, the real server handler (server/dev.ts, empty database), and a
// stand-in TradingView chart (test/fixture.html served at the TradingView URL). Usage: npm run e2e
import { check, press as pressAt, runE2E, until } from './e2e-setup.ts';

await runE2E('tv', 'https://www.tradingview.com/**', 'fixture.html', async ({ ctx, cookie, call, cache }) => {
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
  const press = (sel: string) => pressAt(chart, sel);
  const note = () => chart.locator('dg-note .note.on').count();
  const noteHead = () => chart.locator('dg-note .head').textContent();
  const today = () => call('GET', '/api/today', undefined, cookie).then((r) => r.data);

  // Trade 1 keeps the rule: straight through, counted, no note.
  await press('#submit');
  check((await sent()) === 1 && (await note()) === 0, 'a trade within the rules goes straight through, with no note');
  await until(async () => (await cache())?.snapshot?.entries?.length === 1, 'the entry reaches the server');

  // Trade 2 breaks R1: it still goes straight through, and is counted as a rule break with a note.
  await press('#submit');
  check((await sent()) === 2, 'a trade that breaks a rule goes straight through too (never held)');
  check((await note()) === 1 && (await noteHead())?.includes('Trade 2 today. Your limit is 1.'), 'a note says which rule it broke');
  check(!(await chart.locator('dg-pause').count()), 'there is no pause on the page');
  const t2 = await until(async () => {
    const d = await today();
    return d.broken.length === 1 && d;
  }, 'the rule break reaches the server');
  check(t2.broken[0].violations[0] === 'R1' && t2.meters.breaksToday === 1, 'the server counts it as a rule break of R1');

  // Closing is never counted as an entry.
  let closed = false;
  await chart.exposeFunction('dgClosed', () => (closed = true));
  await chart.evaluate(() => document.getElementById('close')!.addEventListener('click', () => (window as any).dgClosed()));
  await press('#close');
  check(closed, 'a close goes straight through');

  const d3 = await until(async () => {
    const d = await today();
    return d.meters.tradesToday === 2 && d;
  }, 'two trades counted');
  check(d3.meters.tradesToday === 2, 'two trades counted today (the close is not one)');

  // A trade placed elsewhere appears in the positions table: counted, and over R1.
  // The positions table is read every 2 s; let it read the table as it is first.
  await chart.waitForTimeout(4500);
  await chart.evaluate(() => (window as any).setPosition('ETHUSD', 'sell', 2));
  const out = await until(async () => {
    const d = await today();
    return d.broken.find((b: any) => b.symbol === 'ETHUSD');
  }, 'the trade from the positions table reaches the server');
  check(out.side === 'sell' && out.size === 2 && out.violations.includes('R1'), 'a trade from the positions table is counted as a rule break of R1');
  check((await today()).meters.tradesToday === 3, 'trades counted at the click are not counted again from the positions table');

  // Closing it loses 50: the close and its net reach the server.
  await chart.evaluate(() => {
    (window as any).setPosition('ETHUSD', 'sell', 0);
    (window as any).setSummary(99_950, 99_950);
  });
  const close = await until(async () => (await cache())?.snapshot?.closes?.[0], 'the close reaches the server');
  check(close.net === -50 && close.size === 2, 'a close is logged with its net');

  // Floating loss takes today's loss to 110, past the 100 limit: the server is told, and the next trade breaks R8.
  await chart.evaluate(() => (window as any).setSummary(99_950, 99_890));
  const acct = await until(async () => {
    const d = await today();
    return d.accounts[0]?.inLimit && d.accounts[0];
  }, 'the daily loss limit reaches the server');
  check(acct.inLimit, 'reaching the daily loss limit is reported');
  await press('#submit');
  check((await sent()) === 3, 'after the loss limit, a new trade still goes straight through');
  check(/down \$110.*daily limit is \$100/.test((await noteHead()) ?? ''), 'the note names the daily loss limit');
});
