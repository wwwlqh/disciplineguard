# DisciplineGuard for Chrome and Edge

The browser extension that pauses new TradingView trades and Polymarket and Kalshi bets that break the trader's rules (SPEC §9.1, EXPERIENCE §6).
The trader clicks **Sign in**, presses **Allow** on the website and opens a chart. Nothing to type.

| File | What it is |
|---|---|
| `src/content.ts` | On TradingView charts: holds a guarded click in the capture phase, runs the rules from `@dg/core` on the cached rules, shows the pause, and after Place anyway lets the trader's own next click through once. Every 2 s it reads the Account Manager for outside entries, closes and the daily loss limit (loss today = the balance at the first read of the day minus equity, kept in the extension). Anything it can't read passes. |
| `src/tv.ts` | Everything TradingView-specific, as data (`PAGE`, the page config) plus the readers for the order, account, positions, balance and equity. |
| `src/bets.ts` | The bet guard shared by Polymarket and Kalshi: the same pause on a Buy, Sell never paused. Loss today = the portfolio value at the first read of the day minus now. "Stop loss required" doesn't apply. No outside-bet or close detection yet, so cooldown after a loss doesn't fire. |
| `src/content-pm.ts`, `src/pm.ts` | Polymarket: the trade box's Buy (market orders). The wallet is the account (its last 32 hex digits, the server's login limit). Portfolio value from the navbar's balances. |
| `src/content-kalshi.ts`, `src/kalshi.ts` | Kalshi: Submit Buy on the review screen (the order is read at Review Buy) and Buy with 1-Click, also by Enter. Dollars and shares (shares × price); limit orders pass for now. The signed-in user id is the account. Portfolio value from the navbar. |
| `src/watch.ts` | What changed in the positions table, and which of it the guarded paths already counted: the rest are outside entries. Closes take their net from the balance change. |
| `src/pill.ts` | The status pill and mini panel: "On · 2 of 5 trades · cooldown 4:12", Take a break, Done for today. |
| `src/pageconfig.ts` | The signed remote page config (`/tv-page.json`): a newer `PAGE` without a release, 5% of installs first for 30 minutes. Sign it with `scripts/sign-page-config.ts`; the private key stays offline in `~/.disciplineguard/page-key`. |
| `src/pause.ts` | The pause: a modal `<dialog>` in a closed shadow root. |
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
account registration, the pill, straight-through trades, the held trade, skip, closes never paused, Place anyway, an
outside entry, a close with its net, and the daily loss limit. `test/e2e-pm.ts` and `test/e2e-kalshi.ts` do the same for Polymarket and
Kalshi against `test/fixture-pm.html` and `test/fixture-kalshi.html`. `test/e2e-setup.ts` is the setup they share.

On real TradingView: `spikes/tv-runner/live.js` drives a signed-in Paper Trading chart with a live-test build (see its header). Paper Trading only, never a real broker.

