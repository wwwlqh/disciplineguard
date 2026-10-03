// evaluate(rules, settings, state, order, now) → the rules a trade breaks (SPEC §8.1). The only rule logic.
// Every trade is counted; one that breaks a rule is counted as a rule break. Nothing is ever held.
import { classifyOrder, effectiveR5, floorToStep, positionSize, round8, sameInstrument } from './classify.ts';
import { accountResets, dayOf, localParts, localToUtc, nextReset, DAY, HOUR, MIN } from './time.ts';
import type { AccountState, Close, Entry, EvalInput, Rules, State, TitleId, Violation } from './types.ts';

/** Take a break (EXPERIENCE §6.3): 15 minutes from the pill. */
export const BREAK_MINUTES = 15;

export const PRIORITY: TitleId[] = ['DONE_TODAY', 'BREAK', 'R8', 'R7', 'R10', 'R1', 'R2', 'R3', 'R4', 'R6', 'R5', 'R9'];

const EPS = 1e-9;

/** The time used for day rollover and for anything that must not end early (SPEC §3.2). */
export function safeNow(state: State, now: number): number {
  return state.clock.verified ? now : Math.min(now, state.clock.anchor ?? now);
}

/**
 * Entries with same-trade duplicates removed when "count once" is on (SPEC §4.2):
 * same instrument and side on another account within 60 s of a counted entry.
 */
export function countedEntries(entries: Entry[], countOnce: boolean): Entry[] {
  const sorted = [...entries].sort((a, b) => a.t - b.t);
  if (!countOnce) return sorted;
  const out: Entry[] = [];
  for (const e of sorted) {
    const dup = out.some(
      (c) => c.account !== e.account && c.side === e.side && e.t - c.t <= 60_000 && sameInstrument(c.symbol, e.symbol),
    );
    if (!dup) out.push(e);
  }
  return out;
}

/** Entries counted in the user trading day containing `t`. */
export function entriesToday(input: Pick<EvalInput, 'rules' | 'time' | 'state'>, t: number): number {
  const { start, end } = dayOf(input.time.userResets, t);
  return countedEntries(input.state.entries, input.rules.countOnce).filter((e) => e.t >= start && e.t < end && e.t <= t).length;
}

function isLoss(c: Close): boolean {
  return c.net < 0;
}

/** Closes that count for R7: every close except losing closes under the account's ignore_below. */
export function qualifyingCloses(rules: Rules, closes: Close[]): Close[] {
  return [...closes]
    .sort((a, b) => a.t - b.t)
    .filter((c) => {
      if (!isLoss(c)) return true;
      const ignore = rules.accounts[c.account]?.r7IgnoreBelow;
      return !(ignore !== undefined && Math.abs(c.net) < ignore);
    });
}

/** The cooldown each qualifying losing close starts, in ms (SPEC §5.2 R7). */
export function cooldownAfter(rules: Rules, q: Close[], i: number): number {
  const doubled = rules.R7.doubleAfter2 && i > 0 && isLoss(q[i - 1]);
  return rules.R7.minutes * MIN * (doubled ? 2 : 1);
}

/** Latest qualifying losing close at or before `t`, and when its cooldown ends. */
export function activeCooldown(rules: Rules, closes: Close[], t: number): { close: Close; until: number } | undefined {
  const q = qualifyingCloses(rules, closes).filter((c) => c.t <= t);
  for (let i = q.length - 1; i >= 0; i--) {
    if (isLoss(q[i])) return { close: q[i], until: q[i].t + cooldownAfter(rules, q, i) };
  }
  return undefined;
}

export interface R8Status {
  applies: boolean;
  inLimit: boolean;
  loss: number;
  limit: number;
  reachedAt?: number;
  until?: number;
}

/** Loss today on an account, or undefined when it can't be read (SPEC §5.2 R8). */
export function accountLoss(st: AccountState | undefined): number | undefined {
  if (!st) return undefined;
  if (st.platform === 'tv') return st.tvLoss;
  if (st.dayStartBalance === undefined || st.equity === undefined) return undefined;
  return round8(st.dayStartBalance - (st.equity - (st.credit ?? 0)));
}

export function r8Status(input: Pick<EvalInput, 'rules' | 'time' | 'state'>, account: string, t: number): R8Status {
  const none: R8Status = { applies: false, inLimit: false, loss: 0, limit: 0 };
  const { rules, time, state } = input;
  const cfg = rules.accounts[account]?.r8;
  const st = state.accounts[account];
  if (!rules.R8.on || !cfg || !st) return none;
  const loss = accountLoss(st);
  let limit: number;
  if (cfg.unit === 'amount') limit = cfg.value;
  else {
    if (st.platform === 'tv' || st.dayStartBalance === undefined) return none;
    limit = round8((cfg.value * st.dayStartBalance) / 100);
  }
  const resets = accountResets(time, account);
  const rest = rules.R8.restHours * HOUR;
  if (st.limitReachedAt !== undefined) {
    const until = Math.max(nextReset(resets, st.limitReachedAt), st.limitReachedAt + rest);
    if (t < until) return { applies: true, inLimit: true, loss: loss ?? 0, limit, reachedAt: st.limitReachedAt, until };
  }
  if (loss === undefined) return none;
  if (loss >= limit - EPS) {
    return { applies: true, inLimit: true, loss, limit, reachedAt: t, until: Math.max(nextReset(resets, t), t + rest) };
  }
  return { applies: true, inLimit: false, loss, limit };
}

/** The next instant at or after `t` that lies inside an R4 window, in the user's wall clock. */
export function nextWindowStart(input: Pick<EvalInput, 'rules' | 'time'>, t: number): number | undefined {
  const offsets = input.time.offsets;
  const { dayNumber } = localParts(offsets, t);
  let best: number | undefined;
  for (let d = 0; d <= 8; d++) {
    const dn = dayNumber + d;
    const weekday = (((dn + 3) % 7) + 7) % 7;
    for (const w of input.rules.R4.windows) {
      if (w.day !== weekday) continue;
      const at = localToUtc(offsets, dn * DAY + w.start * MIN);
      if (at > t && (best === undefined || at < best)) best = at;
    }
    if (best !== undefined) break;
  }
  return best;
}

export function insideWindows(input: Pick<EvalInput, 'rules' | 'time'>, t: number): boolean {
  const { weekday, msOfDay } = localParts(input.time.offsets, t);
  return input.rules.R4.windows.some((w) => w.day === weekday && msOfDay >= w.start * MIN && msOfDay < w.end * MIN);
}

export function evaluate(input: EvalInput): Violation[] {
  const { rules, time, state, order, now } = input;
  if (order.kind !== 'entry') return [];
  const t = safeNow(state, now);
  const out: Violation[] = [];
  const acct: AccountState = state.accounts[order.account] ?? { platform: order.platform, netting: false, positions: [] };
  const cls = classifyOrder(acct, acct.positions, order.symbol, order.side, order.size);
  const ar = rules.accounts[order.account];

  if (state.doneUntil !== undefined && t < state.doneUntil) {
    out.push({ rule: 'DONE_TODAY', observed: 0, limit: 0, clearsAt: state.doneUntil });
  }
  if (state.breakUntil !== undefined && t < state.breakUntil) {
    out.push({ rule: 'BREAK', observed: 0, limit: 0, clearsAt: state.breakUntil });
  }

  // R8: this account, or any account when "all accounts" is on.
  if (rules.R8.on) {
    const own = r8Status(input, order.account, t);
    if (own.inLimit) out.push({ rule: 'R8', observed: own.loss, limit: own.limit, clearsAt: own.until });
    else if (rules.R8.allAccounts) {
      for (const id of Object.keys(state.accounts)) {
        if (id === order.account) continue;
        const s = r8Status(input, id, t);
        if (s.inLimit) {
          out.push({ rule: 'R8', observed: s.loss, limit: s.limit, clearsAt: s.until });
          break;
        }
      }
    }
  }

  // R7 cooldown.
  if (rules.R7.on) {
    const cd = activeCooldown(rules, state.closes, t);
    if (cd && t < cd.until) {
      out.push({ rule: 'R7', observed: Math.floor((t - cd.close.t) / MIN), limit: (cd.until - cd.close.t) / MIN, clearsAt: cd.until });
    }
  }

  // R10: bigger than the latest losing trade on this account, inside the window after its cooldown.
  if (rules.R10.on) {
    const q = qualifyingCloses(rules, state.closes);
    const losses = [...state.closes].filter((c) => c.account === order.account && isLoss(c) && c.t <= t).sort((a, b) => a.t - b.t);
    const last = losses[losses.length - 1];
    if (last && last.size > 0) {
      const qi = q.indexOf(last);
      const start = rules.R7.on && qi >= 0 ? last.t + cooldownAfter(rules, q, qi) : last.t;
      const end = start + rules.R10.minutes * MIN;
      if (t >= start && t < end && cls.newSize > last.size + EPS) {
        out.push({ rule: 'R10', observed: cls.newSize, limit: last.size, clearsAt: end, fix: { size: last.size } });
      }
    }
  }

  // R1–R3 count user-wide. With "count once", an entry matching one just counted is not evaluated for them.
  const counted = countedEntries(state.entries, rules.countOnce).filter((e) => e.t <= t);
  const matchesCounted =
    rules.countOnce &&
    counted.some((c) => c.account !== order.account && c.side === order.side && t - c.t <= 60_000 && sameInstrument(c.symbol, order.symbol));

  if (!matchesCounted) {
    if (rules.R1.on) {
      const { start, end } = dayOf(time.userResets, t);
      const n = counted.filter((e) => e.t >= start && e.t < end).length;
      if (n >= rules.R1.max) out.push({ rule: 'R1', observed: n + 1, limit: rules.R1.max, clearsAt: end });
    }
    if (rules.R2.on) {
      const inHour = counted.filter((e) => e.t > t - HOUR).sort((a, b) => b.t - a.t);
      if (inHour.length >= rules.R2.max) {
        out.push({ rule: 'R2', observed: inHour.length + 1, limit: rules.R2.max, clearsAt: inHour[rules.R2.max - 1].t + HOUR });
      }
    }
    if (rules.R3.on) {
      const ms = rules.R3.seconds * 1000;
      const inWin = counted.filter((e) => e.t > t - ms).sort((a, b) => b.t - a.t);
      const need = rules.R3.count - 1;
      if (need >= 1 && inWin.length >= need) {
        out.push({ rule: 'R3', observed: inWin.length + 1, limit: rules.R3.count, clearsAt: inWin[need - 1].t + ms });
      }
    }
  }

  // R4 uses the wall clock as it is (SPEC §3.1).
  if (rules.R4.on && !insideWindows(input, now)) {
    out.push({ rule: 'R4', observed: 0, limit: 0, clearsAt: nextWindowStart(input, now) });
  }

  // R6: MT only.
  if (rules.R6.on && order.platform !== 'tv' && ar?.r6) {
    const lots = cls.newSize;
    if (order.sl === undefined) out.push({ rule: 'R6', observed: 0, limit: 0, fix: { addSl: true } });
    else if (order.price !== undefined && order.spec && order.spec.tickSize > 0) {
      const ticks = Math.round((Math.abs(order.price - order.sl) / order.spec.tickSize) * 1e6) / 1e6;
      const perLot = ticks * order.spec.tickValueLoss;
      const risk = Math.round(perLot * lots * 100) / 100;
      const limit =
        ar.r6.unit === 'amount'
          ? ar.r6.value
          : acct.dayStartBalance !== undefined
            ? round8((ar.r6.value * acct.dayStartBalance) / 100)
            : undefined;
      if (limit !== undefined && risk > limit + EPS) {
        const fit = perLot > 0 ? floorToStep(limit / perLot, order.spec.volumeStep) : 0;
        out.push({ rule: 'R6', observed: risk, limit, fix: { size: fit } });
      }
    }
  }

  // R5: resulting position against the account's limit for this symbol.
  if (rules.R5.on) {
    const limit = effectiveR5(ar, order.symbol);
    if (limit !== undefined && cls.resulting > limit + EPS) {
      const opp = positionSize(acct.positions, order.symbol, order.side === 'buy' ? 'sell' : 'buy');
      const same = positionSize(acct.positions, order.symbol, order.side);
      const raw = cls.reversal ? opp + limit : limit - same;
      const step = order.spec?.volumeStep ?? 0;
      const fix = Math.max(0, step ? floorToStep(raw, step) : round8(raw));
      out.push({ rule: 'R5', observed: cls.resulting, limit, fix: { size: fix } });
    }
  }

  if (rules.R9.on && order.sl === undefined) out.push({ rule: 'R9', observed: 0, limit: 0, fix: { addSl: true } });

  return out.sort((a, b) => PRIORITY.indexOf(a.rule) - PRIORITY.indexOf(b.rule));
}
