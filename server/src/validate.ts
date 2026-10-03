// Validates protected setting values (ranges from SPEC §5.1 and §7.2). Returns a clean copy or throws.
import { isValidTimeZone } from '@dg/core';
import { HttpError } from './http.ts';

const bad = (what: string): never => {
  throw new HttpError(400, 'bad_setting', what);
};

function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') bad(what);
  return v as boolean;
}

function int(v: unknown, min: number, max: number, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) bad(what);
  return v as number;
}

function real(v: unknown, min: number, max: number, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) bad(what);
  return Math.round((v as number) * 1e8) / 1e8;
}

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) bad(what);
  return v as Record<string, unknown>;
}

function hhmm(v: unknown, what: string): string {
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) bad(what);
  return v as string;
}

function tz(v: unknown): string {
  if (typeof v !== 'string' || v.length > 64 || !isValidTimeZone(v)) bad('timezone');
  return v as string;
}

function resetValue(v: unknown) {
  const o = obj(v, 'reset');
  const preset = o.preset;
  if (preset === 'midnight') return { preset };
  if (preset === 'forex_close' || preset === 'futures_session') return { preset };
  if (preset === 'custom') return { preset, at: hhmm(o.at, 'reset time'), tz: tz(o.tz) };
  return bad('reset preset');
}

function limit(v: unknown, maxPct: number, what: string) {
  if (v === null) return null;
  const o = obj(v, what);
  if (o.unit === 'amount') return { unit: 'amount', value: real(o.value, 0.01, 1e9, what) };
  if (o.unit === 'pct') return { unit: 'pct', value: real(o.value, 0.1, maxPct, what) };
  return bad(what);
}

export type AccountLookup = (id: string) => { platform: string } | undefined;

export function validateSetting(key: string, value: unknown, account: AccountLookup): unknown {
  const [kind, id, sub] = key.split(':');
  if (kind === 'rule') {
    const o = obj(value, key);
    const on = bool(o.on, 'on');
    switch (id) {
      case 'R1':
        return { on, max: int(o.max, 1, 100, 'max') };
      case 'R2':
        return { on, max: int(o.max, 1, 50, 'max') };
      case 'R3':
        return { on, count: int(o.count, 2, 10, 'count'), seconds: int(o.seconds, 10, 600, 'seconds') };
      case 'R4': {
        if (!Array.isArray(o.windows) || o.windows.length > 42) bad('windows');
        const windows = (o.windows as unknown[]).map((w) => {
          const x = obj(w, 'window');
          const start = int(x.start, 0, 1439, 'start');
          const end = int(x.end, 1, 1440, 'end');
          if (end <= start) bad('window order');
          return { day: int(x.day, 0, 6, 'day'), start, end };
        });
        return { on, windows };
      }
      case 'R5':
      case 'R6':
      case 'R9':
        return { on };
      case 'R7':
        return { on, minutes: int(o.minutes, 1, 240, 'minutes'), doubleAfter2: bool(o.doubleAfter2 ?? false, 'doubleAfter2') };
      case 'R8':
        return { on, restHours: int(o.restHours, 0, 24, 'restHours'), allAccounts: bool(o.allAccounts ?? false, 'allAccounts') };
      case 'R10':
        return { on, minutes: int(o.minutes, 5, 120, 'minutes') };
      default:
        return bad('rule');
    }
  }
  if (kind === 'default') {
    if (!['r5', 'r5bet', 'r6', 'r8', 'r7ignore'].includes(id)) bad('default');
    return validateSetting(`acct:*:${id === 'r5bet' ? 'r5' : id}`, value, () => ({ platform: 'mt5' }));
  }
  if (kind === 'acct') {
    const a = account(id);
    if (!a) throw new HttpError(404, 'no_account');
    switch (sub) {
      case 'r5': {
        const o = obj(value, 'r5');
        const overrides = o.r5Overrides === undefined ? [] : o.r5Overrides;
        if (!Array.isArray(overrides) || overrides.length > 20) bad('overrides');
        return {
          r5Max: real(o.r5Max, 0.000001, 1e9, 'max size'),
          r5Overrides: (overrides as unknown[]).map((x) => {
            const ov = obj(x, 'override');
            if (typeof ov.prefix !== 'string' || !/^[A-Za-z0-9._#-]{1,30}$/.test(ov.prefix)) bad('override symbol');
            return { prefix: (ov.prefix as string).toUpperCase(), max: real(ov.max, 0.000001, 1e9, 'override size') };
          }),
        };
      }
      case 'r6':
        if (a.platform === 'tv' && value !== null) bad('R6 is MT only');
        return limit(value, 10, 'r6');
      case 'r8': {
        const l = limit(value, 20, 'r8');
        if (l && l.unit === 'pct' && a.platform === 'tv') bad('TradingView daily loss limit is an amount');
        return l;
      }
      case 'r7ignore':
        return value === null ? null : real(value, 0, 1e9, 'ignore below');
      case 'copies':
        if (!Array.isArray(value) || value.length > 20) bad('copies');
        return (value as unknown[]).map((m) => int(m, 0, Number.MAX_SAFE_INTEGER, 'magic'));
      case 'reset':
        return resetValue(value);
      default:
        return bad('account setting');
    }
  }
  switch (kind) {
    case 'countOnce':
      return bool(value, 'countOnce');
    case 'tz':
      return tz(value);
    case 'reset':
      return resetValue(value);
    default:
      return bad('setting');
  }
}
