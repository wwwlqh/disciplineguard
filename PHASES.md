# DisciplineGuard: Phase Plan v2

> Replaces BLUEPRINT.md §11 (Launch Plan) and §16 (Build Order).
> **No time estimates by design.** A phase ends when its exit criteria are met, never on a date. Metric windows such as "day 14" or "monthly churn" measure results; they do not schedule work.
> Feature references point to SPEC.md (behavior) and EXPERIENCE.md (screens and flows). Metric definitions are in SPEC.md §14.

---

## How the phases work

- Each phase has a **goal**, what it **ships**, what it **leaves out**, **exit criteria** and the **decisions** made at its gate.
- Nothing from a later phase is built early, unless a gate decision moves it.
- A failed exit criterion means the phase continues with fixes. Criteria are lowered only by an explicit, written gate decision.
- Exit criteria are read only once the minimum sample sizes are reached. Each platform passes on its own.
- **Safety invariants** (SPEC §1.3, items 1–3): any confirmed breach stops feature work until it is fixed.
- **At the end of every phase**, before the next one starts:
  1. **Review** the phase's changes for bugs and security (`/code-review`, `/security-review`), and check the boundaries: the safety and privacy invariants (SPEC §1.3), each firm's EA rules (PHASE0.md §2), TradingView's terms (PHASE0.md §3), Chrome Web Store policy, and that nothing claims to give advice or guarantee a pass. Fix what is found.
  2. **Clean up**: no dead code, unused files or docs that describe something the code no longer does.
  3. **Green**: every test and typecheck passes (`npm test`, `npm run typecheck`) and the EA compiles with 0 errors.
  4. **Publish** the client source: `scripts/publish-public.sh` (public repo `wwwlqh/disciplineguard-clients`).

## Phase map

| Capability | P0 | P1A | P1B | P2 | P3 | P4 |
|---|---|---|---|---|---|---|
| Spikes, name check, competitor check | ● | | | | | |
| Legal set, DPIA, entity | | ● | | | | |
| Server core, security basics, release integrity | | ● | | | | |
| Web app core: onboarding, setup mode, lock, rules, devices, Today, basic stats | | ● | | | | |
| Lead platform client (decided at the P0 gate) | | ● | | | | |
| Popup with trader settings (when it shows, wait, extras), skip card, break, done for today, practice pause | | ● | | | | |
| Coverage and protection-off visibility on Today (in the end-of-session summary from P1B) | | ● | | | | |
| Owner dashboard for the exit criteria | | ● | | | | |
| MT5 baseline (ships with the MT5 client, in P1A or P1B) | | ● | ● | | | |
| Windows app: sign in, Protect, file bridge, auto-update, code-signed (SPEC §9.5) | | ● | | | | |
| Early-bird checkout (hosted, yearly only) | | ● | | | | |
| Full checkout (monthly, yearly) | | | ● | | | |
| Second platform client | | | ● | | | |
| Telegram trader alerts and summaries | | | ● | | | |
| Reason chips (with consent), notes 2–3 with tags, pause content experiments | | | ● | | | |
| Self-serve export and delete, full plan states, product-fit survey | | | ● | | | |
| MT4 EA | | | gate (P0) | ● if demand | | |
| Accountability partner, MT push | | | | ● | | |
| Public Chrome listing (same item), Edge listing | | | | ● | | |
| Client source public on GitHub (EA, Windows app, rules engine; extension when built), synced each phase | | ● | ● | ● | ● | ● |
| Launch website, comparison page, demo videos, status page | | | | ● | | |
| Affiliate program for educators, referral credit | | | | ● | | |
| Session check-in, reflection, harm-marker note, take a break 1/7/30 days | | | | ● | | |
| Discipline report, prop firm mode, stronger enforcement options | | | | | ● | |
| More TradingView paths, web platforms, native platforms, mobile shield | | | | | ● | |
| Prediction markets and crypto exchanges on the web, guard any button (web) | | | | | ● | |
| Regional pricing, pause subscription or Challenge Pass | | | | if chosen at the P1 gate | ● | |
| Localization | | | | | ● | |
| Coach and community licenses | | | | | ● | |
| Mobile pause app, betting, guard any button for Windows apps | | | | | | ● |

---

## Phase 0: Prove and pick

**Goal**: find out whether the pause can technically work on each platform, pick the lead platform, and start building. The founder is a trader and is the product's first user, so product decisions come from the founder, not from research.

### Ships

**A. Prove**: spikes Q1a–Q11 (SPEC §17). These are throwaway experiments that answer technical questions; they are not product code.

- Do Q1a, Q3 and Q11 first. They decide whether a platform is possible, and whether MT setup can be done with no steps inside MT.
- Q4, Q5, Q7, Q9 and Q10 come from testing on the founder's own setup and the firms' public rules pages.
- Q6 is one email to the payment provider, plus naming a fallback.
- Where SPEC §17 says "most named", use the brokers and prop firms the founder trades with.

**B. Basics**

- **Name**: knockout search for "DisciplineGuard" (trademark databases, Chrome store, Google). Buy the domain and take the social handles.
- **TradingView terms**: read and note the clauses about reading pages, synthetic clicks and "order verification or risk management" use. The store item is named "DisciplineGuard", never "…for TradingView".
- **Competitors**: a quick look at whether TiltGuard, EmotionLock or others already pause before the order is sent. If one does, the positioning line changes before any public copy is written.

### Leaves out

- Any production code.
- Surveys, interviews and prototype studies.
- The DPIA, entity setup, privacy-law mapping, EU and UK representatives and the breach plan. These move to Phase 1A, before the first beta user installs.
- A formal SPEC freeze. SPEC §2–8 and the §15 test cases stay the working reference, and changes get a note.

### Exit criteria

- **Q1a** passes on paper trading and at least 1 real broker, or TradingView leaves the plan for now.
- **Q3 and Q11** answered on at least one MT5 broker and one prop-firm build.
- **Other spikes** answered, or deferred with a written note.
- **Name**: check passed, domain owned.
- **Payment**: the provider has said yes, or a fallback is named.

### Decisions at the gate

- **Lead platform** for Phase 1A: **MT5** (founder's pick, 26 Sep 2026). EAs are officially supported by MetaQuotes, and the MT5 popup flow already passed its spike. TradingView is the second platform, in Phase 1B, if Q1a passes.
- **MT4**: in or out of Phase 1B, the founder's call.
- **TradingView scope**:
  - If Q1a fails, TradingView leaves the plan until a new spike passes.
  - R7 and R8 stay Beta on TradingView in any case. If Q2 fails, the listing says so and more orders are unclassified.
- **Bypass-rate ceiling** for the Phase 1 behavior gate.
- **Signed rule cache in the EA** (Q10), and a **per-user magic number** (Q5).
- **Starter templates**, written by the founder.

---

## Phase 1A: Concierge beta on the lead platform

**Goal**: prove that the pause changes behavior safely and that people keep it on, with the founder close to every early user.

### Ships

**Server**

- Email sign-in (link + code), sync, events, snapshot, coverage, jobs, and signed page config (TradingView).
- Security basics (SPEC §10.9): session emails, Windows app sign-in, rate limits, webhook secrets, and release integrity **before the first install**.

**Web app**

- Onboarding in four screens (EXPERIENCE §5.2): templates, plan, one note, trading day, risk notice, analytics consent, practice pause, setup mode and lock.
- Today, Rules with the verdict line and account sheets, Devices with the Windows app download, basic Stats, Account.

**Lead platform client**: the full pause system (SPEC §7), the status vocabulary, the checklist or coach card, and coverage.

**Windows app** (MT5 leads, so it ships here): sign in with Allow, find and Protect terminals, the file bridge, and auto-update of the app and the EA (SPEC §9.5). Code-signed before the first beta install, so Windows shows no warning. There is no manual setup.

**Measurement**

- The MT5 baseline, if MT5 leads.
- The owner dashboard: one panel per Phase 1 exit criterion, split by platform and wave, with payment figures from provider webhooks stored on the server.

**Early-bird checkout**

- Hosted checkout, yearly only, $79.
- Offered when a beta user's 14-day trial ends. A webhook sets the plan state.

**Legal**

- The entity is chosen: data controller, party to the Terms and payee at the payment provider. If it is outside the EU or UK, EU and UK representatives are arranged before the first EU or UK beta user.
- Privacy laws mapped for the home country and the main user countries (registration, officer or representative, breach deadlines, notice languages). A breach plan is written.
- Terms, privacy policy, risk notice, cookie notice, refund policy and the list of processors, live before the first beta user installs.
- Lawyer-reviewed before the first beta user connects a live account.
- DPIA completed before the first beta user installs.

**Support**

- Report a problem with diagnostics, founder setup calls for wave 1, the private community, and the uninstall page.
- Help articles: setup, "Is it allowed by my firm?", "Trading and wellbeing".

**Go-to-market**

- Wave 1 onboarded on calls, with consent to capture testimonials, recordings of real pauses and aggregate numbers.
- The first search pages ("how to stop revenge trading", one per major firm's daily-loss rule).

### Leaves out

- The second platform, Telegram, MT push and reason chips.
- Notes 2–3.
- Self-serve export and delete: support handles these on request within legal deadlines.
- Past-due handling.

### Gate to 1B

- Safety criteria met on the lead platform over at least 1,000 guarded exits.
- At least 30 activated users.
- Each of the top 3 setup failure causes has a shipped fix.

---

## Phase 1B: Second platform and self-serve

**Goal**: repeat the result on the second platform, remove the founder from setup, and measure willingness to pay.

### Ships

- **Second platform**: the second platform client. MT4 too, if the P0 gate moved it.
- **Alerts**: Telegram for trader alerts and end-of-session summaries.
- **Pause**:
  - reason chips, with consent;
  - notes 2–3 with trigger tags;
  - pause content experiments, disclosed in the beta terms;
  - the calibration prompt on Today.
- **Account**: full checkout with monthly and yearly plans (SPEC §12.3), self-serve export and delete, and the full plan states (SPEC §12.2).
- **Measurement**: the MT5 baseline, if MT5 is the second platform; the product-fit survey; the weekly control self-report.
- **Go-to-market**:
  - Later waves are self-serve.
  - Two channel tests with tracked links: one prop-firm community and one trading educator. Record trials and payers by source.
  - Onboarding step 1 collects "Other platform: tell me when it's ready" counts.

### Phase 1 exit criteria

These are read once the cohort reaches:

- 100 trials ended;
- 50 activated users per platform;
- 40 product-fit answers;
- 300 pauses from at least 30 users;
- 1,000 guarded exits per platform.

If the waitlist can't supply these numbers, invite referrals from beta users and one community before lowering any threshold. Every criterion is reported per platform.

**Safety**

- No confirmed case of a closing order paused, an order sent twice or lost after Place anyway, or an order waiting on the network.
- This must hold across at least 1,000 guarded exits per platform. Zero failures in 1,000 bounds the true rate below about 0.3%.

**Behavior**

- The held rate meets the target set after wave 1, fixed before wave 2.
- Rule-breaking trades per trading day fall below the user's own baseline for most MT5 users with a baseline. TradingView uses the weaker week-1 comparison.
- Limit overshoot falls.
- Displacement does not rise.
- The bypass rate stays at or below the Phase 0 ceiling.
- Skip rate is reported as a diagnostic only.

**Retention**: at least 40% of activated users are retained (SPEC §2). "Kept on, not working" users don't count.

**Payment**

- Trial → paid of at least 10% of trials ended, and at least 20% of activated users.
- Reported separately for early-bird and list price, with at least 10 list-price purchases before any price decision.
- Reported by country group, with checkout abandonment.

**Product fit**: at least 40% "very disappointed".

**Self-serve**: in the last wave, at least 70% of activated TradingView users and at least 60% of activated MT5 users reached On with no support contact.

**Support load**: problem reports per 100 active users recorded per platform. Each of the top 3 causes has a fix or a help article.

**Speed**

- Trades that get no pause gain at most 50 ms in at least 99% of cases (extension).
- At most 1% of EA clicks are flagged as possibly delayed.

**Reliability**

- At least 98% of extension heartbeats are On, excluding global page changes.
- At least one simulated TradingView layout break was detected and fixed through the page config without a store release.
- The share of real breakages fixed by config alone is tracked.

### Decisions at the Phase 1 gate

- **Defaults**: templates and the popup setting defaults.
- **Prices**, and **card or no card** for the public trial, judged on activated → paid and on the repeat-trial rate.
- **Pause subscription or Challenge Pass** in Phase 2, from the share of cancellations giving a challenge reason.
- **Regional pricing and extra payment methods** in Phase 2, from the by-country reporting.
- **N**, the paying-user target for the Phase 2 gate.
- **MT4 threshold**: the number of MT4 "tell me" requests that puts the MT4 EA in Phase 2.

---

## Phase 2: Public launch

**Goal**: open to everyone with a product that installs easily, earns trust quickly, and doesn't depend on the founder for setup or support.

### Ships

- **MT4 EA**: only if MT4 "tell me" requests reach the level set at the Phase 1 gate. Otherwise it becomes a Phase 3 bet.
- **Accountability partner** (SPEC §11.3–11.4, EXPERIENCE.md §11.2), and **MT push** with one-EA routing.
- **Public source** is live from Phase 1A (`wwwlqh/disciplineguard-clients`, synced at the end of each phase). Phase 2 adds the extension to it, and the "What we see" page links to it.
- **Store listings**:
  - The unlisted Chrome item made public: the same item, so installs and reviews carry over.
  - An Edge Add-ons listing.
  - Listing optimization: keyword-rich description, pause screenshots, the demo video.
  - Review requests to users after their 10th pause.
- **Website**:
  - launch pages;
  - the comparison page ("acts before the order" vs. lockout tools vs. journals);
  - demo videos;
  - the "Is it allowed by my firm?" page;
  - the status page and changelog;
  - the accessibility statement.
- **Google sign-in**.
- **Trader wellbeing and reflection**:
  - the session check-in;
  - reflection in the summary;
  - note staleness prompts and self-appraisal questions;
  - the harm-marker note;
  - take a break for 1, 7 or 30 days.
- **Affiliates and referrals**:
  - An affiliate program for trading educators and community owners, sized so a yearly plan still nets at least $60 after fees.
  - No revenue share with prop firms or brokers, and none without legal review. Firms may give members a discount code. The prop firm page states "no affiliation".
  - Referral credit: give a month, get a month.
- **Owner dashboard**: acquisition, affiliate and referral panels.
- **If chosen at the Phase 1 gate**:
  - pause subscription or Challenge Pass;
  - regional pricing and extra payment methods.
- **Trademark** applications filed in the main markets before the public listing.
- **Go-to-market**: launch posts in the channels that produced payers in Phase 1.

### Exit criteria

- **Growth**: paying users reach N, with at least half from organic, referral or affiliate sources.
- **Churn and refunds**:
  - monthly-plan churn at most 10% in each monthly reading;
  - yearly refunds at most 5% of yearly sales;
  - chargebacks below 0.5% of payments.
- **Reputation**: Chrome Web Store rating at least 4.5 from at least 30 reviews.
- **Acquisition cost**: if paid acquisition is used, cost per paying user is below the net revenue of one yearly plan.
- **Founder load**:
  - at least 80% of new users reach On with no support contact;
  - support and TradingView fixes take less than a third of the founder's working time.
- **Quality**: the Phase 1 safety, speed and reliability criteria still hold at public scale.

### Decisions at the gate

Which Phase 3 bets come first, ranked by data: requests, "tell me" counts, churn and cancel reasons, and uninstall reasons.

---

## Phase 3: Grow

**Goal**: make the product more valuable to current users and reach the platforms they ask for.

Each bet is independent, rolled out in waves, and compared against users not yet offered it (not against users who chose to use it).

| Bet | What it is | Success signal |
|---|---|---|
| Discipline report | Worst days, limit overshoots and size vs. plan, after a minimum sample, with honest caveats (EXPERIENCE.md §5.8) | Retention against the not-yet-offered group |
| Prop firm mode | Firm presets with source and check date (the user confirms the values), distance to breach, equity-based and trailing drawdown, "risk at most X% of what's left before my limit" | Fewer daily-limit overshoots among prop users |
| Stronger enforcement | Opt-in hard lock after the daily limit, loosening delays of 3 or 7 days, a "day off" rule, "pause after giving back 50% of today's peak profit" | Opt-in rate. Held rate among opted-in users |
| More TradingView paths | DOM ladder, chart trading, dragging order lines | Fewer outside and unchecked orders on TradingView |
| One account on TradingView and MT | Matching the same trade across platforms | Fewer "connect in one place only" support contacts |
| Web platforms | DXtrade, Match-Trader, TradeLocker, cTrader web, Tradovate web, TopstepX web, using the extension and page config. Built in order of "tell me" counts, each only after the request threshold | Sign-ups per platform |
| Native platforms | NinjaTrader, cTrader desktop, each as an adapter the Windows app installs (SPEC §9.0). Costlier than a web adapter | Sign-ups per platform |
| Prediction markets and crypto exchanges | Kalshi, Polymarket, Binance, Bybit, Hyperliquid on the web, as extension adapters. Needs its own daily-loss definition, since a position may only settle when the event resolves. Only marketed where the platform accepts residents | Sign-ups per platform |
| Guard any button (web) | The trader clicks a site's Buy button once to guard it. Count and time rules only. Covers every site without an adapter, and shows which adapters to build next | Sites guarded, and requests per site |
| Mobile shield | When a limit is reached (daily loss, cooldown, outside hours), the phone shields the MT and TradingView mobile apps | Fewer trades from MT mobile after a limit |
| Coach and community licenses | Group plans with an owner view of totals only. Members opt in per group and can leave immediately. No coach sees individual trades without consent | Paid groups |
| Localization | Top languages from sign-up data | Conversion in those countries |
| Regional pricing | If not already in Phase 2. Outside the EU/EEA by country; inside only after a legal check | Conversion without lower revenue per user |
| More partners, partner replies | Several partners, one-tap encouragement back | Partner retention effect |
| Journal export | Export to the journals traders already use | Use of the export |
| R6 on TradingView | Once pip value can be computed reliably | Adoption |

### Gate to Phase 4

- Phase 2 churn and refund targets met in each of the last three monthly readings.
- Net revenue covers founder pay plus one contractor.
- Support and platform maintenance take under a third of founder time, or are handled by someone else.
- The mobile shield is used by a set number of paying users.
- A smoke test outside trading brings a set number of sign-ups for the new market.
- `evaluate()` and the pause run as a module with no trading-platform dependency.

---

## Phase 4: Expand

**Goal**: take "the pause button for money impulses" beyond trading platforms.

| Bet | What it is |
|---|---|
| Mobile pause app | Extends the Phase 3 shield to crypto and betting apps. Crypto rules are fed by read-only exchange API keys (trade count, P/L) |
| Guard any button for Windows apps | The Windows app catches a click on a chosen button in another desktop app. Fragile and may be flagged by antivirus, so only for apps users ask for |
| Betting | Only if a paid smoke test works. The route through betting operators has the same conflict of interest as prop firms, so it is avoided |

**Every expansion starts with its own Phase 0**, including:

- feasibility spikes;
- app-store policy checks: Apple's Family Controls entitlement, and Google Play's restrictions on accessibility and overlay permissions;
- a regulatory review;
- for betting: a gambling harm-minimization review, 18+ (21+ where required), no ads that reach minors, and each operator's terms;
- no claims to treat or prevent addiction;
- a prototype test.

---

## Go-to-market track

| Phase | Work |
|---|---|
| P0 | Competitor check |
| P1A | Founder-led onboarding and interviews. Testimonials and pause recordings with consent. First search pages |
| P1B | Self-serve waves. Two tracked channel tests (prop community, educator). "Tell me" counts per platform |
| P2 | Public listings. Comparison page and demo videos. Launch posts in proven channels. Affiliates and referrals |
| P3 | Scale proven channels. Localization. Content per firm and platform |

Marketing claims always carry a source and a date. Never "money saved". Use aggregate numbers only, such as "Users skipped 34% of paused trades this month".

---

## Triggers that reopen the plan

| Trigger | Response |
|---|---|
| TradingView objects (terms notice, trademark complaint, store takedown) | MT leads. TradingView users are told in the product. No workaround that breaks TradingView's terms |
| TradingView or a large broker adds a native pre-trade limit | Put the marketing weight on shared rules across platforms and delayed loosening |
| A top-3 prop firm bans third-party EAs or blocks web requests | Update the firm page. That firm's other platform becomes the first Phase 3 platform bet |
| MetaQuotes restricts EAs, start-up configurations, prop licensing or MT4 | Web-platform bets move to the front of Phase 3 |
| Antivirus or SmartScreen flags the Windows app | Submit to the vendors, publish the steps to allow it, and track installs lost at that step |
| The payment provider closes the account | Switch to the Phase 0 fallback. Clients keep enforcing until `valid_until` + 7 days (SPEC §10.5) |
| A competitor ships a pause at the click | No change by itself. Watch cancel and uninstall reasons |
| A safety invariant breach | Feature work stops until it is fixed (see "How the phases work") |

---

## Numbers to recheck before the first checkout

Estimates per sale, based on BLUEPRINT.md §10.4 (Lemon Squeezy, international card, non-US payout).

| Case | Net per sale |
|---|---|
| Yearly $99, tax excluded | ≈ $90.65 |
| Yearly $99, tax included (20% VAT) | ≈ $74 |
| Monthly $14.99, tax included (20% VAT) | ≈ $10.80 |
| Early-bird $79, tax excluded | ≈ $72 |
| Yearly $99 with a 25% affiliate commission, tax excluded | ≈ $66 |

The lawyer review and business registration are Phase 1 costs, not optional extras. BLUEPRINT's "4–10 paying users" break-even is replaced by a founder-pay threshold set at the Phase 2 gate.
