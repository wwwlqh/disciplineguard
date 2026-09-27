# DisciplineGuard: Build plan

What gets built, in order. No dates and no user-number gates: a phase ends when its code is built and working.
Behavior is in SPEC.md, screens and words in EXPERIENCE.md.

## End of every phase

1. **Review** the changes for bugs and security (`/code-review`, `/security-review`) and check the safety invariants (SPEC §1.3).
2. **Clean up**: no dead code, and no doc that describes something the code no longer does.
3. **Green**: `npm test`, `npm run typecheck`, the "Windows app" workflow, and the EA compiles with 0 errors.
4. **Publish** the client source: `scripts/publish-public.sh` (public repo `wwwlqh/disciplineguard-clients`).

A confirmed breach of safety invariants 1–3 stops feature work until it is fixed.

## Phase 1A: MT5

**Built**
- Server: email sign-in (link + code), sync, events, coverage, jobs, security basics (SPEC §10.9).
- Web app: onboarding, Today, Rules, Devices, Stats, Account, owner dashboard.
- MT5 EA: panel, the full pause system (SPEC §7), status line, setup checklist.
- Windows app: sign in with Allow, find and Protect terminals, the file bridge, auto-update of the app and the EA (SPEC §9.5).
- Early-bird checkout: $79 a year, offered when the trial ends.
- Help center: one short article per status line and setup step; the EA, the tray and Devices link to it.

**Left**
- First release: code signing and the release workflow (the founder adds the secrets, clients/windows/README.md).

## Phase 1B: TradingView and self-serve

**Built**
- Alerts and end-of-session summaries as Windows notifications from the app (SPEC §11). No Telegram.
- Pause: reason chips, the save-reasons question on Today, reasons in Stats, the calibration prompt.
- Full checkout: `/plans` with monthly and yearly, cancel, switch plan, refund request, billing links, the renewal reminder and the plan-state banners (SPEC §12).
- Self-serve export (emailed ZIP link) and deletion (SPEC §12.6, §13.4).

**Left**
- TradingView extension, once spike Q1a passes. MT4 if wanted.
- The founder: Lemon Squeezy products (yearly, monthly, early-bird), their redirect to `/plans?paid`, and the secrets in server/wrangler.toml.

## Phase 2: Public launch

- Accountability partner (SPEC §11.3–11.4). Its channel to the partner's phone is the founder's call. Optional MT push for the trader.
- Public Chrome listing (the same store item) and an Edge listing.
- Launch website, comparison page, demo videos, status page and changelog.
- Google sign-in.
- Session check-in, reflection in the summary, take a break for 1, 7 or 30 days.
- Affiliate program for educators, and referral credit (give a month, get a month).

## Phase 3: Grow

Independent bets, in the order the founder picks.

| Bet | What it is |
|---|---|
| Discipline report | Worst days, limit overshoots and size vs. plan, after a minimum sample (EXPERIENCE §5.8) |
| Prop firm mode | Firm presets the user confirms, distance to breach, equity-based and trailing drawdown |
| Stronger enforcement | Opt-in hard lock after the daily limit, loosening delays of 3 or 7 days, a "day off" rule, "pause after giving back 50% of today's peak profit" |
| More TradingView paths | DOM ladder, chart trading, dragging order lines |
| One account on TradingView and MT | Matching the same trade across platforms |
| Web platforms | DXtrade, Match-Trader, TradeLocker, cTrader web, Tradovate web, TopstepX web, as extension adapters |
| Native platforms | NinjaTrader, cTrader desktop, as adapters the Windows app installs (SPEC §9.0) |
| Prediction markets and crypto | Kalshi, Polymarket, Binance, Bybit, Hyperliquid on the web. Needs its own daily-loss definition |
| Guard any button (web) | The trader clicks a site's Buy button once to guard it. Count and time rules only |
| Mobile shield | When a limit is reached, the phone shields the MT and TradingView mobile apps |
| Coach and community licenses | Group plans with an owner view of totals only, opt-in per member |
| Localization, regional pricing, journal export, R6 on TradingView | |

## Phase 4: Expand

- Mobile pause app for crypto and betting apps.
- Guard any button for Windows apps: only for apps users ask for.
- Betting, only if a paid smoke test works.

## Triggers that reopen the plan

| Trigger | Response |
|---|---|
| TradingView objects (terms notice, trademark complaint, store takedown) | MT leads. TradingView users are told in the product |
| MetaQuotes restricts EAs or start-up configurations | Web-platform bets move to the front |
| Antivirus or SmartScreen flags the Windows app | Submit to the vendors and publish the steps to allow it |
| The payment provider closes the account | Switch to Paddle. Clients keep enforcing until `valid_until` + 7 days (SPEC §10.5) |
| A safety invariant breach | Feature work stops until it is fixed |
