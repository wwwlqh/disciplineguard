<div align="center">

<img src="web/public/mark.svg" width="64" alt="DisciplineGuard">

# DisciplineGuard

<a href="https://disciplineguard.leowqiheng.workers.dev"><img src="docs/hero.gif" width="880" alt="Your trading rules, counted on every trade. A Buy past the day's trade limit goes straight through, the count goes to 4 of 3, and a note says: 'Trade 4 today. Your limit is 3. It counts toward today.'"></a>

<p>
<a href="https://disciplineguard.leowqiheng.workers.dev/start"><img src="https://img.shields.io/badge/Start_free_→-5EEAD4?style=for-the-badge" alt="Start free" height="36"></a>&nbsp;&nbsp;<a href="https://disciplineguard.leowqiheng.workers.dev/downloads/DisciplineGuard-Setup.exe"><img src="https://img.shields.io/badge/Windows_app-E2E8F0?style=for-the-badge" alt="Download the Windows app" height="36"></a>&nbsp;&nbsp;<a href="https://disciplineguard.leowqiheng.workers.dev/help/tradingview"><img src="https://img.shields.io/badge/Browser_extension-E2E8F0?style=for-the-badge" alt="Browser extension" height="36"></a>
</p>

**Works with** &nbsp; <img src="web/public/brands/mt5.png" height="18" align="center" alt=""> MetaTrader 5 <sub>Windows app</sub> &nbsp;·&nbsp; <img src="web/public/brands/tv.png" height="18" align="center" alt=""> TradingView <sub>website</sub> &nbsp;·&nbsp; <img src="web/public/brands/pm.png" height="18" align="center" alt=""> Polymarket <sub>website</sub> &nbsp;·&nbsp; <img src="web/public/brands/kalshi.png" height="18" align="center" alt=""> Kalshi <sub>website</sub>

</div>

<br>

## No journal to fill in. No lockout.

| | What it does | You decide? |
|---|---|---|
| **DisciplineGuard** | **Counts every trade by itself, as you place it, and marks one that goes past your rules** | **Always. Nothing is blocked** |
| Lockout tools | Lock you out after the limit | No |
| Journals | You write each trade up yourself, after | Only if you remember |

## Three steps. Then you trade.

<img src="docs/how.gif" width="880" alt="Set your rules by ticking what costs you, connect your platform with one click on Allow, then trade as usual: every trade goes straight through and is counted, and one that goes past a rule gets a short note.">

## Ten rules. Your numbers.

<img src="docs/rules.png" width="880" alt="The ten rules: max trades per day, max trades per hour, too fast, trading hours, max position size, max risk per trade, cooldown after a loss, daily loss limit, stop loss required, no bigger after a loss.">

Tightening a rule applies now. **Loosening one waits until your next day reset**, so a bad moment can't switch it off. Plus **Take a break** (15 minutes to 30 days), **Done for today**, and a morning check-in to tighten today's limits only.

A trade that goes past a rule shows a short note on the chart ("Trade 4 today. Your limit is 3. It counts toward today."), lands on Today and in Stats, and sends a Windows notification.

## Your platform, on your computer

<img src="docs/platforms.png" width="880" alt="MetaTrader 5 works with the Windows app, phone app and web terminal (phone and web terminal trades count while MT5 runs on a computer or VPS); Mac app not yet. TradingView, Polymarket and Kalshi work on the website in Chrome or Edge; their phone apps aren't supported. MetaTrader 4 is coming later.">

- **MetaTrader 5:** the Windows app sets MT5 up for you: no files to copy, nothing to type. Every trade on the account counts: MetaTrader itself, F9, one-click, the phone app and the web terminal. Prop firm and broker accounts.
- **TradingView:** the order panel, one-click Buy/Sell, and trades placed anywhere else on the chart (read from the positions table).
- **Polymarket:** Buy in the trade box (market orders).
- **Kalshi:** Submit Buy and Buy with 1-Click (dollars or shares).

## What it never does

- **It never holds, pauses or blocks an order.** Every trade goes straight through.
- **It never makes an order wait for our server.** Rules are checked on your computer.
- **We never see your broker password**, and never open, change or close a trade.

## Get started

1. Click **[Start free](https://disciplineguard.leowqiheng.workers.dev/start)**, tick where you trade and set your rules. Sign in with Google or email to save them.
2. Connect your platform. The last step shows each one live as it connects:
   - **MT5:** download the [Windows app](https://disciplineguard.leowqiheng.workers.dev/downloads/DisciplineGuard-Setup.exe), click **Allow**, tick your MetaTrader, then **Connect**.
   - **TradingView, Polymarket or Kalshi:** [install the browser extension](https://disciplineguard.leowqiheng.workers.dev/help/tradingview) (download, unzip, *Load unpacked*), then **Sign in** and **Allow**.
3. Trade.

**Free for everyone: every rule, on 1 trading account.** TradingView Paper Trading doesn't count toward it. Plans for more accounts are coming.

> The Windows app isn't code-signed yet, so Windows may say *"Windows protected your PC"* the first time. Click **More info → Run anyway**.

<div align="center">
<br>
<a href="https://disciplineguard.leowqiheng.workers.dev/start"><img src="https://img.shields.io/badge/Start_free_→-5EEAD4?style=for-the-badge" alt="Start free" height="36"></a>
<br><br>
<sub>See every time you go past your own rules. Counted on every trade.</sub>
</div>

---

## For developers

The whole product is open source in this repository.

```
server/            Cloudflare Worker: API, sync, sign-in, jobs (TypeScript, D1)
web/               The web app and site (React, Vite)
packages/core/     The rules engine, shared by the server, web and extension
clients/mt5/       The MT5 Expert Advisor (MQL5)
clients/windows/   The Windows app that installs and bridges the EA (Tauri, Rust)
clients/extension/ The browser extension for TradingView, Polymarket and Kalshi (Chrome and Edge, MV3)
```

```bash
npm install
npm test
npm run typecheck
```

Run locally with `npm run dev -w server` and `npm run dev -w web`. The EA compiles with `clients/mt5/compile.ps1`. `clients/mt5/tests/core-tests.ps1` checks the EA's rules engine against the TypeScript one. Releases are built by the **Windows app** workflow in GitHub Actions.

How it behaves is in [SPEC.md](SPEC.md), what it says and shows is in [EXPERIENCE.md](EXPERIENCE.md), and what's next is in [PHASES.md](PHASES.md).

The code is public to read, not to reuse: see [LICENSE](LICENSE).

<div align="center">
<br>
<sub>Built by a trader, for traders who know their rules and want to keep them.</sub>
</div>
