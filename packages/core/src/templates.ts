// Starting templates (EXPERIENCE §5.3). Starting values, not advice. Edit the numbers here.
// If two choices set the same rule, the stricter value wins.
import { DEFAULT_POPUP } from './pause.ts';
import { tzOffset } from './resolve.ts';
import { splitWindow } from './changes.ts';
import type { AccountRules, Platform, PopupSettings, Rules, TimeWindow } from './types.ts';

export type Choice = 'too_many' | 'win_back' | 'size_up' | 'hours' | 'skip_sl' | 'bad_days' | 'give_back';
export type Style = 'scalping' | 'day' | 'swing';
export type AccountType = 'prop_challenge' | 'prop_funded' | 'own' | 'demo';

export const TEMPLATE_VALUES = {
  tooManyTradesPerDay: 5,
  tooFastCount: 3,
  tooFastSeconds: 120,
  cooldownMinutes: 15,
  ignoreBelowPctOfDailyLimit: 10,
  noBiggerMinutes: 30,
  riskPerTradePct: 1,
  dailyLossPct: 2,
  restHours: 12,
  propLimitShare: 0.8,
  sessions: {
    london: { tz: 'Europe/London', start: '08:00', end: '11:00' },
    new_york: { tz: 'America/New_York', start: '14:30', end: '17:00' },
  },
} as const;

export interface TemplateAccount {
  id: string;
  platform: Platform;
  type: AccountType;
  balance?: number;
  usualSize?: number;
  /** TradingView and "amount" limits need an amount in the account currency. */
  dailyLossAmount?: number;
  prop?: { dailyLimitPct?: number; dailyLimitAmount?: number };
}

export interface TemplateInput {
  choices: Choice[];
  style: Style;
  accounts: TemplateAccount[];
  userTz: string;
  session?: 'london' | 'new_york' | { days: number[]; start: number; end: number };
}

export function emptyRules(): Rules {
  return {
    R1: { on: false, max: 5 },
    R2: { on: false, max: 3 },
    R3: { on: false, count: 3, seconds: 120 },
    R4: { on: false, windows: [] },
    R5: { on: false },
    R6: { on: false },
    R7: { on: false, minutes: 15, doubleAfter2: false },
    R8: { on: false, restHours: 12, allAccounts: false },
    R9: { on: false },
    R10: { on: false, minutes: 30 },
    accounts: {},
    countOnce: false,
    closeOutside: false,
  };
}

function hhmm(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

/** A named session in the user's wall clock, Monday to Friday, at today's offsets. */
export function sessionWindows(session: 'london' | 'new_york', userTz: string, now = Date.now()): TimeWindow[] {
  const s = TEMPLATE_VALUES.sessions[session];
  const shift = (tzOffset(userTz, now) - tzOffset(s.tz, now)) / 60;
  const start = (((hhmm(s.start) + shift) % 1440) + 1440) % 1440;
  const end = (((hhmm(s.end) + shift) % 1440) + 1440) % 1440;
  return splitWindow([0, 1, 2, 3, 4], start, end === 0 ? 1440 : end);
}

function minDefined(a: number | undefined, b: number): number {
  return a === undefined ? b : Math.min(a, b);
}

export function buildTemplate(input: TemplateInput, now = Date.now()): { rules: Rules; popup: PopupSettings } {
  const r = emptyRules();
  const has = (c: Choice) => input.choices.includes(c);
  const acct = (id: string): AccountRules => (r.accounts[id] ??= {});
  const V = TEMPLATE_VALUES;

  const dailyLoss = (a: TemplateAccount): AccountRules['r8'] | undefined => {
    if (a.platform === 'tv') return a.dailyLossAmount !== undefined ? { unit: 'amount', value: a.dailyLossAmount } : undefined;
    return { unit: 'pct', value: V.dailyLossPct };
  };

  if (has('too_many')) {
    r.R1 = { on: true, max: minDefined(r.R1.on ? r.R1.max : undefined, V.tooManyTradesPerDay) };
    if (input.style !== 'scalping') r.R3 = { on: true, count: V.tooFastCount, seconds: V.tooFastSeconds };
  }
  if (has('bad_days') || has('win_back')) {
    r.R8 = { on: true, restHours: V.restHours, allAccounts: true };
    for (const a of input.accounts) {
      const l = dailyLoss(a);
      if (l) acct(a.id).r8 = l;
    }
    if (has('bad_days')) r.R1 = { on: true, max: minDefined(r.R1.on ? r.R1.max : undefined, V.tooManyTradesPerDay) };
  }
  if (has('win_back')) {
    r.R7 = { on: true, minutes: V.cooldownMinutes, doubleAfter2: true };
    r.R10 = { on: true, minutes: V.noBiggerMinutes };
    for (const a of input.accounts) {
      const l = r.accounts[a.id]?.r8;
      const base = l?.unit === 'amount' ? l.value : l && a.balance ? (l.value * a.balance) / 100 : undefined;
      if (base !== undefined) acct(a.id).r7IgnoreBelow = Math.round(base * (V.ignoreBelowPctOfDailyLimit / 100) * 100) / 100;
    }
  }
  if (has('size_up')) {
    r.R10 = { on: true, minutes: V.noBiggerMinutes };
    r.R5 = { on: true };
    r.R6 = { on: true };
    for (const a of input.accounts) {
      if (a.usualSize !== undefined) acct(a.id).r5Max = a.usualSize;
      if (a.platform !== 'tv') acct(a.id).r6 = { unit: 'pct', value: V.riskPerTradePct };
    }
  }
  if (has('hours') && input.session) {
    const s = input.session;
    r.R4 = { on: true, windows: typeof s === 'string' ? sessionWindows(s, input.userTz, now) : splitWindow(s.days, s.start, s.end) };
  }
  if (has('skip_sl')) r.R9 = { on: true };

  // Prop accounts (EXPERIENCE §5.3 "Prop account").
  for (const a of input.accounts) {
    if (a.type !== 'prop_challenge' && a.type !== 'prop_funded') continue;
    const p = a.prop ?? {};
    let limit: AccountRules['r8'] | undefined;
    if (p.dailyLimitAmount !== undefined) limit = { unit: 'amount', value: Math.round(p.dailyLimitAmount * V.propLimitShare * 100) / 100 };
    else if (p.dailyLimitPct !== undefined && a.platform !== 'tv') limit = { unit: 'pct', value: Math.round(p.dailyLimitPct * V.propLimitShare * 100) / 100 };
    if (limit) {
      const cur = r.accounts[a.id]?.r8;
      if (!cur || cur.unit !== limit.unit || limit.value < cur.value) acct(a.id).r8 = limit;
      r.R8 = { on: true, restHours: Math.max(r.R8.restHours, V.restHours), allAccounts: r.R8.allAccounts };
    }
    r.R7 = { on: true, minutes: Math.max(r.R7.on ? r.R7.minutes : 0, V.cooldownMinutes), doubleAfter2: r.R7.doubleAfter2 };
    r.R9 = { on: true };
  }

  return { rules: r, popup: { ...DEFAULT_POPUP } };
}
