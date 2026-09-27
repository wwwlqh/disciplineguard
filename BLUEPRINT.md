# DisciplineGuard — Blueprint v4

> Scope: **TradingView (Chrome extension) + MT4 + MT5**. Business model: **14-day free trial, then subscription**.
> Structure only, no code.
>
> **Superseded where they differ** by SPEC.md, EXPERIENCE.md and PHASES.md. Biggest change since v4: MT setup is done by the DisciplineGuard Windows app (sign in, Allow, Protect), not by the trader (SPEC §9.5).

---

## 1. The Product in One Line

**Set your own trading rules → trade normally → when you break one, a popup shows you your own rule and your own note, and makes you wait a few seconds before you can continue.**

This is not the app judging the trader. It is the trader's calm self reminding their emotional self of a promise they made.

---

## 2. Why It Works (Market Position)

- Prop challenge pass rates are only about 5–14%, and one firm reported that 93.7% of its failures were daily or max drawdown breaches, which is what revenge trading and overtrading cause.
- Competitors act **too late**:
  - lockout tools (TiltGuard, EmotionLock, Fenstrom) act after the limit is hit
  - TradeCrucible notifies after the trade
  - journals (Edgewonk, TraderSync, Tradezella) analyze afterwards
- DisciplineGuard acts **at the click**, inside the platform, before the order is sent.
- Tagline: *"Lockout tools stop you after you've blown it. DisciplineGuard stops the trade that blows it."*

---

## 3. User Journey

1. **Sign up** on the website with an email → the 14-day trial starts (no card needed).
2. **Set rules** on the web dashboard, plus a personal note.
3. **Install one thing per kind of platform:**
   - websites (TradingView): the Chrome extension, then click Allow
   - MT5/MT4: the DisciplineGuard Windows app, then click Allow and **Protect**. The app puts the EA into MetaTrader, turns it on and keeps it updated. The trader never copies a file, changes an MT setting or types a code
4. **Rules sync automatically** from the web dashboard. Nothing is set inside the extension or MT.
5. **Trade normally.** Nothing happens while the trader follows their rules.
6. **A rule is broken** → popup → wait → Cancel or Continue.
7. **Stats page** (in the user web app): popups shown, cancelled, continued, rules broken most.
8. **Day 14:** subscribe or the popups stop.

**One account, one rule set, all platforms.** A trade counted on MT5 and a trade counted on TradingView go toward the same daily limit when both are connected.

---

## 4. Rules (set by the trader)

| Rule | Example | Needs |
|---|---|---|
| **Max trades per day** | 5 | Order count (always available) |
| **Max trades per hour** | 3 | Order count |
| **Too fast** | 2 orders within 60 s | Order timestamps |
| **Trading hours** | Only 14:30–17:00 | Clock |
| **Max position size** | 0.5 lots / 2 contracts / $500 risk | Order size (+ SL for risk) |
| **Cooldown after a loss** | Wait 10 min after a losing trade | Closed trade P/L |
| **Stop after losing today** | Stop after −$300 or −3% | Daily P/L |
| **No trade without SL** | SL required | Order form |

**Personal note** (required during setup): 1–2 lines in the trader's own words, for example "Don't chase. You lost $600 last Friday doing exactly this." It is shown in every popup.

### 4.1 Rule-change protection (key feature)

A rule that can be loosened in the middle of a tilt protects nothing.

| Change | When it applies |
|---|---|
| Stricter (fewer trades, smaller size, longer cooldown) | **Immediately** |
| Looser (more trades, bigger size, shorter cooldown, rule deleted) | **The next trading day** (or after a 24-hour delay; the user picks one of the two during setup and can't change it later) |

- Rules are stored on the **server**, so reinstalling or editing local files can't skip the delay.
- A pending loosened rule shows as "Takes effect tomorrow 00:00".

---

## 5. The Popup

**Content:**
- **Title:** which rule was broken, e.g. "Rule: max 5 trades/day — this is trade #6"
- **Your note:** shown large, in quotes
- **Context:** today's trades, today's P/L, time since the last loss (whatever the platform can supply)
- **Order summary:** symbol, side, size
- **Countdown:** 5 s by default (the trader can choose 5–15 s; the same stricter/looser rules apply to this setting too)
- **Buttons:**
  - **[Cancel Trade]:** always active; default focus; Esc cancels
  - **[Continue]:** locked until the countdown ends

**Rules:**
- Enter never continues. Only a real click on Continue does.
- A second Buy/Sell click while the popup is open does nothing.
- The popup is **never** shown for closing, reducing, or moving SL/TP. Exits are always instant.
- When DisciplineGuard can't tell whether an order opens or closes a position, the order goes through and is logged.
- Every popup result (rule, cancel/continue, seconds waited) is logged.

---

## 6. Platform 1 — TradingView (Chrome Extension)

**What it covers:** trading from TradingView through any connected broker (OANDA, Pepperstone, IC Markets, Interactive Brokers, Tradovate, etc.). TradingView has no API for third parties, so a browser extension is the only way.

**How it works:**
- Runs only on TradingView pages.
- Watches the order panel submit button and the floating Buy/Sell buttons. It listens to mouse and keyboard events early enough to hold the order before TradingView sends it.
- If a rule is broken, the order is held and the popup opens.
- On Continue:
  - a **one-time pass** for that button, which expires after 3 seconds
  - the original action is re-sent; if TradingView ignores it, the popup says "Click Buy again now"

**Data the extension can read:**

| Data | Source | Status |
|---|---|---|
| Order size, side, SL | The order panel form | ✅ Launch |
| Trade count, timestamps | Its own log of orders it has seen | ✅ Launch |
| Closed trade P/L, daily P/L | TradingView's Account Manager panel (history/positions) | ⚠️ Beta. Depends on the broker and on page layout |

So on TradingView, the **cooldown after a loss** and **stop after losing today** rules start as Beta.

**Remote update config (must be in v1):** TradingView changes its page often. The button and field locations are kept in a config file on the server, so breakage can be fixed in hours without a Chrome Web Store review. If the locations stop matching, the extension shows **"Inactive — update pending"** instead of failing silently.

**Browsers:** Chrome at launch, Edge soon after (same package), and Brave and other Chromium-based browsers where it works.

---

## 7. Platform 2 & 3 — MT4 and MT5 (Expert Advisor)

**Key limit to state openly:** MT4 and MT5 do not let any add-on block the platform's own Buy/Sell buttons. So DisciplineGuard provides **its own trading panel** on the chart, and that panel is where the popup lives.

**Panel:**
- Buy / Sell buttons
- Lot size calculator (risk % or $ + SL → lots)
- SL / TP fields
- Status line: "Trades today 3/5 · Cooldown 4:12 · Loss today −$120 / −$300"

**Data:** MT4 and MT5 give full access, so **every rule works at launch:**
- account balance and equity
- closed trades with P/L, including commission and swap
- open positions
- the clock

**Trades placed outside the panel** (native buttons, one-click trading, mobile app):
- MT5 identifies them by the source recorded with each deal.
- MT4 identifies them because the panel stamps its own orders with an ID and outside trades don't have it.
- They **still count** toward the daily trade limit and daily loss.
- They are **logged and shown** ("2 trades placed outside DisciplineGuard today") but never touched.

**Setup guide:** turn off One-Click Trading and hide the native quick-trade buttons, so the panel is the easy way to trade.

**MT4 vs MT5 differences:**

| | MT4 | MT5 |
|---|---|---|
| Language | MQL4 | MQL5 |
| Detecting new closed trades | Check history on a 1 s timer | Live trade events + timer |
| Telling panel trades from outside trades | Panel order ID | Deal source + panel order ID |
| Build | Separate version, same rules and popup | Main version |

Both must behave **the same** as the extension. One shared rule spec with shared test cases covers all three versions.

**Connecting to the account (the Windows app):**
- The trader installs "DisciplineGuard for Windows", signs in, clicks Allow, and ticks the MetaTrader installs to protect.
- The app copies the EA in, attaches it, turns on Algo Trading, and restarts MT once if needed (with the trader's click).
- The EA talks to the app through local files; the app talks to the server. No WebRequest address to allow, no pairing code.
- The app keeps the EA updated and offers to protect any MetaTrader installed later.
- It must be code-signed, or Windows SmartScreen warns users.

---

## 8. Architecture

```
          ┌───────────────────────────────┐
          │   Web Dashboard + Server      │
          │  - Account, trial, billing    │
          │  - Rules + next-day loosening │
          │  - Daily totals (all devices) │
          │  - TradingView page config    │
          │  - User stats + analytics     │
          └──────┬────────────────┬───────┘
                 │                │
     ┌───────────▼──────┐   ┌─────▼────────────────┐
     │ Chrome Extension │   │ Windows app          │
     │ one adapter per  │   │ installs + updates + │
     │ website          │   │ connects the plugins │
     └──────────────────┘   └─────┬────────────────┘
                                  │ local files
                            ┌─────▼────────────────┐
                            │ MT4 EA / MT5 EA      │
                            │ (own trading panel)  │
                            └──────────────────────┘
          same rule spec · same popup · same test cases
```

**Server:**
- **Hosting:** Cloudflare Workers + D1 database (or Supabase).
- **What it stores:**
  - account and subscription status
  - rules and pending rule changes
  - daily counters (trades, P/L)
  - popup log
  - TradingView page config
- **What it never stores:** broker passwords or login details. It never places or closes trades.

**Offline behavior:**
- If the server can't be reached, the extension and EA keep enforcing the **last synced rules** from their local cache, with no looser changes applied.
- A server outage never blocks trading, and it never switches the rules off either.

---

## 9. Business Model

### 9.1 Pricing

| Plan | Price | Notes |
|---|---|---|
| **Trial** | 14 days free | All features, all platforms. Email required, no card |
| **Monthly** | $14.99 | |
| **Yearly** | $99 (~$8.25/month) | The default plan to push. "Less than one challenge reset" |

- One subscription covers **TradingView + MT4 + MT5** together, on all of the trader's devices.
- **After the trial ends without payment:**
  - the popups stop
  - the extension and EA show "Trial ended — subscribe to keep your rules active"
  - rules and stats are kept for 90 days, so the trader can come back without setting up again
- **Trial abuse:** the trial is tied to the email and the MT account number, so a second trial on the same MT account isn't allowed.

### 9.2 Payments

- Lemon Squeezy, Paddle, or Stripe with a merchant-of-record add-on, so sales tax and VAT are handled.
- Confirm the provider accepts a trading-tool product before launch.
- Instead of emails, the extension and EA show an in-app banner in the last 3 days: "Trial ends in X days".
- Cancel at any time from the user's account page.

### 9.3 Later options (only if users ask)

- Challenge Pass (one-time payment for 60 days)
- Founders lifetime deal (limited number)
- More platforms: web ones as extension adapters (TopstepX, Kalshi, Polymarket, crypto exchanges), desktop ones through the Windows app (cTrader, NinjaTrader). See SPEC §9.0
- Licensing to platforms and brokers

---

## 10. Costs

All prices are in USD, checked in September 2026. Ranges are estimates, so re-check them before paying.

### 10.1 One-time costs (before launch)

| Item | Cost | Notes |
|---|---|---|
| Chrome Web Store developer account | **$5** once | Needed to publish the extension |
| Logo / simple branding | $0–200 | Canva yourself, or a Fiverr designer |
| Privacy policy + terms | $0–1,500 | $0 with a generator/template; $300–1,500 if a lawyer reviews it (recommended before real users pay) |
| Business registration | ~$0–300 | Depends on your country. Payment providers pay out to an individual or a company |
| Trademark "DisciplineGuard" (optional) | ~$250–400 per country/class | Can wait until revenue exists |
| Testing accounts | **$0** | MT4/MT5 demo accounts, FTMO free trial, TradingView paper trading |
| Development | **$0** if you build it yourself · rough estimate **$8k–25k** if you hire freelancers for all parts (extension, MT4 EA, MT5 EA, server, web app) | The biggest cost by far if outsourced |

### 10.2 Monthly running costs

| Item | Launch (0–500 users) | Growing (~2,000 users) | Notes |
|---|---|---|---|
| Domain (.com) | ~$1/month (~$12/year) | ~$1 | |
| Server: Cloudflare Workers + D1 | **$0** (free: 100k requests/day) | **$5** (Workers Paid: 10M requests/month) | D1 has large free allowances; usage beyond them is billed separately but tiny at this size |
| Website + user web app hosting | **$0** (Cloudflare Pages) | $0 | |
| Analytics: PostHog | **$0** (free: 1M events/month) | $0–50 | ~2,000 users × ~20 events/day ≈ 1.2M/month → roughly $10 over the free tier |
| Account emails (sign-up confirmation, password reset only; no marketing) | **$0** (Resend free: 3,000/month, 100/day) | **$20** (Resend Pro) | Needed even without marketing emails |
| Support email inbox | $0 (Cloudflare Email Routing → Gmail) | $0–7 | Google Workspace ~$7/month if you want a proper inbox |
| Error monitoring (Sentry) | $0 (free tier) | $0–26 | Optional |
| Windows code signing (for the Windows app) | See 10.3 | See 10.3 | |
| TradingView plan for testing | $0 (free plan) | $0–15 | A paid plan only if you need more layouts or indicators while testing |
| 24/7 VPS for MT testing (optional) | $0–15 | $0–15 | Only for long automated tests |
| **Total per month** | **≈ $1–30** | **≈ $30–140** | |

### 10.3 Windows code signing (the Windows app)

The Windows app must be signed, or Windows SmartScreen shows a warning.

| Option | Cost | Who can use it |
|---|---|---|
| **Skip the installer at launch**: ship the EA files + a guide with screenshots | **$0** | Anyone. Good for beta |
| Azure Artifact Signing (Basic) | **$9.99/month** | Only US, Canada, EU or UK businesses and self-employed individuals |
| OV code-signing certificate (e.g. Sectigo via resellers) | **~$215–230/year** | Anyone. Since 2026, certificates are issued for 1 year only |

**Recommendation (changed):** sign the Windows app from the first beta install, since it now does the whole MT setup and an unsigned app scares exactly the users who need trust. Use whichever option you're eligible for.

### 10.4 Payment fees (per sale, Lemon Squeezy as example)

| Fee | Rate |
|---|---|
| Base fee (includes card processing, tax/VAT handling, fraud protection) | 5% + $0.50 |
| Subscription payments | +0.5% |
| International (non-US) customers | +1.5% |
| PayPal payments | +1.5% |
| Payout to a non-US bank | 1% of each payout |

**What you actually keep** (international customer, card, non-US bank):

| Plan | Price | Fees ≈ | You keep ≈ |
|---|---|---|---|
| Monthly | $14.99 | 7% + $0.50 ≈ $1.55, then 1% payout | **~$13.30 (≈ 89%)** |
| Yearly | $99 | 7% + $0.50 ≈ $7.43, then 1% payout | **~$90.65 (≈ 92%)** |

Paddle is priced similarly. Income tax in your own country comes on top.

### 10.5 Summary

| Scenario | Upfront | Per month |
|---|---|---|
| **Minimum launch** (you build it, no installer, template legal docs) | **~$17** (Chrome $5 + domain $12) | **~$1–5** |
| **Recommended public launch** (lawyer-checked legal docs, code signing, basic business setup) | **~$500–2,000** | **~$15–50** |
| **Growing** (~2,000 users) | — | **~$30–140** |

**Break-even:** with ~$13 kept per monthly subscriber, about **4–10 paying users** cover the running costs. Your main cost is **your time**, especially keeping the TradingView extension working when TradingView changes its page.

Marketing spend is not included: organic posting costs $0, and paid ads are optional.

---

## 11. Launch Plan (users are already waiting)

1. **Beta:**
   - Give the waiting users the full product with the 14-day trial.
   - Offer an early-bird price (e.g. $79/year locked in) to anyone who subscribes during beta.
2. **Watch the analytics dashboard during beta** (section 12):
   - which rules people use
   - cancel rate
   - where users drop off
   - TradingView breakage and MT setup problems
3. **Public launch:**
   - Chrome Web Store listing
   - landing page with a 10-second demo video per platform (broken rule → popup with their note → Cancel)
4. **Channels:**
   - forex and prop-firm Reddit and Discord communities
   - trading YouTube and TikTok

---

## 12. Analytics & Owner Dashboard

**Principle:** you see **who your users are and how they use the product**, all on one dashboard. Symbols, prices, P/L amounts, trade details and the personal note are **never** sent to the analytics tool.

### 11.1 Tool: PostHog (no need to build your own dashboard)

- **PostHog** covers:
  - product analytics
  - funnels
  - retention
  - website visit tracking with sources/UTM
  - **ready-made dashboards**
- It has a generous free tier and can be hosted in the EU.
- It can also **import revenue data from Stripe**, so paid users and revenue show up on the same dashboard. If you use Lemon Squeezy or Paddle instead, check how to import their data.
- Every event from the website, extension and EA carries the same **user ID**, so everything connects to one user.
- **Alternative:** Mixpanel (similar features).
- Building your own admin dashboard isn't worth it at this stage.

### 11.2 User background (detected automatically, no survey)

| Info | Where it comes from |
|---|---|
| Country | Sign-up (country only, no IP address stored) |
| How they found you | UTM / referrer on the landing page (YouTube, TikTok, Reddit, Discord, Google…) |
| Platforms used | Which of the TradingView extension / MT4 EA / MT5 EA is installed |
| **Broker or prop firm** | MT account server name (e.g. "FTMO-Server", "FundedNext-Live") · broker connected in TradingView |
| Demo or real account | MT account type |
| Account size range | Balance **grouped into ranges** (<$5k, $5–25k, $25–100k, $100k+), never the exact amount |
| Account currency | MT account info |
| Device / browser / OS | Extension and website |

Prop firm accounts can be recognized from the MT server name, so you'll know which firms your users trade with without asking.

### 11.3 Events tracked

**Funnel:**
landing visit → sign-up → rules set → extension or EA installed → first popup → still active on day 7 → trial ends → **paid** → cancelled

**Usage (counts only):**
- popups shown, cancelled, continued, and which rule caused them
- rule changes (stricter / looser)
- which platforms are used and how often
- TradingView extension health (active / inactive)
- days active

### 11.4 Owner dashboard (built in PostHog)

| Panel | Shows |
|---|---|
| **Overview** | Sign-ups, active trials, paid users, revenue, churn, this week vs last |
| **Funnel** | Where users drop off, from landing visit to paid |
| **Acquisition** | Sign-ups and **paid users by source** (which channel actually brings paying users) |
| **Users** | Country, broker/prop firm, platform, demo/real, account size range |
| **Product** | Popups per day, cancel rate by rule, most-used rules, rule loosening attempts |
| **Retention** | % still active on day 7 / 14 / 30, split by platform and source |
| **Health** | TradingView extension active vs inactive, EA sync errors |

### 11.5 How you use it for marketing

- Spend time and money on the channels that bring **paid** users, not just sign-ups.
- Target the prop firms and countries where most paying users come from, e.g. "FTMO traders in the UK".
- Use anonymous totals in ads, e.g. "Users cancelled 34% of paused trades this month." Never individual data.
- Decide which platform or rule to improve next.

### 11.6 Privacy rules (must follow)

- **Privacy policy** lists exactly what's collected (including broker name and balance range) and why.
- **Chrome Web Store:**
  - declare the data use in the listing
  - the extension collects only on TradingView, never browsing history
  - **never sell user data** (Chrome's "Limited Use" policy)
- **Cookie banner** on the website for EU/UK visitors.
- **Data export and account deletion** from the user's account page, as required by GDPR and similar laws.
- **Never share data** with prop firms, brokers or anyone else without the user's explicit consent.

---

## 13. Success Metrics

| Metric | Target |
|---|---|
| Cancel rate (popups → Cancel) | ≥ 30% |
| Still active after 14 days | ≥ 50% |
| Trial → paid | ≥ 10% (no-card trial) |
| Monthly churn | ≤ 10% |
| TradingView config uptime | ≥ 98% |

---

## 14. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| TradingView changes its page and the extension breaks | Remote config, "Inactive" badge, fixes within hours |
| Antivirus or SmartScreen flags the Windows app | Code signing from day one, submit to vendors, publish the steps to allow it |
| MT traders ignore the panel and use native buttons | Setup guide, outside trades still count toward limits, a daily "outside trades" warning |
| Traders loosen rules while on tilt | Loosening applies the next day; rules stored on the server |
| Traders get used to the popup | Their own note, rotating context (today's P/L, last loss), and an optional longer countdown |
| An exit is paused by mistake | Only orders that open or add are paused; when unsure, the order goes through; tested before every release |
| Server outage | Cached rules keep working; trading is never blocked |
| MT4 ages out (MetaQuotes pushes MT5) | MT4 shares the rule spec, so it's cheap to keep; drop it if usage falls |

---

## 15. Legal & Trust

- "A behavioral tool, not financial advice. DisciplineGuard never places, changes or closes trades on its own."
- Privacy policy: which data is synced (rules, counts, P/L totals, popup log), and that it can be deleted from the dashboard.
- Chrome Web Store: runs on TradingView only; the remote config is data, not code.
- Prop firms: the EA only lets the trader place their own orders. Check FTMO and FundedNext rules and publish a "prop-firm friendly" note.
- Check the name "DisciplineGuard" for trademark conflicts.
- Client code (EA, Windows app, rules engine; the extension once built) public on GitHub now, so anyone can check it never touches trades on its own.

---

## 16. Build Order

| Step | Deliverable |
|---|---|
| 1 | Rule spec + shared test cases (written, no code yet) |
| 2 | Server: accounts, trial, rules with next-day loosening, daily totals |
| 3 | MT5 EA: panel + all rules + popup + sync, plus the Windows app that installs and connects it |
| 4 | Chrome extension: TradingView order hold/release + popup + remote config |
| 5 | User web app: rule setup, note, stats, account page |
| 6 | Billing: trial → subscription |
| 7 | Analytics: PostHog events, auto-detected user info, owner dashboard, UTM tracking on the landing page |
| 8 | MT4 EA (port from MT5) |
| 9 | Privacy policy, Chrome Web Store listing, beta launch |

**Checks to run before step 3 and step 4:**
1. Which mouse or keyboard event TradingView uses to send an order, and whether a re-sent event goes through.
2. Whether MT5 correctly labels panel trades vs native and mobile trades on a demo account.

---

## 17. Sources

- TradingView Broker Integration (brokers only): https://www.tradingview.com/brokerage-integration/
- Prop firm pass rates and failure causes: https://www.quantvps.com/blog/prop-firm-statistics · https://thepropfirmguide.com/prop-firm-statistics/
- MetaQuotes and the prop firm platform shift: https://fundedtrading.com/best-metatrader-alternative/
- Competitors: https://www.emotionlock.app/learn/best-apps-stop-revenge-trading · https://tiltguard.app/learn/revenge-trading · https://fenstrom.vercel.app/ · https://tradecrucible.com/blog/best-app-to-track-trading-discipline/
- Cost sources: Lemon Squeezy pricing https://www.lemonsqueezy.com/pricing · Cloudflare Workers pricing https://developers.cloudflare.com/workers/platform/pricing/ · Cloudflare D1 pricing https://developers.cloudflare.com/d1/platform/pricing/ · PostHog pricing https://posthog.com/pricing · Resend pricing https://resend.com/docs/knowledge-base/what-is-resend-pricing · Azure Artifact Signing https://azure.microsoft.com/en-us/pricing/details/artifact-signing/ · Sectigo OV code signing (reseller) https://www.ssl2buy.com/sectigo-code-signing-certificate.php
