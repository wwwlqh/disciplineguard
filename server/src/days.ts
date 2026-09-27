// Trading days with their counts: "days kept" on Today and Stats, and the end-of-session summary.
import type { Env } from './env.ts';
import type { UserCtx } from './context.ts';

export interface DayRow {
  start: number;
  end: number;
  entries: number;
  pauses: number;
  placed: number;
  outside: number;
  unprotected: number;
}

/** Trading days in [from, to) with counts, for "days kept" (SPEC §2). */
export async function dayRows(env: Env, uc: UserCtx, from: number, to: number): Promise<DayRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT type, t, payload FROM events WHERE user_id = ? AND type IN ('entry', 'pause', 'override') AND t >= ? AND t < ? AND void_at IS NULL",
  ).bind(uc.user.id, from, to).all<{ type: string; t: number; payload: string }>();
  const days: DayRow[] = [];
  for (let i = 0; i < uc.userResets.length - 1; i++) {
    const s = uc.userResets[i];
    const e = uc.userResets[i + 1];
    if (e <= from || s >= to) continue;
    days.push({ start: s, end: e, entries: 0, pauses: 0, placed: 0, outside: 0, unprotected: 0 });
  }
  for (const r of results) {
    const d = days.find((x) => r.t >= x.start && r.t < x.end);
    if (!d) continue;
    const p = JSON.parse(r.payload ?? '{}');
    if (r.type === 'entry') {
      d.entries++;
      if (p.unprotected) d.unprotected++;
    } else if (r.type === 'pause') d.pauses++;
    else if (r.type === 'override') {
      if (p.from === 'outside') d.outside++;
      else d.placed++;
    }
  }
  return days;
}

export function isKept(d: DayRow): boolean {
  return d.entries + d.pauses > 0 && d.placed === 0 && d.outside === 0 && d.unprotected === 0;
}
