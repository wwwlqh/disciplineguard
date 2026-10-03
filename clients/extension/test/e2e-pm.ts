// End to end: the built extension in Chromium, the real server handler (server/dev.ts, empty database), and a
// stand-in Polymarket market (test/fixture-pm.html served at the Polymarket URL). Usage: node test/e2e-pm.ts
import { check, press as pressAt, runE2E, until } from './e2e-setup.ts';

await runE2E('pm', 'https://polymarket.com/**', 'fixture-pm.html', async ({ ctx, cookie, call, cache }) => {
  // The market page: the extension reads the wallet, registers it and syncs the rules.
  const chart = await ctx.newPage();
  await chart.goto('https://polymarket.com/event/stand-in/will-it-rain');
  await until(async () => (await cache())?.status === 'on' && Object.keys((await cache()).accounts).length === 1, 'extension On');
  const me = (await call('GET', '/api/me', undefined, cookie)).data;
  check(me.accounts.length === 1 && me.accounts[0].platform === 'tv' && me.accounts[0].last3 === '0ab', 'the Polymarket wallet is protected (last 3 only)');

  const pillText = () => chart.locator('dg-pill .text').textContent();
  await until(async () => (await pillText())?.startsWith('On · 0 of 1 bets'), 'the pill shows On and the bet meter');
  check(true, 'the pill shows On and the bet meter');

  const sent = () => chart.evaluate(() => (window as any).sent as number);
  const press = (sel: string) => pressAt(chart, sel);
  const pauseOpen = () => chart.locator('dg-pause dialog[open]').count();

  // Bet 1 keeps the rule: straight through, and counted.
  await press('#submit');
  check((await sent()) === 1 && (await pauseOpen()) === 0, 'a bet within the rules goes straight through');
  await until(async () => (await cache())?.snapshot?.entries?.length === 1, 'the entry reaches the server');

  // Picking an outcome is never held.
  await press('#no');
  await press('#yes');
  check((await pauseOpen()) === 0, 'picking Yes or No is never paused');

  // Bet 2 breaks R1: held, the page never sees the click. Esc skips.
  await press('#submit');
  check((await sent()) === 1 && (await pauseOpen()) === 1, 'bet 2 is held with the pause');
  check((await chart.locator('dg-pause .head').textContent())?.includes('trade 2 today'), 'the pause names the rule');
  await chart.keyboard.press('Escape');
  check((await pauseOpen()) === 0 && (await sent()) === 1, 'Esc skips; nothing sent');

  // Selling is never paused.
  await press('#sell');
  await press('#submit');
  check((await sent()) === 2 && (await pauseOpen()) === 0, 'a sell goes straight through');
  await press('#buy');

  // Deposit is never paused.
  await chart.evaluate(() => (document.getElementById('submit')!.textContent = 'Deposit'));
  await press('#submit');
  check((await pauseOpen()) === 0, 'Deposit is never paused');
  await chart.evaluate(() => (document.getElementById('submit')!.textContent = 'Buy Yes'));

  // Place anyway after the wait, then the trader's own click sends it.
  await press('#submit');
  await chart.waitForTimeout(2300);
  await chart.locator('dg-pause button.place').click();
  check((await pauseOpen()) === 0 && (await sent()) === 2, 'Place anyway closes the pause and does not click for the trader');
  await press('#submit');
  check((await sent()) === 3 && (await pauseOpen()) === 0, 'the next click on Buy places it');

  // The portfolio drops 150 from where the day started: past the 100 limit. The server is told and the next bet is paused.
  await chart.evaluate(() => (window as any).setPortfolio(850));
  const acct = await until(async () => {
    const d = (await call('GET', '/api/today', undefined, cookie)).data;
    return d.accounts[0]?.inLimit && d.accounts[0];
  }, 'the daily loss limit reaches the server');
  check(acct.inLimit, 'reaching the daily loss limit is reported');
  await press('#submit');
  check((await pauseOpen()) === 1 && (await sent()) === 3, 'after the loss limit, a new bet is paused');
  check(/down \$150.*daily limit is \$100/.test((await chart.locator('dg-pause .head').textContent()) ?? ''), 'the pause names the daily loss limit');
  await chart.keyboard.press('Escape');
});
