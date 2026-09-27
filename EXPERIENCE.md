# DisciplineGuard: Experience and UI Spec v2

> Companion to SPEC.md, which defines behavior. This document defines what customers see, read and feel on every surface.
> v2 merges seven independent reviews: customer experience, technical feasibility, trader psychology, business, legal and privacy, security, and persona walkthroughs.
> Phase tags such as **[P2]** refer to PHASES.md. Untagged items ship with the feature they belong to, in Phase 1 unless PHASES.md says otherwise.
> Structure only: screens are described as content and behavior, not as mockups or code.

---

## 1. Experience principles

| # | Principle | In practice |
|---|---|---|
| 1 | Your calm self talks to your tilted self | The pause speaks in the trader's own words: their note and their plan. The app never judges, scolds or praises |
| 2 | Your style, your popup | The trader decides when the popup shows and how long it waits. By default, a trade that breaks no rule goes straight through, with no confirmation, no sound and no wait for our server |
| 3 | Always a safe way out | Skipping is the easy, default action. Closing a trade is never paused, and the UI says so wherever that fear comes up |
| 4 | Honest numbers only | Show counts and facts. Never claim money saved. Never show a P/L total for trades placed anyway on its own. No dark patterns in billing |
| 5 | Calm under stress | The pause is readable in two seconds: no red or green, no flashing, no sounds |
| 6 | One product everywhere | The same words, states and pause layout on TradingView, MT and the web app |
| 7 | Commitment is a moment | Locking rules is a deliberate step the trader takes, once |
| 8 | Always say what happens to orders | Every state that is not On says whether orders still go through (they always do) |

---

## 2. Voice and vocabulary

### 2.1 Voice

- Calm, direct, specific and kind, like an adult peer. Short sentences, second person, present tense, real numbers.
- In the pause: no exclamation marks, no emoji.

### 2.2 Vocabulary

Users never see the internal terms.

| Internal (SPEC.md) | What users see |
|---|---|
| Entry | Trade (new trade, adding to a trade) |
| Exit | Closing, reducing, moving SL/TP |
| Pause | Pause |
| Skip | Skip this trade / skipped |
| Place anyway | Place anyway / placed anyway |
| Violation | "your rule" |
| Outside trade | Trade placed outside DisciplineGuard |
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

These rules apply to product copy about the trader or their trades. Search-page titles and the trader's own answer options (such as "Failed my challenge") are exempt.

### 2.4 Numbers and time

- **Money**: account currency, with the sign first: "−$120". In the pause, money uses the normal text color. Stats may color P/L, always with a + or − sign.
- **Times**: the user timezone, 24-hour or 12-hour by locale.
  - Today: "10:14".
  - Another day: "Tue 02:00".
  - Recent: "4 min ago".
  - Anything scheduled shows the exact time, never just "tomorrow".
- **Counts**: "This would be trade 6 today. Your limit is 5." In status lines, "3 of 5 trades" within the limit and "6 trades · limit 5" past it. Money in status lines keeps its sign: "Loss −$120 of $300". Never "6/5".
- **Plurals** are handled by the string catalog: "1 trade", "6 trades".

---

## 3. Surface inventory

| Surface | Phase | Purpose |
|---|---|---|
| Website | P0 waitlist, P1 beta site, P2 launch site | Explain, earn trust, sign up |
| Web app | P1 | Onboarding, rules, devices, stats, alerts, account |
| Extension: pre-install explainer (web) | P1 | Explain Chrome's permission warning before it appears |
| Extension: welcome tab | P1 | Sign in this browser, pin the icon, open TradingView |
| Extension: first-visit coach card | P1 | What is and isn't paused, open the Account Manager |
| Extension: status pill and mini panel | P1 | Ambient status while trading |
| Extension: toolbar popup | P1 | Status, today, practice pause, help |
| Extension: pause and its states | P1 | The core moment |
| Extension: banners and notices | P1 | Off, Needs attention, trial ending, unguarded trade |
| Windows app: sign-in, Protect, tray | P1 | Set up MT with no files, settings or codes. Keep the EA updated |
| MT EA: panel, result line, details | P1 (MT5). MT4 in P2 if demand, or P1B if the P0 gate moves it | Trade and see today's status |
| MT EA: setup checklist | P1 | Shown only while something needs fixing |
| MT EA: pause | P1 | The core moment |
| Telegram bot | P1 trader, P2 partner | Alerts and summaries |
| Partner invite page (web) | P2 | Explain before Telegram |
| Email | P1 | Sign-in, setup link, trial, renewal, security, deletion |
| Uninstall page | P1 | One question, reinstall link |
| Internal: page-config editor and health monitor | P1 | Fix TradingView changes |
| Internal: support console (read-only, never shows notes) | P1 | Help users without seeing private content |

---

## 4. Website

| Page | Phase | Key content |
|---|---|---|
| Home | P0 waitlist, P1 beta, P2 launch | "Lockout tools act after your limit. DisciplineGuard pauses you at the click." The three trust lines. A picture of a pause. In P1: "Join the beta" with the invite waves explained |
| How it works | P1 | Rules → pause with your note → skip or place anyway. Tighten now, loosen later. Closing is never paused |
| Pricing | P1 | Monthly and yearly, nothing preselected. Tax treatment. Trial terms (14 days from your first connection). Renewal terms. 14-day refund. Early-bird for beta users |
| Platforms | P1 | What works where, in plain words: TradingView in Chrome and Edge only (not Safari, not the Desktop app, not the phone); MT5 on Windows; MT5 on Mac (status from spike Q9); MT4 (P2); what happens to phone trades; which TradingView paths are paused and which aren't yet; what DisciplineGuard can't see |
| What we see | P1 | "Our code is public" with a link to the client source on GitHub (the EA, the Windows app and the rules engine; the extension once built). Two columns. "We see": counts, daily P/L totals, symbol/side/size of paused orders, broker or server name, last 3 digits of accounts. "We never see": passwords, full account numbers, other websites. Notes, plans and reasons never go to analytics or partners |
| Is it allowed by my firm? | P1 article, P2 page | Per firm: the firm's written answer and its date. "Firm rules change. Check your firm's current rules. DisciplineGuard isn't affiliated with any firm and doesn't guarantee you pass." |
| Trading and wellbeing | P1 | §12 |
| Help center | P1 | One article per status reason and per setup step, with screenshots (Windows and Mac) and short videos |
| Search pages | P1 | "How to stop revenge trading", and one page per major firm's daily-loss rule |
| Comparison | P2 | Acts before the order (DisciplineGuard) vs. after the limit (lockout tools) vs. after the trade (journals) |
| Demo videos | P2 | One short clip per platform |
| Status and changelog | P2 | TradingView compatibility, server status, fixes |
| Legal | P1 | Company name and address, contact, EU and UK representatives if needed, Terms, Privacy Policy, Risk notice, Cookie notice, Refund and withdrawal policy, list of processors, trademark line. Accessibility statement from P2 |

**The three trust lines** appear on Home, in onboarding, on the extension welcome tab, in the coach card and in the EA checklist:

1. "Closing a trade is never paused."
2. "Trades that keep your rules go straight through. We never make an order wait for our server."
3. "We never see your broker password, and we never open, change or close a trade unless you click to do it."

**Footer**: "DisciplineGuard is a self-control tool. It doesn't give investment, trading, financial or tax advice. Trading carries a high risk of losing money. TradingView, MetaTrader and Telegram are trademarks of their owners; DisciplineGuard isn't affiliated with or endorsed by them."

---

## 5. Web app

### 5.1 Navigation

- **Desktop**: Today · Rules · Devices · Stats · Alerts · Account. Help and "Report a problem" in the header.
- **Mobile**: bottom tabs for Today, Rules, Stats and Alerts. Devices and Account sit in a menu. Every screen works on a phone.

### 5.2 Sign-up and onboarding

**Sign-up**

- Email → an email with a sign-in link **and a 6-digit code**. The screen that asked offers "Enter code instead", so a link opened on the phone never strands the laptop.
- The line under the button: "By continuing, you confirm you're 18 or older and agree to the Terms and Privacy Policy."
- **[P2]** Continue with Google.

**Onboarding: four screens**

Back is always available until the rules are saved, and progress is saved so it can be resumed.

1. **About your trading**, on one screen:
   - account type: prop challenge · funded prop · own money · demo. For prop: the firm (with suggestions) and its daily loss limit. Choosing a firm with a known reset sets the day reset to match;
   - how you trade (scalping · day · swing) and usual position size;
   - "DisciplineGuard protects MT5 on Windows. Also trade somewhere else?" chips: TradingView, MT4, MT5 on Mac, MT on my phone, something else. Each shows its honest one-liner and records "tell me when it's ready" (the phone line: "Phone trades can't be paused. They still count, and show up when your computer's MT is running.").
2. **What costs you the most?** Up to two choices (§5.3). Below them, "Your starting rules" names the rules they turn on, with the prop line where it applies ("We pause new trades at 4% down. Open trades can still lose more, and your firm's overall loss limit isn't tracked."). **Adjust** opens every rule card for editing. "Starting values, not advice. Set rules you'd keep on a normal day."
   - "I give back profits after a good start" is collected for a **[P3]** rule.
3. **Your note**:
   - the plan ("When a pause stops a trade, I will…") and one note, with "Add another note" (up to three) and "Preview the pause";
   - "Your day resets at <reset> · <timezone>", folded, with timezone and reset (midnight · forex close · futures session · match my prop firm · custom) inside;
   - "How protection works": tightening applies now, loosening waits until the next reset or 12 hours; closing is never paused; you choose when the pause shows and how long it waits;
   - the **risk notice** checkbox (required; version and time stored) and **analytics consent** as equal Yes/No buttons;
   - [Save my rules].
4. **Connect MT5**: the three steps of §5.7 with the live "Waiting for your computer…" state. On a phone: "Finish on your computer" with the address to open. Below: setup mode in one line, and [Try a practice pause] [Go to Today] [Lock my rules now].

### 5.3 Starting templates

These are starting values, not advice. If two choices set the same rule, the stricter value wins.

| Choice | Starting rules |
|---|---|
| Too many trades | R1 max 5 per day · R3 3 trades within 120 s (R3 off for scalpers) |
| Win back a loss | R7 cooldown 15 min, ignoring losses under 10% of the daily limit, doubling after 2 losses in a row · R10 on (30 min) · R8 as in "Bad days" |
| Size up after a loss | R10 on (30 min) · R5 at the user's usual size · R6 1% (MT) |
| Outside plan hours | R4 from the chosen session (London 08:00–11:00, New York 14:30–17:00, shown in local time) or custom. Offers to pair with R8 |
| Skip stop loss | R9 on |
| Bad days | R8 2% (MT) or an amount (TradingView), rest 12 h, "any account at its limit pauses all" on · R1 max 5 |
| Prop account | R8 at 80% of the firm's daily limit with the firm's reset · R7 15 min · R9 on |

### 5.4 Today

Top to bottom:

1. **Devices strip**: one row per device and account with its status (§8): "Chrome · TradingView · OANDA …821 · On · seen 20 s ago".
2. **Banners** as relevant:
   - setup mode, with its lock time and "Lock my rules";
   - trial ("Trial · day 4 of 14");
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
6. **Today's pauses**, with their outcomes.
7. **Coverage**:
   - "DisciplineGuard was off on …123 from 14:02 to 16:40 (2 trades)";
   - "Orders we couldn't check: 3 (open the Account Manager once today)";
   - "No TradingView connection during your trading hours (10:05–11:40)".
8. **This week**: pauses, skipped, placed anyway, days kept.
9. **Calibration prompt**, when one rule caused most of a week's pauses and they were mostly placed anyway or marked "In my plan": "Max trades per day paused 14 trades this week, and most were placed anyway. If the limit is wrong, schedule a change. It starts at your next day reset."

**Empty states**

- No device: "Connect TradingView or MT to start. Your rules are ready."
- Connected, no pauses: "No pauses yet. [Show a practice pause]"
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
  - Setup mode, within 30 minutes after a real pause: "Setup mode: applies at 10:44, 30 minutes after your last pause."
- The confirm button matches the verdict: "Apply now" or "Schedule change".
- **"Why wait?"**: "Your calm self set this rule. Waiting means a bad moment can't undo it."
- **Popup settings** (SPEC §7.2), with the same verdict line:
  - when it shows: only when I break a rule · on every new entry;
  - wait (0–60 s);
  - wait after a loss (off, or seconds + within how many minutes);
  - growing wait (off, or +seconds per trade placed anyway, with a cap; shows the example sequence);
  - type to confirm (off · always · after N trades placed anyway today);
  - skip card (on or off);
  - keyboard place anyway (accessibility option: "Type PLACE instead of clicking"; turning it on is a looser change).
- **Account sheets**, one per trading account:
  - nickname;
  - firm;
  - daily loss limit (amount or %) and its reset;
  - max position size in that account's unit;
  - "copies" magic numbers (MT).
- **R4 editor** accepts windows across midnight (22:00–02:00) and explains: "Fri 22:00–Sat 02:00 counts as Friday's session."

### 5.6 Plan and notes

- **Plan (required)**: "When a pause stops a trade, I will…". Placeholders: "stand up and get water" · "close the chart for 10 minutes" · "write the setup down first".
- **Notes** (one required, up to three), with three prompts, each filling an editable draft:
  1. "What will you do instead of this trade?"
  2. "Who or what are you doing this for?"
  3. "Last time I ignored this rule, it cost me ___."
- Examples appear as greyed placeholders, never pre-filled.
- Hint: "Write it the way a good friend would say it to you. Kind and specific works better than harsh."
- Each note can be tagged: "After a loss" · "Too many trades" · "Any pause".
- A live pause preview, including the MT layout, so long notes are seen wrapping.
- Privacy line: "Only you see your notes and plan. They're never sent to your partner or to analytics."
- After lock, adding a note applies now. Editing or deleting shows the verdict line (looser).
- **[P2]** After 30 showings or 3 weeks: "Your note has been shown 30 times. Still true? [Keep] [Rewrite]".

### 5.7 Devices and accounts

- **Device rows** with their trading accounts, state (§8), last seen and version. Account rows show nickname, platform, server and last 3 digits.
- **Add TradingView**:
  - **Pre-permission explainer**: "Chrome will say DisciplineGuard can 'read and change your data on tradingview.com'. We need that to see the order button and your positions. We don't read any other site."
  - The store link. In P1 an unlisted listing, with "why it's unlisted".
  - The welcome tab (§6.1).
- **Add MT5 (MT4 in P2)**: three steps, all outside MT.
  1. **[Download DisciplineGuard for Windows]**. One line under it: "Signed by <company>. It sets up MetaTrader for you."
  2. Open it and click **Allow** in the browser tab it opens (§7.1).
  3. Tick your MetaTrader and press **Protect**.

  Around the steps:
  - A live "Waiting for your computer…" state that flips to "MT5 · FTMO-Server3 · …123 · On" when the EA first reports in.
  - Troubleshooting: "My MetaTrader isn't listed" (Browse to it) · antivirus · "I use a VPS" (install the app there too) · MT4 history setting.
  - A 30-second video. In the beta: "Book a 10-minute setup call".
- **New account notice**: "MT5 · FTMO-Server3 · …123 connected from DESKTOP-4F2 just now. [Not mine]".
- **Account states**: Active · Not seen since <date> · **Ended** · Not enforced ("This account already used a free trial with another login. Subscribe to protect it.").
- **Same account on two platforms**: "Is this the same account as MT5 …456? Connect it in one place only."
- **Remove**:
  - An Ended account: immediate. "Removed. Slot freed."
  - Otherwise: "Removing is a loosening. It takes effect Tue 02:00. Until then this account stays protected."
- **Cap**: "8 of 10 accounts". At the cap: "You've reached 10 accounts. Remove an account to add this one. Ended accounts are removed at once." Ended accounts are listed first.

### 5.8 Stats

**P1**

- Pauses by outcome: skipped, placed anyway, timed out. Also by rule and by hour of day.
- **Days kept**: "Kept your rules on 9 of the 10 days you traded".
- **Came-back days**: "1 trade placed anyway at 10:32, then rules kept."
- **Coverage**, shown as information, not misconduct: trades placed outside DisciplineGuard, periods DisciplineGuard was off, orders we couldn't check, stops removed or widened.
- An account filter and a period switch.
- **Your baseline (MT5)**: "Before DisciplineGuard: 3.1 trades a day that would have been paused. Weeks 3–6: 1.2."

**P3**

- Reasons named in pauses, and what followed trades marked "In my plan".
- The **discipline report**: worst days, limit overshoots, and size compared with the plan.
  - Only after at least 20 trades placed anyway.
  - Always with the line: "Small samples swing a lot. A few trades can't show whether breaking a rule pays."
  - Never a P/L total for trades placed anyway on its own.

### 5.9 Alerts

- **Telegram**: "Connect Telegram" with a deep link and a **QR code** (Telegram usually lives on the phone). The bot confirms, then offers a test message.
- One switch per alert type, following SPEC §11.2.
- **Summary time**: "end of your trading hours, or 60 min after your last trade if you have none" (default), or a custom time. It is sent silently.
- **MT push**: how to set the MetaQuotes ID, with a test from the EA menu.
- An "Include amounts in my alerts" switch. Telegram and MetaQuotes deliver alerts under their own privacy policies.
- **Partner [P2]**: §11.2.

### 5.10 Account

- **Plan**:
  - status ("Trial · day 4 of 14", or the renewal date);
  - change plan, cancel;
  - "Withdraw or request a refund";
  - the billing portal.
- **Privacy**:
  - "Share product usage (never trade details)";
  - "Save the reasons I pick", with "Delete my reason history";
  - "Hide amounts on screen", which replaces money on the pill, panel and pause with "—" for screen sharing and streaming.
- **Security**:
  - web sessions with "Sign out all";
  - change email (confirmed by both addresses);
  - recent security events.
- **Wellbeing**: link to §12. **[P2]** Take a break for 1, 7 or 30 days.
- **Data**: export (emailed link, needs a fresh sign-in), delete (§13.5).
- Sign out.

---

## 6. Chrome and Edge extension

### 6.1 Welcome tab (after install)

1. "Connect this browser". One click if the web app is signed in, otherwise a code shown here and approved from the email link on any device.
2. "Pin DisciplineGuard", with an animated hint: Chrome hides new extensions under the puzzle icon.
3. "Open TradingView".
4. Checklist: connected · TradingView open · broker connected in TradingView (with how-to) · practice pause.
5. The three trust lines.

### 6.2 First-visit coach card (on TradingView)

- "DisciplineGuard is on."
- "1) Open your broker's trading panel once so we can see your positions."
- "2) Closing, reducing, moving SL/TP and cancelling orders are never paused."
- **Coverage list**:
  - Paused: order panel, Buy/Sell buttons in one-click mode, Reverse.
  - Not paused yet: DOM, chart trading, dragging order lines. "Trades placed there still count."
- Buttons: [Show a practice pause] [Got it].

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
  - practice pause, help, report a problem.
- In the last 3 days of the trial the pill says "Trial ends Thu 00:00". An hour before protection ends: "Protection ends at 00:00 tonight."

### 6.4 Toolbar popup

- State, reason line and action (§8).
- Detected accounts, today's meters and pending changes.
- Practice pause, help, report a problem.
- Sign out, with the warning: "Signing out turns protection off in this browser. It's shown on Today and in your summary."

### 6.5 Banners, cards and notices on TradingView

| Situation | Copy |
|---|---|
| Global page change | Off: "TradingView changed. Orders go through normally while we update DisciplineGuard." |
| Local page problem | Needs attention: "DisciplineGuard can't read this page. Check TradingView's language, zoom and other extensions. Orders go through unchecked until then." |
| Broker not connected | Setting up: "Connect your broker in TradingView's trading panel to turn on protection." |
| Account Manager unreadable | Needs attention: "Open the Account Manager once today so we can check your orders." |
| Trade placed through an unguarded path | "That trade came from the DOM, which can't be paused yet. It still counts." |
| New broker account | "New account: OANDA …821. Max position size? [0.5] units [Set] · Not now". A first value applies now |
| Not enforced | Off: "This account already used a free trial with another login. Orders go through normally. [See plans]" |
| Trial or plan ended | A one-time card at the first visit after the end: "Your trial ended at 00:00. Trades are no longer paused. Your rules are saved until 25 Dec. [See plans]" |
| Signing out while offline | "Signing out when back online. Protection stays on until then." |

---

## 7. MT: Windows app and EA

The trader never has to handle the EA. The Windows app installs, attaches, connects and updates it. Everything in this section after §7.1 happens on the chart.

### 7.1 Windows app

**First run**
1. "Sign in to DisciplineGuard" [Continue in browser]. The browser opens the web app: "Allow DisciplineGuard on this computer (DESKTOP-4F2)? [Allow] [Cancel]". If the web app isn't signed in, the normal email sign-in comes first.
2. "We found your MetaTrader". One row per terminal: broker name, folder, a tick (on by default). "Don't see it? [Browse]". Below the list, ticked by default: "Include my last 90 days of trades. Used only for your own before/after comparison. Only you see it." 
3. **[Protect]**. Per row: "Installed ✓ · Algo Trading on ✓ · Connected ✓". If MT is open: "MetaTrader needs a quick restart to finish. Open trades aren't affected. [Restart MetaTrader] [Next time I open it]".
4. "Done. Open any chart: the DisciplineGuard panel is there. [Try a practice pause]".

The three trust lines sit at the bottom of every first-run screen.

**Tray**
- Icon dot uses the status colors (§8). The menu: status per terminal · Open dashboard · Practice pause · Protect another MetaTrader · Help · Report a problem.
- "New MetaTrader found: IC Markets MT5. [Protect]".
- Unticking a terminal: "Removing protection is a loosening. It takes effect Tue 02:00. Until then this terminal stays protected." (Same as removing an account, §5.7.)

**Never**: the app never closes MetaTrader without the Restart click, never shows ads or upsells in the tray, and never asks for a broker password.

### 7.2 Panel

- **Order entry**: Buy and Sell; order type (Market, Limit, Stop); size in lots with a risk calculator (risk % or amount + SL → lots, labelled "Lot size estimate. Check it before you trade."); SL and TP in pips or price, with a draggable SL line; "Close all on this symbol". The panel remembers the last setup.
- **Result line** after every order: "Placed: Buy 0.80 EURUSD at 1.10030", or "Not placed: stop loss too close to price".
- **Status line**, one short row: "● On · 3 of 5 trades · Loss −$120 of $300".
- **Details view**: cooldown, outside trades today, pending changes, next reset.
- **Menu**: practice pause · hide quick-trade buttons on all charts · setup check · theme (auto, light, dark) · help · report a problem.
- **Layout**: anchored to any corner, collapsible to the status line, and adjustable with the "Panel scale" input.
- Drawn as a canvas image with measured text. A light or dark palette follows the chart background.

### 7.3 Connecting

Nothing to type on the chart. Until the Windows app connects this terminal, the panel shows one status line and "Your rules are set on the website. Orders go through normally until this terminal is connected." The line is one of:

- "Open the DisciplineGuard app on this computer"
- "Sign in to the DisciplineGuard app"
- "Tick this MetaTrader in the DisciplineGuard app"
- "Connecting…"

**New MT login in a protected terminal**: "New account on this terminal: FTMO-Server3 …456. Protect it? [Protect]".

### 7.4 Setup checklist

The EA shows it only while an item fails. With the Windows app it usually passes at once, and the panel opens straight to trading. Each item has a one-line fix. The checks follow SPEC §9.2.

- **DisciplineGuard app running**: "Open DisciplineGuard from the Start menu. Your saved rules still apply." (Windows app only.)
- **Algo Trading**: names which switch is off. The Windows app normally turns it on.
- **Connected**: "Tick this MetaTrader in the DisciplineGuard app" or "Sign in to the DisciplineGuard app".
- **Rules loaded**.
- **Account detected**: shows broker, server and last 3 digits.
- **Quick-trade buttons**: a "Hide on all charts" button.
- **MT4 history**: "Set Account History to All history".
- **Firm line** from the Q5 answers: "FTMO: third-party trade panels allowed (FTMO support, 12 Sep 2026)", or "Not confirmed yet".

When everything passes: "On. Try a practice pause."

### 7.5 Other states

| State | Copy |
|---|---|
| Secondary instance | "On (panel only). Another chart is doing the counting." |
| Outside trade went past a rule | A quiet card: "A trade placed outside DisciplineGuard went past your 'Daily loss limit'. It counts toward today." |
| Protection ended | "Off · trial ended · Orders go through normally · Plans: disciplineguard.com/plans" (text, since the EA can't open links). The panel keeps working as a plain panel with the calculator |
| Not enforced | "Off · this account already used a free trial with another login" |
| Built-in VPS migration | "DisciplineGuard can't run on MetaQuotes' built-in VPS. Keep it on your terminal or your own VPS." |

### 7.6 Designing within MT limits

- Chart objects cannot block F9, native one-click or other charts. The pause dims the chart, and the checklist and help explain that trades placed around it still count.
- There is no keyboard focus model. Skip this trade is visually primary, Esc skips, and Enter does nothing.
- A compact pause (title, note, buttons) is used on narrow charts.
- The Mac build is tested for fonts and scaling in spike Q9.

---

## 8. Status vocabulary (every surface)

Each state has one indicator, one reason line and one action. The same words appear on the extension badge, the pill, the MT status line, Devices, Telegram and help articles.

| State | Indicator | Example reason line | Action |
|---|---|---|---|
| **On** | Accent dot | "Protecting MT5 · FTMO …123" · "Panel only. Another chart is doing the counting." | — |
| **On (offline)** | Accent dot with an offline mark | "DisciplineGuard app isn't running. Rules saved at 10:42 still apply." · "Using rules saved at 10:42. Can't reach our server." After 24 h: "Offline since yesterday 10:42. Rules are still on." | Retry |
| **Setting up** | Blue dot | "Restart MetaTrader to finish setup" · "Tick this MetaTrader in the DisciplineGuard app" | Show me how |
| **Needs attention** | Amber dot | "Algo Trading is off, so the panel can't place trades" · "Open the Account Manager once today" · "DisciplineGuard can't read this page" · "Sign in again. Your saved rules still apply." | A specific fix |
| **Off** | Grey dot with a slash | "TradingView changed. Orders go through normally while we update DisciplineGuard." · "Trial ended" · "Signed out" · "Can't confirm your plan" · "This account already used a free trial" | A specific action |
| **Not running** | Grey dot | "MT5 on FTMO …123 is closed" (normal at the end of the day) | — |

Rules:

- Red is never a status color.
- Off always says that orders go through.
- Amber appears only when the user can do something about it.
- On (offline) turns amber only in the last 24 hours before `valid_until + 7 days`.

---

## 9. The pause

### 9.1 Layout, top to bottom

1. **Label**, small: "PAUSE · YOUR RULE".
2. **Headline**: one line, the fact in the trader's frame (§9.2).
3. **Other rules also affected**: at most two lines, then "+1 more".
4. **The note**: the largest text, in quotes, set in its own typeface, with the attribution "you, 12 Sep".
5. **Your plan**: "Your plan: close the chart for 10 minutes."
6. **Way-out or fix line** (§9.2).
7. **Protect-the-day line**, only when true: "Today is a kept day so far."
8. **Situational lines**, each only when it applies:
   - re-attempt: "You skipped this trade 40 s ago."
   - outside trade: "1 trade today was placed outside DisciplineGuard and went past a rule."
   - scheduled change: "Your change to 8 trades a day starts at 02:00."
   - partner **[P2]**: "Sam gets a message if you place this anyway."
9. **Today**, one quiet line of facts: "Trade 6 today · 2 losses in a row · last loss 4 min ago". It shows P/L only when the headline is the daily loss limit.
10. **Order**: "Buy 0.50 EURUSD · SL 1.0950", with the side shown as a neutral chip.
11. **Name it (optional)**: reason chips (§9.5).
12. **Wait line**: a thin progress bar under the note, hidden when the wait is 0 s. When the trader turned on the growing wait and it has grown: "Wait today: 20 s. It grows with each trade placed anyway and resets at your next trading day."
13. **Buttons**:
    - **Skip this trade**: primary, focused, accent color.
    - **Place anyway**: secondary, disabled while waiting ("Place anyway · 0:08"). When unlocked it reads "Place Buy 0.50 EURUSD anyway".
    - **Type to confirm**, when turned on and it applies: "Type 7 to place trade 7 today" [field]. Neutral wording only.
    - **MT only**, when the fix is the only thing left: "Place at <fix> lots" (the largest size that keeps the position within the limit) or "Add stop loss".
14. **Footer**, small: "Closing, moving SL/TP and cancelling orders are never paused. To close a position, skip first."

Never inside the pause: upsells, trial banners, surveys or ratings requests.

### 9.2 Headlines and way-out lines

For R2, R3, R7 and R10, the pause does **not** show a countdown to the moment the trader can go again. That would schedule the next impulsive trade. The pause shows the plan instead. The end time is shown where the trader looks when calm: the pill, the panel details and Today. R8 does show when the rest ends, because it lasts hours.

| Rule | Headline | Way-out or fix line |
|---|---|---|
| R1 | "This would be trade 6 today. Your limit is 5." | "Your limit resets Tue 00:00." |
| R2 | "This would be trade 4 this hour. Your limit is 3." | Plan line only |
| R3 | "This is your 2nd trade in 45 seconds." | Plan line only |
| R4 | "It's 13:42. Your trading hours start at 14:30." | "Your hours open at 14:30." |
| R5 | "This would make your EURUSD position 0.80 lots. Your max is 0.50." | "Trade 0.50 lots or less." |
| R6 | "This trade risks $220. Your max is $100." / "No stop loss, so risk can't be checked." | "0.45 lots fits at this stop." / "Add a stop loss." |
| R7 | "Your last trade closed at a loss 4 minutes ago." | Plan line only |
| R8 | "You're down $310 today. Your daily limit is $300." | "You're done for today. Your rest ends Tue 11:10." |
| R9 | "This trade has no stop loss." | "Add a stop loss." |
| R10 | "This is bigger than the trade you just lost on (1.2 vs 0.8 lots)." | "Trade 0.8 lots or less." |
| Break | "You're on a break until 10:29." | Plan line only |
| Done for today | "You said you're done for today." | "Your trading day resets at 00:00." |
| Every new entry, no rule broken | "Check your plan before this trade." | Plan line only |

### 9.3 After the decision

**Skip.** If the skip card is on, it stays for 10 s or until closed:

> "Trade skipped. Today is still a kept day."
> "Your plan: close the chart for 10 minutes."
> [Take a 15-minute break] [Done for today] [Close]

The first line appears only when true.

**Place anyway**

- **TradingView**: the pause says before unlock: "After Place anyway, click Buy once more." Place anyway closes it and shows a small card: "Click Buy to place it (10 s)." After the trader's click, the card closes (sent) or shows the broker's reason (rejected). If 10 s pass with no click, the card goes away and the next Buy opens a new pause. The extension never clicks for the trader.
- **MT**: the card closes. The panel's result line confirms the order.
- No guilt message. The status line updates: "6 trades · limit 5".

**Timeout**: "Pause closed after 2 minutes. Trade not placed. Your plan: …"

**Hidden tab (extension)**: on return, "The countdown paused while this tab was in the background."

### 9.4 Practice pause

- The same layout with a "Practice" label and an example order.
- Nothing is sent, counted or logged.
- Available in onboarding, the toolbar popup, the pill, the EA menu and Today.

### 9.5 Name it (optional)

- Chips: "Afraid to miss it" · "Winning back a loss" · "Frustrated" · "Bored" · "On a roll" · "In my plan".
- One tap, never required, available until the decision.
- The chips never change the wait.
- **First use**: "Save the reasons you pick? Only you see them, in your stats. [Save my reasons] [Don't save]". Without consent, chips still show, but nothing is stored.
- **[P2]** For trades placed anyway with no chip, the summary asks once: "What was going on at 10:32?"

### 9.6 Visual rules

- **Palette**: a neutral surface with one calm accent (teal or indigo) on Skip this trade only. No red or green anywhere. Place anyway is never colored like the platform's Buy (blue) or Sell (red).
- **Identity**: a distinct DisciplineGuard surface with a small mark, so it is never mistaken for TradingView's own order dialog.
- **Position**: centered in the viewport, never at the clicked button. Place anyway is placed away from where the original Buy/Sell button was.
- **Motion**: no pulse or color change when Place anyway unlocks. Fade-in under 200 ms, and none with reduced motion. No sounds.
- **Numbers**: tabular numerals for counts, timers and money.
- **Extension**: follows TradingView's light or dark theme, with bundled fonts.
- **MT**: canvas-drawn text, scaled by DPI and panel scale. Palette by chart background.
- **Size**: buttons at least 44 × 44 px. The card is about 440–520 px wide, or full width minus margins on small screens and narrow charts.

### 9.7 Accessibility (extension and web)

- Announced as a modal alert dialog, labelled by the headline and described by the note.
- Focus stays inside and starts on Skip this trade. Esc skips.
- The countdown is announced at the start ("Place anyway available in 15 seconds") and at unlock, never every second.
- Text contrast at least 4.5:1, button boundaries 3:1, and a visible focus ring that does not rely on TradingView's styles.
- Tested with a screen reader inside the closed shadow root.
- MT chart objects cannot support screen readers. Alerts carry the full meaning in text.

### 9.8 The pause on MT

- The same hierarchy, drawn on canvas, with a solid backdrop.
- The compact form (headline, note, buttons) is used on narrow charts.
- The fix buttons appear when the size or SL fix is the only thing left.

### 9.9 Session check-in [P2]

The first time a device is On in a trading day, an optional, dismissible card offers:

- "How are you arriving? Rested · Tired · Stressed · Upset". Saved only with the same consent as reasons.
- "Tighten for today only: stop after [3] trades · pause after −$[150]". It applies now and reverts at the next reset. It is never looser than the locked rules.
- Tired, Stressed or Upset suggests one tighten. The check-in never blocks anything.

---

## 10. Rule-change moments

| Moment | What the trader sees |
|---|---|
| Setup mode | A banner on Today, Rules, the pill and the EA details: "Setup mode: changes apply instantly until you lock your rules (on their own at Fri 00:00)." |
| 24 h before the automatic lock | Email and Today: "Your rules lock at Fri 00:00. Review them now." |
| Lock my rules | A sheet listing each rule in plain words, the plan and the notes. A live example: "If you raise 5 trades to 8 today at 15:00, the change starts Wed 03:00." A checkbox: "I understand loosening waits until my next day reset, or 12 hours if that's later." The trader types their first name, then presses [Lock my rules]. Copy: "Setup mode happens once." Afterwards: "Locked by Alex on 12 Sep, 09:14." |
| Tighten | "Tighter. Applies now." → toast "Applied. Your devices pick it up at their next sync, within 5 minutes." |
| Loosen | Verdict with the exact time → [Schedule change] → toast "Scheduled for Tue 02:00. Cancel anytime." → a scheduled chip on the card, Today, the pill panel and the EA details |
| Cancel a scheduled change | "Cancelled. Your current rule stays." |
| Scheduled change for the rule in a pause | The pause line: "Your change to 8 trades a day starts at 02:00." |
| Take a break / Done for today | A confirmation: "Every new trade will be paused until 10:29. This can't be shortened." |

---

## 11. Alerts and partner

### 11.1 Trader messages (Telegram, MT push)

| Alert | Message |
|---|---|
| Daily loss limit reached | "Daily loss limit reached on FTMO …123: −$310 of $300. New trades are paused until Tue 11:10." |
| Outside trade went past a rule | "A trade placed on MT mobile went past 'Max trades per day'. It counts toward today." |
| DisciplineGuard was off | "DisciplineGuard was off on …123 from 14:02 to 16:40. 2 trades were placed then." |
| Account moved to another login | "Account …123 was connected to another DisciplineGuard login. If that wasn't you, sign in and check Devices." |
| Orders we couldn't check | "We couldn't check 4 of your orders today because the Account Manager was closed. How to fix: <link>" |
| End-of-session summary | "Today: 4 trades · 1 pause · 1 skipped · rules kept." After a day that wasn't kept, it ends with "New trading day. Same rules." |
| **[P2]** Reflection | "How did today go? [On plan] [Mostly] [Not really]", then "One line for tomorrow's you?" The reply becomes the first note shown tomorrow |

Commands and buttons: Today · Status · Help · Unlink.

### 11.2 Accountability partner [P2]

**Trader side** (Alerts → Add a partner):

- The trader enters their own name as the partner will see it, and the partner's name.
- A preview shows every message type.
- A "Share amounts" switch, off by default.
- A note: "Your notes, plan and reasons are never shared."
- The trader gets an invite link to share.
- Status shows: Invite sent · Waiting for your confirmation · Active · Left.

**Invite page (web)**, before Telegram:

- who invited them;
- DisciplineGuard in two lines;
- the exact message list;
- how to get Telegram;
- [Open in Telegram], with a fallback code for when the link is lost during install.

**Consent in Telegram**:

> "Alex asked you to be their trading accountability partner. You'll get a short message when Alex reaches their daily loss limit, places a trade anyway after it, turns DisciplineGuard off or trades while it's off, connects their account to another login, takes a break of 1 to 30 days, has their plan end or refunded, has a support change made to their account, or asks to delete their account. Other trades placed anyway, trades placed outside DisciplineGuard that went past a rule, and stops removed or widened come in one summary after Alex's session. You won't see amounts. We store your Telegram ID and the name Alex gave you, only to send these messages. You must be 18 or older. Quiet hours: 22:00–08:00, Alex's time (you can change this). Privacy: <link>."
> [Accept] [No thanks]

The line about amounts changes if the trader shares them. After Accept, the trader sees the partner's Telegram name and @handle and taps Confirm before alerts start.

**Tone** of real-time messages: factual, no counts.

> "Alex placed a trade anyway after reaching their daily loss limit. No need to reply now. If you talk later, asking how the day went helps more than advice."

Every message has two buttons:

- [What does this mean?]: "You don't need to do anything now. A calm check-in later helps more than a call during trading."
- [Quiet hours].

A [Stop] button is always available.

**Quiet hours**: messages held during quiet hours arrive as one message with their times: "While quiet hours were on: 23:40 …, 00:15 …".

**Digest**, after the trader's session: "Alex's session: 2 trades placed anyway (max trades per day). Rules kept 4 of 5 trading days this week."

**Ending**: the messages in SPEC §11.4. Removal and "stop sharing amounts" apply immediately. The partner is told.

---

## 12. Trading and wellbeing

**[P1] Help page "Trading and wellbeing"**

- Linked from the footer and from Account, never from the pause.
- It lists free, confidential services by country, such as the UK National Gambling Helpline (GamCare), 1-800-GAMBLER in the US, Gambling Help Online in Australia, and Gamblers Anonymous.
- Before listing a service, confirm that it accepts trading-related problems.
- No clinical labels.

**[P2] Harm-marker note**

- Shown to the trader only, at most once every 30 days, on Today only. Never in Telegram, email or the summary.
- Never in the pause, never to the partner, and in analytics only as aggregate counts.
- Triggers:
  - an MT deposit within 24 h after reaching the daily loss limit;
  - placing anyway on R8 on 3 or more days in 14;
  - trades between 00:00 and 05:00 outside R4 on several days;
  - 3 or more new prop accounts in 30 days.
- Copy: "Some stretches are harder than others. If trading is costing you sleep, money you need, or time with people, talking to someone helps. It's free and confidential. [See support] [Not now]"

**[P2] Take a break for 1, 7 or 30 days**

- Every new trade is paused with a 45 s wait and type to confirm.
- It can't be shortened.
- The partner is told.

---

## 13. Trial, paywall, cancellation and deletion

### 13.1 Trial

- "Trial · day 4 of 14" on Today. The trial starts when the first device is On.
- In the last 3 days: "Trial ends Thu 00:00" on the pill, the EA status line, Today and in an email.
- One moment everywhere: the trial ends at the first day reset after 14 days, and protection stops then. Emails, banners and the pill all state that time.
- 60 minutes before: "Protection ends at 00:00 tonight."
- After it ends: a one-time card on each platform (§6.5, §7.5).

### 13.2 Paywall and plans

**Recap**, from the trader's own counts only: "In your trial: 11 pauses. You skipped 4 trades. You kept your rules on 8 of the 10 days you traded. Your most frequent pause: cooldown after a loss."

**Plans**

- Yearly (best value) and monthly, with nothing preselected.
- The price shows whether tax is included.
- Beta users see the early-bird price and its terms: "$79 a year, kept at every renewal while your plan never lapses. Ends if you switch to monthly or the plan lapses."

**Next to Pay**

- The renewal terms, with an unticked "I agree to automatic renewal" box.
- "Full refund within 14 days of your first payment."
- No countdown timers, fake scarcity or guilt copy.

**After paying mid-session**: "Protection is back on. Today so far: 6 trades, −$180. These count, so your next trade will be paused. Your devices update at their next sync, within 5 minutes."

### 13.3 Renewal

- An email 30 days before each yearly renewal: the date, the price (including an early-bird price), and how to cancel, with a one-click link.
- An email at least 30 days before any price change.

### 13.4 Cancellation

**Where**: Account → Plan → Cancel. At most two screens.

**Screen 1, one optional question**: "What's the main reason?"

- Passed my challenge
- Failed my challenge
- Between challenges or taking a break
- Too expensive
- Setup problems
- Too many pauses
- Didn't help
- Stopped trading
- Other (with text)

**Screen 2, one tailored offer at most, never a guilt trip**:

- Setup problems → "Book a setup call".
- Too many pauses → "Review your rules" (the scheduled-change flow).
- Too expensive → yearly.
- Between challenges → a pause subscription, if the Phase 1 gate adds it.

**Confirmation**: "Cancelled. Protection stays on until 30 Oct. Your rules are saved for 90 days after that."

An unticked opt-in: "Tell me about major improvements." Without it, no email is sent after cancellation.

### 13.5 Deletion

**Delete sheet**

- **When** deletion happens:
  - "Deleted now", when protection isn't active;
  - or "Deleted at Tue 02:00. DisciplineGuard is a commitment tool, so deletion waits like a loosening. Your plan is cancelled now, and you won't be charged again."
- **What is deleted and what is kept**, and for how long (SPEC §13.5). Billing records stay with the payment provider. Messages already sent stay in Telegram.
- **A leaving checklist**: remove the EA, uninstall the extension, leave the bot. No protection-off alerts are sent once deletion is requested.
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
| Neutral scale, dark and light | Surfaces, text, borders |
| Accent (one hue, teal or indigo; not TradingView blue, not buy/sell red or green) | Primary actions, focus ring, Skip this trade, the "On" dot |
| Blue | "Setting up" |
| Amber | "Needs attention" |
| Grey | "Off", "Not running" |
| Red | Destructive buttons only (delete account) |
| P/L colors | Stats only, always with + or − signs |

Dark mode is first-class. The web app follows the system setting with a manual switch. The extension follows TradingView. MT follows the chart background.

### 14.3 Typography

- One sans-serif family (for example Inter), bundled. Tabular numerals for figures.
- A humanist serif for the note only, so "your voice" looks different from system text.
- MT: system fonts drawn on canvas.

### 14.4 Components

- **Pause**: pause card, practice pause, countdown button, type-to-confirm field, reason chip, skip card.
- **Rules**: rule card with a scheduled state, verdict line, time-window picker (across midnight), weekday picker, number input with unit, account sheet.
- **Status and devices**: status dot and pill, device row, checklist item (done, pending, blocked + fix).
- **Feedback**: banner (setup mode, billing, offline, coverage), toast with actions, sheet and confirmation dialog.
- **Data display**: meter (x of y), stat tile, empty state.
- **Alerts**: partner message preview.

### 14.5 Localization readiness

- All strings in catalogs, including MQL string tables. ICU plurals.
- Locale-aware numbers, currency and 12/24-hour time.
- Layouts that survive text 40% longer than English, and a later right-to-left pass.
- MT fonts must cover the target scripts.
- English only in Phase 1 and Phase 2. Languages are added in Phase 3 by sign-up data.

### 14.6 Accessibility target

WCAG 2.2 AA for the website, the web app and the extension, with documented exceptions:

- **Place anyway needs a pointer click** (SPEC invariant 5). An opt-in "Type PLACE" setting gives keyboard and switch users a deliberate alternative.
- **The countdown and the 2-minute timeout** are time limits that are part of the product's purpose.
- **The MT panel**: chart objects can't meet every criterion.

From Phase 2, publish an accessibility statement listing these exceptions and a contact address. Never claim "fully accessible" or "WCAG compliant" without an audit.

---

## 15. Support and feedback

- **Help center**: one article per status reason and setup step, plus "Is it allowed by my firm?" and "Trading and wellbeing".
- **Report a problem**, from the web app, the pill, the toolbar popup and the EA menu:
  - Types: "This order should not have been paused" · "This order should have been paused but wasn't" · Setup · Billing · Other.
  - Automatically attached: client type and version, config version, self-test results, status history for the last 24 h, recent event types without values, browser and OS or MT build, hedging or netting, web-access status, last error codes.
  - A preview shows exactly what will be sent. The order details of the last pause are included only with an opt-in checkbox. Notes, plans and reasons are never attached.
- **Support policy**, stated in the help center: support can't unlock rules, apply scheduled changes early, or reopen setup mode (SPEC §1.5).
- **Beta programme**:
  - Wave 1 gets founder setup calls, which double as interviews.
  - A private Discord or Telegram group with setup-help, bugs and wins channels. Rules: no trade calls, signals or offers to manage accounts, and no P/L screenshots required.
  - A changelog post per release.
- **Feedback loops**:
  - Day 3: "Is DisciplineGuard pausing the right trades? Yes · Too often · Not enough · Not sure".
  - **Product-fit survey**, once, after a day without a pause, for users with 3 or more real pauses: "How would you feel if you could no longer use DisciplineGuard?" and "Has a pause stopped a trade you're glad you didn't take?"
  - Weekly: "This week, how in control of your trading did you feel? 1–5".
  - Interviews with the users who skip most and those who place anyway most.
- **Uninstall page**: "What happened?" (setup · blocked something I needed · too many pauses · switched platform · stopped trading · other) plus an optional email, and a reinstall link.

---

## 16. Experience metrics

| Metric | Definition |
|---|---|
| Onboarding completion | Sign-up → a device On and rules locked |
| Setup success per platform | Started connecting → On |
| Setup failure points | Which checklist item or step fails most |
| Self-serve setup | Reached On with no support contact |
| Practice pause rate | Users who ran one before their first real pause |
| Added delay | Extra delay on trades with no pause (SPEC §14) |
| Product fit, control self-report | SPEC §14 |
| Support rate | Problem reports per 100 active users, by type |
| Uninstall and cancel reasons | Distribution of answers |
