// Coverage intervals and "placed while protection was off" (SPEC §10.6).
import type { Env } from './env.ts';

/** A primary heartbeat within this long of the interval end extends it: 300 s idle cadence + 120 s. */
export const COVERAGE_GAP_MS = 420_000;

/** Extends or opens coverage intervals for one account and connection with these instants. */
export async function addCoverage(env: Env, accountId: string, connectionId: string, points: number[]): Promise<void> {
  const pts = [...new Set(points)].sort((a, b) => a - b);
  for (const p of pts) {
    const row = await env.DB.prepare(
      'SELECT id, from_utc, to_utc FROM coverage WHERE account_id = ? AND connection_id = ? AND to_utc >= ? AND from_utc <= ? ORDER BY to_utc DESC LIMIT 1',
    ).bind(accountId, connectionId, p - COVERAGE_GAP_MS, p + COVERAGE_GAP_MS).first<{ id: number; from_utc: number; to_utc: number }>();
    if (row) {
      if (p > row.to_utc || p < row.from_utc) {
        await env.DB.prepare('UPDATE coverage SET from_utc = MIN(from_utc, ?), to_utc = MAX(to_utc, ?) WHERE id = ?').bind(p, p, row.id).run();
      }
    } else {
      await env.DB.prepare('INSERT INTO coverage (account_id, connection_id, from_utc, to_utc) VALUES (?, ?, ?, ?)').bind(accountId, connectionId, p, p).run();
    }
  }
}

/** True when an instant lies inside [from, to + 420 s] of some interval on this account, from any connection. */
export async function wasCovered(env: Env, accountId: string, t: number): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 FROM coverage WHERE account_id = ? AND from_utc <= ? AND to_utc + ? >= ? LIMIT 1')
    .bind(accountId, t, COVERAGE_GAP_MS, t)
    .first();
  return !!row;
}

export interface Gap {
  accountId: string;
  from: number;
  to: number;
}

/** Periods longer than `minMs` in [from, to] when no connection covered the account. */
export async function coverageGaps(env: Env, accountId: string, from: number, to: number, minMs = 15 * 60_000): Promise<Gap[]> {
  const { results } = await env.DB.prepare('SELECT from_utc, to_utc FROM coverage WHERE account_id = ? AND to_utc + ? >= ? AND from_utc <= ? ORDER BY from_utc')
    .bind(accountId, COVERAGE_GAP_MS, from, to)
    .all<{ from_utc: number; to_utc: number }>();
  const gaps: Gap[] = [];
  let cursor = from;
  for (const r of results) {
    if (r.from_utc - cursor > minMs) gaps.push({ accountId, from: cursor, to: r.from_utc });
    cursor = Math.max(cursor, r.to_utc + COVERAGE_GAP_MS);
  }
  if (to - cursor > minMs) gaps.push({ accountId, from: cursor, to });
  return gaps;
}
