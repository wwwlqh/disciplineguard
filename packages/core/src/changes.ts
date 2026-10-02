// Rule-change protection (SPEC §6): stricter applies now, looser waits.
import { effectiveR5 } from './classify.ts';
import { effectiveAt, nextReset, HOUR, MIN } from './time.ts';
import type { AccountRules, PopupSettings, TimeWindow } from './types.ts';

export type Direction = 'same' | 'stricter' | 'looser';

/**
 * Protected setting keys and their values:
 * - `rule:R1` … `rule:R10`: the rule's global fields (see Rules in types.ts)
 * - `acct:<id>:r5` {r5Max, r5Overrides} · `acct:<id>:r6` / `acct:<id>:r8` {unit, value} | null
 * - `acct:<id>:r7ignore` number | null · `acct:<id>:copies` number[] · `acct:<id>:reset` ResetSpec
 * - `default:r5` / `default:r6` / `default:r8` / `default:r7ignore`: used by accounts without their own value;
 *   `default:r5bet` is the max size in dollars for Polymarket and Kalshi accounts
 * - `popup` PopupSettings · `countOnce` boolean · `closeOutside` boolean · `tz` string · `reset` ResetSpec
 * - `note:<id>` {text, tag} | null · `plan` string
 */
export type SettingKey = string;

type Dir = 'up' | 'down' | 'on';

/** Compares fields: each changed field must move in its stricter direction for the whole change to be stricter. */
function fields(pairs: [Dir, unknown, unknown][]): Direction {
  let changed = false;
  for (const [dir, a, b] of pairs) {
    if (a === b) continue;
    changed = true;
    if (dir === 'on') {
      if (!(a === false && b === true)) return 'looser';
    } else if (typeof a !== 'number' || typeof b !== 'number') return 'looser';
    else if (dir === 'up' ? b < a : b > a) return 'looser';
  }
  return changed ? 'stricter' : 'same';
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** True when every minute allowed by `inner` is also allowed by `outer`. */
export function windowsInside(inner: TimeWindow[], outer: TimeWindow[]): boolean {
  return inner.every((w) => {
    const cover = outer.filter((o) => o.day === w.day).sort((a, b) => a.start - b.start);
    let pos = w.start;
    for (const o of cover) {
      if (o.start > pos) break;
      pos = Math.max(pos, o.end);
      if (pos >= w.end) return true;
    }
    return pos >= w.end;
  });
}

/** Splits an editor window that may cross midnight into stored windows (SPEC §5.2 R4). */
export function splitWindow(days: number[], start: number, end: number): TimeWindow[] {
  const out: TimeWindow[] = [];
  for (const d of days) {
    if (end > start) out.push({ day: d, start, end });
    else {
      out.push({ day: d, start, end: 1440 });
      if (end > 0) out.push({ day: (d + 1) % 7, start: 0, end });
    }
  }
  return out;
}

function compareR5(a: AccountRules | undefined, b: AccountRules | undefined): Direction {
  if (sameJson(a, b)) return 'same';
  if (!a || a.r5Max === undefined) return 'stricter'; // first value for a new account applies now
  if (!b || b.r5Max === undefined) return 'looser';
  const probes = new Set<string>(['\u0000']);
  for (const o of [...(a.r5Overrides ?? []), ...(b.r5Overrides ?? [])]) probes.add(o.prefix.toUpperCase());
  for (const p of probes) {
    const before = effectiveR5(a, p) ?? Infinity;
    const after = effectiveR5(b, p) ?? Infinity;
    if (after > before) return 'looser';
  }
  return 'stricter';
}

type Limit = { unit: 'amount' | 'pct'; value: number } | null | undefined;

function compareLimit(a: Limit, b: Limit): Direction {
  if (sameJson(a ?? null, b ?? null)) return 'same';
  if (!a) return 'stricter';
  if (!b) return 'looser';
  if (a.unit !== b.unit) return 'looser';
  return b.value < a.value ? 'stricter' : 'looser';
}

const TC_RANK = { off: 0, after: 1, always: 2 } as const;

function comparePopup(a: PopupSettings, b: PopupSettings): Direction {
  if (sameJson(a, b)) return 'same';
  const parts: Direction[] = [];
  parts.push(a.show === b.show ? 'same' : b.show === 'every' ? 'stricter' : 'looser');
  parts.push(fields([['up', a.wait, b.wait]]));
  if (a.lossWait.on !== b.lossWait.on) parts.push(b.lossWait.on ? 'stricter' : 'looser');
  else if (b.lossWait.on) {
    parts.push(fields([['up', a.lossWait.seconds, b.lossWait.seconds], ['up', a.lossWait.withinMinutes, b.lossWait.withinMinutes]]));
  }
  if (a.growing.on !== b.growing.on) parts.push(b.growing.on ? 'stricter' : 'looser');
  else if (b.growing.on) parts.push(fields([['up', a.growing.step, b.growing.step], ['up', a.growing.cap, b.growing.cap]]));
  const ra = TC_RANK[a.typeConfirm.mode];
  const rb = TC_RANK[b.typeConfirm.mode];
  if (ra !== rb) parts.push(rb > ra ? 'stricter' : 'looser');
  else if (b.typeConfirm.mode === 'after') parts.push(fields([['down', a.typeConfirm.n, b.typeConfirm.n]]));
  parts.push(fields([['on', a.skipCard, b.skipCard]]));
  parts.push(a.keyboardPlace === b.keyboardPlace ? 'same' : b.keyboardPlace ? 'looser' : 'stricter');
  if (parts.includes('looser')) return 'looser';
  return parts.includes('stricter') ? 'stricter' : 'same';
}

/** Compares a proposed value with the active one (SPEC §6.2). Anything not clearly stricter is looser. */
export function compareChange(key: SettingKey, active: any, proposed: any): Direction {
  if (sameJson(active, proposed)) return 'same';
  const [kind, id, sub] = key.split(':');
  if (kind === 'rule') {
    const a = active ?? { on: false };
    const b = proposed ?? { on: false };
    if (a.on && !b.on) return 'looser';
    if (!a.on) return 'stricter'; // enabling, or editing a rule that is off
    switch (id) {
      case 'R1':
      case 'R2':
        return fields([['down', a.max, b.max]]);
      case 'R3':
        return fields([['down', a.count, b.count], ['up', a.seconds, b.seconds]]);
      case 'R4':
        return windowsInside(b.windows, a.windows) ? 'stricter' : 'looser';
      case 'R7':
        return fields([['up', a.minutes, b.minutes], ['on', a.doubleAfter2, b.doubleAfter2]]);
      case 'R8':
        return fields([['up', a.restHours, b.restHours], ['on', a.allAccounts, b.allAccounts]]);
      case 'R10':
        return fields([['up', a.minutes, b.minutes]]);
      default:
        return 'looser';
    }
  }
  if (kind === 'acct') {
    switch (sub) {
      case 'r5':
        return compareR5(active ?? undefined, proposed ?? undefined);
      case 'r6':
      case 'r8':
        return compareLimit(active, proposed);
      case 'r7ignore':
        if (proposed === null || proposed === undefined) return 'stricter';
        if (active === null || active === undefined) return 'looser';
        return proposed < active ? 'stricter' : 'looser';
      case 'copies': {
        const a: number[] = active ?? [];
        const b: number[] = proposed ?? [];
        return b.every((m) => a.includes(m)) ? 'stricter' : 'looser';
      }
      default:
        return 'looser'; // acct:<id>:reset and anything unknown
    }
  }
  // Defaults apply to every account without its own value, so they compare like account values.
  if (kind === 'default') return compareChange(`acct:*:${id === 'r5bet' ? 'r5' : id}`, active, proposed);
  if (kind === 'popup') return comparePopup(active, proposed);
  if (kind === 'countOnce') return proposed ? 'looser' : 'stricter';
  if (kind === 'closeOutside') return proposed ? 'stricter' : 'looser';
  if (kind === 'note') return active ? 'looser' : 'stricter';
  if (kind === 'plan') return active ? 'looser' : 'stricter';
  return 'looser'; // tz, reset and anything unknown
}

export const SETUP_COOL_OFF_MIN = 30;
export const AUTO_LOCK_HOURS = 72;

export interface ChangeContext {
  now: number;
  userResets: number[];
  setupMode: boolean;
  /** The latest real pause (not practice), for the setup-mode cool-off (SPEC §6.1). */
  lastRealPauseAt?: number;
}

/** When a change takes effect: 'now' or an instant. */
export function whenApplies(direction: Direction, ctx: ChangeContext): 'now' | number {
  if (direction !== 'looser') return 'now';
  if (ctx.setupMode) {
    const coolEnd = ctx.lastRealPauseAt !== undefined ? ctx.lastRealPauseAt + SETUP_COOL_OFF_MIN * MIN : -Infinity;
    return ctx.now < coolEnd ? coolEnd : 'now';
  }
  return effectiveAt(ctx.userResets, ctx.now);
}

export interface SettingRow<T = unknown> {
  active: T;
  pending?: { value: T; effectiveAt: number; requestedAt: number };
}

/** Treats a due pending value as active (SPEC §6.4). Only the server calls this. */
export function activateDue<T>(row: SettingRow<T>, now: number): SettingRow<T> {
  if (row.pending && now >= row.pending.effectiveAt) return { active: row.pending.value };
  return row;
}

/** Applies a requested change to a setting (SPEC §6.4). Compared with the active value, never the pending one. */
export function requestChange<T>(
  key: SettingKey,
  row: SettingRow<T>,
  proposed: T,
  ctx: ChangeContext,
): { row: SettingRow<T>; direction: Direction; appliesAt: 'now' | number } {
  const cur = activateDue(row, ctx.now);
  const direction = compareChange(key, cur.active, proposed);
  const at = whenApplies(direction, ctx);
  if (at === 'now') return { row: { active: proposed }, direction, appliesAt: 'now' };
  return { row: { active: cur.active, pending: { value: proposed, effectiveAt: at, requestedAt: ctx.now } }, direction, appliesAt: at };
}

/** Setup mode ends at the first reset at least 72 hours after the first connection reached On (SPEC §6.1). */
export function autoLockAt(userResets: number[], firstOnAt: number): number {
  return nextReset(userResets, firstOnAt + AUTO_LOCK_HOURS * HOUR - 1);
}
