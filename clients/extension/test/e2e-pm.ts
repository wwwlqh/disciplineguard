// End to end: the built extension in Chromium, the real server handler (server/dev.ts, empty database), and a
// stand-in Polymarket market (test/fixture-pm.html served at the Polymarket URL). Usage: node test/e2e-pm.ts
import { check, press as pressAt, runE2E, until } from './e2e-setup.ts';

await runE2E('pm', 'https://polymarket.com/**', 'fixture-pm.html', async ({ ctx, cookie, call, cache }) => {
  // The market page: the extension reads the wallet, registers it and syncs the rules.
  const chart = await ctx.newPage();
  await chart.goto('https://polymarket.com/event/stand-in/will-it-rain');
  await until(async () => (await cache())?.status === 'on' && Object.keys((await cache()).accounts).length === 1, 'extension On');
  const me = (await call('GET', '/api/me', undefined, cookie)).data;
  check(me.accounts.length === 1 && me.accounts[0].platform === 'tv' && me.accounts[0].last3 === '0ab', 'the Polymarket wallet is counted (last 3 only)');

  const pillText = () => chart.locator('dg-pill .text').textContent();
  await until(async () => (await pillText())?.startsWith('On · 0 of 1 bets'), 'the pill shows On and the bet meter');
  check(true, 'the pill shows On and the bet meter');

  const sent = () => chart.evaluate(() => (window as any).sent as number);
  const press = (sel: string) => pressAt(chart, sel);
  const note = () => chart.locator('dg-note .note.on').count();
  const noteHead = () => chart.locator('dg-note .head').textContent();
  const today = () => call('GET', '/api/today', undefined, cookie).then((r) => r.data);

  // Bet 1 keeps the rule: straight through, and counted.
  await press('#submit');
  check((await sent()) === 1 && (await note()) === 0, 'a bet within the rules goes straight through, with no note');
  await until(async () => (await cache())?.snapshot?.entries?.length === 1, 'the entry reaches the server');

  // Picking an outcome isn't a bet.
  await press('#no');
  await press('#yes');
  check((await note()) === 0, 'picking Yes or No is not counted');

  // Bet 2 breaks R1: it still goes straight through, counted as a rule break with a note.
  await press('#submit');
  check((await sent()) === 2, 'a bet that breaks a rule goes straight through too (never held)');
  check((await note()) === 1 && (await noteHead())?.includes('Trade 2 today'), 'a note says which rule it broke');
  await until(async () => (await today()).broken.length === 1, 'the rule break reaches the server');

  // Selling and Deposit aren't bets.
  await press('#sell');
  await press('#submit');
  check((await sent()) === 3, 'a sell goes straight through');
  await press('#buy');
  await chart.evaluate(() => (document.getElementById('submit')!.textContent = 'Deposit'));
  await press('#submit');
  await chart.evaluate(() => (document.getElementById('submit')!.textContent = 'Buy Yes'));
  const d = await until(async () => {
    const x = await today();
    return x.meters.tradesToday === 2 && x;
  }, 'two bets counted');
  check(d.meters.tradesToday === 2 && d.broken.length === 1, 'the sell and Deposit are not counted as bets');

  // The portfolio drops 150 from where the day started: past the 100 limit. The server is told; the next bet breaks R8.
  await chart.evaluate(() => (window as any).setPortfolio(850));
  const acct = await until(async () => {
    const x = await today();
    return x.accounts[0]?.inLimit && x.accounts[0];
  }, 'the daily loss limit reaches the server');
  check(acct.inLimit, 'reaching the daily loss limit is reported');
  await press('#submit');
  check((await sent()) === 4, 'after the loss limit, a new bet still goes straight through');
  check(/down \$150.*daily limit is \$100/.test((await noteHead()) ?? ''), 'the note names the daily loss limit');
});
