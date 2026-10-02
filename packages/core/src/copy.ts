// Pause wording (EXPERIENCE §9.2). The EA has its own copy of these strings in DG/Copy.mqh.
import type { PausePlan } from './pause.ts';
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

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function unit(order: Order): string {
  return order.platform === 'tv' ? 'units' : 'lots';
}

/** `r3Seconds` is the R3 window, needed to say how fast the trades came. */
export function headline(v: Violation | undefined, order: Order, f: Fmt, now: number, r3Seconds?: number): string {
  if (!v) return 'Check your plan before this trade.';
  switch (v.rule) {
    case 'R1':
      return `This would be trade ${v.observed} today. Your limit is ${v.limit}.`;
    case 'R2':
      return `This would be trade ${v.observed} this hour. Your limit is ${v.limit}.`;
    case 'R3':
      if (v.clearsAt !== undefined && r3Seconds !== undefined) {
        const span = Math.max(1, Math.round((now - (v.clearsAt - r3Seconds * 1000)) / 1000));
        return `This is your ${ordinal(v.observed)} trade in ${span} seconds.`;
      }
      return `This is your ${ordinal(v.observed)} trade in a short time.`;
    case 'R4':
      return v.clearsAt ? `It's ${f.time(now)}. Your trading hours start at ${f.time(v.clearsAt)}.` : `It's ${f.time(now)}. You're outside your trading hours.`;
    case 'R5':
      return `This would make your ${order.symbol} position ${f.size(v.observed, order)} ${unit(order)}. Your max is ${f.size(v.limit, order)}.`;
    case 'R6':
      return v.fix?.addSl ? "No stop loss, so risk can't be checked." : `This trade risks ${f.money(v.observed, order.account)}. Your max is ${f.money(v.limit, order.account)}.`;
    case 'R7':
      return v.observed <= 0 ? 'Your last trade just closed at a loss.' : `Your last trade closed at a loss ${v.observed} minute${v.observed === 1 ? '' : 's'} ago.`;
    case 'R8':
      return `You're down ${f.money(v.observed, order.account)} today. Your daily limit is ${f.money(v.limit, order.account)}.`;
    case 'R9':
      return 'This trade has no stop loss.';
    case 'R10':
      return `This is bigger than the trade you just lost on (${f.size(v.observed, order)} vs ${f.size(v.limit, order)} ${unit(order)}).`;
    case 'BREAK':
      return `You're on a break until ${f.time(v.clearsAt ?? now)}.`;
    case 'DONE_TODAY':
      return "You said you're done for today.";
  }
}

/** The way-out or fix line. Undefined means the plan line only (R2, R3, R7, R10 never show when they end). */
export function wayOut(v: Violation | undefined, order: Order, f: Fmt): string | undefined {
  if (!v) return undefined;
  switch (v.rule) {
    case 'R1':
      return v.clearsAt ? `Your limit resets ${f.time(v.clearsAt)}.` : undefined;
    case 'R4':
      return v.clearsAt ? `Your hours open at ${f.time(v.clearsAt)}.` : undefined;
    case 'R5':
      return `Trade ${f.size(v.fix?.size ?? v.limit, order)} ${unit(order)} or less.`;
    case 'R6':
      return v.fix?.addSl ? 'Add a stop loss.' : `${f.size(v.fix?.size ?? 0, order)} ${unit(order)} fits at this stop.`;
    case 'R8':
      return v.clearsAt ? `You're done for today. Your rest ends ${f.time(v.clearsAt)}.` : undefined;
    case 'R9':
      return 'Add a stop loss.';
    case 'R10':
      return `Trade ${f.size(v.limit, order)} ${unit(order)} or less.`;
    case 'DONE_TODAY':
      return v.clearsAt ? `Your trading day resets at ${f.time(v.clearsAt)}.` : undefined;
    default:
      return undefined;
  }
}

/** Other rules also affected: at most two lines, then "+N more" (EXPERIENCE §9.1). */
export function otherRules(plan: PausePlan): string[] {
  const rest = plan.violations.slice(1).map((v) => RULE_NAMES[v.rule]);
  if (rest.length <= 2) return rest;
  return [...rest.slice(0, 2), `+${rest.length - 2} more`];
}

export function placeLabel(order: Order, f: Fmt): string {
  const side = order.side === 'buy' ? 'Buy' : 'Sell';
  return `Place ${side} ${f.size(order.size, order)} ${order.symbol} anyway`;
}

export const TRUST_LINES = [
  'Closing a trade is never paused.',
  'Trades that keep your rules go straight through. We never make an order wait for our server.',
  'We never see your broker password, and we never open, change or close a trade unless you click to do it or turn on Close outside trades.',
];

export const PAUSE_FOOTER = 'Closing, moving SL/TP and cancelling orders are never paused. To close a position, skip first.';

/** Name it (EXPERIENCE §9.5): [id, chip]. The EA's DGChipIds match the ids. */
export const REASONS = [
  ['fomo', 'Afraid to miss it'],
  ['win_back', 'Winning back a loss'],
  ['frustrated', 'Frustrated'],
  ['bored', 'Bored'],
  ['on_a_roll', 'On a roll'],
  ['in_plan', 'In my plan'],
] as const;
