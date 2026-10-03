// Watching the Account Manager (SPEC §9.1 "Outside detection", §4.1): what changed in the positions table since the
// last read, and which of it was already counted at the click. Pure, so the end-to-end test and the content script
// share it.
import { normSymbol, round8, sameInstrument, type Position, type Side } from '@dg/core';

export interface Change {
  symbol: string;
  side: Side;
  size: number;
}

const key = (p: { symbol: string; side: Side }) => `${normSymbol(p.symbol)}|${p.side}`;

function totals(ps: Position[]): Map<string, Change> {
  const m = new Map<string, Change>();
  for (const p of ps) {
    const k = key(p);
    const c = m.get(k);
    if (c) c.size = round8(c.size + p.size);
    else m.set(k, { symbol: normSymbol(p.symbol), side: p.side, size: p.size });
  }
  return m;
}

/** Sizes opened and closed between two reads of the table. A reversal is one closed and one opened. */
export function diffPositions(before: Position[], after: Position[]): { opened: Change[]; closed: Change[] } {
  const a = totals(before);
  const b = totals(after);
  const opened: Change[] = [];
  const closed: Change[] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(k)?.size ?? 0;
    const y = b.get(k)?.size ?? 0;
    const c = (b.get(k) ?? a.get(k))!;
    if (y > x) opened.push({ symbol: c.symbol, side: c.side, size: round8(y - x) });
    else if (y < x) closed.push({ symbol: c.symbol, side: c.side, size: round8(x - y) });
  }
  return { opened, closed };
}

/** An entry counted at the click, still waiting to show up in the table. Market orders wait 15 s, pending orders until they fill. */
export interface Expected {
  t: number;
  symbol: string;
  side: Side;
  size: number;
  pending: boolean;
}

export const MARKET_MATCH_MS = 15_000;

/**
 * Takes an opened change off the click-counted entries that explain it. Returns the part nobody placed through a counted
 * path: a trade placed elsewhere. `expected` is updated in place.
 */
export function unexplained(opened: Change, expected: Expected[], now: number): number {
  let left = opened.size;
  for (const x of expected) {
    if (left <= 0) break;
    if (x.side !== opened.side || !sameInstrument(x.symbol, opened.symbol)) continue;
    if (!x.pending && now - x.t > MARKET_MATCH_MS) continue;
    const used = Math.min(left, x.size);
    x.size = round8(x.size - used);
    left = round8(left - used);
  }
  for (let i = expected.length - 1; i >= 0; i--) {
    const x = expected[i];
    if (x.size <= 0 || (!x.pending && now - x.t > MARKET_MATCH_MS)) expected.splice(i, 1);
  }
  return left;
}
