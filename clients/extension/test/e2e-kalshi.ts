// End to end: the built extension in Chromium, the real server handler (server/dev.ts, empty database), and a
// stand-in Kalshi market (test/fixture-kalshi.html served at the Kalshi URL). Usage: node test/e2e-kalshi.ts
import { check, press as pressAt, runE2E, until } from './e2e-setup.ts';

await runE2E('kalshi', 'https://kalshi.com/**', 'fixture-kalshi.html', async ({ ctx, cookie, call, cache }) => {
  // The market page: the extension reads the signed-in account, registers it and syncs the rules.
  const page = await ctx.newPage();
  await page.goto('https://kalshi.com/markets/kxrainnyc/rain-in-nyc/kxrainnyc-26oct02');
  await until(async () => (await cache())?.status === 'on' && Object.keys((await cache()).accounts).length === 1, 'extension On');
  const me = (await call('GET', '/api/me', undefined, cookie)).data;
  check(me.accounts.length === 1 && me.accounts[0].platform === 'tv' && me.accounts[0].last3 === '0de', 'the Kalshi account is counted (last 3 only)');

  const pillText = () => page.locator('dg-pill .text').textContent();
  await until(async () => (await pillText())?.startsWith('On · 0 of 1 bets'), 'the pill shows On and the bet meter');
  check(true, 'the pill shows On and the bet meter');

  const sent = () => page.evaluate(() => (window as any).sent as number);
  const press = (sel: string) => pressAt(page, sel);
  const note = () => page.locator('dg-note .note.on').count();
  const noteHead = () => page.locator('dg-note .head').textContent();
  const today = () => call('GET', '/api/today', undefined, cookie).then((r) => r.data);
  const counted = (n: number, what: string) => until(async () => (await today()).meters.tradesToday === n, what);

  // Bet 1 keeps the rule: Review Buy, then Submit Buy, straight through and counted with what the panel said.
  await press('#advance');
  check((await page.locator('#submit').isVisible()) && (await note()) === 0, 'Review Buy is not a bet');
  await press('#submit');
  check((await sent()) === 1 && (await note()) === 0, 'a bet within the rules goes straight through, with no note');
  const entry = await until(async () => (await cache())?.snapshot?.entries?.[0], 'the entry reaches the server');
  check(entry.symbol === 'New York:Yes' && entry.size === 10, 'the bet is read from the panel: market, outcome and dollars');

  // Picking an outcome isn't a bet.
  await press('#no');
  await press('#yes');
  check((await note()) === 0, 'picking Yes or No is not counted');

  // Bet 2 breaks R1 at Submit Buy: it still goes straight through, counted as a rule break with a note.
  await press('#advance');
  await press('#submit');
  check((await sent()) === 2, 'a bet that breaks a rule goes straight through too (never held)');
  check((await note()) === 1 && (await noteHead())?.includes('Trade 2 today'), 'a note says which rule it broke');
  await until(async () => (await today()).broken.length === 1, 'the rule break reaches the server');

  // Selling isn't a bet.
  await press('#sell');
  await press('#advance');
  await press('#submit');
  check((await sent()) === 3, 'a sell goes straight through');
  await press('#buy');
  await counted(2, 'the sell is not counted');

  // With 1-Click on, the main button places the bet, and so does Enter in the amount field: both counted.
  await page.evaluate(() => (window as any).setOneClick(true));
  await press('#advance');
  check((await sent()) === 4, 'Buy with 1-Click goes straight through');
  await counted(3, 'Buy with 1-Click is counted');
  await page.locator('#amount').focus();
  await page.keyboard.press('Enter');
  await counted(4, 'Enter in the amount field is counted too');

  // Shares are read as shares × the price: 20 at 40¢ is $8. A limit order isn't read yet, so it isn't counted.
  await page.evaluate(() => (window as any).setUnits('Shares', '20'));
  await press('#advance');
  const b = await until(async () => (await today()).broken.find((x: any) => x.size === 8), 'the shares bet reaches the server');
  check(b.symbol === 'New York:Yes', 'a bet in shares is sized in dollars (20 × 40¢ = $8)');
  await page.evaluate(() => (window as any).setUnits('Limit', '20'));
  const before = (await today()).meters.tradesToday;
  await press('#advance');
  await page.waitForTimeout(1500);
  check((await today()).meters.tradesToday === before, "a limit order isn't counted (it isn't read yet)");
  await page.evaluate(() => (window as any).setUnits('Dollars', '10'));

  // The portfolio drops from $12.35K to $12.20K: $150, past the $100 limit. The server is told; the next bet breaks R8.
  await page.evaluate(() => (window as any).setPortfolio('$12.20K'));
  const acct = await until(async () => {
    const d = await today();
    return d.accounts[0]?.inLimit && d.accounts[0];
  }, 'the daily loss limit reaches the server');
  check(acct.inLimit, 'reaching the daily loss limit is reported (portfolio read from the navbar)');
  await press('#advance');
  check(/down \$150.*daily limit is \$100/.test((await noteHead()) ?? ''), 'the note names the daily loss limit');
});
