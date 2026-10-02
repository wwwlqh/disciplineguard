// End to end: the built extension in Chromium, the real server handler (server/dev.ts, empty database), and a
// stand-in Kalshi market (test/fixture-kalshi.html served at the Kalshi URL). Usage: node test/e2e-kalshi.ts
import { check, press as pressAt, runE2E, until } from './e2e-setup.ts';

await runE2E('kalshi', 'https://kalshi.com/**', 'fixture-kalshi.html', async ({ ctx, cookie, call, cache }) => {
  // The market page: the extension reads the signed-in account, registers it and syncs the rules.
  const page = await ctx.newPage();
  await page.goto('https://kalshi.com/markets/kxrainnyc/rain-in-nyc/kxrainnyc-26oct02');
  await until(async () => (await cache())?.status === 'on' && Object.keys((await cache()).accounts).length === 1, 'extension On');
  const me = (await call('GET', '/api/me', undefined, cookie)).data;
  check(me.accounts.length === 1 && me.accounts[0].platform === 'tv' && me.accounts[0].last3 === '0de', 'the Kalshi account is protected (last 3 only)');

  const pillText = () => page.locator('dg-pill .text').textContent();
  await until(async () => (await pillText())?.startsWith('On · 0 of 1 bets'), 'the pill shows On and the bet meter');
  check(true, 'the pill shows On and the bet meter');

  const sent = () => page.evaluate(() => (window as any).sent as number);
  const press = (sel: string) => pressAt(page, sel);
  const pauseOpen = () => page.locator('dg-pause dialog[open]').count();
  const today = () => call('GET', '/api/today', undefined, cookie).then((r) => r.data);

  // Bet 1 keeps the rule: Review Buy, then Submit Buy, straight through and counted with what the panel said.
  await press('#advance');
  check((await pauseOpen()) === 0 && (await page.locator('#submit').isVisible()), 'Review Buy is never paused');
  await press('#submit');
  check((await sent()) === 1 && (await pauseOpen()) === 0, 'a bet within the rules goes straight through');
  const entry = await until(async () => (await cache())?.snapshot?.entries?.[0], 'the entry reaches the server');
  check(entry.symbol === 'New York:Yes' && entry.size === 10, 'the bet is read from the panel: market, outcome and dollars');

  // Picking an outcome is never held.
  await press('#no');
  await press('#yes');
  check((await pauseOpen()) === 0, 'picking Yes or No is never paused');

  // Bet 2 breaks R1: held at Submit Buy, the page never sees the click. Esc skips; Back is never paused.
  await press('#advance');
  await press('#submit');
  check((await sent()) === 1 && (await pauseOpen()) === 1, 'bet 2 is held with the pause at Submit Buy');
  check((await page.locator('dg-pause .head').textContent())?.includes('trade 2 today'), 'the pause names the rule');
  await page.keyboard.press('Escape');
  check((await pauseOpen()) === 0 && (await sent()) === 1, 'Esc skips; nothing sent');
  await press('#back');
  check((await pauseOpen()) === 0 && (await page.locator('#advance').isVisible()), 'Back is never paused');

  // Selling is never paused.
  await press('#sell');
  await press('#advance');
  await press('#submit');
  check((await sent()) === 2 && (await pauseOpen()) === 0, 'a sell goes straight through');
  await press('#buy');

  // With 1-Click on, the main button places the bet: held, and so is Enter in the amount field.
  await page.evaluate(() => (window as any).setOneClick(true));
  await press('#advance');
  check((await pauseOpen()) === 1 && (await sent()) === 2, 'Buy with 1-Click is held with the pause');
  await page.keyboard.press('Escape');
  await page.locator('#amount').focus();
  await page.keyboard.press('Enter');
  check((await pauseOpen()) === 1 && (await sent()) === 2, 'Enter in the amount field is held too');
  await page.keyboard.press('Escape');

  // Shares are read as shares × the price: 20 at 40¢ is $8. A limit order isn't read yet, so it passes.
  await page.evaluate(() => (window as any).setUnits('Shares', '20'));
  await press('#advance');
  check((await pauseOpen()) === 1, 'a bet in shares is held');
  await page.keyboard.press('Escape');
  const p = await until(async () => (await today()).pauses.find((x: any) => x.size === 8), 'the shares bet reaches the server');
  check(p.symbol === 'New York:Yes', 'a bet in shares is sized in dollars (20 × 40¢ = $8)');
  await page.evaluate(() => (window as any).setUnits('Limit', '20'));
  await press('#advance');
  check((await pauseOpen()) === 0 && (await sent()) === 3, "a limit order passes (it isn't read yet)");
  await page.evaluate(() => (window as any).setUnits('Dollars', '10'));

  // Place anyway after the wait, then the trader's own click sends it.
  await press('#advance');
  await page.waitForTimeout(2300);
  await page.locator('dg-pause button.place').click();
  check((await pauseOpen()) === 0 && (await sent()) === 3, 'Place anyway closes the pause and does not click for the trader');
  await press('#advance');
  check((await sent()) === 4 && (await pauseOpen()) === 0, 'the next click on Buy with 1-Click places it');

  // The portfolio drops from $12.35K to $12.20K: $150, past the $100 limit. The server is told and the next bet is paused.
  await page.evaluate(() => (window as any).setPortfolio('$12.20K'));
  const acct = await until(async () => {
    const d = await today();
    return d.accounts[0]?.inLimit && d.accounts[0];
  }, 'the daily loss limit reaches the server');
  check(acct.inLimit, 'reaching the daily loss limit is reported (portfolio read from the navbar)');
  await press('#advance');
  check((await pauseOpen()) === 1 && (await sent()) === 4, 'after the loss limit, a new bet is paused');
  check(/down \$150.*daily limit is \$100/.test((await page.locator('dg-pause .head').textContent()) ?? ''), 'the pause names the daily loss limit');
  await page.keyboard.press('Escape');
});
