// Time helpers that work only from pre-resolved values (SPEC §3.3). No timezone code here.
import type { ResolvedTime } from './types.ts';

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

/** The trading day containing `t`: [start, end) between two resets. */
export function dayOf(resets: number[], t: number): { start: number; end: number } {
  let start = -Infinity;
  let end = Infinity;
  for (const r of resets) {
    if (r <= t) start = r;
    else {
      end = r;
      break;
    }
  }
  return { start, end };
}

/** The first reset strictly after `t`. */
export function nextReset(resets: number[], t: number): number {
  for (const r of resets) if (r > t) return r;
  return Infinity;
}

export function accountResets(time: ResolvedTime, account: string): number[] {
  return time.accountResets[account] ?? time.userResets;
}

/** The user timezone's UTC offset in seconds at instant `t`. */
export function offsetAt(offsets: [number, number][], t: number): number {
  if (offsets.length === 0) return 0;
  let off = offsets[0][1];
  for (const [at, o] of offsets) {
    if (at <= t) off = o;
    else break;
  }
  return off;
}

/** Wall-clock parts in the user timezone. */
export function localParts(offsets: [number, number][], t: number): { weekday: number; msOfDay: number; dayNumber: number } {
  const local = t + offsetAt(offsets, t) * 1000;
  const dayNumber = Math.floor(local / DAY);
  const msOfDay = local - dayNumber * DAY;
  // 1970-01-01 was a Thursday (weekday 3 with Monday = 0).
  const weekday = (((dayNumber + 3) % 7) + 7) % 7;
  return { weekday, msOfDay, dayNumber };
}

/** Converts a local wall-clock instant (ms since epoch in local time) back to UTC. */
export function localToUtc(offsets: [number, number][], local: number): number {
  const guess = local - offsetAt(offsets, local) * 1000;
  const off = offsetAt(offsets, guess) * 1000;
  return local - off;
}

/** effective_at for a looser change (SPEC §6.3). */
export function effectiveAt(userResets: number[], requestAt: number): number {
  return Math.max(nextReset(userResets, requestAt), requestAt + 12 * HOUR);
}
