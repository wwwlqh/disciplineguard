// When the popup shows and how long it waits (SPEC §7.2).
import { sameInstrument } from './classify.ts';
import { entriesToday, placedAnywayCount, safeNow } from './evaluate.ts';
import { MIN } from './time.ts';
import type { EvalInput, PopupSettings, TitleId, Violation } from './types.ts';

export const PAUSE_TIMEOUT_SEC = 120;
export const SKIP_CARD_SEC = 10;
export const REATTEMPT_SEC = 180;
export const BREAK_MINUTES = 15;
/** Breaks and "done for today" wait at least this long, whatever the popup settings say (SPEC §7.2). */
export const BREAK_MIN_WAIT_SEC = 15;
/** TradingView one-time pass after Place anyway (SPEC §7.5). */
export const TV_PASS_SEC = 10;

export const DEFAULT_POPUP: PopupSettings = {
  show: 'breaks',
  wait: 5,
  lossWait: { on: false, seconds: 15, withinMinutes: 30 },
  growing: { on: false, step: 5, cap: 45 },
  typeConfirm: { mode: 'off', n: 3 },
  skipCard: true,
  keyboardPlace: false,
};

export interface PausePlan {
  /** 'CHECK' is "Check your plan before this trade." (every new entry, no rule broken). */
  title: TitleId | 'CHECK';
  violations: Violation[];
  waitSec: number;
  /** The number to type, when type to confirm applies: the trade number today. */
  typeConfirm?: number;
  reattemptAgoSec?: number;
  tradeNumber: number;
  placedAnyway: number;
}

/** Returns the pause to show for this entry, or null when the order goes straight through. */
export function planPause(input: EvalInput, violations: Violation[], popup: PopupSettings): PausePlan | null {
  const { state, order, now } = input;
  if (order.kind !== 'entry') return null;
  if (violations.length === 0 && popup.show !== 'every') return null;
  const t = safeNow(state, now);
  const count = placedAnywayCount(input, t);

  let wait = popup.wait;
  if (popup.lossWait.on) {
    const lastLoss = state.closes.filter((c) => c.net < 0 && c.t <= t).reduce((m, c) => Math.max(m, c.t), -Infinity);
    if (t - lastLoss < popup.lossWait.withinMinutes * MIN) wait = Math.max(wait, popup.lossWait.seconds);
  }
  if (popup.growing.on) {
    const grown = wait + popup.growing.step * count;
    wait = Math.min(grown, Math.max(popup.growing.cap, wait));
  }
  const title: TitleId | 'CHECK' = violations[0]?.rule ?? 'CHECK';
  if (title === 'BREAK' || title === 'DONE_TODAY') wait = Math.max(wait, BREAK_MIN_WAIT_SEC);

  let reattemptAgoSec: number | undefined;
  const skip = state.lastSkip;
  if (skip && skip.side === order.side && sameInstrument(skip.symbol, order.symbol) && t - skip.t <= REATTEMPT_SEC * 1000 && t >= skip.t) {
    reattemptAgoSec = Math.round((t - skip.t) / 1000);
    wait = Math.max(wait, skip.waitSec);
  }

  const tradeNumber = entriesToday(input, t) + 1;
  const tc = popup.typeConfirm;
  const typeConfirm = tc.mode === 'always' || (tc.mode === 'after' && count >= tc.n) ? tradeNumber : undefined;

  return { title, violations, waitSec: Math.max(0, Math.min(wait, 180)), typeConfirm, reattemptAgoSec, tradeNumber, placedAnyway: count };
}
