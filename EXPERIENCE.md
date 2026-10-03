# DisciplineGuard: Experience and UI Spec v2

> What customers see and read on every surface. Behavior is in SPEC.md. Phase tags such as **[P2]** refer to PHASES.md.
> **Fewest words wins.** One line per idea, never the same line twice on one screen.

---

## 1. Experience principles

| # | Principle | In practice |
|---|---|---|
| 1 | Your calm self talks to your tilted self | The note states the trader's own rule. The app never judges, scolds or praises |
| 2 | Never in the way | Every trade goes straight through, with no confirmation, no sound and no wait for our server. DisciplineGuard only counts |
| 3 | A mirror, not a lock | A trade that goes past a rule is marked, so the trader sees the pattern. Nothing is blocked or closed |
| 4 | Honest numbers only | Show counts and facts. Never claim money saved. No dark patterns in billing |
| 5 | Calm under stress | The note is readable in two seconds: no red or green, no flashing, no sounds |
| 6 | One product everywhere | The same words, states and note on TradingView, Polymarket, Kalshi, MT and the web app |
| 7 | Commitment is a moment | Locking rules is a deliberate step the trader takes, once |
| 8 | Always say what is counted | Every state that is not On says whether trades are counted |

---

## 2. Voice and vocabulary

### 2.1 Voice

- Calm, direct, specific and kind, like an adult peer. Short sentences, second person, present tense, real numbers.
- In the note: no exclamation marks, no emoji.

### 2.2 Vocabulary

Users never see the internal terms.

| Internal (SPEC.md) | What users see |
|---|---|
| Entry | Trade (new trade, adding to a trade) |
| Exit | Closing, reducing, moving SL/TP |
| Violation | "your rule" |
| Rule break | Past a rule ("went past your rule") |
| Unclassified order | Order we couldn't check |
| Protection off, coverage gap | DisciplineGuard was off |
| Trading day, day reset | Your trading day, resets at 00:00 |
| Looser / stricter change | "Starts at…" / "Applies now" |
| Pending change | Scheduled change |
| Connection | Device: "Chrome on Windows", "MT5 on FTMO …123" |
| Setup mode, lock | Setup mode, Lock my rules |
| Plan, license | Plan |

### 2.3 Words never used

- **Blaming words**: violation, broke, broken, tilt, revenge, fail, failed, mistake, weak, blocked, not allowed. Say "went past a rule" instead.
- **Clinical words**: addiction, disorder, compulsive, therapy, treatment. The product is a self-control tool, not a health product.
- **Advice words**: "Suggested", "recommended size". Say "Starting value" and "Lot size estimate. Check it before you trade."

These rules apply to product copy about the trader or their trades.

### 2.4 Numbers and time

- **Money**: account currency, with the sign first: "−$120". In the note, money uses the normal text color. Stats may color P/L, always with a + or − sign.
- **Times**: the user timezone, 24-hour or 12-hour by locale.
  - Today: "10:14".
  - Another day: "Tue 02:00".
  - Recent: "4 min ago".
  - Anything scheduled shows the exact time, never just "tomorrow".
- **Counts**: "Trade 6 today. Your limit is 5." In status lines, "3 of 5 trades" within the limit and "6 trades · limit 5" past it. Money in status lines keeps its sign: "Loss −$120 of $300". Never "6/5".
- **Plurals** are handled by the string catalog: "1 trade", "6 trades".

---

## 3. Surface inventory

| Surface | Phase | Purpose |
|---|---|---|
| Website | P0 waitlist, P1 beta site, P2 launch site | Explain, earn trust, sign up |
| Web app | P1 | Onboarding, rules, devices, stats, alerts, account |
| Extension: pre-install explainer (web) | P1 | Explain Chrome's permission warning before it appears |
| Extension: welcome tab | P1 | Sign in this browser, pin the icon, open TradingView |
| Extension: first-visit coach card | P1 | What is counted, open the Account Manager |
| Extension: status pill and mini panel | P1 | Ambient status while trading |
| Extension: toolbar popup | P1 | Status, today, help |
| Extension: the note | P1 | Says which rule a trade went past |
| Extension: banners and notices | P1 | Off, Needs attention, account limit |
| Windows app: sign-in, Connect, tray | P1 | Set up MT with no files, settings or codes. Keep the EA updated |
| MT EA: status panel | P1 (MT5). MT4 in P2 if demand | Today's count, the note, break and done for today |
| MT EA: setup checklist | P1 | Shown only while something needs fixing |
| Windows notifications | P1 | Alerts and summaries, from the Windows app. No bot to link |
| Email | P1 | Sign-in, renewal, security, deletion |
| Internal: page-config editor and health monitor | P1 | Fix TradingView changes |
| Internal: support console (read-only) | P1 | Help users without seeing private content |

---

## 4. Website

| Page | Phase | Key content |
|---|---|---|
| Home | P0 waitlist, P1 beta, P2 launch | "Your trading rules, counted on every trade." The hero plays a Buy past the day's limit: it goes through, the count goes to "4 of 3", and the note appears. Compared with lockout tools and journals. The three trust lines |
| How it works | P1 | Right under the hero, played: Set your rules, Connect your platform, Trade as usual, beside a window where a cursor does each step (ticks two costs and saves; downloads, Allow, Connect, On; a trade within the rules goes through, the next goes past the limit, goes through too and gets the note). Each step plays, then the next; click one to watch it. Plays only on screen; reduced motion shows each step's key frame |
| Pricing | P1 | Free: 1 trading account, every rule, no card. TradingView Paper Trading not counted. Paid plans for more accounts later |
| Where it works | P1 | One card per platform, one row per way to trade on it, each marked **Works**, **Not supported** or **Not yet**. MetaTrader 5: Windows app, phone app and web terminal work (said under the card: they count while MT5 runs with DisciplineGuard on a computer or VPS); Mac app not yet. TradingView: website in Chrome or Edge works; desktop app and phone app not supported ("Use the website instead"). Polymarket, Kalshi: website works; phone app not supported. Then "MetaTrader 4 is coming later." The top strip names each platform with its way that works. Help → Where it works and Start free's first screen show the same list (`web/src/ui/Where.tsx`) |
| What we see | P1 | "Our code is public" with a link to the client source on GitHub (the EA, the Windows app and the rules engine; the extension once built). Two columns. "We see": counts, daily P/L totals, symbol/side/size of counted trades, broker or server name, last 3 digits of accounts. "We never see": passwords, full account numbers, other websites |
| Help center | P1 | `/help`: one short article per status reason and per setup step. The EA's Help names the article for its current status |
| Search pages | P1 | "How to stop revenge trading", and one page per major firm's daily-loss rule |
| Comparison | P2 | Counts every trade by itself (DisciplineGuard) vs. locks you out (lockout tools) vs. written up by hand (journals) |
| Demo videos | P2 | One short clip per platform |
| Status and changelog | P2 | TradingView compatibility, server status, fixes |

**The three trust lines** appear once per surface where trust is decided: Home, the Windows app sign-in screen and the extension welcome tab.

1. "Every trade goes straight through. DisciplineGuard never holds, pauses or blocks an order."
2. "Each trade is counted against your rules, and a trade that goes past one is marked."
3. "We never see your broker password, and we never open, change or close a trade."

---

## 5. Web app

### 5.1 Navigation

- **Desktop**: Today · Rules · Devices · Stats · Account in the sidebar, with the counting status and Help below. Alerts are on Account.
- **Phone**: the same five as bottom tabs. Every screen works on a phone.
- **The logo** always leads to the website's first page, from every page. Signed in, the first page's buttons say "Open dashboard" ("Continue setup" before the rules are saved) instead of Sign in and Start free.

### 5.2 Sign-up and onboarding

**Sign-up**

- Email → an email with a sign-in link **and a 6-digit code**. The screen that asked offers "Enter code instead", so a link opened on the phone never strands the laptop.
- **[P2]** Continue with Google.

**Onboarding: four screens, nothing to type**

Start free opens it signed out: screens 1 to 3 need no account and the draft stays in the browser. [Save my rules] then asks to sign in ("Save your rules") and saves them to the account right after. Back is always available until the rules are saved, and progress is saved so it can be resumed.

1. **Where do you trade?**, tick all that apply, on the website's Where it works cards (§4): each way to trade on MetaTrader 5, TradingView, Polymarket and Kalshi is a tick with its mark (Works, Not supported, Not yet), then MetaTrader 4 ("Coming later") and Somewhere else. The MetaTrader 5 card says how phone and web terminal trades are counted once either is ticked. Picks that can't be counted record "tell me when it's ready".
2. **About your trading**: account type (prop challenge · funded prop · own money · demo; for prop, the firm and its daily loss limit), how you trade, usual position size in lots, and "Usual bet ($)" when Polymarket or Kalshi is picked. Only Polymarket or Kalshi: no lots and no prop types.
3. **Your rules**: "What costs you the most?", tick all that apply (§5.3). Each ticked choice opens its rules right under it, ready to adjust; a rule shows once. "I size up after a loss" shows Max size (lots) and Max bet ($) for what was picked; each applies only to its own accounts. Max risk per trade only with MetaTrader. Below: the day reset (folded), "Tightening applies now. Loosening waits until your next day reset", and [Save my rules].
4. **Connect**: one card per way in (§5.6): MetaTrader 5 through the Windows app; TradingView, Polymarket and Kalshi through the browser extension (a site's phone or desktop app also gets this card, since trades on its website are counted; MetaTrader 5's phone app or web terminal gets the Windows app card, since those trades count while MT5 runs with it). Each card's live line goes "Waiting…" → "Allowed on DESKTOP-4F2" (or Chrome) → each account and its state. One line per pick that can't be connected. On a phone: "Finish on your computer". Below: setup mode in one line, and [Go to Today] [Lock my rules now].

### 5.3 Starting templates

If two choices set the same rule, the stricter value wins.

| Choice | Starting rules |
|---|---|
| Too many trades | R1 max 5 per day · R3 3 trades within 120 s (R3 off for scalpers) |
| Win back a loss | R7 cooldown 15 min, ignoring losses under 10% of the daily limit, doubling after 2 losses in a row · R10 on (30 min) · R8 as in "Bad days" |
| Size up after a loss | R10 on (30 min) · R5 at the user's usual size · R6 1% (MT) |
| Outside plan hours | R4 from the chosen session (London 08:00–11:00, New York 14:30–17:00, shown in local time) or custom. Offers to pair with R8 |
| Skip stop loss | R9 on |
| Bad days | R8 2% (MT) or an amount (TradingView), rest 12 h, "any account at its limit counts for all" on · R1 max 5 |
| Prop account | R8 at 80% of the firm's daily limit with the firm's reset · R7 15 min · R9 on |

### 5.4 Today

Top to bottom:

1. **Devices strip**: one row per device and account with its status (§8): "Chrome · TradingView · OANDA …821 · On · seen 20 s ago".
2. **Banners** as relevant:
   - setup mode, with its lock time and "Lock my rules";
   - "Max size not set for Tradovate …789";
   - account connected to another login.
3. **Today's meters**:
   - trades (5 of 5);
   - loss per account against its limit;
   - cooldown or break (ends at…);
   - trading hours (open or closed, next window);
   - next reset.
4. **Take a break · Done for today** buttons (stricter, immediate).
5. **Scheduled changes**: "Max trades per day: now 5 → 8 from Tue 02:00 · Cancel change".
6. **Activity**: today's trades that went past a rule, with the rules, and coverage gaps.
7. **Coverage**:
   - "DisciplineGuard was off on …123 from 14:02 to 16:40 (2 trades)";
   - "Orders we couldn't check: 3 (open the Account Manager once today)";
   - "No TradingView connection during your trading hours (10:05–11:40)".
8. **This week**: trades past a rule, days kept.
9. **Calibration prompt**, when one rule caused most of a week's trades past a rule (at least 5): "14 trades went past Max trades per day this week, more than any other rule. Is it set right?"

**Empty states**

- No device: "Connect TradingView or MT to start. Your rules are ready."
- Connected, nothing past a rule: "No trade went past a rule today."
- No stats yet: "Stats start after your first trading day."

### 5.5 Rules

- **Rule cards**:
  - plain meaning, value, and platform badges;
  - a scheduled state: "Now: 5 trades a day → From Tue 02:00: 8 [Cancel change]";
  - "You set this on 12 Sep".
- **Editor**: a live verdict line as the user types.
  - Stricter: "Tighter. Applies now."
  - Looser: "Looser. Starts Tue 02:00 (in 12 hours). Your current rule stays until then. You can cancel this change anytime."
  - Setup mode: "Setup mode: applies now."
  - Setup mode, within 30 minutes after a trade past a rule: "Setup mode: applies at 10:44, 30 minutes after your last trade past a rule."
- The confirm button matches the verdict: "Apply now" or "Schedule change".
- **"Why wait?"**: "Your calm self set this rule. Waiting means a bad moment can't undo it."
- **Account sheets**, one per trading account:
  - nickname;
  - firm;
  - daily loss limit (amount or %) and its reset;
  - max position size in that account's unit;
  - "copies" magic numbers (MT).
- **R4 editor** accepts windows across midnight (22:00–02:00) and explains: "Fri 22:00–Sat 02:00 counts as Friday's session."

### 5.6 Devices and accounts

- **Device rows** with their trading accounts, state (§8), last seen and version. Account rows show nickname, platform, server and last 3 digits.
- **Add TradingView, Polymarket, Kalshi** (the browser extension, Chrome or Edge):
  1. **[Download the extension]**, then unzip it.
  2. Go to `chrome://extensions` (copy button; `edge://extensions` in Edge), turn on Developer mode, Load unpacked.
  3. On the tab that opens (§6.1), Sign in, then Allow.
  4. Open TradingView, Polymarket or Kalshi.

  The same live line as MT5: "Waiting for the extension…" → "Allowed on Chrome" → "Polymarket …a90 · On". In Safari or Firefox: "Open this page in Chrome or Edge".
- **Add MT5 (MT4 in P2)**: three steps, all outside MT.
  1. **[Download DisciplineGuard for Windows]**. One line under it: "Signed by <company>. It sets up MetaTrader for you."
  2. Open it and click **Allow** in the browser tab it opens (§7.1).
  3. Tick your MetaTrader and press **Connect**.

  Around the steps:
  - A live "Waiting for your computer…" state that flips to "Allowed on DESKTOP-4F2. Tick your MetaTrader and press Connect." after Allow, then "MT5 · FTMO-Server3 · …123 · On" when the EA first reports in.
  - Troubleshooting: "My MetaTrader isn't listed" (Browse to it) · antivirus · "I use a VPS" (install the app there too) · MT4 history setting.
  - A 30-second video.
- **New account notice**: "MT5 · FTMO-Server3 · …123 connected from DESKTOP-4F2 just now. [Not mine]".
- **Account states**: Active · Not seen since <date> · **Ended**.
- **Same account on two platforms**: "Is this the same account as MT5 …456? Connect it in one place only."
- **Remove**:
  - An Ended account: immediate. "Removed. Slot freed."
  - Otherwise: "Removing is a loosening. It takes effect Tue 02:00. Until then this account's trades are counted."
- **Cap**: "8 of 10 accounts". At the cap: "You've reached 10 accounts. Remove an account to add this one. Ended accounts are removed at once." Ended accounts are listed first.

### 5.7 Stats

**P1**

- Trades, and trades past a rule: by rule and by hour of day.
- **Days kept**: "Kept your rules on 9 of the 10 days you traded".
- **One slip**: days with exactly one trade past a rule.
- **Coverage**, shown as information, not misconduct: periods DisciplineGuard was off, orders we couldn't check, stops removed or widened.
- An account filter and a period switch.

**P3**

- The **discipline report**: worst days, limit overshoots, and size compared with the plan.
  - Only after at least 20 trades past a rule.
  - Always with the line: "Small samples swing a lot. A few trades can't show whether going past a rule pays."
  - Never a P/L total for trades past a rule on its own.

### 5.8 Alerts (on Account)

- One line: "Shown as notifications on your computer by DisciplineGuard for Windows." Without the app: "Install it".
- One switch per alert type, following SPEC §11.2.
- **Summary time**: "End of trading hours, or 60 min after the last trade" (default), or a time every 30 minutes.
- "Include amounts". "Hide amounts on screen" also hides them in alerts.
- **Send a test**: shows a notification within a minute.

### 5.9 Account

- **Alerts** (§5.8).
- **Plan**:
  - status ("Free · 1 trading account · TradingView Paper Trading doesn't count", or the renewal date);
  - change plan, cancel, request a refund;
  - the billing portal.
- **Privacy**:
  - "Hide amounts on screen", which replaces money on the pill, panel and note with "—" for screen sharing and streaming.
- **Security**:
  - web sessions with "Sign out all";
  - change email (confirmed by both addresses);
  - recent security events.
- **[P2]** Take a break for 1, 7 or 30 days (§12).
- **Data**: export (emailed link, needs a fresh sign-in), delete (§13.5).
- Sign out.

---

## 6. Chrome and Edge extension

### 6.1 Welcome tab (after install)

1. "Connect this browser". One click if the web app is signed in, otherwise a code shown here and approved from the email link on any device.
2. "Pin DisciplineGuard", with an animated hint: Chrome hides new extensions under the puzzle icon.
3. "Open TradingView".
4. Checklist: connected · TradingView open · broker connected in TradingView (with how-to).
5. The three trust lines.

### 6.2 First-visit coach card (on TradingView)

- "DisciplineGuard is on."
- "1) Open your broker's trading panel once so we can see your positions."
- "2) Every trade is counted: the order panel, Buy/Sell buttons, the DOM and chart trading. Nothing is held or blocked."
- Button: [Got it].

### 6.3 Status pill and mini panel

- **Pill**:
  - A small chip fixed near the chart's bottom-right, never over the order panel. Hidden in TradingView fullscreen.
  - Draggable. The position is remembered.
  - Collapsible to the mark alone.
  - Content: the state and one meter: "● On · 3 of 5 trades · cooldown 4:12".
  - Colors follow TradingView's theme.
- **Mini panel** (click):
  - today's meters, pending changes, detected accounts, next reset;
  - Take a break, Done for today;
  - dashboard, help.
- On a paid plan, an hour before counting ends: "Counting ends at 00:00 tonight."

### 6.4 Toolbar popup

- State, reason line and action (§8).
- Detected accounts, today's meters and pending changes.
- Open dashboard, help.
- Sign out, with the warning: "Signing out turns counting off in this browser. It's shown on Today and in your summary."

### 6.5 Banners, cards and notices on TradingView

| Situation | Copy |
|---|---|
| Global page change | Off: "TradingView changed. Trades aren't counted while we update DisciplineGuard." |
| Local page problem | Needs attention: "DisciplineGuard can't read this page. Check TradingView's language, zoom and other extensions." |
| Broker not connected | Setting up: "Connect your broker in TradingView's trading panel to start counting." |
| Account Manager unreadable | Needs attention: "Open the Account Manager once today so we can check your orders." |
| A trade went past a rule | The note (§9): "PAST YOUR RULE · MAX TRADES PER DAY / Trade 4 today. Your limit is 3. / It counts toward today." 8 s, top right |
| New broker account | "New account: OANDA …821. Max position size? [0.5] units [Set] · Not now". A first value applies now |
| Account limit | Off: "Off · Account limit. The free plan covers 1 trading account. Paper Trading doesn't count. Remove the other account on disciplineguard.com/devices." |
| Signing out while offline | "Signing out when back online. Counting stays on until then." |

---

## 7. MT: Windows app and EA

The trader never has to handle the EA. The Windows app installs, attaches, connects and updates it. Everything in this section after §7.1 happens on the chart.

### 7.1 Windows app

**First run**
1. "Sign in to DisciplineGuard" [Continue in browser]. The browser opens the web app: "Allow DisciplineGuard on this computer (DESKTOP-4F2)? [Allow] [Cancel]". If the web app isn't signed in, the normal email sign-in comes first.
2. "We found your MetaTrader". One row per terminal: broker name, folder, a tick (on by default). "Don't see it? [Browse]".
3. **[Connect]**. Per row: "Installed ✓ · Connected ✓". If MT is open: "MetaTrader needs a quick restart to finish. Open trades aren't affected. [Restart MetaTrader] [Next time I open it]".
4. "You're all set. Every trade on this account is now counted against your rules: in MetaTrader, on your phone and on the web terminal. [Open dashboard]"

The three trust lines sit under the sign-in screen only.

**Tray**
- Icon dot uses the status colors (§8). The menu: status per terminal · Open dashboard · Connect MetaTrader · Help · Report a problem.
- "New MetaTrader found: IC Markets MT5. [Connect]".
- Connected terminals show no tick to untick. Under them: "To stop counting a terminal, remove the account on the website. It's a loosening, so it waits like any other. [Open Devices]" (same as removing an account, §5.6).
- Closing the window keeps the app in the tray. Help opens the help center.
- The trader's alerts and end-of-session summary appear as Windows notifications (§11.1).

**Never**: the app never closes MetaTrader without the Restart click, never shows ads or upsells in the tray, and never asks for a broker password.

### 7.2 Panel

Trades are placed the usual way in MetaTrader. The panel only shows the count; it never places, holds or closes a trade.

- **Status line**, one short row: "● On · 3 of 5 trades · Loss −$120 of $300".
- **Today**: "Trades today: 3 of 5" · "Loss today: $120 of $300" · "Cooldown until 10:42" · "On a break until 10:29".
- **15 min break** · **Done for today** buttons.
- **The card** (§9), for 2 minutes after a trade went past a rule: "Trade 4 today. Your limit is 3. It counts toward today. [OK]".
- **Details view**: what is counted ("Every trade on this account counts: this terminal, F9, one-click, phone and web terminal."), scheduled changes, next reset, setup mode.
- **Menu**: break · done for today · setup check · theme (auto, light, dark) · help · report a problem.
- **Layout**: anchored to any corner, collapsible to the status line, and adjustable with the "Panel scale" input.
- Drawn as a canvas image with measured text. A light or dark palette follows the chart background.

### 7.3 Connecting

Nothing to type on the chart. Until the Windows app connects this terminal, the panel shows one status line and "Trades aren't counted until connected." The line is one of:

- "Open the DisciplineGuard app on this computer"
- "Sign in to the DisciplineGuard app"
- "Tick this MetaTrader in the DisciplineGuard app"
- "Connecting…"

**New MT login in a connected terminal**: "New account on this terminal: FTMO-Server3 …456. Count its trades? [Count it]".

### 7.4 Setup checklist

The EA shows it only while an item fails. With the Windows app it usually passes at once, and the panel opens straight to today's count. Each item has a one-line fix. The checks follow SPEC §9.2.

- **DisciplineGuard app running**: "Open DisciplineGuard from the Start menu." (Windows app only.)
- **Connected**: "Tick this MetaTrader in the DisciplineGuard app" or "Sign in to the DisciplineGuard app".
- **Rules loaded**.
- **Account detected**: shows broker, server and last 3 digits.
- **MT4 history**: "Set Account History to All history".

When everything passes: "On. Every trade on this account is counted."

### 7.5 Other states

| State | Copy |
|---|---|
| Secondary instance | "On · Another chart is doing the counting." |
| A trade went past a rule | The card (§9): "You're down $310 today. Your daily limit is $300. It counts toward today." |
| Account limit | "Off · The free plan covers 1 account · Trades aren't counted" |
| Built-in VPS migration | "Off · Can't run on MetaQuotes' built-in VPS. Use your terminal or your own VPS." |

### 7.6 Designing within MT limits

- Every trade is read from the account's history, so F9, one-click, other charts and the phone are all counted.
- There is no keyboard focus model: the panel needs no keyboard.
- The Mac build is tested for fonts and scaling in spike Q9.

---

## 8. Status vocabulary (every surface)

Each state has one indicator, one reason line and one action. The same words appear on the extension badge, the pill, the MT status line, Devices, alerts and help articles.

| State | Indicator | Example reason line | Action |
|---|---|---|---|
| **On** | Accent dot | "Counting MT5 · FTMO …123" · "Another chart is doing the counting." | — |
| **On (offline)** | Accent dot with an offline mark | "App not running. Rules from 10:42 apply." · "Using rules saved at 10:42. Can't reach our server." After 24 h: "Offline since yesterday 10:42. Rules are still on." | Retry |
| **Setting up** | Blue dot | "Restart MetaTrader to finish setup" · "Tick this MetaTrader in the DisciplineGuard app" | Show me how |
| **Needs attention** | Amber dot | "Open the Account Manager once today" · "DisciplineGuard can't read this page" · "Sign in again. Your saved rules still apply." | A specific fix |
| **Off** | Grey dot with a slash | "TradingView changed. Trades aren't counted while we update DisciplineGuard." · "Account limit" · "Signed out" · "Can't confirm your plan" | A specific action |
| **Not running** | Grey dot | "MT5 on FTMO …123 is closed" (normal at the end of the day) | — |

Rules:

- Red is never a status color.
- Off always says that trades aren't counted.
- Amber appears only when the user can do something about it.
- On (offline) turns amber only in the last 24 hours before `valid_until + 7 days`.

---

## 9. The note

DisciplineGuard never pauses, holds or blocks a trade. When a counted trade went past a rule, a small note says which. A trade within the rules shows nothing.

### 9.1 Layout, top to bottom

1. **Label**, small: "PAST YOUR RULE · MAX TRADES PER DAY" (the first rule's name).
2. **Line**: the fact in the trader's frame (§9.2).
3. **"It counts toward today."**, then any other rules by name: "Also: Stop loss required."

Never inside the note: upsells, plan banners, surveys or ratings requests.

### 9.2 Lines

| Rule | Line |
|---|---|
| R1 | "Trade 6 today. Your limit is 5." |
| R2 | "Trade 4 this hour. Your limit is 3." |
| R3 | "Your 2nd trade in 45 seconds." |
| R4 | "Placed at 13:42, outside your trading hours." |
| R5 | "Your EURUSD position is 0.80 lots. Your max is 0.50." |
| R6 | "This trade risks $220. Your max is $100." / "No stop loss, so its risk couldn't be checked." |
| R7 | "Placed 4 minutes after a losing trade." |
| R8 | "You're down $310 today. Your daily limit is $300." |
| R9 | "This trade has no stop loss." |
| R10 | "Bigger than the trade you just lost on (1.2 vs 0.8 lots)." |
| Break | "Placed during your break (until 10:29)." |
| Done for today | "Placed after you said you're done for today." |

### 9.3 Where it shows

- **TradingView, Polymarket, Kalshi**: a card at the top right of the page for 8 s. It never covers the order controls.
- **MT**: a card on the panel for 2 minutes, with [OK].
- **Windows notification**: the alert (§11.1).
- **Today**: the trade in Activity, with its rules.

### 9.4 Visual rules

- **Palette**: a neutral surface, the brand gradient as a thin top edge. No red or green.
- **Identity**: the DisciplineGuard mark, so it is never mistaken for the platform's own messages.
- **Motion**: a short fade, none with reduced motion. No sounds.
- **Numbers**: tabular numerals for counts, times and money.
- **Extension**: follows the site's light or dark theme. **MT**: canvas-drawn text, palette by chart background.
- **Accessibility**: the note is a polite status announcement, so a screen reader reads it without moving focus.

### 9.9 Session check-in [P2]

Once a device is connected, Today offers an optional card, dismissible for the trading day: "Tighten for today only: stop after [3] trades · stop after a loss of [150]". It applies now and reverts at the next reset. It is never looser than the locked rules, and it never blocks anything.

---

## 10. Rule-change moments

| Moment | What the trader sees |
|---|---|
| Setup mode | A banner on Today, Rules, the pill and the EA details: "Setup mode: changes apply instantly until you lock your rules (on their own at Fri 00:00)." |
| 24 h before the automatic lock | Email and Today: "Your rules lock at Fri 00:00. Review them now." |
| Lock my rules | A sheet listing each rule in plain words. A live example: "If you raise 5 trades to 8 today at 15:00, the change starts Wed 03:00." A checkbox: "I understand loosening waits until my next day reset, or 12 hours if that's later." The trader types their first name, then presses [Lock my rules]. Copy: "Setup mode happens once." Afterwards: "Locked by Alex on 12 Sep, 09:14." |
| Tighten | "Tighter. Applies now." → toast "Applied. Your devices pick it up at their next sync, within 5 minutes." |
| Loosen | Verdict with the exact time → [Schedule change] → toast "Scheduled for Tue 02:00. Cancel anytime." → a scheduled chip on the card, Today, the pill panel and the EA details |
| Cancel a scheduled change | "Cancelled. Your current rule stays." |
| Take a break / Done for today | A confirmation: "Until 10:29, every trade is marked as past your rule. Can't be shortened." |

---

## 11. Alerts

### 11.1 Trader alerts (Windows notifications)

| Alert | Message |
|---|---|
| Daily loss limit reached | "Daily loss limit reached on FTMO …123: −$310 of $300. Until Tue 11:10, a new trade goes past this rule." |
| A trade went past a rule | "A trade went past your rule" / "Buy 1 EURUSD on your phone went past 'Max trades per day'. It counts toward today." |
| A trade after the daily loss limit | "Trade after your daily loss limit" / "Buy 1 EURUSD on FTMO …123. It counts toward today." |
| DisciplineGuard was off | "DisciplineGuard was off on …123 from 14:02 to 16:40. 2 trades were placed then." |
| Account moved to another login | "Account …123 was connected to another DisciplineGuard login. If that wasn't you, sign in and check Devices." |
| Orders we couldn't check | "We couldn't check 4 of your orders today because the Account Manager was closed. How to fix: <link>" |
| End-of-session summary | "Today: 4 trades · 0 past a rule · rules kept." After a day that wasn't kept, it ends with "New trading day. Same rules." |

Each alert is a title and one or two lines, e.g. "Daily loss limit reached" / "FTMO …123: −$310 of $300. Until Tue 11:10, a new trade goes past this rule."

---

## 12. Take a break for 1, 7 or 30 days [P2]

- From Account. Every trade until then is marked as past your rule.
- It can't be shortened.

---

## 13. Free plan, paid plans, cancellation and deletion

### 13.1 Free plan

- Free for everyone, no end date: 1 trading account, every rule. TradingView Paper Trading doesn't count.
- Account: "Free · 1 trading account · TradingView Paper Trading doesn't count". No banners, countdowns or upsells.
- A second account gets the account-limit line on its platform (§6.5, §7.5) and the help article.

### 13.2 Paid plans (not linked from the product yet)

**Recap**, from the trader's own counts only: "So far: 42 trades, 5 past a rule. You kept your rules on 8 of the 10 days you traded. The rule you went past most: cooldown after a loss."

**Plans**

- Yearly (best value) and monthly, with nothing preselected.
- One line under the plans: "Tax, if any, is added at checkout."
- Beta users see the early-bird price and its terms: "$79 a year, kept at every renewal while your plan never lapses. Ends if you switch to monthly or the plan lapses."

**Next to Pay**

- One line: "Renews every year at $99. Cancel anytime. Full refund within 14 days."
- No countdown timers, fake scarcity or guilt copy.

**After paying mid-session**: "Counting is back on. Your devices update at their next sync, within 5 minutes."

### 13.3 Renewal

- An email 30 days before each yearly renewal: the date, the price (including an early-bird price), and how to cancel, with a one-click link.
- An email at least 30 days before any price change.

### 13.4 Cancellation

Account → Plan → Cancel, then one confirm. No questions, no offers.

**Confirmation**: "Cancelled. Counting stays on until 30 Oct. Your rules are saved for 90 days after that."

### 13.5 Deletion

**Delete sheet**

- **When** deletion happens:
  - "Deleted now", when counting isn't active;
  - or "Deleted at Tue 02:00. DisciplineGuard is a commitment tool, so deletion waits like a loosening. Your plan is cancelled now, and you won't be charged again."
- **What is deleted and what is kept**, and for how long (SPEC §13.3). Billing records stay with the payment provider.
- **A leaving checklist**: uninstall DisciplineGuard for Windows and the extension. No protection-off alerts are sent once deletion is requested.
- Export first, then type DELETE to confirm.

**While pending**: a banner, "Deletes Tue 02:00. [Cancel deletion]".

**After deletion**: devices show Off: "Account deleted. Orders go through normally. You can remove DisciplineGuard from MT and Chrome." The confirmation email repeats the checklist.

---

## 14. Design system foundations

### 14.1 Feel

A calm pre-flight checklist. Not a parental lock, not a casino.

### 14.2 Color tokens

| Token | Use |
|---|---|
| Neutral scale, light | Surfaces, text, borders |
| Accent: the icon's mint to aqua, with dark ink on it (not TradingView blue, not buy/sell red or green) | Primary actions, focus ring, the note's top edge, the "On" dot |
| Blue | "Setting up" |
| Amber | "Needs attention" |
| Grey | "Off", "Not running" |
| Red | Destructive buttons only (delete account) |
| P/L colors | Stats only, always with + or − signs |

Bright and light only: the website, web app and Windows app never switch to dark. The extension follows TradingView. MT follows the chart background.

The icon: two candlesticks on a mint-to-blue tile. `web/public/mark.svg` is the master; the Windows, tray and extension icons are drawn from it, pixel-tuned at 16–32 px.

### 14.3 Typography

- One sans-serif family (for example Inter), bundled. Tabular numerals for figures.
- MT: system fonts drawn on canvas.

### 14.4 Components

- **Note**: the "past your rule" card (extension, MT panel, website demos).
- **Rules**: rule card with a scheduled state, verdict line, time-window picker (across midnight), weekday picker, number input with unit, account sheet.
- **Status and devices**: status dot and pill, device row, checklist item (done, pending, blocked + fix).
- **Feedback**: banner (setup mode, billing, offline, coverage), toast with actions, sheet and confirmation dialog.
- **Data display**: meter (x of y), stat tile, empty state.

### 14.5 Localization readiness

- All strings in catalogs, including MQL string tables. ICU plurals.
- Locale-aware numbers, currency and 12/24-hour time.
- Layouts that survive text 40% longer than English, and a later right-to-left pass.
- MT fonts must cover the target scripts.
- English only in Phase 1 and Phase 2. Languages are added in Phase 3 by sign-up data.

### 14.6 Accessibility target

WCAG 2.2 AA for the website, the web app and the extension, with documented exceptions:

- **The note shows for 8 s** on the trading site. It is announced to screen readers, and the same fact stays on Today and in the alert.
- **The MT panel**: chart objects can't meet every criterion.

---

## 15. Support

- **Help center**: one short article per status reason and setup step.
- **Report a problem**, on Account (the EA menu points there):
  - Types: "A trade was counted wrong, or not counted" · Setup · Billing · Other.
  - Attached: each device's kind, version, status and last seen, and the browser. Never trades or amounts.
- **Support policy**: support can't unlock rules, apply scheduled changes early, or reopen setup mode (SPEC §1.5).
