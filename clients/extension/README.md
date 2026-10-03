# DisciplineGuard for Chrome and Edge

The browser extension that counts TradingView trades and Polymarket and Kalshi bets against the trader's rules (SPEC §9.1, EXPERIENCE §6). It never holds or blocks an order.
The trader clicks **Sign in**, presses **Allow** on the website and opens a chart. Nothing to type.

| File | What it is |
|---|---|
| `src/content.ts` | On TradingView charts: reads each Buy/Sell click passively in the capture phase, counts the order with the rules it went past (`@dg/core`, cached rules) and shows the note. Every 2 s it reads the Account Manager for trades placed elsewhere, closes and the daily loss limit (loss today = the balance at the first read of the day minus equity, kept in the extension). |
| `src/tv.ts` | Everything TradingView-specific, as data (`PAGE`, the page config) plus the readers for the order, account, positions, balance and equity. |
| `src/bets.ts` | The bet counter shared by Polymarket and Kalshi: each Buy is counted, with the same note; selling isn't an entry. Loss today = the portfolio value at the first read of the day minus now. "Stop loss required" doesn't apply. No close detection yet, so cooldown after a loss doesn't fire. |
| `src/content-pm.ts`, `src/pm.ts` | Polymarket: the trade box's Buy (market orders). The wallet is the account (its last 32 hex digits, the server's login limit). Portfolio value from the navbar's balances. |
| `src/content-kalshi.ts`, `src/kalshi.ts` | Kalshi: Submit Buy on the review screen (the order is read at Review Buy) and Buy with 1-Click, also by Enter. Dollars and shares (shares × price); limit orders aren't counted yet. The signed-in user id is the account. Portfolio value from the navbar. |
| `src/watch.ts` | What changed in the positions table, and which of it was already counted at the click: the rest are trades placed elsewhere. Closes take their net from the balance change. |
| `src/pill.ts` | The status pill and mini panel: "On · 2 of 5 trades · cooldown 4:12", Take a break, Done for today. |
| `src/pageconfig.ts` | The signed remote page config (`/tv-page.json`): a newer `PAGE` without a release, 5% of installs first for 30 minutes. Sign it with `scripts/sign-page-config.ts`; the private key stays offline in `~/.disciplineguard/page-key`. |
| `src/note.ts` | The note after a trade went past a rule: a small card at the top right, in a closed shadow root. |
| `src/background.ts` | The service worker: sign-in (Allow + PKCE, like the Windows app), one connection per broker account, sync every minute, the signed rule cache, alerts as browser notifications. Tokens stay in its IndexedDB. |
| `src/popup.ts`, `src/welcome.ts` | The toolbar popup and the welcome tab. |

## Build and try it

```bash
npm run build --workspace clients/extension
```

Then `chrome://extensions` → Developer mode → **Load unpacked** → `clients/extension/dist`.
A build against a local server: `DG_API=http://localhost:8787 DG_PUBKEY=<hex from /v1/pubkey> node build.ts`.

## Tests

`npm test --workspace clients/extension`: the position diff and the page config checks.

`npm run e2e --workspace clients/extension` runs the built extension in Chromium against the real server handler
(`server/dev.ts`, empty database) and a stand-in chart (`test/fixture.html`) served at the TradingView URL: sign-in,
account registration, the pill, trades within the rules, a trade past a rule (straight through, counted, the note), closes,
a trade from the positions table, a close with its net, and the daily loss limit. `test/e2e-pm.ts` and `test/e2e-kalshi.ts` do the same for Polymarket and
Kalshi against `test/fixture-pm.html` and `test/fixture-kalshi.html`. `test/e2e-setup.ts` is the setup they share.

On real TradingView: `spikes/tv-runner/live.js` drives a signed-in Paper Trading chart with a live-test build (see its header). Paper Trading only, never a real broker.

