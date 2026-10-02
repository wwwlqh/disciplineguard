// Shared types for evaluate() and everything around it (SPEC §8.1).
// All instants are UTC epoch milliseconds. Weekdays are 0 = Monday … 6 = Sunday.

export type Side = 'buy' | 'sell';
export type Platform = 'mt5' | 'mt4' | 'tv';
export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9' | 'R10';
export type TitleId = RuleId | 'BREAK' | 'DONE_TODAY';

/** One R4 window in the user's wall clock. `start` inclusive, `end` exclusive, minutes since local midnight, end ≤ 1440. */
export interface TimeWindow {
  day: number;
  start: number;
  end: number;
}

export type LimitUnit = 'amount' | 'pct';

/** Per trading account settings (the account sheet, EXPERIENCE §5.5). */
export interface AccountRules {
  /** R5 limit in the account's size unit. Undefined: not set yet, R5 does not apply (SPEC §5.2). */
  r5Max?: number;
  r5Overrides?: { prefix: string; max: number }[];
  r6?: { unit: LimitUnit; value: number };
  r8?: { unit: LimitUnit; value: number };
  /** R7: a losing close with |net| below this does not start a cooldown. */
  r7IgnoreBelow?: number;
  /** MT magic numbers marked "copies" (SPEC §4.2). */
  copiesMagic?: number[];
}

export interface Rules {
  R1: { on: boolean; max: number };
  R2: { on: boolean; max: number };
  R3: { on: boolean; count: number; seconds: number };
  R4: { on: boolean; windows: TimeWindow[] };
  R5: { on: boolean };
  R6: { on: boolean };
  R7: { on: boolean; minutes: number; doubleAfter2: boolean };
  R8: { on: boolean; restHours: number; allAccounts: boolean };
  R9: { on: boolean };
  R10: { on: boolean; minutes: number };
  accounts: Record<string, AccountRules>;
  /** "Count the same trade on several accounts once" (SPEC §4.2). */
  countOnce: boolean;
  /**
   * "Close outside trades" (SPEC §9.2): the MT5 EA closes a trade placed by hand outside DisciplineGuard (phone, web,
   * the terminal's own order window) that goes past a rule, right after its fill. Off unless the trader turns it on.
   */
  closeOutside: boolean;
}

export interface PopupSettings {
  show: 'breaks' | 'every';
  wait: number;
  lossWait: { on: boolean; seconds: number; withinMinutes: number };
  growing: { on: boolean; step: number; cap: number };
  typeConfirm: { mode: 'off' | 'always' | 'after'; n: number };
  skipCard: boolean;
  keyboardPlace: boolean;
}

/**
 * Pre-resolved time (SPEC §3.3). Clients never compute timezones.
 * `userResets` and each `accountResets` list are sorted and must contain at least one instant ≤ now and one > now.
 * `offsets` are the user timezone's [instant, offset seconds] pairs, sorted; the first applies before its instant too.
 */
export interface ResolvedTime {
  userResets: number[];
  accountResets: Record<string, number[]>;
  offsets: [number, number][];
}

export interface Entry {
  t: number;
  account: string;
  symbol: string;
  side: Side;
  size: number;
}

export interface Close {
  t: number;
  account: string;
  /** profit + commission + swap + fees of the closing deal. */
  net: number;
  size: number;
}

export interface Position {
  symbol: string;
  side: Side;
  size: number;
}

export interface AccountState {
  platform: Platform;
  /** MT netting account. Hedging when false. TradingView: see SPEC §4.4. */
  netting: boolean;
  positions: Position[];
  /** MT: balance at the account's reset + money moves since (SPEC §5.2). */
  dayStartBalance?: number;
  equity?: number;
  credit?: number;
  /** TradingView: loss today read from the Account Manager (positive = loss). Undefined: R8 not available. */
  tvLoss?: number;
  /** When this account entered the R8 limit state, if it did. */
  limitReachedAt?: number;
}

export interface ClockState {
  verified: boolean;
  /** Best estimate of now from the monotonic clock since the last verified sync. Used while unverified. */
  anchor?: number;
}

export interface State {
  /** Counted entries, at least since the start of the current trading day and for the rolling windows. */
  entries: Entry[];
  /** Closes for the R7/R10 windows, always including the two most recent. */
  closes: Close[];
  /** Instants of place-anyway decisions and outside violations (the placed-anyway count, SPEC §2). */
  overrides: number[];
  breakUntil?: number;
  doneUntil?: number;
  accounts: Record<string, AccountState>;
  clock: ClockState;
  /** The most recent skip, for re-attempts (SPEC §2). */
  lastSkip?: { t: number; symbol: string; side: Side; waitSec: number };
}

export type OrderKind = 'entry' | 'exit' | 'unclassified';
export type OrderType = 'market' | 'limit' | 'stop';

export interface SymbolSpec {
  tickSize: number;
  tickValueLoss: number;
  volumeStep: number;
  volumeMin: number;
}

export interface Order {
  platform: Platform;
  account: string;
  symbol: string;
  side: Side;
  size: number;
  type: OrderType;
  kind: OrderKind;
  sl?: number;
  /** R6 entry price: the order price for pending orders, ask (buy) or bid (sell) for market orders. */
  price?: number;
  spec?: SymbolSpec;
}

export interface Fix {
  /** The largest size that satisfies the rule (R5, R6, R10). */
  size?: number;
  addSl?: boolean;
}

export interface Violation {
  rule: TitleId;
  observed: number;
  limit: number;
  clearsAt?: number;
  fix?: Fix;
}

export interface EvalInput {
  rules: Rules;
  time: ResolvedTime;
  state: State;
  order: Order;
  now: number;
}
