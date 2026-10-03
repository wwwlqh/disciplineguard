# DisciplineGuard: Behavior Specification v2

> Document set:
> - **SPEC.md** (this file): what the product does. The contract every client and the server follow.
> - **EXPERIENCE.md**: what customers see and read.
> - **PHASES.md**: what gets built, in order.
>
> Keywords: **MUST** = required. **SHOULD** = expected, may slip with a written reason. **MAY** = optional.
> Phase tags such as **[P1A]** refer to PHASES.md. Untagged behavior applies from the phase that ships the feature.
> Structure only: no code. Formulas and field names are there to remove ambiguity.

---

## 1. Scope, invariants, threat model

### 1.1 Scope

The phase plan (PHASES.md) decides what ships when. This spec describes the complete behavior of every feature planned through Phase 2, plus the items tagged [P3]. Other Phase 3 bets get their own spec sections before they are built, and never change earlier rules.

Not planned at any phase:

- TradingView Desktop app and TradingView mobile. A browser extension cannot run there.
- Holding, pausing or blocking an order in any way. Since 3 Oct 2026 DisciplineGuard only counts: every trade goes straight through and is counted against the rules.
- Sharing any user data with prop firms or brokers.
- A full trading journal. Export to existing journals instead.

### 1.2 Terms used in this spec vs. in the product

This spec uses precise internal terms. Users see the words in EXPERIENCE.md §2. For example, the internal "entry" is a "trade", and a "violation" is a "rule break".

### 1.3 Invariants (never break these)

1. **No order is ever held, paused, delayed or blocked.** Every order goes straight through. DisciplineGuard only reads it and counts it.
2. **DisciplineGuard never opens, changes or closes a trade.**
3. **Counting never makes an order wait on the network.** Every count and rule check is made from data already on the device, after or alongside the order.
4. **A looser change never takes effect early**, including offline and after a reinstall. Signing out, uninstalling and switching a connection to another login are not loosenings: they end counting on that connection at once, are always visible (§10.6), and never change either login's rules or pending changes.
5. **Symbols, prices, sizes and P/L amounts never reach analytics or anyone else.**
6. **A client that has synced at least once keeps counting against its saved rules** when the network fails, when its web access is blocked, or when the server rejects it. Counting ends only in the cases listed in §10.5.

Any confirmed breach of invariants 1–3 stops feature work until it is fixed (PHASES.md).

### 1.4 Threat model

DisciplineGuard is a mirror, not a lock: it never stops a trade. The design goal is that every trade is counted, and every way around the counting is **slow** (it waits like a loosening) or **visible** (it shows on Today and in the end-of-session summary).

Known paths that are neither slow nor visible, accepted and stated on the Platforms page:

- Trading in TradingView Desktop, TradingView mobile, an incognito window, another browser profile or a browser without the extension. These are partly caught later (§10.6), when TradingView's history is readable.
- A patched EA, a modified extension or a modified Windows app. The client source is public (PHASES.md), so this path is known, not hidden.
- Closing the DisciplineGuard Windows app. This is not a bypass: the EA keeps counting against its saved rules and shows **On (offline)** (§9.5). It is visible on Today as an offline period.

### 1.5 Support and admin policy

- Support never activates a scheduled change early, never reopens setup mode, never loosens or disables a rule, and never changes the account email outside the two-address flow (§10.9).
- The only exception is undoing changes made by a session the user reports as not theirs.
- Every admin write is logged and emailed to the user.
- The help center states this policy.

---

## 2. Definitions

| Term | Meaning |
|---|---|
| **User** | One DisciplineGuard login (email). Owns one rule set. |
| **Connection** | One signed-in browser extension install, or one MT terminal. An MT terminal is connected by the DisciplineGuard Windows app (§9.5). Holds a device token. |
| **Trading account** | One broker account seen by a connection: an MT4 login, an MT5 login, or one TradingView broker account. Identified by platform + server + an HMAC of the account number. A trading account can be seen by several connections (for example desktop and VPS). |
| **Click path** | A way of placing an order whose click the extension reads, so the order is counted with its stop loss at the click (§9.1). |
| **Windows app** | "DisciplineGuard for Windows": a signed desktop app that installs, attaches, updates and connects the EA for the trader, and carries its network traffic (§9.5). |
| **Adapter** | The platform-specific part of a client: it finds the order controls, describes an order, and reads the account's trades. Everything else (`evaluate()`, the rule-break note, sync) is shared (§9.0). |
| **Entry** | An order that opens a new position or increases an existing one (§4). |
| **Exit** | An order that only closes or reduces a position, changes SL/TP, or cancels a pending order. |
| **Unclassified order** | A click-path order the client cannot classify as entry or exit (§4.5). |
| **Trading day** | The period between two day resets (§3). |
| **Violation** | A rule that an entry broke, as returned by `evaluate()` for the state just before it (§8). |
| **Rule break** | A counted entry with at least one violation (§7). Stored as an `override` event, for history. |
| **Kept day** | A trading day with at least one entry, no rule break, and no entry placed while counting was off. |
| **Setup mode** | The single period after sign-up when every rule change applies immediately (§6.1). |
| **Lock** | The end of setup mode, by the user or automatically. |
| **Protection state** | On, On (offline), Setting up, Needs attention, Off, Not running. Defined in EXPERIENCE.md §8. |
| **Coverage** | Time intervals during which a connection was running and counting for a trading account (§10.6). |

---

## 3. Time and the trading day

### 3.1 Day reset

- A **day reset** is a local time **plus an IANA timezone**. Presets:
  - `Local midnight` (default): 00:00 in the user timezone.
  - `Forex close`: 17:00 `America/New_York`.
  - `Futures session`: 17:00 `America/Chicago`.
  - `Broker server midnight` (MT): 00:00 in the broker's server time, from the broker offset (§3.3).
  - `Custom`: any HH:MM in any IANA zone. Used for prop firms (for example 00:00 `Europe/Prague`).
- The **user day reset** drives R1, the placed-anyway count, the typed-step conditions, done for today and all "today" figures. R2, R3, R7 and R10 use rolling windows and ignore the reset. R4 uses the user timezone wall clock (below).
- **R8 has a reset per trading account.** It defaults to the user day reset. A prop account SHOULD use the firm's reset, set in the account sheet.
- R4 windows and weekdays use the **user timezone** wall clock, independent of the reset.
- On daylight-saving days a trading day is 23 or 25 hours long, and the reset follows the wall clock of its zone.
- A reset time that does not exist on a DST day happens at the first valid instant after it. A reset time that occurs twice happens at its first occurrence.

### 3.2 Clocks

- The **server clock (UTC)** is the reference. Every sync response includes server time.
- Each client stores `server_offset = server_time − wall_clock` at every successful sync and uses `now = wall_clock + server_offset`.
- Within one process lifetime, the client also tracks a monotonic clock. If wall time and monotonic time drift apart by more than 120 s between syncs, the clock is **unverified** until the next successful sync.
- While the clock is unverified, or when the client has no anchor at all (fresh page load, service-worker restart) and cannot sync:
  - day-based counts (R1, R8, placed-anyway count) do not roll over to a new trading day;
  - cooldowns and breaks do not end early;
  - a sync is attempted immediately.
- If a client has never synced, it enforces nothing and shows **Setting up** (EXPERIENCE.md §8).

### 3.3 Pre-resolved time for clients

MQL4 and MQL5 have no IANA timezone support. Clients never compute timezones themselves. Every sync response carries:

- the current trading day: `{id, start_utc, end_utc}` for the user reset, and one per trading account for R8;
- the next reset instants;
- a list of timezone transitions `[(utc_instant, offset_s)]` for the user timezone and every reset zone, covering at least until `valid_until + 7 days` (§10.5, §12.2).

The shared test cases (§15) carry these resolved values, so every client is tested without any timezone code.

**Broker time (MT).** History times are in broker server time. The EA computes `broker_offset = round((server_now − utc_now) / 1800) × 1800` seconds, where:

- `utc_now` comes from §3.2;
- `server_now` is `TimeTradeServer()` on MT5, or `TimeCurrent()` on MT4, used only when a tick arrived in the last 10 s.

Otherwise the last value stays. The value is stored per broker server.

---

## 4. Counting entries

### 4.1 What counts

| Situation | Counted as |
|---|---|
| Click-path market order (extension), filled in one or several partial fills | 1 entry, at the click |
| Click-path pending order (limit/stop) | 1 entry at placement. **Stops counting** if it is cancelled or expires unfilled, when the cancellation is seen |
| MT order filled in several deals | 1 entry, at the first fill |
| MT pending order, later filled | 1 entry at fill time |
| A position that appears in the TradingView positions table with no click-path entry to explain it | 1 entry, when seen |
| Adding to a position in the same direction | 1 entry |
| Reversal on a netting account, or TradingView "Reverse" | 1 entry (it opens a new position) |
| Closing or reducing, including partial closes | Exit. Never counted, never evaluated |
| MT4 remainder ticket after a partial close or close-by | Not an entry (§4.4) |
| Unclassified order | Not counted when placed. Re-checked later (§4.5) |
| Same trade on several accounts (option, §4.2) | Counted once for R1, R2 and R3 |

### 4.2 Scope

- **User-wide rules**: R1, R2, R3, R4 and R7 count entries and losses on every connected trading account and platform.
- **Per-account rules**: R5, R6, R8 and R10 are checked against each trading account's own positions, closes, balance and currency.
- **Option "Count the same trade on several accounts once"** (off by default): entries with the same symbol and side on different trading accounts, within 60 s of each other, count as one for R1, R2 and R3. When the option is on, an entry that matches an already counted entry is not evaluated for R1, R2 or R3. For copied trades, the user MAY mark a copier's magic number as "copies". Deals with that magic number then never count as rule breaks for R1, R2 or R3. They still count toward per-account rules.

### 4.3 Deduplication

- Events built from platform data use a **deterministic** `event_id = UUIDv5(platform : server_hash : account_hash : ticket : event_type)`. Two EAs reporting the same deal produce the same id.
- Other events use a random UUID.
- Each connection numbers its events with `client_seq`. The snapshot returns `acked_seq`, the highest sequence number stored or deduplicated for that connection (§8.4).
- **MT5 entries** are deduplicated by order ticket (`DEAL_ORDER`), so partial fills count once. **MT5 losing closes** are deduplicated by deal ticket.
- **MT4 entries and closes** are deduplicated by order ticket.
- The primary EA reports every entry deal it sees, from MetaTrader, the phone app, the web terminal and other EAs.
- **One broker account on both TradingView and MT** (brokers that connect TradingView to an MT account) is not supported until Phase 3. The Devices page asks "Is this the same account as MT5 …456?" and tells the user to connect it in one place only.

### 4.4 Classifying entry vs. exit

| Platform | Method |
|---|---|
| MT5 | A deal with `DEAL_ENTRY_IN`, or the opened part of `DEAL_ENTRY_INOUT`, is an entry. |
| MT4 | A new market ticket is an entry, unless it is a **remainder**: its comment is `from #N`, ticket N exists with the same symbol and type, and both have the same open time and open price. |
| TradingView order panel, one-click floating buttons, Reverse button | Close or reduce mode in the panel: exit. Otherwise the position model (below) decides: no position or same direction → entry; opposite direction with size ≤ position → exit; opposite direction with size > position → entry. Position unknown → unclassified. "Reverse" is always an entry. |
| TradingView position Close buttons, SL/TP drags | Not read. They are exits. |

**TradingView position model.**

- The extension keeps positions per broker account and symbol, each with a `verified_at` time.
- The Account Manager positions table, when readable, is the source of truth.
- Click-path entries and exits since the last read update the model.
- An opposite-direction order counts as an exit only if either:
  - the table is readable now; or
  - `verified_at` is less than 5 minutes old and later than the last fill seen on that symbol.

  Otherwise it passes as `exit_unverified`: it is logged and shown in stats.
- Every classification records its basis: `table_live`, `model` or `unknown`.
- For brokers that allow hedging on TradingView (confirmed per broker in Q2), every non-close order is an entry.

### 4.5 Unclassified orders

- They are logged, not counted at the click.
- When the Account Manager or an order confirmation later shows that such an order opened or added to a position, it is counted and evaluated then (§8.2).
- The trader sees "Orders we couldn't check" on the pill, Today and in stats, with the fix "Open the Account Manager once today".

---

## 5. Rules

### 5.1 Catalog

All rules are off until the user enables them, usually through a starter template (EXPERIENCE.md §5.3).

| ID | Rule | Parameters (range) | Scope | Violation when a new entry arrives and… |
|---|---|---|---|---|
| R1 | Max trades per day | `max` 1–100 | User | entries this trading day ≥ `max` |
| R2 | Max trades per hour | `max` 1–50 | User | entries in (now − 60 min, now] ≥ `max` |
| R3 | Too fast | `count` 2–10, `seconds` 10–600 | User | entries in (now − `seconds`, now] ≥ `count` − 1 |
| R4 | Trading hours | 1–3 windows `start`–`end`, weekdays | User | now is outside every window, or today is not an allowed weekday |
| R5 | Max position size | `max_size` per trading account, up to 20 symbol overrides. The default is in lots; Polymarket and Kalshi accounts take a separate default in dollars (max bet), never the lots one | Account | resulting position in that symbol and direction > effective limit |
| R6 | Max risk per trade (MT) | amount in account currency, or 0.1–10% of day-start balance | Account | no SL, or computed risk > limit |
| R7 | Cooldown after a loss | `minutes` 1–240; `ignore_below` amount (optional); `double_after_2` (optional) | User | now < latest qualifying losing close + cooldown |
| R8 | Daily loss limit | amount in account currency, or 0.1–20% of day-start balance (TradingView: amount only); `rest_hours` 0–24 (default 12); `all_accounts` (optional) | Account | this account is in its limit state (§5.2) |
| R9 | Stop loss required | none | Order | the order has no SL attached at submission |
| R10 | No bigger after a loss | `minutes` 5–120 (default 30) | Account | inside the window after a losing close, the entry is larger than the losing trade (§5.2) |

### 5.2 Details

**R4 windows**

- `start` is inclusive and `end` is exclusive. `end` may be `24:00`.
- The editor accepts windows that cross midnight, such as `22:00–02:00`, and stores them as two windows, `22:00–24:00` and `00:00–02:00` of the next weekday.

**R5 max position size**

- There is one value per trading account, in the unit that account uses:
  - MT: lots;
  - TradingView: the quantity unit its order panel shows.
- A default value MAY be applied to all MT accounts. A newly detected account without a value gets a prompt, and a first value applies immediately (§6.2). Until a value is set, R5 does not apply to that account, and Today shows "Max size not set for …".
- Symbol matching for overrides: uppercase both, remove any prefix up to and including `:`, then the override matches if the symbol starts with it. `EURUSD` matches `OANDA:EURUSD`, `EURUSD.a` and `EURUSDm`.
- **Resulting position** is the existing position in that symbol and direction plus the order size. On a reversal, it is the size of the new opposite position. If the existing position is unknown (a TradingView hedging broker before any read), the order size is used.

**R6 risk (MT)**

- MT5: `risk = |entry_price − sl_price| / SYMBOL_TRADE_TICK_SIZE × SYMBOL_TRADE_TICK_VALUE_LOSS × lots`.
- MT4: the same formula with `MODE_TICKSIZE` and `MODE_TICKVALUE`.
- `entry_price` is the order price for a pending order, and the current ask (buy) or bid (sell) for a market order.
- `lots` is the order size, or the new opposite position on a reversal.

**R7 cooldown**

- A **losing close** is a closing deal with net P/L < 0, where net = profit + commission + swap + fees of that deal. Partial closes count.
- A **qualifying close** is any close except a losing close ignored by `ignore_below`.
- `ignore_below` is an amount per trading account, in its currency, set in the account sheet. A losing close with |net| below it does not start a cooldown. The template sets it to 10% of that account's R8 limit at template time.
- `double_after_2`: when the two most recent qualifying closes, on any account, were both losses, the cooldown after the second is `2 × minutes`.
- The cooldown runs from the close time of the latest qualifying losing close.

**R8 daily loss limit**

MT:

- `loss = day_start_balance − (current_equity − current_credit)`. Open positions count, and broker credit does not.
- Money moves are never profit or loss:
  - MT5: `DEAL_TYPE_BALANCE`, `DEAL_TYPE_CREDIT`, `DEAL_TYPE_BONUS`, `DEAL_TYPE_CORRECTION`;
  - MT4: history orders of type 6 (balance) and 7 (credit).
- Everything else is P/L, including commission on entry deals, `DEAL_TYPE_COMMISSION` and `DEAL_TYPE_CHARGE`.
- `day_start_balance` = the balance at this account's day reset + money moves since that reset.
- If no EA ran at the reset, it is rebuilt: `current_balance − net P/L of all non-money-move deals since the reset`.
- The first client to report a day-start balance for an account and trading day stores it on the server. All clients use the server value when they have it.
- MT4 only sees the history period chosen in its Account History tab. If the EA cannot see back to the reset, the setup checklist shows "Set Account History to All history", and the EA uses the server value if one exists.

TradingView (Beta):

- `loss = −(realized P/L of positions closed since the account's reset + unrealized P/L of open positions)`, read from the Account Manager.
- Amount limits only.
- If P/L cannot be read for a broker, R8 shows "Not available for this account" on the rule card and on Today, and never triggers there.

**Limit state**

- An account enters the **limit state** when `loss ≥ limit`.
- It stays in the limit state until the later of:
  - (a) the account's next day reset;
  - (b) the moment it entered the limit state + `rest_hours`.
- It stays in the limit state even if the loss later shrinks.
- **All accounts** (`all_accounts` on): while any account is in the limit state, entries on every account violate R8.
- Once R8 was reached on an account in a trading day, every later entry on that account in that trading day breaks R8, however late it is detected.

**R10 no bigger after a loss**

- R10 is evaluated per trading account. The window follows the latest losing close **on the new entry's account**.
- The window starts at the end of the R7 cooldown that close started, or at the close itself if R7 is off. It lasts `minutes`.
- Inside the window, an entry larger than the losing trade's size violates R10. The comparison uses the account's own size unit.
- On TradingView, R10 applies only when the losing trade's size is known.

**% limits** (MT only) use `day_start_balance`. The MVP has no equity-based or trailing drawdown (Phase 3, prop firm mode).

### 5.3 Availability

| Rule | MT5 | MT4 | TradingView |
|---|---|---|---|
| R1–R4, R9 | ✅ | ✅ | ✅ |
| R5 | ✅ | ✅ | ✅ once set for that account |
| R6 | ✅ | ✅ | ❌ (Phase 3) |
| R7 | ✅ | ✅ | ✅ for losses closed on MT. Beta for losses closed on TradingView |
| R8 | ✅ | ✅ | Beta, amount only |
| R10 | ✅ | ✅ | Beta (needs the losing trade's size) |

### 5.4 Priority

When a trade breaks several rules, all are recorded. The note and the alert name the first in this order: done for today, break, R8, R7, R10, R1, R2, R3, R4, R6, R5, R9. Breaks are returned as `BREAK` and done for today as `DONE_TODAY` (§6.5).

---

## 6. Rule-change protection

### 6.1 Setup mode and lock

- Every new user starts in setup mode. Trades are counted, but every change applies immediately.
- Setup mode ends at the first of:
  - (a) the user taps **Lock my rules** and types their first name;
  - (b) the first day reset at least **72 hours** after the user's first connection reached On. A notice goes out 24 hours before: "Your rules lock at <time>. Review them now."
- **Cool-off inside setup mode**: a loosening requested within 30 minutes after a rule break applies 30 minutes after that rule break.
- **Setup mode exists once per user.** It never restarts:
  - not for a new connection or trading account;
  - not after all connections are removed;
  - not when a lapsed plan resumes;
  - not at support's request.
- There is no unlock.
- The lock time is stored and shown later ("You set this on 12 Sep").

### 6.2 Stricter vs. looser (after lock)

Every change is compared with the **active** value. If a change is not clearly stricter, it is looser.

| Setting | Applies now (stricter) | Scheduled (looser) |
|---|---|---|
| Enable or disable a rule | Enable | Disable or delete |
| R1, R2 `max`, R6 limit, R8 limit | Lower | Higher |
| R5 `max_size` or override | The effective limit of every symbol goes down or stays the same | The effective limit of any symbol goes up |
| R5 first value for a newly detected account | Always now | — |
| R3 | Higher `seconds` with the same or lower `count`, or lower `count` with the same or higher `seconds` | Any other change |
| R4 windows and weekdays | The new allowed time lies entirely inside the old | Any other change |
| R7 `minutes` | Higher | Lower |
| R7 `ignore_below` | Lower or removed | Higher or added |
| R7 `double_after_2`, R8 `all_accounts` | Turn on | Turn off |
| R8 `rest_hours`, R10 `minutes` | Higher | Lower |
| R6 or R8 unit (amount ↔ %) | Never counted as stricter | Always looser |
| User timezone, any day reset | Never counted as stricter | Always looser |
| "Count the same trade on several accounts once", "copies" magic numbers | Turn off, or remove | Turn on, or add |
| Remove a trading account | Now, if the account is **Ended** (§10.7) | Otherwise looser. It stays counted and keeps its slot until `effective_at` |
| Remove a connection | — | Looser (except a connection whose accounts are all Ended) |
| Connect a new connection or trading account | Now | — |
| Delete the DisciplineGuard account | Now, if counting is not active | Otherwise looser (§12.6) |
| Cancel the plan | Now (runs to the end of the paid period) | — |
| Trader's own alert channels, "Hide amounts on screen" | Now (not protected) | — |

### 6.3 When a looser change takes effect

`effective_at = max(first day reset after the request, request time + 12 hours)`, using the **active** user day reset and timezone.

- Examples with a 00:00 reset:
  - a request at 10:00 takes effect at 00:00 tonight;
  - a request at 14:00 takes effect at 02:00 tomorrow;
  - a request at 23:55 takes effect at 11:55 tomorrow.
- The worst case is about 24 hours. The 12-hour minimum stops a loosening at 23:55 from applying at 00:00.
- **[P3] Longer delays**: the user MAY choose a delay of 3 or 7 days. Choosing a longer delay is stricter. Choosing a shorter one is looser.

### 6.4 Pending changes

- Each setting has one active value and at most one pending value with `effective_at`.
- A new change is compared with the **active** value:
  - stricter or equal: it becomes active now, and any pending value for that setting is dropped;
  - looser: it replaces any pending value, and `effective_at` is recalculated from the new request.
- The user can cancel a pending change at any time. The cancellation applies immediately.
- **Only the server activates pending changes.** On any read at or after `effective_at`, the server treats the pending value as active and stores it that way. Clients never activate a pending looser value by themselves (invariant 4).

### 6.5 Tighten now: breaks and "done for today"

These are always stricter and apply immediately. They can never be shortened or cancelled.

| Action | Where | Effect |
|---|---|---|
| Take a break | Today, pill, EA panel | For 15 minutes, every entry is a rule break (`BREAK`). Note: "Placed during your break (until 10:29)." |
| Done for today | Today, pill, EA panel | Until the next user day reset, every entry is a rule break (`DONE_TODAY`) |
| **[P2]** Tighten for today | Session check-in (EXPERIENCE.md §9.9) | A temporary lower R1 or R8 value until the next reset. It is never looser than the locked rules |
| **[P2]** Take a break for 1, 7 or 30 days | Account | Until then, every entry is a rule break (`BREAK`) |

Trades still go straight through during a break or "done for today" (invariant 1). They are counted as rule breaks.

---

## 7. Rule breaks

Every entry is counted. When `evaluate()` (§8.1) returns at least one violation for it, judged with the state just before it, the entry is a **rule break**:

- The entry event carries the rule ids (`violations`). The server also stores an `override` event for it, which Today, Stats, the summary and "days kept" count.
- **On the platform**: the extension shows a small note at the top right of the page for 8 s, and the EA shows a card on its panel for 2 minutes: the first rule in words (EXPERIENCE.md §9.2), "It counts toward today", and the other rules by name. The note never covers or blocks the order controls.
- **Alert**: §11.2.
- **Setup mode**: the latest rule break starts the 30-minute cool-off (§6.1).
- A trade within the rules shows nothing.

Nothing is ever held, delayed or blocked (invariant 1), and DisciplineGuard never clicks anything for the trader.

---

## 8. Evaluation

### 8.1 The shared function

Every client implements the same pure function:

```
evaluate(rules, settings, state, order, now) → violations
```

**Inputs**

- `rules`: the active rule set from the last sync.
- `settings`: the pre-resolved trading days, resets and timezone transitions (§3.3).
- `state`:
  - recent entries (time, trading account, symbol, side) for at least the last `max(60 min, R3 seconds)`, plus the count this trading day;
  - closes (time, net, size, account, win or loss) for at least the last `max(2 × R7 minutes + R10 minutes, 30 min)`, and always the two most recent, regardless of resets;
  - break and done-for-today state;
  - per account: positions, day-start balance, equity, credit, P/L, limit state.
- `order`: platform, trading account, symbol, side, size, SL, order type, entry or exit, and symbol specs (tick size, tick value) on MT.
- `now`: from §3.2.

**Output**

A list in priority order (§5.4). Each item is `{rule_id, observed, limit, clears_at?, fix?}`:

- `clears_at` is when the rule stops applying: R1–R4, R7, R8, R10, `BREAK` and `DONE_TODAY`;
- `fix` is what would satisfy it: R5, R6, R9, and R10 (the losing trade's size).

It is the only rule logic. Exits and unclassified orders return an empty list without evaluation. The test cases in §15 are written against this function and include the detail fields.

### 8.2 When it runs

- **Click-path entries** (the extension): at the click, from the in-memory cache, without holding the click. The result goes with the entry event.
- **Entries read after the fill** (the EA, and the TradingView positions table): after the fact. The rules:
  - the entry itself is excluded from its own counts and windows;
  - the fill time is used as `now` for R1–R4, R7 and R10;
  - R8 uses the limit state at the fill time. When that state is unknown, current equity is used if the fill was less than 60 s ago, and R8 is skipped otherwise. The rule in §5.2 still applies to entries after the limit was reached;
  - R6 and R9 use the deal's SL, or the position's when the deal has none. A TradingView entry read from the positions table has no readable SL, so R9 isn't judged for it;
  - R5 uses the deal's volume.

### 8.3 Freshness

- **Nothing waits for a network call** (invariant 3).
- The extension evaluates in the content script against a cache in memory. That cache is loaded from extension storage and updated when storage changes. There is never a round trip at click time.
- The EA evaluates on its own thread.
- Freshness comes from **intent-triggered syncs**, at most one per 10 s:
  - Extension:
    - a TradingView tab becomes visible;
    - the order panel opens;
    - the order quantity changes;
    - 30 s pass while the tab is focused.
  - EA:
    - a trade or close (`OnTradeTransaction`);
    - the regular timer (§10.3).
- Cross-platform totals are **eventually consistent**. An entry on one platform can take up to one sync interval to affect another. This is accepted.

### 8.4 Merging local events with the snapshot

- The snapshot contains:
  - entries this trading day, and entry timestamps for the recent window;
  - closes (§8.1);
  - break, done-for-today and limit states;
  - per-account day-start balances;
  - the trading day it belongs to, `as_of`, and `acked_seq` for this connection.
- **Merge rule**: `value = snapshot value + local events with client_seq > acked_seq`.
- **Day reset while offline**:
  - Day-based snapshot values (entries today) apply only to the trading day of `as_of`. After a reset, the client counts only its local events since that reset.
  - Timestamp-based values (R2, R3, R7, R10) stay valid across the reset.
  - The rollover itself is blocked while the clock is unverified (§3.2).

---

## 9. Platforms

### 9.0 How platforms are added

A trader installs at most one thing per kind of platform, never one per platform:

| Kind | One install covers | How a new platform is added |
|---|---|---|
| Websites (TradingView, Polymarket, Kalshi; later crypto exchanges, web broker platforms) | The Chrome and Edge extension | A new **adapter** inside the extension: a signed page config (§9.1) plus a small bundled module. Users get it through a normal extension update |
| Desktop platforms with a plugin system (MT5, MT4; later cTrader, NinjaTrader) | The DisciplineGuard Windows app (§9.5) | A plugin for that platform, which the Windows app installs and keeps updated. The trader only ticks "Connect" |
| Any other website **[P3]** | The extension | **Count any button**: the trader clicks a site's Buy button once to have it counted. Only count and time rules apply, because size and P/L can't be read |
| Other Windows apps **[P4 bet]** | The Windows app | The same "count any button" idea for desktop windows. Fragile, so only for apps users ask for |
| Phone apps | — | MT5's phone app: counted through MT5 on a computer or VPS, from the account's history. Other phone apps: not counted |

**Adapter contract.** Every adapter supplies only:
- the order controls to read, and a self-test that they are still the right ones;
- `describe(order)`: symbol, side, size, type and SL where readable, and entry vs. exit (§4.4);
- account identity, and positions and P/L where readable.

`evaluate()`, the rule-break note, sync, coverage and the status vocabulary are shared and never change per platform. `packages/core` must not import anything platform-specific.

### 9.1 Chrome and Edge extension (TradingView)

**Basics**

- Manifest V3.
- Host permissions: `https://www.tradingview.com/*`, `https://polymarket.com/*` and the DisciplineGuard API. Content scripts match only `https://www.tradingview.com/chart/*`, `https://polymarket.com/*` and `https://kalshi.com/*`.
- All code is bundled: no remote scripts, no `eval`.

**Timers**: sync, heartbeat, alerts and self-tests use `chrome.alarms`, every minute.

**Click paths** (read, never held)

- The order panel submit button, including Enter in its fields.
- The floating Buy/Sell buttons, **only when one-click trading is on**. When it is off, those buttons only open the order panel, so the panel's submit is read instead. The extension learns which it is from what a floating click does (the order panel opens, or an order appears).
- Everything else (the DOM ladder, chart right-click Trade, dragging order lines, keyboard shortcuts) is counted from the positions table (below).

**Reading clicks**

- The content script runs at `document_start`. It registers passive capture-phase listeners on `window` for `pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click` and the relevant `keydown` events. It reads the order at the start of the gesture and counts it at the click or Enter that ends it.
- It never calls `preventDefault()` or `stopImmediatePropagation()`, and never dispatches events to the page.
- Events whose `composedPath()` includes the extension's own host are ignored.

**Rendering**

- The rule-break note (§7) is a small card at the top right, in a closed shadow root. It never covers the order controls and disappears after 8 s.
- The pill is fixed-position on the document root, never inside TradingView's own DOM. Its default spot is computed from an anchor in the page config and recomputed on resize. A dragged position is stored as a fraction of viewport width.
- The theme follows the `theme-light` or `theme-dark` class on TradingView's root element.

**Page config** (remote, data only)

- Fixed schema:
  - `version`;
  - CSS selectors for a closed list of named controls (prefer `data-name` attributes over generated class names);
  - per-locale text markers;
  - numeric thresholds;
  - self-tests from a fixed set of check types: element exists, text contains, attribute equals.
- It cannot add event types, load URLs, or contain script, HTML or expressions. Unknown keys are ignored.
- **Signed** with an Ed25519 key kept offline. The extension bundles the public key. It rejects unsigned files, and any version lower than the highest it has accepted.
- No click-path selector may match an element whose text matches the close/reduce markers **bundled in the extension**, so a close is never counted as an entry, whatever the config says.
- **Staged rollout**: a new version goes to 5% of installs for 30 minutes before everyone.
- Health events carry check ids and pass/fail only. Never page text.

**Self-tests**

- Self-tests run when an order control first appears (a mutation observer scoped to the config's containers) and on every click it reads. The matched control must carry the expected `data-name` and side text. If it does not, that path fails its check and its clicks aren't read; the positions table still counts the trades.
- **Global vs. local failures.** The server labels a failure:
  - **global** when at least 20% of active installs on the same config version fail the same check within 30 minutes. The extension shows **Off: "TradingView changed. Trades aren't counted while we update DisciplineGuard."**
  - **local** otherwise. The extension shows **Needs attention: "DisciplineGuard can't read this page. Check TradingView's language, zoom and other extensions."** A local failure counts as counting off (§10.6).

**Account identity**

- Read from the Account Manager header.
- Stored as `HMAC(server_secret, broker id + account number)`, plus the last 3 characters. Account holder names are never stored or sent.
- Positions and P/L read from the Account Manager stay in the extension. Only these are sent: entries, exits, closes (time, net, size, win or loss), and loss today per account.

**Table detection (Beta)**

- New positions or fills in the Account Manager that match no click-path entry are counted as entries, with the rules they broke (§8.2).
- At startup, the extension reads fills made since its last heartbeat (if the history is readable, Q2) and reports them as "placed while counting was off" (§10.6).

**Heartbeat**: part of every sync (§10.3), 60 s while active and 300 s while idle, while a TradingView tab with a connected broker is open. Every extension heartbeat counts as primary.

**Protection-off signals**

- Sign-out sends protection-off for each of its connections (best effort), then forgets its tokens.
- Signing in as another person sends protection-off with reason `switched_login` for the old person's connections first.

**Sign-in**

- The same Allow as the Windows app (§9.5): the extension opens `/allow?ext=<its id>&challenge=<PKCE>`, the trader presses Allow, and the web app hands the single-use code to that extension id (`externally_connectable` lists only the web app origin, and the extension checks the sender origin). The extension redeems it at `POST /v1/auth/desktop` with its verifier.
- Each TradingView broker account seen on a chart is counted at once, like a new MT login after Connect: the extension registers it at `POST /v1/desktop/terminals` (kind `tv`) and gets a device token for it.
- The tokens live in the service worker's IndexedDB, never in content scripts.
- There is no store listing: each release publishes the extension zip, and Help → Install the browser extension covers Load unpacked.

### 9.2 MT5 EA

**Panel** (status only; trades are placed the usual way in MetaTrader)

- A status line: "On · 2 of 3 trades · Loss $40 of $300".
- Today's numbers: trades today, loss today, cooldown, break or done for today.
- **15 min break** and **Done for today** buttons (§6.5).
- The rule-break card (§7) for 2 minutes after a recent trade broke a rule.
- Details: what is counted, scheduled changes, next reset, setup mode.
- A menu: break, done for today, setup check, theme, help, report a problem.
- It is collapsible to a bar, can be anchored to any corner, and has a "Panel scale" input.

**The EA never places, changes or closes an order** (invariant 2). It needs no Algo Trading.

**Events**: `OnTradeTransaction` plus a 1 s timer check of history.

**Counting**

- Every entry deal on the account is counted, whoever placed it: MetaTrader's own order window, F9, one-click trading, the phone app, the web terminal or another EA.
- `DEAL_REASON` is recorded only to label the source: desktop, mobile, web or another EA.
- Each is evaluated at its fill with the state before it (§8.2), and reported with the rules it broke.
- History is read back to 7 days, so trades placed while MT was closed are counted when it opens again. Only trades since the account was connected count.

**Network**

- **The EA makes no web requests.** It exchanges files with the Windows app through the terminal's Common Files folder (§9.5). There is no web address to allow, and no order can wait on the network.
- One request at a time. Files are read and written only on the timer, never in a click handler.
- A request with no reply after 20 s counts as failed; the next sync is tried 30 s later.

**Setup checklist** (shown only while an item fails; it usually passes at once)

| Check | How it is detected |
|---|---|
| DisciplineGuard app running | The app's heartbeat file is newer than 90 s. If not: "Open DisciplineGuard from the Start menu." |
| Connected | The app has a connection id for this terminal and the last sync wasn't refused. If not: "Tick this MetaTrader in the DisciplineGuard app" or "Sign in to the DisciplineGuard app" |
| Rules loaded | First sync done |
| Account detected | Shows broker, server and account (last 3 digits) |
| MT4 history | "Set Account History to All history", when history does not reach the reset |

**Connecting**

- There is no pairing code. The trader ticked "Connect" for this terminal in the Windows app, so the EA's first sync reaches the app, which registers the terminal and its account (§9.5, `POST /v1/desktop/terminals`). Devices shows it at once with [Not mine], and the change email goes out (§10.9).
- Until then the panel shows one status line, with nothing to type: "Open the DisciplineGuard app on this computer", "Tick this MetaTrader in the DisciplineGuard app" or "Connecting…". Trades aren't counted yet.
- The EA keeps the connection id in its own `MQL5\Files` folder, so saved rules still apply while the app is closed. The device token stays with the app, protected by Windows (DPAPI).

**Connection changes**

- A new MT login in a connected terminal shows "New account on this terminal: <server> …456. Count its trades? [Count it]". Connecting it is immediate.
- When the Windows app signs in as another DisciplineGuard user, it first sends protection-off with reason `switched_login` for the old user's connections and waits for the server to acknowledge it. Without server contact, the switch is refused.
- A new connection id from the app (a reinstall or another login) replaces the EA's saved cache, so one user's rules never apply under another.

**Heartbeat**: part of every sync call. The EA syncs every 60 s while active and every 300 s while idle (§10.3).

**One primary per terminal**

- Temporary global variables `DG_PRIMARY_ID` (a random instance id below 2^31) and `DG_PRIMARY_TS` (`TimeLocal()`).
- Takeover with `GlobalVariableSetOnCondition` when `DG_PRIMARY_TS` is more than 30 s old **or** more than 30 s in the future.
- Each cycle, an instance acts as primary only if `DG_PRIMARY_ID` equals its own id.
- Heartbeats carry the role. Only primary heartbeats count for coverage (§10.6).
- Secondary instances show "On · Another chart is doing the counting."

**Stop changes**: the EA records each time a position's SL is removed, or moved so that R6 risk would exceed the limit. These appear in stats and in the daily summary as "Stop removed or widened".

**Deinit reasons**

| Reason | Behavior |
|---|---|
| `REASON_CHARTCHANGE`, `REASON_PARAMETERS`, `REASON_RECOMPILE` | Keep state. No protection-off. The next init draws the panel first; the first sync runs from the timer |
| `REASON_ACCOUNT` | Register the new trading account (cap check) |
| `REASON_REMOVE`, `REASON_CHARTCLOSE`, `REASON_TEMPLATE` | Queue a protection-off event and hand it to the bridge; the Windows app sends it after the chart is gone |
| `REASON_CLOSE` | Nothing (closing the terminal is normal; the status is Not running) |

**Rendering**

- Text is drawn on a canvas bitmap with measured wrapping, because a chart label is cut at 63 characters and does not wrap.
- Only buttons are native objects.
- Pixel sizes are scaled by `TERMINAL_SCREEN_DPI / 96`, times the panel scale.
- Light or dark palette from `CHART_COLOR_BACKGROUND`.

### 9.3 MT4 EA

- A port of the MT5 EA, passing the same test cases.
- History polling every 1 s.
- MT4 cannot tell desktop, mobile and web apart, so entries carry no source label.
- Remainder tickets follow §4.4.

### 9.4 Both EAs

- The EA must run in the desktop terminal or on a VPS terminal the user controls.
- If the EA is migrated to MetaQuotes' built-in VPS, the chart UI does not run there. The EA detects the migration where possible and the guide warns about it.
- **Mac** is not supported: the Windows app doesn't run there.

### 9.5 Windows app (DisciplineGuard for Windows)

**Why it exists.** Only something running inside MT can read an MT account's trades as they happen, so the EA stays. The Windows app removes the EA as a setup task: the trader signs in, clicks Allow, ticks the terminals to count, and never copies a file, changes an MT setting or types a code.

**What the trader does** (EXPERIENCE.md §5.6):
1. Downloads `DisciplineGuard-Setup.exe` from the web app and runs it.
2. Signs in: the app opens the web app in the browser, which shows "Allow DisciplineGuard on this computer? [Allow]". This is the extension's sign-in pattern (§9.1): a single-use code exchanged with PKCE at `POST /v1/auth/desktop`.
3. Sees every MT5 terminal on the computer, all ticked, and presses **Connect**.

**What the app does on Connect**, per terminal:
- Finds terminals from `%APPDATA%\MetaQuotes\Terminal\<id>\origin.txt` (only when that install still has `terminal64.exe`) and from running `terminal64.exe` processes, including portable installs.
- Copies the EA into `MQL5\Experts\DisciplineGuard\` after checking its SHA-256 against the signed release manifest.
- Attaches the EA through MT's own files:
  - the chart template `MQL5\Profiles\Templates\default.tpl` carries the EA, so every new chart has the panel (MT only reads it, so this works while MT is open). A fresh MT has no `default.tpl`; the app then writes a bare one that draws new charts the way MT's built-in default does, and deletes it again when the terminal is removed;
  - with MT closed, the first chart of the last-used profile without an EA gets it, and `config\common.ini` gets `[Experts] Enabled=1` and `AllowLiveTrading=1`, MT's switches for running EAs (the EA itself never trades). A chart or template that runs another EA is left alone.
- MT rewrites its profile on exit, so if the terminal is running: "MetaTrader needs a quick restart to finish. Open trades aren't affected. [Restart MetaTrader] [Next time I open it]". Restart asks MT to close the way its own X button does, finishes and opens it again. The app never closes MT without that click. With "Next time", setup finishes the next time the trader closes MT.
- Marks the terminal connected. The EA's first sync then reaches the app, which registers the terminal and its account (`POST /v1/desktop/terminals`) and passes the reply back.

**The bridge** (EA ↔ app), in `%APPDATA%\MetaQuotes\Terminal\Common\Files\DisciplineGuard\<terminal id>\`:
- `out.txt`: one request from the EA, `<seq> <path>` then the JSON body. Only `/v1/sync` is forwarded.
- `in.txt`: the reply, `<seq> <HTTP status>` then the body. The signed rules inside are verified by the EA with Ed25519 (§10.5), so editing the file has no effect.
- `app.txt`: the app heartbeat (time, state, connection id, masked email). `ea.txt`: the EA heartbeat, every 15 s.
- Every file is written to a temp name and renamed, so neither side reads half a file.
- The EA touches these files only on its timer, never in a click handler.

**Running**
- Starts with Windows and lives in the tray. Its states follow EXPERIENCE.md §8.
- When the app isn't running, the EA keeps counting against its saved rules and shows **On (offline)**, "App not running". §10.5 applies unchanged.

**Updates**
- The app updates itself through a signed update manifest (checked every 6 hours) and carries the EA with a signed EA manifest. After an update the new EA build is copied into each connected terminal while that terminal is closed, because MT reloads an EA whose file changes. The trader does nothing.
- Releases are published in the public source repository (`wwwlqh/disciplineguard`); `/downloads/` on the site points to the latest one.
- An MT5 installed later shows a tray notice: "New MetaTrader found: IC Markets MT5. Connect it? [Connect]".

**Protection-off signals**
- Removing a terminal is a loosening and waits like any removal (§10.6, EXPERIENCE.md §5.6): the app links to Devices, and keeps serving the terminal until the server reports it removed. Uninstalling the app is a protection-off signal (`uninstalled`). The uninstaller sends protection-off and removes the EA only after the server acknowledges it (a 200 or 410; a 401 means a stale token, not an acknowledgement). The EA file goes even while MT is open, so MT drops it at the next start. Without server contact it leaves the EA in place and says so.
- Removing the EA from a chart by hand queues protection-off, which the app sends; a stale `ea.txt` also shows it.

**Later platforms.** The same app installs the MT4 EA, and later cTrader cBots and NinjaTrader add-ons, each as its own adapter (§9.0).

---

## 10. Server

### 10.1 Stack

- One Cloudflare Worker with D1 as the database. It also serves the web app's static files, on the same origin as the API.
- Durable Objects are not needed. D1 serializes writes, so first-writer values and conditional updates are single atomic statements.
- Sync reads from the D1 primary, or through a session bookmark, never from a lagging replica.

### 10.2 Scheduled work

- A cron trigger every 5 minutes runs due rows from `jobs(id, kind, run_at, payload, done_at)`. Each job is idempotent and marked done in the same batch.
- Job kinds:
  - setup-mode auto-lock and its notice;
  - scheduled account deletion;
  - yearly renewal reminders;
  - alert roll-ups, protection-off checks and end-of-session summaries, keyed by user and trading day (§11.2).
- Retention purges (§13.3) run on every cron. Pending rule changes and removals need no job (§6.4).

### 10.3 Sync

- One endpoint: `POST /v1/sync`. The body carries queued events and a heartbeat. The response carries:
  - server time and license state with `valid_until`;
  - active rules, pending changes and settings with pre-resolved time (§3.3);
  - the snapshot (§8.4);
  - the page-config version.
- **Cadence**:
  - 60 s while active (an entry or exit in the last 30 minutes, or a focused TradingView tab);
  - 300 s while idle;
  - immediately after an entry, exit or losing close;
  - intent-triggered syncs (§8.3), at most one per 10 s.
- Multi-row writes respect D1's limit of 100 bound parameters per statement.

### 10.4 Endpoints (structure)

| Endpoint | Purpose |
|---|---|
| `POST /v1/auth/email`, `POST /v1/auth/verify` | Request a sign-in email (link + 6-digit code), and redeem it |
| `GET /v1/auth/google` | Continue with Google (OAuth with PKCE) |
| `POST /v1/auth/desktop` | Exchange a web-app code for a Windows app or extension token (PKCE) |
| `POST /v1/desktop/terminals` | The Windows app registers a terminal the trader ticked (the extension: a broker account) and gets its device token |
| `POST /v1/sync` | Events, heartbeat, and the full sync response |
| `POST /v1/desktop/alerts` | The Windows app and the extension fetch the trader's alerts after their cursor (app token, §11.1) |
| `GET /tv-page.json` | The signed page config, a static file |
| `POST /v1/webhooks/lemonsqueezy` | The payment provider's signed webhook |
| Web app API (`/api/*`) | Rules, settings, connections, today, stats, alerts, plan, export, delete |

### 10.5 Offline and failure behavior

- Clients cache the last sync and keep enforcing it in every failure state:
  - no network;
  - web access blocked;
  - HTTP 401 or 403;
  - a revoked token.

  They show **On (offline)**, or **Needs attention: "Sign in again"** for 401, 403 or a revoked token. Never "not connected".
- Events queue locally, and the queue is sent when the server is reachable again.
- The per-account history cursor ("last reported deal") is stored on the **server**. Deleting local files therefore cannot hide deals.
- **Enforcement ends only when**:
  - (a) the server has acknowledged a sign-out, with the protection-off event stored first;
  - (b) the server says the connection's scheduled removal has taken effect;
  - (c) the plan has ended (§12.2): at a day reset, or at `max(next user day reset, event + 12 h)` after a refund, chargeback or provider cancellation;
  - (d) the cached `valid_until + 7 days` has passed with no server contact. The client then shows **Off: "Can't confirm your plan."**;
  - (e) the server reports that account deletion has run. This is a distinct `account_deleted` response, not a plain 401; the server keeps a tombstone of the token hashes for this;
  - (f) for one trading account only: its scheduled removal has taken effect, or it is Not enforced (§12.5).
- **Signed cache.** The rules, settings and license block of each sync response is Ed25519-signed. The extension verifies it with WebCrypto, and the EA with a small bundled verifier (spike Q10). A cache that fails verification is ignored and replaced by a fresh sync. If the EA verifier is judged too costly, "edit local files while blocking the server" is added to §1.4.

### 10.6 Coverage and protection-off decisions

- The server does not store heartbeats as events. It keeps `coverage(trading_account, connection, from_utc, to_utc)`:
  - a primary heartbeat within 420 s (the 300 s idle cadence + 120 s) of `to_utc` extends the interval;
  - otherwise a new interval opens;
  - queued offline events carry client timestamps and extend coverage.
- An entry was **placed while protection was off** if its fill time is inside no interval `[from_utc, to_utc + 420 s]`.
- At each start, a client asks for its accounts' coverage gaps longer than 15 minutes and reports fills made in them:
  - MT from the server cursor;
  - TradingView from the Account Manager history, where readable.
- Only the server decides protection-off status and sends alerts. Two EAs therefore never both alert.
- Protection-off is **visible by default** from Phase 1:
  - Today and the end-of-session summary list every protection-off period and every connection not seen during the user's trading hours;
  - the trader is alerted when protection stays off, or when entries are placed while it is off (§11.2).
- **Removing the EA or uninstalling** sends protection-off at once (best effort). The alert waits 10 minutes for that user's accounts to be covered again, to avoid false alarms after a reinstall.
- **Same account under another login**: account numbers aren't secret, so claiming one proves nothing. When a trading account's HMAC is connected under user B while it is connected, or pending removal, under user A:
  - while it is live under A (not Ended, §10.7), B is refused: state `taken`. A keeps protection and is not told. B's EA says "Off · This account is on another DisciplineGuard login", the TradingView pill "Off · On another login", with the help article `account-taken`;
  - once it has Ended under A (no heartbeat or entries for 3 full trading days), it moves to B. A gets email, an alert and a Today notice: "Account …123 was connected to another DisciplineGuard login", and A's coverage for it ends then.
  - A trader moving their own account to a new login removes it on the old login's Devices page (a removal waits like a loosening), or signs out there and waits until it has Ended.

### 10.7 Trading account states

| State | Meaning |
|---|---|
| Active | Seen by a connection in the current or previous trading day |
| Not seen | Not seen for a full trading day, but not Ended |
| **Ended** | Trading disabled by the broker (`ACCOUNT_TRADE_ALLOWED` false), or no heartbeat and no entries for 3 full trading days. Removing an Ended account is immediate and frees its slot |

### 10.8 Data model (structure)

- `user` 1–n `desktop_install` (token hash, version, last seen) 1–n `connection`.
- `user` 1–n `connection` (`device_token_hash`, `kind`: extension or mt4 or mt5, `desktop_id`, `install_id` (MT: the terminal id), role, version, build hash).
- `connection` n–m `trading_account` (platform, `server_hash`, `account_hash`, `last3`, nickname, firm, R8 reset, state), through `seen_by(first_seen, last_seen)`.
- `rule_setting` (user or account scope, `active_value`, `pending_value`, `effective_at`, `set_at`).
- `event` (deterministic or random id, `client_seq`, type, times, payload per §7.7).
- `coverage`, `jobs`, `alerts`, `session`, `audit_log`.

### 10.9 Security

**Sign-in**

- Email with a sign-in link and a 6-digit code. Both expire after 15 minutes and work once.
- The token is carried in the URL fragment. Sign-in completes only after a button press on the landing page.
- A link opened in a different browser from the one that asked shows: "Sign in as l***@gmail.com on this device?"
- Limits: 3 requests per email per hour and 10 per IP per hour, behind a bot check. The email plan is paid before the beta, with a quota alert.
- **[P2]** Google sign-in links to an existing account only when Google reports the email as verified.

**Web sessions**

- Account lists web sessions with "Sign out all". Signing out web sessions does not revoke connections.
- Every change to a protected setting or connection emails the account address within 1 minute: what changed, when, browser and OS, and "Not you? Sign out all web sessions".
- Export needs a sign-in within the last 10 minutes and is delivered as an emailed link.
- Changing the account email needs confirmation from both addresses. The old address gets a 7-day undo link.

**Windows app sign-in**

- The Allow code is single use, valid 2 minutes, and goes only to the app's loopback address (`127.0.0.1`, RFC 8252).
- It is exchanged only with the PKCE verifier whose SHA-256 the app sent, so a forwarded Allow link is useless to anyone else.
- 30 exchanges per IP per hour. Every Allow emails the account address with the computer's name.
- The app token can only register terminals (`POST /v1/desktop/terminals`) and fetch the trader's alerts (`POST /v1/desktop/alerts`). Each terminal gets its own device token.

**Device tokens**

- Bound to one connection. They may call only `/v1/sync`, receive only their own accounts' figures, and are limited to 120 events per minute in batches of at most 100.

**Release integrity** (before the first beta install)

- Hardware-key two-factor authentication on Cloudflare, the domain registrar, the payment provider and the email provider.
- Dependencies pinned with a lockfile and reviewed on update.
- The Windows app and its installer are code-signed. The app checks every EA build against a signed release manifest before copying it.
- The EA reports its build hash when it connects, and the server warns about unknown builds.

**Logs and diagnostics**

- Health events, sync errors and diagnostics contain only check ids, error codes, versions and times.
- They never contain account names or numbers, page text, query strings or tokens.
- Worker logs never record request bodies or query strings for auth or the Windows app sign-in.

---

## 11. Alerts

### 11.1 Channels

- **Windows notifications**: the server decides every alert and queues it. Each DisciplineGuard for Windows signed in to the user fetches new ones every 30 seconds (`POST /v1/desktop/alerts`) and shows them as Windows notifications. Nothing to link or install. A new install starts from the latest alert and doesn't replay old ones. Alerts are kept 7 days, and one older than 24 hours is never shown.
- **TradingView [with the extension]**: the extension shows the same alerts as browser notifications.
- **Email**: transactional only (§12.7).
- SMS is out of scope.

### 11.2 What is sent

| Event | Trader (default) |
|---|---|
| R8 limit reached | On |
| A trade after R8 was reached (`after_limit`) | On |
| Protection off (10 minutes after the device turned off, unless its accounts are covered again), or entries placed while it was off | On |
| Account connected to another DisciplineGuard login | On (also email) |
| A trade broke a rule (other rules, `broke`) | On |
| Stop removed or widened | Off |
| Orders we couldn't check (4 in a trading day) | On (as a product problem) |
| Account deletion requested | Email |
| Plan ended, refund, chargeback or provider cancellation | Email |
| Support change to the account (§1.5) | Email |
| End-of-session summary | On |

- **Rate limit** per recipient: at most 1 message per rule per 30 minutes. When messages were held back, one roll-up is sent at the end of the window ("4 more trades broke a rule since 10:14").
- **End-of-session summary**:
  - sent at a time the user chooses; default: the end of the last R4 window, or 60 minutes after the last trade;
  - never sent at a reset in the middle of the night;
  - says the trades and rule breaks of the day, and whether the rules were kept;
  - lists protection-off periods and connections not seen.

---

## 12. Plans and billing

### 12.1 Free plan

- **Free for everyone, with no end date**: every rule, on 1 trading account (§12.5). No trial and no card.
- Paid plans (for more accounts) come later, priced by the number of accounts. Until then `/plans` is not linked from the product; the billing code below stays for existing and future paid users.

### 12.2 Plan states

| State | Enforcement | Banner |
|---|---|---|
| Free | On | None |
| Active | On | None |
| Past due (payment failed) | On until the first user day reset at least 3 days after the failure | "Payment failed. Update your card." |

- When a paid period ends (expired, refunded, charged back or cancelled by the provider), the user is back on Free. Protection stays on; accounts already connected stay connected, and new ones are checked against the free cap.
- **`valid_until`** is the instant protection ends if nothing changes:
  - on Free, the first user day reset at least 30 days ahead, rolling forward with each sync;
  - the end of the paid period, moved to the next user day reset;
  - when past due, the reset at which enforcement ends.

  Every sync carries it. Clients keep enforcing until `valid_until` + 7 days without a sync (§10.5).
- The only state with protection off is a deleted account.
- **Paying after the end, or mid-session**:
  - protection resumes at once with the last active rules;
  - today's entries count;
  - the success screen says so, and clients update at their next sync.

### 12.3 Pricing

- **List prices**: $14.99 per month, $99 per year.
- **Tax**: prices exclude tax. The payment provider adds any tax at checkout, and the Plans page says so.
- **Early-bird**:
  - $79 per year, yearly only;
  - kept at every renewal while the plan renews without a gap; it ends if the plan lapses or the user switches to monthly;
  - for beta users who buy before Phase 2 opens.
- **Plans** (`/plans`): yearly first (the early-bird for beta users), then monthly. Plan changes switch the provider's variant from the next renewal; switching to monthly ends the early-bird price.
- **Checkout**: one line next to Pay: "Renews every <month|year> at <price>. Cancel anytime." Yearly is listed first.

### 12.4 Refunds and cancellation

- **Refund**: a full refund on request within 14 days of a first payment (Account → Plan → Request a full refund; the founder refunds it at the provider). After that, cancelling stops the next renewal.
- **Cancel**: applies immediately (§6.2). Protection runs to the end of the paid period. No questions asked.

### 12.5 Account caps

- **Free**: 1 connected trading account across MT and TradingView. TradingView Paper Trading accounts are not counted. MT demo accounts are counted, since prop firm challenges run on them.
- **Paid**: 10 connected trading accounts.
- Both count Ended accounts and accounts waiting for removal. Removing an Ended account is immediate and frees its slot (§10.7).
- An account over the cap is not connected, and orders on it go through normally. The EA says "Off · The free plan covers 1 account", the TradingView pill says "Off · Account limit", and the help article says to remove the other account on Devices.
- Existing accounts over the cap when this took effect (28 Sep 2026) stay connected.
- The same trading account under another login moves to the new login (§10.6), so it can't be protected twice for free.

### 12.6 Account deletion

- **Protection not active** (setup mode, or no connection seen for a full trading day): deletion is immediate.
- **Protection active**: deletion is scheduled like a loosening (§6.3).
- In every case:
  - the plan is cancelled at the payment provider at once, and the user is never charged again;
  - protection-off alerts are suppressed from the moment deletion is requested;
  - data is used only to keep rules running and send the alerts already set up until the deletion runs, never for analytics.
- A deletion request sent by email follows the same schedule.

### 12.7 Transactional emails

- Sign-in link and code.
- "Your rules lock at <time>" (setup mode ending).
- Payment failed.
- Receipts (from the provider).
- Yearly renewal reminder 30 days before renewal.
- Price change notice at least 30 days before it applies.
- Security notices (§10.9).
- Deletion requested and deletion completed.

---

## 13. Privacy and analytics

### 13.1 Analytics

- Counts only, from the server's own database, shown on the owner dashboard (§14).
- No third-party analytics tool and no consent screen. No user's settings, rules or trades leave the server for analytics.

### 13.2 Onboarding answers

- Onboarding answers are stored only as the resulting template ids.

### 13.3 Retention

| Data | Kept |
|---|---|
| Account data, rules, trades, closes, rule breaks (and pauses from before 3 Oct 2026) | While the account exists. Deleted on deletion |
| Other events (protection-off, stop changes, orders we couldn't check) | 90 days |
| Coverage | 30 days |
| Alerts | 7 days |
| Support reports | 12 months |
| Backups | Deleted data leaves backups within 30 days |

### 13.4 Export

A ZIP containing:

- JSON with everything;
- CSV files for counted trades (with the rules each broke) and rule changes.

Contents:

- profile and settings;
- rules with their full change history;
- connections (last 3 characters only);
- every counted trade with the rules it broke;
- alert settings;
- plan status.

Billing records are in the payment provider's portal.

---

## 14. Owner dashboard

Counts only, from the server's own database, for the owner emails: users (and new this week), users whose device turned on, users with a device seen this week, accounts by platform, trades and rule breaks this week, "tell me when it's ready" picks by platform, and problem reports by type. Never anyone's settings.

---

## 15. Shared test cases

**Defaults** unless stated:

- user timezone `UTC`, user day reset 00:00 `UTC`, R8 reset = user reset;
- setup mode ended;
- R8 `rest_hours` 12 and `all_accounts` off;
- clock verified;
- no losing close in the last 30 minutes.

Times are on the same day unless stated. "Pass" means an empty list: no rule broken. Expected results give the title rule and, where useful, `clears_at` or `fix`.

### 15.1 Trading day

| ID | Given | When | Expect |
|---|---|---|---|
| DAY-01 | R1 max 1. One entry at 23:50 | Entry at 00:10 next day | Pass |
| DAY-02 | User reset `Forex close`. R1 max 1. Entry Monday 16:50 New York | Entry Monday 17:05 New York | Pass (Tuesday's trading day) |
| DAY-03 | Same as DAY-02 | Entry Monday 16:55 New York | R1, `clears_at` Monday 17:00 New York |
| DAY-04 | Timezone and reset zone `Europe/London`, R1 max 1. Spring clock-change Sunday (01:00 → 02:00). Entry 00:30 | Entry 23:30 the same day | R1 (same trading day, 23 h long) |
| DAY-05 | Reset 01:30 `Europe/London`. Spring clock-change Sunday | The reset | Happens at 02:00 local |
| DAY-06 | Account A R8 reset 00:00 `Europe/Prague`. User reset 00:00 `Asia/Kolkata` (summer: Prague is UTC+2, Kolkata UTC+5:30) | R8 loss on A accumulated from 22:00 UTC | A's day started 22:00 UTC. The user trading day started 18:30 UTC |
| DAY-07 | At 22:30 the wall clock jumps 3 h to 01:30 while monotonic time does not advance. No sync possible, so the clock is unverified. R1 max 5, 5 entries today | Entry | R1, observed 6 (no rollover while unverified) |

### 15.2 Counting and classification

| ID | Given | When | Expect |
|---|---|---|---|
| CNT-01 | R1 max 5, 4 entries | Click-path market order filled in 3 partial fills | Pass. Counted once (5) |
| CNT-02 | TradingView, 1 entry (a limit order from the order panel) | The limit order is cancelled unfilled | Count becomes 0 |
| CNT-03 | Hedging account, long 1.0 EURUSD, R5 max 1.2 | Panel Buy 0.5 EURUSD | Entry. R5 resulting 1.5 → R5, `fix` "0.2 lots or less" |
| CNT-04 | Netting account, long 1.0 | Panel Sell 0.4 | Exit. No evaluation |
| CNT-05 | Netting account, long 1.0, R5 max 1.0 | Panel Sell 1.5 | Entry (reversal). R5 checks 0.5: pass |
| CNT-06 | TradingView, table never readable today, no click-path order on the symbol | Order panel Buy (not close mode) | Unclassified. Pass. Not counted |
| CNT-07 | Same MT5 account on desktop and VPS | One outside deal reported by both | Same `event_id`. Counted once. Neither EA double-counts after merging |
| CNT-08 | MT5 outside market order | Filled in 3 deals with the same `DEAL_ORDER` | 1 entry |
| CNT-09 | MT4, outside position 1.0, ticket 123 | Partial close creates ticket 124 with comment `from #123`, same open time and price | Not an entry |
| CNT-10 | MT4 | Manual entry with comment `from #999` (no ticket 999) | Entry |
| CNT-12 | R1 max 5, 5 entries | A 6th entry | Goes straight through. Count 6, rule break R1 |
| CNT-13 | MT panel | `OrderSend` fails (not enough money) | Not counted. Result line shows the reason |
| CNT-14 | TradingView, table collapsed. Model: long 1 EURUSD verified 3 min ago, no fill since | Order panel Sell 1 EURUSD | Exit (basis `model`) |
| CNT-15 | Same, but verified 10 min ago | Order panel Sell 1 EURUSD | `exit_unverified`: pass, logged |
| CNT-16 | TradingView, table readable, no EURUSD position | Order panel Sell 1 EURUSD | Entry |
| CNT-17 | An unclassified Buy at 10:00 | At 10:05 the table shows it opened a position | Counted as an entry at 10:00 and evaluated (§8.2) |
| CNT-18 | "Count the same trade on several accounts once" on. Accounts A and B on one connection. R1 max 5, 4 entries | Buy EURUSD on A at 10:00:00, then on B at 10:00:20 | Pass for both. R1 count 5 |
| CNT-20 | TradingView, position long 1 | "Reverse" clicked | Entry (always) |

### 15.3 Rules

| ID | Given | When | Expect |
|---|---|---|---|
| R1-01 | R1 max 5, 4 entries | Entry | Pass |
| R1-02 | R1 max 5, 5 entries | Entry | R1, observed 6, limit 5, `clears_at` 00:00 |
| R1-03 | R1 max 5: 3 on MT5 + 2 on TradingView, synced | Entry on TradingView | R1 |
| R2-01 | R2 max 3, entries 10:05, 10:20, 10:50 | Entry 11:04 | R2, `clears_at` 11:05 |
| R2-02 | Same | Entry 11:05 | Pass |
| R3-01 | R3 count 2 in 60 s, entry 10:00:00 | Entry 10:00:45 | R3, `clears_at` 10:01:00 |
| R3-02 | Same | Entry 10:01:00 | Pass |
| R3-03 | R3 count 3 in 60 s, entries 10:00:00 and 10:00:30 | Entry 10:00:50 | R3 |
| R3-04 | R3 count 2 in 60 s, entry 10:00:00 | Entry 10:00:59 | R3 |
| R4-01 | R4 14:30–17:00, all weekdays | Entry 14:29:59 | R4, `clears_at` 14:30 |
| R4-02 | Same | Entry 14:30:00 | Pass |
| R4-03 | Same | Entry 17:00:00 | R4 |
| R4-04 | R4 00:00–24:00, Mon–Fri | Entry Saturday 12:00 | R4, `clears_at` Monday 00:00 |
| R4-05 | R4 22:00–24:00 | Entry 23:59:30 | Pass |
| R4-06 | Editor input 22:00–02:00, Mon–Fri | Stored | Two windows. Entry Saturday 01:00 passes (Friday's session). Entry Monday 01:00 → R4 |
| R5-01 | R5 max 0.5 | Order 0.5, no position | Pass |
| R5-02 | R5 max 0.5 | Order 0.51 | R5, `fix` "0.5 lots or less" |
| R5-03 | R5 max 0.5, long 0.3 | Buy 0.3 | R5 (resulting 0.6) |
| R5-04 | R5 max 0.5, override XAUUSD 0.1 | Buy XAUUSD.a 0.2 | R5 |
| R5-05 | R5 max 0.5 on A and B, long 0.4 on A | Buy 0.4 same symbol on B | Pass |
| R5-06 | New TradingView account, no R5 value | Entry of any size | Pass. Today shows "Max size not set" |
| R6-01 | MT5, R6 100 USD, tick size 0.00001, tick value (loss) 1 USD/lot, ask 1.10000 | Market Buy 1.00, SL 1.09800 | R6 (risk 200), `fix` "0.50 lots at this stop" |
| R6-02 | Same | Market Buy 0.50, SL 1.09800 | Pass (100 is not above 100) |
| R6-03 | R6 on | No SL | R6, `fix` "Add a stop loss" |
| R7-01 | R7 10 min. Losing close 10:00:00 (net −50) | Entry 10:09:59 | R7, `clears_at` 10:10:00 |
| R7-02 | Same | Entry 10:10:00 | Pass |
| R7-03 | R7 10 min. Close: profit +2, commission −5 at 10:00 | Entry 10:05 | R7 (net −3) |
| R7-04 | R7 10 min. Losing close on MT5 10:00, synced | Entry on TradingView 10:05 | R7 |
| R7-05 | R7 10 min, `ignore_below` 10. Close net −3 at 10:00 | Entry 10:05 | Pass |
| R7-06 | R7 10 min, `double_after_2`. Losing closes 10:00 and 10:20 | Entry 10:35 | R7, `clears_at` 10:40 |
| R8-01 | R8 300. Day-start 10,000, closed −200, floating −120, credit 0 | Entry | R8 (loss 320) |
| R8-02 | R8 3%. Day-start 10,000, loss 299 | Entry | Pass |
| R8-03 | Same, loss 300 | Entry | R8 |
| R8-04 | R8 300. Balance at reset 10,000, deposit 1,000 at 09:00, equity 10,800 | Entry | Pass (day-start 11,000, loss 200) |
| R8-05 | R8 300. A in limit state, B loss 0, `all_accounts` off | Entry on B | Pass |
| R8-06 | TradingView broker where P/L cannot be read | Entry | Never R8. Rule card and Today show "Not available for this account" |
| R8-07 | R8 300. No EA at reset. Since reset: withdrawal 500, closed −200. Balance 9,300, equity 9,250 | EA starts, entry | Day-start 9,500, loss 250. Pass |
| R8-08 | R8 300. Day-start 10,000, equity 10,100 incl. credit 500 | Entry | R8 (loss 400) |
| R8-09 | R8 300, rest 12 h. Limit reached 23:10 | Entry 00:30 next day | R8, `clears_at` 11:10 |
| R8-10 | R8 300, rest 12 h. Limit reached 09:00 | Entry 00:30 next day | Pass (reset passed, rest ended 21:00) |
| R8-11 | R8 300. Limit reached 10:00. Loss shrinks to 250 at 11:00 | Entry 11:05 | R8 (limit state holds) |
| R8-12 | `all_accounts` on. A in limit state | Entry on B | R8 |
| R8-13 | A reached R8 at 10:00. EA stopped 11:00–12:00; an entry was placed at 11:30 | EA restarts and reports it | Rule break of R8, placed while protection was off |
| R9-01 | R9 on, TradingView one-click, no bracket configured | Floating Buy | R9 |
| R9-02 | R9 on | Order with SL | Pass |
| R10-01 | R7 10 min, R10 30 min. Losing close 0.8 lots at 10:00 on A | Entry 1.2 lots on A at 10:15 | R10, `fix` "0.8 lots or less", `clears_at` 10:40 |
| R10-02 | Same | Entry 0.8 lots on A at 10:15 | Pass |
| R10-03 | Same | Entry 1.2 lots on A at 10:45 | Pass |
| R10-04 | Same | Entry 1.2 lots on B at 10:15 | Pass (other account) |

### 15.4 Rule breaks and breaks

| ID | Given | When | Expect |
|---|---|---|---|
| MUL-01 | R1 and R7 violated | Entry | Goes straight through. One rule break, R7 first, R1 listed |
| SHOW-02 | No rule broken | Entry | Pass. No note, no alert |
| BRK-01 | "Take a break" at 10:14 | Entry 10:20 | Goes straight through. Rule break `BREAK`. Note "Placed during your break (until 10:29)." |
| BRK-02 | "Done for today" at 15:00 | Entry 18:00 | Rule break `DONE_TODAY` until 00:00. Cannot be cancelled |
| BRK-03 | A 7-day break | Entry the next day | Rule break `BREAK` |
| EXIT-01 | R8 reached | An exit | Pass. Not counted |

### 15.5 Setup mode and rule changes

| ID | Given | When | Expect |
|---|---|---|---|
| SET-01 | Setup mode | R1 5 → 8 | Active now |
| SET-02 | Setup mode. Rule break at 10:14 | R1 5 → 8 at 10:20 | Active at 10:44 |
| SET-03 | First connection On Monday 10:00 | No lock | Notice Thursday 00:00. Setup mode ends Friday 00:00 |
| SET-04 | Setup mode | "Lock my rules" + first name | Ended. Lock time stored |
| SET-05 | Locked. All connections removed, new one connected | — | Setup mode does not restart |
| CHG-01 | R1 5 | → 3 at 14:00 | Active now |
| CHG-02 | R1 5 | → 8 at 10:00 | Pending, 00:00 tonight |
| CHG-03 | R1 5 | → 8 at 14:00 | Pending, 02:00 tomorrow |
| CHG-04 | R1 5 | → 8 at 23:55 | Pending, 11:55 tomorrow |
| CHG-05 | R1 5 | → 8 at 12:00 | Pending, 00:00 tonight |
| CHG-06 | R1 active 5, pending 8 | → 4 | 4 active now, pending dropped |
| CHG-07 | R1 active 5, pending 8 (requested 10:00) | → 10 at 11:00 | Pending 10, 00:00 tonight |
| CHG-08 | R7 on | Disable | Pending |
| CHG-09 | Timezone `UTC` | → `Asia/Singapore` at 10:00 | Pending, 00:00 tonight (active reset) |
| CHG-10 | Standard wait 10 | → 5 | Pending |
| CHG-11 | Standard wait 5 | → 10 | Active now |
| CHG-12 | R4 14:30–17:00 | → 15:00–16:00 | Active now |
| CHG-13 | R4 14:30–17:00 | → 14:00–16:00 | Pending |
| CHG-14 | R5 0.5, no overrides | Add EURUSD 2.0 | Pending |
| CHG-15 | R5 0.5, no overrides | Add XAUUSD 0.1 | Active now |
| CHG-18 | Pending change | Cancel it | Removed now |
| CHG-19 | R1 active 5, pending 8 at 00:00. This client made 5 entries 00:00–00:20, offline 23:00–01:00 | Entry 00:30 | R1 (pending not active without a sync) |
| CHG-21 | Account A Ended | Remove A | Immediate. Slot freed |
| CHG-22 | Account A active | Remove A at 10:00 | Pending, 00:00 tonight. Still enforced |
| CHG-23 | Protection active | Delete account at 10:00 | Scheduled 00:00 tonight. Plan cancelled now |
| CHG-24 | Setup mode | Delete account | Immediate |

### 15.6 Offline, security, coverage, plans, alerts

| ID | Given | When | Expect |
|---|---|---|---|
| OFF-01 | Server unreachable | Entry with a violation | Goes straight through. Rule break from the cache. Event queued |
| OFF-02 | Snapshot 90 s old | Entry, no violation in cache | Goes straight through. Counted |
| OFF-03 | `valid_until` + 7 days passed, no contact | Entry | Pass. Off: "Can't confirm your plan" |
| OFF-04 | Never synced | Entry | Pass. Setting up |
| OFF-05 | No contact 10 days, `valid_until` next week | Entry breaking R1 | Rule break |
| OFF-06 | MT: internet down after syncing, Windows app running | Entry breaking R1 | Rule break. Status On (offline) |
| OFF-07 | Extension signed out while offline | Entry breaking R1 | Rule break. "Signing out when back online" |
| OFF-08 | MT with the Windows app: app closed after syncing | Entry breaking R1 | Rule break from the saved rules. Status On (offline), "App not running" |
| SEC-01 | Windows app signed in as user A with protected terminals | The app signs in as user B | Protection-off `switched_login` sent for A's connections first. Without server contact: refused |
| SEC-02 | MT account live under A | Same account connected under B | Refused (`taken`); A keeps it. Once Ended under A, it moves: A notified, A's coverage ends |
| SEC-03 | Page config with a bad signature | Received | Rejected. Last accepted config stays |
| SEC-04 | Page config selector matches a Close button | Loaded | That control's clicks aren't read. The path fails its self-test |
| SEC-05 | Self-test fails on 1 install only | — | That install: Needs attention, counted as protection off |
| SEC-06 | Self-test fails on 30% of installs on one config | — | Off: "TradingView changed" for all |
| SEC-07 | Primary lock timestamp set 1 h in the future (edited) | Another instance checks | Lock stale. Takeover |
| COV-01 | No primary heartbeat on account A 11:00–11:40 | Entry at 11:20 reported later | Placed while protection was off. Listed on Today and in the summary |
| COV-02 | Desktop EA stopped, VPS EA running on A | Entry from the phone | Counted. Not protection-off |
| SUB-01 | Free user, first connection On | Any day later | Protection stays on; `valid_until` is at least 30 days ahead |
| SUB-02 | Signed up, never connected | Day 25 | Still Free and enforcing |
| SUB-03 | Free, 1 MT account connected | Connect a second MT account; connect TradingView Paper Trading | The second is refused with the cap; Paper Trading connects |
| SUB-04 | Paid, 10 accounts, none Ended | Connect an 11th | Refused with the cap message |
| SUB-05 | 10 accounts, 2 Ended | Connect a new one | Allowed after removing an Ended one (immediate) |
| SUB-06 | Paid, chargeback at 20:00 | — | Back on Free; protection stays on |
| ALR-03 | — | 4 orders we couldn't check in a trading day | Trader told once |
| ALR-04 | Rule breaks at 10:00, 10:05, 10:05 | Alerts | One at 10:00, then at 10:30 "2 more trades broke a rule since 10:00." |
| ALR-05 | A new Windows app install | First fetch | No old alerts shown. Only alerts after that fetch |

---

## 16. Open questions

| # | Question | If the answer is no |
|---|---|---|
| Q1a | Can a `document_start` capture listener read the TradingView order-panel submit, Enter in its fields and the one-click floating buttons, on paper trading and 2+ target brokers? Also: touch input, confirmation dialogs, where one-click SL/brackets come from | Those trades are counted from the positions table only, without their stop loss |
| Q2 | Can the extension read positions, fills history, P/L and the account id from the Account Manager, including when it is collapsed or on another tab, for the brokers the founder trades with? Which allow hedging? | More orders become unclassified. R7 and R8 stay Beta on TradingView, and the listing says so |
| Q3 | Does MT5 `DEAL_REASON` label desktop, mobile and web trades on real brokers and prop firm servers? | Trades carry no source label (counting is unaffected) |
| Q11 | Can the Windows app, with no clicks inside MT: (a) put the EA on a chart and in `default.tpl`; (b) turn on Algo Trading through a start-up configuration; (c) keep both after a terminal restart; (d) exchange bridge files in the Common folder within 1 s with no effect on click handling? On a broker build and a prop-firm build. **2026-09-27, MetaQuotes build 6230, demo account:** (a) yes: `expertmode=5` loads the EA on the profile chart, and a new chart gets it from `default.tpl`; (b) yes; (c) yes over two normal restarts, but MT turns Algo Trading off whenever the account changes. Open: (d), and a prop-firm build | For each part that fails, the app shows only that one step, with a screenshot ("Click Algo Trading once"), instead of the whole manual flow |
