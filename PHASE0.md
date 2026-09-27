# Phase 0: Results and gate

> Status on 27 Sep 2026. Updates PHASES.md "Phase 0". Spike details are in `spikes/README.md`.
> ✅ done · ⏳ needs the founder · ⚠️ done, with a risk to watch

## 1. Spikes

| # | Question | Status | Result |
|---|---|---|---|
| Q1a | Can the extension hold TradingView Buy/Sell? | ⏳ | Not run. Needs Chrome, a TradingView login and Paper Trading (README "TradingView"). |
| Q2 | Can the extension read positions and P/L? | ⏳ | Next spike, once Q1a passes. |
| Q3 | Does `DEAL_REASON` label desktop, mobile and web trades? | ⏳ | Needs trades from the phone and web terminal on your broker account. |
| Q4 | Does push work on prop-firm builds? | ⏳ | Needs your FTMO terminal and a MetaQuotes ID. |
| Q5 | Do the firms allow a panel EA? | ✅ | See §2. Per-user magic number chosen. |
| Q6 | Does the payment provider accept us? | ⚠️ | Lemon Squeezy's prohibited list doesn't cover a self-control tool. Written confirmation still needed (email in §4). Fallback named: Paddle. |
| Q7 | WebRequest in `OnDeinit` | Dropped | The EA makes no web requests. |
| Q8 | How long WebRequest blocks | Dropped | The EA makes no web requests, so no order can wait on the network. |
| Q9 | MT5 for Mac | Deferred | No Mac. The Platforms page says "Mac: not supported yet". |
| Q10 | Ed25519 in the EA | ✅ | **Pass.** `clients/mt5/DG/Ed25519.mqh`. It agrees with Node's Ed25519 on all 8 checks (RFC 8032 vector, tampered cache, wrong key, flipped bit, 3 KB payload). **1.8 ms** per verification on build 6230. |
| Q11 | Can the Windows app set up MT5 with no clicks inside MT? | ⚠️ | **Partial, 27 Sep, portable MT5 on a MetaQuotes demo.** A start-up file attaches the EA to a chart: works. The file bridge: works end to end (EA → app → server → EA, connected with no code typed, checklist green). Algo Trading from `[Experts] Enabled=1`, even with `Account=0`: **stayed off**, because MT5 turns it off when the terminal logs in to an account at start. Next: test on a normal (non-portable) terminal whose account doesn't change; if it still stays off, the app shows one step, "Click Algo Trading once". |
| MT5 popup flow | Open, early click ignored, Place anyway after the wait | ✅ | Passed again on a MetaQuotes demo: a click at 1.6 s was ignored, and Place anyway after 5 s reached `OrderSend`. |

**How Q10 and the popup test ran.** A portable copy of MT5 was started in a scratch folder with its own data and a MetaQuotes demo account it created itself. Your terminals and accounts were not touched.

**Why Q7 and Q8 were dropped.** WebRequest URLs can only be allowed by hand in MT5's options, and a stalled WebRequest could make a Buy click wait on the network (safety invariant 3). The Windows app removes both: the EA makes no web requests at all (SPEC §9.5).

## 2. Prop firms (Q5)

| Firm | EAs | What matters for us | Source |
|---|---|---|---|
| FTMO | Allowed | Forbidden: EAs that make over 2,000 server requests a day, third parties trading for you, and coordinated opposite positions. Many clients using the same third-party strategy can hit the $400k-per-strategy cap. A panel that sends only the trader's own clicks triggers none of these. | [FTMO forbidden practices](https://ftmo.com/en/forbidden-trading-practices/), updated 2 Feb 2026 |
| FundedNext | Allowed | Identical trades across accounts are not allowed. Copying only between your own FundedNext accounts. | [FundedNext help](https://help.fundednext.com/en/articles/8019805-what-is-the-copy-trading-rule-at-fundednext) |
| FundingPips | Third-party EAs as "trade or risk manager" only. No EAs in the Monthly Competition | Our EA is a trade and risk manager, so allowed outside the competition. The competition goes on the firm page. | [Propvator summary](https://propvator.com/blog/is-copy-trading-allowed-at-funding-pips/) (check the firm's own page before publishing) |
| The5ers | Allowed, if you own and control the EA | Fine | Same summary |

**Decision: per-user magic number** (SPEC §9.2 [Q5]). No firm names magic numbers, but a single magic number shared by every user would look like "many clients on one EA". The server assigns each user a random magic number at pairing (range 700,000,000–799,999,999). It costs nothing.

**Before publishing any firm line** (EXPERIENCE §7.4), email each firm's support and use their written reply and its date. Third-party summaries are not enough for the product.

## 3. Basics

**Name** ✅ web check · ⏳ legal check

- No product, app, extension or company called "DisciplineGuard" or "Discipline Guard" shows up in web search.
- `disciplineguard.com` and `disciplineguard.app` are **unregistered** (registry lookup on 27 Sep 2026). Buy both now.
- ⏳ Run the official searches yourself (five minutes each): [USPTO](https://tmsearch.uspto.gov) and [EUIPO eSearch](https://euipo.europa.eu/eSearch) for "DISCIPLINEGUARD" in classes 9 and 42, plus a Chrome Web Store search.

**TradingView terms** ⚠️

Section 3 of the [Terms of Use](https://www.tradingview.com/policies/) bans "non-display usage" of TradingView data: "automated trading, automated order generation, price referencing, order verification…", "using data in operations control or risk management programs", and any third-party tool that "facilitates, enables, or encourages" these.

- **Our position**: the extension never generates or clicks orders (SPEC §7.5). It reads only the trader's own order form and broker account table, never TradingView's market data, and always shows the result to a human.
- **Risk**: "order verification" and "risk management programs" are close to what the pause does. The store item stays "DisciplineGuard", never "…for TradingView".
- **Mitigation**: MT5 leads, which is already decided. Before the public listing in Phase 2, email TradingView partnerships and describe the extension. The "TradingView objects" trigger in PHASES.md stays as written.

**Competitors** ⚠️ **the positioning line changes**

| Product | What it does | Acts before the order? |
|---|---|---|
| [LockMyTrades](https://www.lockmytrades.com/) | MT4/MT5 EA with TradingView and TradeLocker integrations. Hard-blocks new orders after limits and consecutive losses, blocks news times, 15-minute cooldowns, "rules are immutable" during the session. $29.99/month | **Yes, as a hard block** |
| TradeGuard ([.co](https://app.tradeguard.co/), [.in](https://tradeguardhq.in/trading-discipline-app-india)) | Intercepts orders at the broker connection (Indian brokers' APIs) and kills those that go past a rule. $27/month | **Yes, as a hard block** |
| [Trading Checklist](https://chromewebstore.google.com/detail/trading-checklist/fkioipojjiofaabiphaidgkfkihpjdim) | Chrome extension. Intercepts Buy/Sell clicks on any site and shows a checklist. 226 users | Yes, a checklist, with no rules or counting |
| TiltGuard | Chrome extension that locks the browser after session limits. $97 one-time | No, a lockout after the limit |
| EmotionLock | iOS Screen Time block of trading apps after MT5 limits (investor password) | No, a lockout after the limit |
| PsyRule, Plancana | Pattern warnings and journaling | No |
| TradeBlocker, Stop Trading | Small blockers (15 users and under) | No |

So "Lockout tools act after your limit. DisciplineGuard pauses you at the click." is still true of most tools, but it is **not unique**: LockMyTrades and TradeGuard act before the order too. Their answer is a hard block. Ours is a pause in the trader's own words, with the choice kept.

**New home line** (replaces EXPERIENCE §4 "Home"):

> "Other tools lock you out. DisciplineGuard pauses you at the click, in your own words, and the choice stays yours."

Supporting lines, true for us and not for them:

- Closing a trade is never paused.
- Tighten now, loosen later: looser changes wait until your next day reset.
- One set of rules across MT5 and TradingView.

The comparison page (Phase 2) adds a "hard block" column next to "lockout after the limit" and "journal".

## 4. Payment provider (Q6)

- **Provider**: Lemon Squeezy, merchant of record. Its [prohibited list](https://docs.lemonsqueezy.com/help/getting-started/prohibited-products) bans regulated financial services, get-rich-quick schemes and **crypto products**. A self-control tool fits none of these.
- **Crypto warning**: the Phase 3 crypto and prediction-market bet may conflict with this list. Recheck before that bet starts.
- **Fallback**: Paddle. It bans "regulated financial products" and "trading platforms", which don't cover a self-control tool that places no trades.
- ⏳ **Email to send** (support@lemonsqueezy.com):

> Subject: Pre-approval: trading self-control software (subscription)
>
> Hi, before I set up my store I'd like to confirm DisciplineGuard is allowed. It is software for retail traders: a browser extension and a MetaTrader add-on that show a pause with the trader's own note before an order that breaks rules they set (for example max trades per day or a daily loss limit). It does not give signals, advice or trading services, does not hold funds, and never places trades on its own. Pricing: $14.99/month, $99/year, and a $79/year early-bird. Customers are worldwide.
> Questions: (1) Is this product allowed? (2) You are the seller to consumers, correct? Who handles the EU 14-day withdrawal? (3) Do cards from Nigeria and India and PayPal work for recurring and one-off payments? (4) Is affiliate tracking available for this store?
> Thanks

## 5. Gate decisions

Defaults chosen so work can continue. Each one is yours to change.

| Decision | Default | Why |
|---|---|---|
| Lead platform, Phase 1A | **MT5** (your pick, 26 Sep) | EAs are official, the popup flow passed, and the TradingView terms add risk |
| TradingView in Phase 1B | **Yes, if Q1a passes** | Not run yet. The extension is built after Q1a |
| MT4 | **Out of 1B.** Onboarding collects "Tell me when it's ready" | No demand signal yet |
| Bypass-rate ceiling | **25%** | Above that, a quarter of rule breaks skip the pause and the behavior numbers mean little. Recheck after wave 1 |
| Signed rule cache in the EA | **Yes** | Q10 passed at 1.8 ms |
| Magic number | **Per user** | §2 |
| Order comment | **Empty by default** (SPEC §9.2 said "comment prefix of this user") | A fixed "DG" comment on every user's trades is the same group signal as a shared magic number. Panel trades are identified by ticket (SPEC §4.4), so the comment isn't needed |
| Starter templates | **EXPERIENCE §5.3 as written**, stored in `packages/core/src/templates.ts` | Change the values in one file |
| Home positioning line | **New line in §3** | Competitor check |
| MT5 setup | **Windows app: sign in, Allow, Protect.** No file copying, no web address, no pairing code, and no manual setup | Your call, 27 Sep: traders shouldn't have to add a script to MT5 |
| Network I/O in the EA | **None. Through the Windows app (file bridge, `clients/mt5/DG/Bridge.mqh`)** | Removes the Q8 risk and the allow-list step |
| Client source on GitHub | **Public from Phase 2**: extension, EA, Windows app, rules engine. Server stays private | Trust: anyone can check it never touches trades or sends trade details |

## 6. Exit criteria

| Criterion | Status |
|---|---|
| Q1a passes on paper + 1 real broker, or TradingView leaves the plan | ⏳ Q1a |
| Q3 and Q11 on an MT5 broker and a prop build | ⏳ Q3 needs your terminal (about 10 minutes, README "MT5"). Q11 partial (§1) |
| Other spikes answered or deferred in writing | ✅ Q5, Q6 (pending email), Q9 deferred, Q10. Q7 and Q8 dropped. Q2 waits on Q1a |
| Name check passed, domain owned | ⏳ domain purchase + USPTO/EUIPO search |
| Payment provider says yes, or fallback named | ✅ fallback named (Paddle). Email ready |

**Phase 1A work goes ahead** on the parts no open item blocks: the shared rules engine, server, web app, the MT5 EA and the owner dashboard. The open items change either platform scope (Q1a) or how much of MT setup the Windows app can automate (Q11), not the design.
