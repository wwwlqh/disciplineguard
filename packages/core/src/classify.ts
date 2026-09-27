// Entry vs. exit and the resulting position (SPEC §4.4, §5.2).
import type { AccountRules, AccountState, OrderKind, Position, Side } from './types.ts';

/** Uppercase and drop any prefix up to and including ':' ("OANDA:EURUSD" → "EURUSD"). */
export function normSymbol(s: string): string {
  const u = s.toUpperCase();
  const i = u.lastIndexOf(':');
  return i >= 0 ? u.slice(i + 1) : u;
}

/** True when two broker symbols name the same instrument ("EURUSD", "EURUSD.a", "EURUSDm"). */
export function sameInstrument(a: string, b: string): boolean {
  const x = normSymbol(a);
  const y = normSymbol(b);
  return x.startsWith(y) || y.startsWith(x);
}

/** Positions on this account in this instrument, summed per side. */
export function positionSize(positions: Position[], symbol: string, side: Side): number {
  let total = 0;
  for (const p of positions) if (p.side === side && sameInstrument(p.symbol, symbol)) total += p.size;
  return total;
}

const opposite = (s: Side): Side => (s === 'buy' ? 'sell' : 'buy');

export interface Classification {
  kind: OrderKind;
  /** Position in the order's direction after the order (R5). */
  resulting: number;
  /** Size that R6 and R10 compare: the order size, or the new opposite position on a reversal. */
  newSize: number;
  reversal: boolean;
}

/**
 * Classifies a panel order. `closeMode` is the panel's close/reduce mode (TradingView) or "Close all" (MT).
 * `positions` undefined means the position is unknown (TradingView before any read).
 */
export function classifyOrder(
  acct: Pick<AccountState, 'netting' | 'platform'>,
  positions: Position[] | undefined,
  symbol: string,
  side: Side,
  size: number,
  closeMode = false,
): Classification {
  if (closeMode) return { kind: 'exit', resulting: 0, newSize: 0, reversal: false };
  if (acct.platform !== 'tv' && !acct.netting) {
    // MT hedging: Buy and Sell always open a new position.
    const same = positions ? positionSize(positions, symbol, side) : 0;
    return { kind: 'entry', resulting: same + size, newSize: size, reversal: false };
  }
  if (positions === undefined) return { kind: 'unclassified', resulting: size, newSize: size, reversal: false };
  const same = positionSize(positions, symbol, side);
  const opp = positionSize(positions, symbol, opposite(side));
  if (opp === 0) return { kind: 'entry', resulting: same + size, newSize: size, reversal: false };
  if (size <= opp + 1e-9) return { kind: 'exit', resulting: 0, newSize: 0, reversal: false };
  const rev = round8(size - opp);
  return { kind: 'entry', resulting: rev, newSize: rev, reversal: true };
}

export function round8(x: number): number {
  return Math.round(x * 1e8) / 1e8;
}

/** R5 limit for a symbol: the longest matching override, else the account value (SPEC §5.2). */
export function effectiveR5(ar: AccountRules | undefined, symbol: string): number | undefined {
  if (!ar || ar.r5Max === undefined) return undefined;
  const sym = normSymbol(symbol);
  let best: { prefix: string; max: number } | undefined;
  for (const o of ar.r5Overrides ?? []) {
    const p = o.prefix.toUpperCase();
    if (sym.startsWith(p) && (!best || p.length > best.prefix.length)) best = { prefix: p, max: o.max };
  }
  return best ? best.max : ar.r5Max;
}

/** Rounds a size down to the volume step. */
export function floorToStep(size: number, step: number): number {
  if (!step || step <= 0) return round8(size);
  return round8(Math.floor(size / step + 1e-9) * step);
}
