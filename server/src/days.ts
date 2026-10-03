// Trading days with their counts: "days kept" on Today and Stats, and the end-of-session summary.
import type { Env } from './env.ts';
import type { UserCtx } from './context.ts';

export interface DayRow {
  start: number;
  end: number;
  entries: number;
  /** Trades that broke a rule (override events; before the count-only change, also pauses placed anyway). */
  breaks: number;
  unprotected: number;
}

/** Trading days in [from, to) with counts, for "days kept" (SPEC §2). */
export async function dayRows(env: Env, uc: UserCtx, from: number, to: number): Promise<DayRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT type, t, payload FROM events WHERE user_id = ? AND type IN ('entry', 'override') AND t >= ? AND t < ? AND void_at IS NULL",
  ).bind(uc.user.id, from, to).all<{ type: string; t: number; payload: string }>();
  const days: DayRow[] = [];
  for (let i = 0; i < uc.userResets.length - 1; i++) {
    const s = uc.userResets[i];
    const e = uc.userResets[i + 1];
    if (e <= from || s >= to) continue;
    days.push({ start: s, end: e, entries: 0, breaks: 0, unprotected: 0 });
  }
  for (const r of results) {
    const d = days.find((x) => r.t >= x.start && r.t < x.end);
    if (!d) continue;
    if (r.type === 'entry') {
      d.entries++;
      if (JSON.parse(r.payload ?? '{}').unprotected) d.unprotected++;
    } else d.breaks++;
  }
  return days;
}

/** A day with trades, none of which broke a rule or was placed while DisciplineGuard was off. */
export function isKept(d: DayRow): boolean {
  return d.entries > 0 && d.breaks === 0 && d.unprotected === 0;
}

export interface BrokenTrade {
  t: number;
  accountId: string | null;
  symbol?: string;
  side?: string;
  size?: number;
  label?: string;
  /** The rules it broke, the first one shown. */
  violations: string[];
}

/** Counted trades that broke a rule, newest first. */
export async function brokenTrades(env: Env, userId: string, from: number, o: { to?: number; account?: string; limit?: number } = {}): Promise<BrokenTrade[]> {
  const binds: unknown[] = [userId, from, o.to ?? Number.MAX_SAFE_INTEGER];
  let sql = "SELECT t, account_id, payload FROM events WHERE user_id = ? AND type = 'entry' AND t >= ? AND t < ? AND void_at IS NULL AND json_array_length(payload, '$.violations') > 0";
  if (o.account) (sql += ' AND account_id = ?'), binds.push(o.account);
  sql += ' ORDER BY t DESC';
  if (o.limit) sql += ` LIMIT ${Math.floor(o.limit)}`;
  const { results } = await env.DB.prepare(sql).bind(...binds).all<{ t: number; account_id: string | null; payload: string }>();
  return results.map((r) => {
    const p = JSON.parse(r.payload);
    return { t: r.t, accountId: r.account_id, symbol: p.symbol, side: p.side, size: p.size, label: p.label, violations: p.violations ?? [] };
  });
}
