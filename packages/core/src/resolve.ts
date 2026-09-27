// Server side: turns IANA timezones and reset times into the pre-resolved lists clients use (SPEC §3.3).
// Uses Intl, so it runs on the server and in the web app, never in the EA.
import { DAY, HOUR, MIN } from './time.ts';

export interface ResetSpec {
  /** Local time "HH:MM". */
  at: string;
  tz: string;
}

export const RESET_PRESETS: Record<string, ResetSpec> = {
  forex_close: { at: '17:00', tz: 'America/New_York' },
  futures_session: { at: '17:00', tz: 'America/Chicago' },
};

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

/** Offset of `tz` from UTC at instant `t`, in seconds. */
export function tzOffset(tz: string, t: number): number {
  const parts: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(t))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const whole = Math.floor(t / 1000) * 1000;
  return Math.round((asUtc - whole) / 1000);
}

/** [instant, offset] pairs covering [from, to]. The first pair holds the offset at `from`. */
export function transitions(tz: string, from: number, to: number): [number, number][] {
  const out: [number, number][] = [[from, tzOffset(tz, from)]];
  const step = 6 * HOUR;
  let prevT = from;
  let prevOff = out[0][1];
  for (let t = from + step; t <= to + step; t += step) {
    const off = tzOffset(tz, t);
    if (off !== prevOff) {
      // Binary search to the minute where the offset changes.
      let lo = prevT;
      let hi = t;
      while (hi - lo > MIN) {
        const mid = lo + Math.floor((hi - lo) / 2 / MIN) * MIN;
        if (mid === lo) break;
        if (tzOffset(tz, mid) === prevOff) lo = mid;
        else hi = mid;
      }
      out.push([hi, off]);
      prevOff = off;
    }
    prevT = t;
  }
  return out;
}

function parseHHMM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`bad time ${s}`);
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) throw new Error(`bad time ${s}`);
  return (h * 60 + mm) * MIN;
}

/**
 * The UTC instant of wall time `msOfDay` on local calendar day `dayNumber` (days since 1970-01-01) in `tz`.
 * A time that doesn't exist (DST gap) resolves to the first valid instant after it.
 * A time that occurs twice resolves to its first occurrence (SPEC §3.1).
 */
export function wallToUtc(tz: string, dayNumber: number, msOfDay: number): number {
  const local = dayNumber * DAY + msOfDay;
  const candidates = new Set<number>();
  for (const probe of [local - 14 * HOUR, local, local + 14 * HOUR]) {
    candidates.add(local - tzOffset(tz, probe) * 1000);
  }
  const valid = [...candidates].filter((u) => u + tzOffset(tz, u) * 1000 === local).sort((a, b) => a - b);
  if (valid.length > 0) return valid[0];
  // DST gap: the wall time is skipped. The first valid instant after it is the transition itself.
  const before = local - tzOffset(tz, local - 14 * HOUR) * 1000;
  const after = local - tzOffset(tz, local + 14 * HOUR) * 1000;
  let lo = Math.min(before, after);
  let hi = Math.max(before, after);
  const offLo = tzOffset(tz, lo);
  while (hi - lo > 1000) {
    const mid = lo + Math.floor((hi - lo) / 2000) * 1000;
    if (mid === lo) break;
    if (tzOffset(tz, mid) === offLo) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Local calendar day number of instant `t` in `tz`. */
export function localDayNumber(tz: string, t: number): number {
  return Math.floor((t + tzOffset(tz, t) * 1000) / DAY);
}

/** Every reset instant in [from, to], plus the last one before `from`. */
export function resets(spec: ResetSpec, from: number, to: number): number[] {
  const at = parseHHMM(spec.at);
  const out: number[] = [];
  const firstDay = localDayNumber(spec.tz, from) - 1;
  const lastDay = localDayNumber(spec.tz, to) + 1;
  for (let d = firstDay; d <= lastDay; d++) out.push(wallToUtc(spec.tz, d, at));
  const lastBefore = out.filter((r) => r <= from).pop();
  return out.filter((r) => (lastBefore !== undefined && r === lastBefore) || (r > from && r <= to));
}
