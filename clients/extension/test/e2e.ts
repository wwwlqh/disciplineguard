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
});
