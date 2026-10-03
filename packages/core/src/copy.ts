// Rule-break wording (EXPERIENCE §9.2). The EA has its own copy of these strings in DG/Copy.mqh.
import type { Order, TitleId, Violation } from './types.ts';

export interface Fmt {
  /** "10:14" today, "Tue 02:00" another day. */
  time(t: number): string;
  /** "$310", with the sign handled by the caller. */
  money(x: number, account: string): string;
  size(x: number, order: Order): string;
}

export const RULE_NAMES: Record<TitleId, string> = {
  R1: 'Max trades per day',
  R2: 'Max trades per hour',
  R3: 'Too fast',
  R4: 'Trading hours',
  R5: 'Max position size',
  R6: 'Max risk per trade',
  R7: 'Cooldown after a loss',
  R8: 'Daily loss limit',
  R9: 'Stop loss required',
  R10: 'No bigger after a loss',
  BREAK: 'Break',
  DONE_TODAY: 'Done for today',
};

/** Where an MT5 trade was placed, from the EA's label: "on your phone". Empty when unknown. Same as PlacedWhere in DG/AppTrades.mqh. */
export function placedWhere(label: string | null | undefined): string {
  if (label === 'mobile') return 'on your phone';
  if (label === 'web') return 'on the web terminal';
  if (label === 'desktop') return 'in MetaTrader';
  if (label === 'ea') return 'by another EA';
  return '';
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function unit(order: Order): string {
  return order.platform === 'tv' ? 'units' : 'lots';
}

/**
 * What a counted trade broke, in one line: "Trade 4 today. Your limit is 3." (EXPERIENCE §9.2). `now` is when it was
 * placed; `r3Seconds` is the R3 window, needed to say how fast the trades came.
 */
export function breakLine(v: Violation, order: Order, f: Fmt, now: number, r3Seconds?: number): string {
  switch (v.rule) {
    case 'R1':
      return `Trade ${v.observed} today. Your limit is ${v.limit}.`;
    case 'R2':
      return `Trade ${v.observed} this hour. Your limit is ${v.limit}.`;
    case 'R3':
      if (v.clearsAt !== undefined && r3Seconds !== undefined) {
        const span = Math.max(1, Math.round((now - (v.clearsAt - r3Seconds * 1000)) / 1000));
        return `Your ${ordinal(v.observed)} trade in ${span} seconds.`;
      }
      return `Your ${ordinal(v.observed)} trade in a short time.`;
    case 'R4':
      return `Placed at ${f.time(now)}, outside your trading hours.`;
    case 'R5':
      return `Your ${order.symbol} position is ${f.size(v.observed, order)} ${unit(order)}. Your max is ${f.size(v.limit, order)}.`;
    case 'R6':
      return v.fix?.addSl ? "No stop loss, so its risk couldn't be checked." : `This trade risks ${f.money(v.observed, order.account)}. Your max is ${f.money(v.limit, order.account)}.`;
    case 'R7':
      return v.observed <= 0 ? 'Placed right after a losing trade.' : `Placed ${v.observed} minute${v.observed === 1 ? '' : 's'} after a losing trade.`;
    case 'R8':
      return `You're down ${f.money(v.observed, order.account)} today. Your daily limit is ${f.money(v.limit, order.account)}.`;
    case 'R9':
      return 'This trade has no stop loss.';
    case 'R10':
      return `Bigger than the trade you just lost on (${f.size(v.observed, order)} vs ${f.size(v.limit, order)} ${unit(order)}).`;
    case 'BREAK':
      return `Placed during your break (until ${f.time(v.clearsAt ?? now)}).`;
    case 'DONE_TODAY':
      return "Placed after you said you're done for today.";
  }
}

export const TRUST_LINES = [
  'Every trade goes straight through. DisciplineGuard never holds, pauses or blocks an order.',
  'Each trade is counted against your rules, and a trade that goes past one is marked.',
  'We never see your broker password, and we never open, change or close a trade.',
];
