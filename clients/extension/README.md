# DisciplineGuard for Chrome and Edge

The browser extension that pauses new TradingView trades that break the trader's rules (SPEC §9.1, EXPERIENCE §6).
The trader clicks **Sign in**, presses **Allow** on the website and opens a chart. Nothing to type.

| File | What it is |
|---|---|
| `src/content.ts` | On TradingView charts: holds a guarded click in the capture phase, runs the rules from `@dg/core` on the cached rules, shows the pause, and after Place anyway lets the trader's own next click through once. Anything it can't read passes. |
| `src/tv.ts` | Everything TradingView-specific, as data (`PAGE`, the page config) plus the readers for the order, account and positions. |
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

`npm run e2e --workspace clients/extension` runs the built extension in Chromium against the real server handler
(`server/dev.ts`, empty database) and a stand-in chart (`test/fixture.html`) served at the TradingView URL: sign-in,
account registration, straight-through trades, the held trade, skip, closes never paused, and Place anyway.

On real TradingView: `spikes/tv-runner/live.js` drives a signed-in Paper Trading chart with a live-test build (see its header). Paper Trading only, never a real broker.
