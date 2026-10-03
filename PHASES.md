# DisciplineGuard: Build plan

What gets built, in order. No dates and no user-number gates: a phase ends when its code is built and working.
Behavior is in SPEC.md, screens and words in EXPERIENCE.md.

**Count only (3 Oct 2026).** DisciplineGuard no longer pauses anything. Every trade goes straight through and is counted against the trader's rules; a trade that goes past a rule is marked, with a note and an alert. Removed: the pause and its settings (wait, growing wait, type to confirm, skip card, keyboard place anyway), the practice pause, reason chips, Close outside trades, and the MT5 order panel (MT5 trades are counted from the account's history).

## End of every phase

1. **Review** the changes for bugs and security (`/code-review`, `/security-review`) and check the safety invariants (SPEC §1.3).
2. **Clean up**: no dead code, and no doc that describes something the code no longer does.
3. **Green**: `npm test`, `npm run typecheck`, the "Windows app" workflow, and the EA compiles with 0 errors.

A confirmed breach of safety invariants 1–3 stops feature work until it is fixed.

## Phase 1A: MT5

**Built**
- Server: email sign-in (link + code), sync, events, coverage, jobs, security basics (SPEC §10.9).
- Web app: onboarding, Today, Rules, Devices, Stats, Account, owner dashboard.
- MT5 EA: status panel, counting from the account's history, the rule-break note (SPEC §7), setup checklist.
- Windows app: sign in with Allow, find and connect terminals, the file bridge, auto-update of the app and the EA (SPEC §9.5).
- Help center: one short article per status line and setup step; the EA, the tray and Devices link to it.

**Left**
- Code signing, so Windows shows no warning (the founder adds the Azure secrets, clients/windows/README.md). Releases already publish unsigned.

## Phase 1B: TradingView and self-serve

**Built**
- Alerts and end-of-session summaries as Windows notifications from the app (SPEC §11). No Telegram.
- The calibration prompt on Today.
- Full checkout: `/plans` with monthly and yearly, cancel, switch plan, refund request, billing links, the renewal reminder and the plan-state banners (SPEC §12).
- Self-serve export (emailed ZIP link) and deletion (SPEC §12.6, §13.4).

**Left**
- TradingView extension (clients/extension): works on TradingView Paper Trading (spike Q1a passed 27 Sep 2026), with the pill, counting from the positions table, closes, R8 from the Account Manager and the signed remote page config. Left: the founder's check on one real broker account, self-tests and health events for the page config, and the coach card. MT4 if wanted.
- The founder, only when paid plans open: Lemon Squeezy products, their redirect to `/plans?paid`, and the secrets in server/wrangler.toml.

## Phase 2: Public launch

MT5 and TradingView first; other platforms wait for Phase 3.

**Built**
- Launch website: one page at `/` for signed-out visitors (how it works, comparison, platforms, pricing).
- Google sign-in. The founder: a Google Cloud OAuth client and its two secrets (server/wrangler.toml).
- No extension store (28 Sep 2026): each release publishes the extension zip; Help → Install the TradingView extension covers Load unpacked.
- Status and changelog at `/status`: a live server check; the TradingView and MT5 lines and the changelog are edited by hand in web/src/pages/Status.tsx.
- Session check-in on Today: tighten for today only (max trades, loss limit), in the signed rules so MT5 and TradingView count against it until the next reset. No mood question.
- Take a break for 1, 7 or 30 days (Account): every trade until then is marked as past a rule.
- Free for everyone (28 Sep 2026): no trial, 1 trading account across MT5 and TradingView (Paper Trading not counted), every rule. The EA and the TradingView pill name the account limit. Paid plans priced by number of accounts come later; `/plans` and the billing code stay but aren't linked (SPEC §12).

**Not now** (the founder, 27 Sep 2026): the accountability partner, the affiliate program, referral credit, and the reflection in the summary.

## Phase 3: Grow

Independent bets, in the order the founder picks.

| Bet | What it is |
|---|---|
| Discipline report | Worst days, limit overshoots and size vs. plan, after a minimum sample (EXPERIENCE §5.7) |
| Prop firm mode | Firm presets the user confirms, distance to breach, equity-based and trailing drawdown |
| Longer delays | Loosening delays of 3 or 7 days, a "day off" rule, "stop after giving back 50% of today's peak profit" (counted, never enforced) |
| More TradingView paths | Read the stop loss of DOM and chart-trading orders (they are counted from the positions table already) |
| One account on TradingView and MT | Matching the same trade across platforms |
| Web platforms | DXtrade, Match-Trader, TradeLocker, cTrader web, Tradovate web, TopstepX web, as extension adapters |
| Native platforms | NinjaTrader, cTrader desktop, as adapters the Windows app installs (SPEC §9.0) |
| Crypto | Binance, Bybit, Hyperliquid on the web. Needs its own daily-loss definition. Polymarket and Kalshi are done |
| Count any button (web) | The trader clicks a site's Buy button once to have it counted. Count and time rules only |
| Coach and community licenses | Group plans with an owner view of totals only, opt-in per member |
| Localization, regional pricing, journal export, R6 on TradingView | |

## Phase 4: Expand

- Count any button for Windows apps: only for apps users ask for.
- Betting, only if a paid smoke test works.

## Triggers that reopen the plan

| Trigger | Response |
|---|---|
| TradingView objects (terms notice, trademark complaint, store takedown) | MT leads. TradingView users are told in the product |
| MetaQuotes restricts EAs or start-up configurations | Web-platform bets move to the front |
| Antivirus or SmartScreen flags the Windows app | Submit to the vendors and publish the steps to allow it |
| The payment provider closes the account | Switch to Paddle. Clients keep counting until `valid_until` + 7 days (SPEC §10.5) |
| A safety invariant breach | Feature work stops until it is fixed |
