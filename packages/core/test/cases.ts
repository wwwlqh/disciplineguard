// SPEC §15 test cases as data. The TypeScript tests and the MQL5 runner (clients/mt5/tests) both run these.
// Defaults (SPEC §15): user timezone UTC, reset 00:00 UTC, setup mode ended, popup defaults,
// R8 rest 12 h and all_accounts off, clock verified, no recent losing close.
import { classifyOrder, DAY, emptyRules, HOUR, MIN, DEFAULT_POPUP, resets, transitions } from '../src/index.ts';
import type { AccountState, EvalInput, Order, PopupSettings, ResolvedTime, Rules, State, TitleId } from '../src/index.ts';

/** Monday 5 Oct 2026, 00:00 UTC. */
export const BASE = Date.UTC(2026, 9, 5);

export function at(hms: string, day = 0): number {
  const [h, m, s = 0] = hms.split(':').map(Number);
  return BASE + day * DAY + h * HOUR + m * MIN + s * 1000;
}

export function utcTime(): ResolvedTime {
  const r: number[] = [];
  for (let d = -10; d <= 20; d++) r.push(BASE + d * DAY);
  return { userResets: r, accountResets: {}, offsets: [[BASE - 60 * DAY, 0]] };
}

export function zoneTime(tz: string, resetAt: string, around: number, resetTz = tz): ResolvedTime {
  const from = around - 10 * DAY;
  const to = around + 10 * DAY;
  return { userResets: resets({ at: resetAt, tz: resetTz }, from, to), accountResets: {}, offsets: transitions(tz, from, to) };
}

type RulesPatch = Partial<Omit<Rules, 'accounts'>> & { accounts?: Rules['accounts'] };

export function rules(p: RulesPatch = {}): Rules {
  return { ...emptyRules(), ...p, accounts: p.accounts ?? {} } as Rules;
}

export function mtAccount(p: Partial<AccountState> = {}): AccountState {
  return { platform: 'mt5', netting: false, positions: [], ...p };
}

export function state(p: Partial<State> = {}): State {
  return { entries: [], closes: [], overrides: [], accounts: { A: mtAccount() }, clock: { verified: true }, ...p };
}

export function entries(times: number[], account = 'A', symbol = 'EURUSD'): State['entries'] {
  return times.map((t) => ({ t, account, symbol, side: 'buy' as const, size: 0.1 }));
}

export function order(p: Partial<Order> = {}): Order {
  return { platform: 'mt5', account: 'A', symbol: 'EURUSD', side: 'buy', size: 0.1, type: 'market', kind: 'entry', sl: 1.09, ...p };
}

export interface Expect {
  /** No pause. */
  pass?: boolean;
  /** Title rule (first violation). */
  title?: TitleId | 'CHECK';
  /** Every rule listed, in order. */
  rules?: TitleId[];
  observed?: number;
  limit?: number;
  clearsAt?: number;
  fixSize?: number;
  fixAddSl?: boolean;
  /** Pause wait in seconds (runs planPause). */
  wait?: number;
  typeConfirm?: number | null;
  reattemptAgoSec?: number;
}

export interface Case {
  id: string;
  input: EvalInput;
  popup?: PopupSettings;
  expect: Expect;
}

const T0 = utcTime();
const c = (id: string, input: Partial<EvalInput> & { now: number }, expect: Expect, popup?: PopupSettings): Case => ({
  id,
  input: { rules: rules(), time: T0, state: state(), order: order(), ...input },
  popup,
  expect,
});

const popup = (p: Partial<PopupSettings>): PopupSettings => ({ ...DEFAULT_POPUP, ...p });

// DAY-02/03: Forex close. 5 Oct 2026 is EDT (UTC−4), so 17:00 New York = 21:00 UTC.
const FX = zoneTime('UTC', '17:00', BASE, 'America/New_York');
// DAY-04: London spring change, Sunday 29 Mar 2026 (01:00 → 02:00).
const SPRING = Date.UTC(2026, 2, 29);
const LON = zoneTime('Europe/London', '00:00', SPRING);

function classified(acct: AccountState, o: Order): Order {
  return { ...o, kind: classifyOrder(acct, acct.positions, o.symbol, o.side, o.size).kind };
}

const netLong = mtAccount({ netting: true, positions: [{ symbol: 'EURUSD', side: 'buy', size: 1.0 }] });
const hedgeLong = mtAccount({ positions: [{ symbol: 'EURUSD', side: 'buy', size: 1.0 }] });
const spec = { tickSize: 0.00001, tickValueLoss: 1, volumeStep: 0.01, volumeMin: 0.01 };
const r8Acct = (p: Partial<AccountState>) => ({ A: mtAccount(p) });
const R8 = (value: number, unit: 'amount' | 'pct' = 'amount', extra: Partial<Rules['R8']> = {}) =>
  rules({ R8: { on: true, restHours: 12, allAccounts: false, ...extra }, accounts: { A: { r8: { unit, value } }, B: { r8: { unit, value } } } });

export const CASES: Case[] = [
  // 15.1 Trading day
  c('DAY-01', { rules: rules({ R1: { on: true, max: 1 } }), state: state({ entries: entries([at('23:50', -1)]) }), now: at('00:10') }, { pass: true }),
  c('DAY-02', { rules: rules({ R1: { on: true, max: 1 } }), time: FX, state: state({ entries: entries([at('20:50')]) }), now: at('21:05') }, { pass: true }),
  c('DAY-03', { rules: rules({ R1: { on: true, max: 1 } }), time: FX, state: state({ entries: entries([at('20:50')]) }), now: at('20:55') }, { title: 'R1', clearsAt: at('21:00') }),
  // Entry 00:30 GMT, then 23:30 BST (22:30 UTC) on the 23-hour day.
  c('DAY-04', { rules: rules({ R1: { on: true, max: 1 } }), time: LON, state: state({ entries: entries([SPRING + 30 * MIN]) }), now: SPRING + 22 * HOUR + 30 * MIN }, { title: 'R1' }),
  c('DAY-07', {
    rules: rules({ R1: { on: true, max: 5 } }),
    state: state({ entries: entries([at('09:00'), at('10:00'), at('11:00'), at('12:00'), at('13:00')]), clock: { verified: false, anchor: at('22:30') } }),
    now: at('01:30', 1),
  }, { title: 'R1', observed: 6 }),

  // 15.2 Counting and classification (evaluate level)
  c('CNT-01', { rules: rules({ R1: { on: true, max: 5 } }), state: state({ entries: entries([at('09:00'), at('09:10'), at('09:20'), at('09:30')]) }), now: at('10:00') }, { pass: true }),
  c('CNT-03', {
    rules: rules({ R5: { on: true }, accounts: { A: { r5Max: 1.2 } } }),
    state: state({ accounts: { A: hedgeLong } }),
    order: order({ size: 0.5, spec }),
    now: at('10:00'),
  }, { title: 'R5', observed: 1.5, fixSize: 0.2 }),
  c('CNT-04', { rules: rules({ R1: { on: true, max: 0 } }), state: state({ accounts: { A: netLong } }), order: classified(netLong, order({ side: 'sell', size: 0.4 })), now: at('10:00') }, { pass: true }),
  c('CNT-05', {
    rules: rules({ R5: { on: true }, accounts: { A: { r5Max: 1.0 } } }),
    state: state({ accounts: { A: netLong } }),
    order: classified(netLong, order({ side: 'sell', size: 1.5 })),
    now: at('10:00'),
  }, { pass: true }),
  c('CNT-06', {
    rules: rules({ R1: { on: true, max: 0 } }),
    state: state({ accounts: { A: { platform: 'tv', netting: true, positions: [] } } }),
    order: { ...order({ platform: 'tv' }), kind: classifyOrder({ platform: 'tv', netting: true }, undefined, 'EURUSD', 'buy', 1).kind },
    now: at('10:00'),
  }, { pass: true }),
  c('CNT-16', {
    rules: rules({ R1: { on: true, max: 0 } }),
    state: state({ accounts: { A: { platform: 'tv', netting: true, positions: [] } } }),
    order: { ...order({ platform: 'tv', side: 'sell', size: 1 }), kind: classifyOrder({ platform: 'tv', netting: true }, [], 'EURUSD', 'sell', 1).kind },
    now: at('10:00'),
  }, { title: 'R1' }),
  c('CNT-18a', {
    rules: rules({ R1: { on: true, max: 5 }, countOnce: true }),
    state: state({ entries: entries([at('08:00'), at('08:10'), at('08:20'), at('08:30')]), accounts: { A: mtAccount(), B: mtAccount() } }),
    now: at('10:00:00'),
  }, { pass: true }),
  c('CNT-18b', {
    rules: rules({ R1: { on: true, max: 5 }, countOnce: true }),
    state: state({ entries: entries([at('08:00'), at('08:10'), at('08:20'), at('08:30'), at('10:00:00')]), accounts: { A: mtAccount(), B: mtAccount() } }),
    order: order({ account: 'B' }),
    now: at('10:00:20'),
  }, { pass: true }),

  // 15.3 Rules
  c('R1-01', { rules: rules({ R1: { on: true, max: 5 } }), state: state({ entries: entries([at('08:00'), at('08:10'), at('08:20'), at('08:30')]) }), now: at('10:00') }, { pass: true }),
  c('R1-02', { rules: rules({ R1: { on: true, max: 5 } }), state: state({ entries: entries([at('08:00'), at('08:10'), at('08:20'), at('08:30'), at('08:40')]) }), now: at('10:00') }, { title: 'R1', observed: 6, limit: 5, clearsAt: at('00:00', 1) }),
  c('R1-03', {
    rules: rules({ R1: { on: true, max: 5 } }),
    state: state({ entries: [...entries([at('08:00'), at('08:10'), at('08:20')]), ...entries([at('08:30'), at('08:40')], 'TV1')], accounts: { A: mtAccount(), TV1: { platform: 'tv', netting: true, positions: [] } } }),
    order: order({ platform: 'tv', account: 'TV1' }),
    now: at('10:00'),
  }, { title: 'R1' }),
  c('R2-01', { rules: rules({ R2: { on: true, max: 3 } }), state: state({ entries: entries([at('10:05'), at('10:20'), at('10:50')]) }), now: at('11:04') }, { title: 'R2', clearsAt: at('11:05') }),
  c('R2-02', { rules: rules({ R2: { on: true, max: 3 } }), state: state({ entries: entries([at('10:05'), at('10:20'), at('10:50')]) }), now: at('11:05') }, { pass: true }),
  c('R3-01', { rules: rules({ R3: { on: true, count: 2, seconds: 60 } }), state: state({ entries: entries([at('10:00:00')]) }), now: at('10:00:45') }, { title: 'R3', clearsAt: at('10:01:00') }),
  c('R3-02', { rules: rules({ R3: { on: true, count: 2, seconds: 60 } }), state: state({ entries: entries([at('10:00:00')]) }), now: at('10:01:00') }, { pass: true }),
  c('R3-03', { rules: rules({ R3: { on: true, count: 3, seconds: 60 } }), state: state({ entries: entries([at('10:00:00'), at('10:00:30')]) }), now: at('10:00:50') }, { title: 'R3' }),
  c('R3-04', { rules: rules({ R3: { on: true, count: 2, seconds: 60 } }), state: state({ entries: entries([at('10:00:00')]) }), now: at('10:00:59') }, { title: 'R3' }),
  ...(() => {
    const all = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: 14 * 60 + 30, end: 17 * 60 }));
    const r = rules({ R4: { on: true, windows: all } });
    return [
      c('R4-01', { rules: r, now: at('14:29:59') }, { title: 'R4', clearsAt: at('14:30') }),
      c('R4-02', { rules: r, now: at('14:30:00') }, { pass: true }),
      c('R4-03', { rules: r, now: at('17:00:00') }, { title: 'R4' }),
    ];
  })(),
  // Saturday 10 Oct 12:00 → Monday 12 Oct 00:00.
  c('R4-04', { rules: rules({ R4: { on: true, windows: [0, 1, 2, 3, 4].map((day) => ({ day, start: 0, end: 1440 })) } }), now: at('12:00', 5) }, { title: 'R4', clearsAt: at('00:00', 7) }),
  c('R4-05', { rules: rules({ R4: { on: true, windows: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: 22 * 60, end: 1440 })) } }), now: at('23:59:30') }, { pass: true }),
  // 22:00–02:00 Mon–Fri, stored as two windows (see changes.test.ts for the split).
  ...(() => {
    const w = [0, 1, 2, 3, 4].flatMap((day) => [{ day, start: 22 * 60, end: 1440 }, { day: day + 1, start: 0, end: 120 }]);
    const r = rules({ R4: { on: true, windows: w } });
    return [c('R4-06a', { rules: r, now: at('01:00', 5) }, { pass: true }), c('R4-06b', { rules: r, now: at('01:00', 7) }, { title: 'R4' })];
  })(),
  c('R5-01', { rules: rules({ R5: { on: true }, accounts: { A: { r5Max: 0.5 } } }), order: order({ size: 0.5 }), now: at('10:00') }, { pass: true }),
  c('R5-02', { rules: rules({ R5: { on: true }, accounts: { A: { r5Max: 0.5 } } }), order: order({ size: 0.51, spec }), now: at('10:00') }, { title: 'R5', fixSize: 0.5 }),
  c('R5-03', {
    rules: rules({ R5: { on: true }, accounts: { A: { r5Max: 0.5 } } }),
    state: state({ accounts: { A: mtAccount({ positions: [{ symbol: 'EURUSD', side: 'buy', size: 0.3 }] }) } }),
    order: order({ size: 0.3 }),
    now: at('10:00'),
  }, { title: 'R5', observed: 0.6 }),
  c('R5-04', { rules: rules({ R5: { on: true }, accounts: { A: { r5Max: 0.5, r5Overrides: [{ prefix: 'XAUUSD', max: 0.1 }] } } }), order: order({ symbol: 'XAUUSD.a', size: 0.2 }), now: at('10:00') }, { title: 'R5' }),
  c('R5-05', {
    rules: rules({ R5: { on: true }, accounts: { A: { r5Max: 0.5 }, B: { r5Max: 0.5 } } }),
    state: state({ accounts: { A: mtAccount({ positions: [{ symbol: 'EURUSD', side: 'buy', size: 0.4 }] }), B: mtAccount() } }),
    order: order({ account: 'B', size: 0.4 }),
    now: at('10:00'),
  }, { pass: true }),
  c('R5-06', { rules: rules({ R5: { on: true } }), state: state({ accounts: { T: { platform: 'tv', netting: true, positions: [] } } }), order: order({ platform: 'tv', account: 'T', size: 1000 }), now: at('10:00') }, { pass: true }),
  c('R6-01', { rules: rules({ R6: { on: true }, accounts: { A: { r6: { unit: 'amount', value: 100 } } } }), order: order({ size: 1.0, price: 1.1, sl: 1.098, spec }), now: at('10:00') }, { title: 'R6', observed: 200, fixSize: 0.5 }),
  c('R6-02', { rules: rules({ R6: { on: true }, accounts: { A: { r6: { unit: 'amount', value: 100 } } } }), order: order({ size: 0.5, price: 1.1, sl: 1.098, spec }), now: at('10:00') }, { pass: true }),
  c('R6-03', { rules: rules({ R6: { on: true }, accounts: { A: { r6: { unit: 'amount', value: 100 } } } }), order: order({ sl: undefined, price: 1.1, spec }), now: at('10:00') }, { title: 'R6', fixAddSl: true }),
  c('R7-01', { rules: rules({ R7: { on: true, minutes: 10, doubleAfter2: false } }), state: state({ closes: [{ t: at('10:00:00'), account: 'A', net: -50, size: 1 }] }), now: at('10:09:59') }, { title: 'R7', clearsAt: at('10:10:00') }),
  c('R7-02', { rules: rules({ R7: { on: true, minutes: 10, doubleAfter2: false } }), state: state({ closes: [{ t: at('10:00:00'), account: 'A', net: -50, size: 1 }] }), now: at('10:10:00') }, { pass: true }),
  c('R7-03', { rules: rules({ R7: { on: true, minutes: 10, doubleAfter2: false } }), state: state({ closes: [{ t: at('10:00'), account: 'A', net: -3, size: 1 }] }), now: at('10:05') }, { title: 'R7' }),
  c('R7-04', {
    rules: rules({ R7: { on: true, minutes: 10, doubleAfter2: false } }),
    state: state({ closes: [{ t: at('10:00'), account: 'A', net: -50, size: 1 }], accounts: { A: mtAccount(), T: { platform: 'tv', netting: true, positions: [] } } }),
    order: order({ platform: 'tv', account: 'T' }),
    now: at('10:05'),
  }, { title: 'R7' }),
  c('R7-05', { rules: rules({ R7: { on: true, minutes: 10, doubleAfter2: false }, accounts: { A: { r7IgnoreBelow: 10 } } }), state: state({ closes: [{ t: at('10:00'), account: 'A', net: -3, size: 1 }] }), now: at('10:05') }, { pass: true }),
  c('R7-06', {
    rules: rules({ R7: { on: true, minutes: 10, doubleAfter2: true } }),
    state: state({ closes: [{ t: at('10:00'), account: 'A', net: -50, size: 1 }, { t: at('10:20'), account: 'A', net: -50, size: 1 }] }),
    now: at('10:35'),
  }, { title: 'R7', clearsAt: at('10:40') }),
  c('R8-01', { rules: R8(300), state: state({ accounts: r8Acct({ dayStartBalance: 10000, equity: 9680, credit: 0 }) }), now: at('10:00') }, { title: 'R8', observed: 320 }),
  c('R8-02', { rules: R8(3, 'pct'), state: state({ accounts: r8Acct({ dayStartBalance: 10000, equity: 9701 }) }), now: at('10:00') }, { pass: true }),
  c('R8-03', { rules: R8(3, 'pct'), state: state({ accounts: r8Acct({ dayStartBalance: 10000, equity: 9700 }) }), now: at('10:00') }, { title: 'R8' }),
  c('R8-04', { rules: R8(300), state: state({ accounts: r8Acct({ dayStartBalance: 11000, equity: 10800 }) }), now: at('10:00') }, { pass: true }),
  c('R8-05', {
    rules: R8(300),
    state: state({ accounts: { A: mtAccount({ dayStartBalance: 10000, equity: 10000, limitReachedAt: at('09:00') }), B: mtAccount({ dayStartBalance: 10000, equity: 10000 }) } }),
    order: order({ account: 'B' }),
    now: at('10:00'),
  }, { pass: true }),
  c('R8-06', { rules: R8(300), state: state({ accounts: { A: { platform: 'tv', netting: true, positions: [] } } }), order: order({ platform: 'tv' }), now: at('10:00') }, { pass: true }),
  c('R8-07', { rules: R8(300), state: state({ accounts: r8Acct({ dayStartBalance: 9500, equity: 9250 }) }), now: at('10:00') }, { pass: true }),
  c('R8-08', { rules: R8(300), state: state({ accounts: r8Acct({ dayStartBalance: 10000, equity: 10100, credit: 500 }) }), now: at('10:00') }, { title: 'R8', observed: 400 }),
  c('R8-09', { rules: R8(300), state: state({ accounts: r8Acct({ dayStartBalance: 10000, equity: 10000, limitReachedAt: at('23:10', -1) }) }), now: at('00:30') }, { title: 'R8', clearsAt: at('11:10') }),
  c('R8-10', { rules: R8(300), state: state({ accounts: r8Acct({ dayStartBalance: 10000, equity: 10000, limitReachedAt: at('09:00', -1) }) }), now: at('00:30') }, { pass: true }),
  c('R8-11', { rules: R8(300), state: state({ accounts: r8Acct({ dayStartBalance: 10000, equity: 9750, limitReachedAt: at('10:00') }) }), now: at('11:05') }, { title: 'R8' }),
  c('R8-12', {
    rules: R8(300, 'amount', { allAccounts: true }),
    state: state({ accounts: { A: mtAccount({ dayStartBalance: 10000, equity: 10000, limitReachedAt: at('09:00') }), B: mtAccount({ dayStartBalance: 10000, equity: 10000 }) } }),
    order: order({ account: 'B' }),
    now: at('10:00'),
  }, { title: 'R8' }),
  c('R9-01', { rules: rules({ R9: { on: true } }), order: order({ platform: 'tv', sl: undefined }), state: state({ accounts: { A: { platform: 'tv', netting: true, positions: [] } } }), now: at('10:00') }, { title: 'R9' }),
  c('R9-02', { rules: rules({ R9: { on: true } }), now: at('10:00') }, { pass: true }),
  ...(() => {
    const r = rules({ R7: { on: true, minutes: 10, doubleAfter2: false }, R10: { on: true, minutes: 30 } });
    const s = state({ closes: [{ t: at('10:00'), account: 'A', net: -80, size: 0.8 }], accounts: { A: mtAccount(), B: mtAccount() } });
    return [
      c('R10-01', { rules: r, state: s, order: order({ size: 1.2 }), now: at('10:15') }, { title: 'R10', fixSize: 0.8, clearsAt: at('10:40') }),
      c('R10-02', { rules: r, state: s, order: order({ size: 0.8 }), now: at('10:15') }, { pass: true }),
      c('R10-03', { rules: r, state: s, order: order({ size: 1.2 }), now: at('10:45') }, { pass: true }),
      c('R10-04', { rules: r, state: s, order: order({ account: 'B', size: 1.2 }), now: at('10:15') }, { pass: true }),
    ];
  })(),

  // 15.4 Pause, waits and decisions
  c('MUL-01', {
    rules: rules({ R1: { on: true, max: 1 }, R7: { on: true, minutes: 10, doubleAfter2: false } }),
    state: state({ entries: entries([at('09:00')]), closes: [{ t: at('09:58'), account: 'A', net: -5, size: 1 }] }),
    now: at('10:00'),
  }, { title: 'R7', rules: ['R7', 'R1'], wait: 5 }, DEFAULT_POPUP),
  c('WAIT-01', { rules: rules({ R1: { on: true, max: 1 } }), state: state({ entries: entries([at('09:00')]), overrides: [at('09:10'), at('09:20'), at('09:30')] }), now: at('10:00') }, { title: 'R1', wait: 5, typeConfirm: null }, DEFAULT_POPUP),
  c('WAIT-02', { rules: rules({ R1: { on: true, max: 1 } }), state: state({ entries: entries([at('09:00')]), overrides: [at('09:10'), at('09:20')] }), now: at('10:00') }, { wait: 15 }, popup({ growing: { on: true, step: 5, cap: 45 } })),
  c('WAIT-03', {
    rules: R8(300),
    state: state({ accounts: r8Acct({ dayStartBalance: 10000, equity: 9000 }), overrides: Array.from({ length: 10 }, (_, i) => at('09:00') + i * MIN) }),
    now: at('10:00'),
  }, { title: 'R8', wait: 45 }, popup({ growing: { on: true, step: 5, cap: 45 } })),
  c('WAIT-04', { rules: rules({ R1: { on: true, max: 1 } }), state: state({ entries: entries([at('09:00')]), closes: [{ t: at('09:40'), account: 'A', net: -5, size: 1 }] }), now: at('10:00') }, { wait: 15 }, popup({ lossWait: { on: true, seconds: 15, withinMinutes: 30 } })),
  c('WAIT-05', { rules: rules({ R1: { on: true, max: 1 } }), state: state({ entries: entries([at('09:00')]), closes: [{ t: at('09:20'), account: 'A', net: -5, size: 1 }] }), now: at('10:00') }, { wait: 5 }, popup({ lossWait: { on: true, seconds: 15, withinMinutes: 30 } })),
  c('WAIT-06', { rules: rules({ R1: { on: true, max: 1 } }), state: state({ entries: entries([at('09:00')]), overrides: [at('09:10'), at('09:20')] }), now: at('10:00') }, { wait: 5, typeConfirm: 2 }, popup({ typeConfirm: { mode: 'after', n: 2 } })),
  c('WAIT-07', { rules: rules({ R1: { on: true, max: 1 } }), state: state({ entries: entries([at('09:00')]), overrides: [at('09:30')] }), now: at('10:00') }, { wait: 10 }, popup({ growing: { on: true, step: 5, cap: 45 } })),
  c('WAIT-08', { rules: rules({ R1: { on: true, max: 1 } }), state: state({ entries: entries([at('09:00')]) }), now: at('10:00') }, { title: 'R1', wait: 0 }, popup({ wait: 0 })),
  c('SHOW-01', { now: at('10:00') }, { title: 'CHECK', wait: 5 }, popup({ show: 'every' })),
  c('SHOW-02', { now: at('10:00') }, { pass: true }, DEFAULT_POPUP),
  c('RE-01', {
    rules: rules({ R1: { on: true, max: 1 } }),
    state: state({ entries: entries([at('09:00')]), lastSkip: { t: at('10:00:00'), symbol: 'EURUSD', side: 'buy', waitSec: 15 } }),
    now: at('10:00:40'),
  }, { wait: 15, reattemptAgoSec: 40 }, DEFAULT_POPUP),
  c('BRK-01', { state: state({ breakUntil: at('10:29') }), now: at('10:20') }, { title: 'BREAK', clearsAt: at('10:29'), wait: 15 }, DEFAULT_POPUP),
  c('BRK-02', { state: state({ doneUntil: at('00:00', 1) }), now: at('18:00') }, { title: 'DONE_TODAY', clearsAt: at('00:00', 1) }, DEFAULT_POPUP),
  c('EXIT-01', { rules: R8(300), state: state({ accounts: r8Acct({ dayStartBalance: 10000, equity: 9000 }) }), order: order({ kind: 'exit' }), now: at('10:00') }, { pass: true }, DEFAULT_POPUP),

  // 15.6 Offline (evaluate level)
  c('OFF-05', { rules: rules({ R1: { on: true, max: 1 } }), state: state({ entries: entries([at('09:00')]) }), now: at('10:00') }, { title: 'R1' }),
  c('CHG-19', {
    // Active 5, pending 8 at 00:00, not active without a sync: the client evaluates with 5.
    rules: rules({ R1: { on: true, max: 5 } }),
    state: state({ entries: entries([at('00:00'), at('00:05'), at('00:10'), at('00:15'), at('00:20')]) }),
    now: at('00:30'),
  }, { title: 'R1' }),
];
