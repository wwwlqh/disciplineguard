// Trader alerts (SPEC §11). The server decides what to send; the Windows app fetches them and shows Windows
// notifications. Nothing to link or install beyond the app the trader already has.
import { dayOf, DAY, HOUR, localParts, localToUtc, MIN, placedWhere, RULE_NAMES, type TitleId } from '@dg/core';
import { scheduleJob } from './common.ts';
import { resolvedTime, userCtx, type AccountRow, type UserCtx } from './context.ts';
import { coverageGaps } from './coverage.ts';
import { dayRows, isKept } from './days.ts';
import { now as clock, type Env } from './env.ts';

export const ALERT_KINDS = ['limit', 'after_limit', 'broke', 'off', 'moved', 'unchecked', 'summary', 'stop'] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/** SPEC §11.2 trader defaults. */
const DEFAULT_ON: Record<AlertKind, boolean> = {
  limit: true, after_limit: true, broke: true, off: true, moved: true, unchecked: true, summary: true, stop: false,
};

export interface AlertPrefs {
  on: Record<AlertKind, boolean>;
  /** Summary time in minutes after local midnight; null = the default (end of trading hours, or 60 min after the last trade). */
  summaryAt: number | null;
  amounts: boolean;
}

export function alertPrefs(stored: string | null): AlertPrefs {
  let p: any = {};
  try {
    p = stored ? JSON.parse(stored) : {};
  } catch {}
  const on = { ...DEFAULT_ON };
  for (const k of ALERT_KINDS) if (typeof p.on?.[k] === 'boolean') on[k] = p.on[k];
  // Saved before "broke" replaced "outside" (trades that went past a rule outside DisciplineGuard).
  if (typeof p.on?.broke !== 'boolean' && typeof p.on?.outside === 'boolean') on.broke = p.on.outside;
  const summaryAt = Number.isInteger(p.summaryAt) && p.summaryAt >= 0 && p.summaryAt < 1440 ? p.summaryAt : null;
  return { on, summaryAt, amounts: p.amounts !== false };
}

/** At most one message per alert kind per 30 minutes; the rest are counted and sent as one roll-up (SPEC §11.2). */
export const WINDOW = 30 * MIN;
const ROLLUP: Partial<Record<AlertKind, string>> = {
  after_limit: 'trades placed after your daily loss limit',
  broke: 'trades went past a rule',
  off: 'trades placed while DisciplineGuard was off',
  stop: 'stops removed or widened',
};

/** "14:02" in the trader's timezone. */
export function hhmm(uc: UserCtx, t: number): string {
  const ms = localParts(resolvedTime(uc).offsets, t).msOfDay;
  const h = Math.floor(ms / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "14:02" today, "Tue 02:00" another day. */
function when(uc: UserCtx, t: number, now: number): string {
  const offsets = resolvedTime(uc).offsets;
  const a = localParts(offsets, t);
  return a.dayNumber === localParts(offsets, now).dayNumber ? hhmm(uc, t) : `${WEEKDAYS[a.weekday]} ${hhmm(uc, t)}`;
}

function showAmounts(uc: UserCtx): boolean {
  return alertPrefs(uc.user.alerts_json).amounts && !uc.user.hide_amounts;
}

function money(x: number, currency: string | null): string {
  const v = Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return !currency || currency === 'USD' ? `$${v}` : `${v} ${currency}`;
}

const acctLabel = (a: AccountRow | undefined) => (a ? `${a.nickname ?? a.broker ?? a.server_name ?? a.platform.toUpperCase()} …${a.last3}` : 'your account');
const ruleName = (id: unknown) => `"${RULE_NAMES[id as TitleId] ?? 'your rule'}"`;

async function insertAlert(env: Env, userId: string, kind: string, title: string, text: string): Promise<void> {
  await env.DB.prepare('INSERT INTO alerts (user_id, kind, title, text, created_at) VALUES (?, ?, ?, ?, ?)').bind(userId, kind, title, text, clock(env)).run();
}

/** Queues an alert for the trader's Windows app, if that alert is on. `urgent` alerts are never held for a roll-up. */
export async function alert(env: Env, uc: UserCtx, kind: AlertKind, title: string, text: string, urgent = false): Promise<void> {
  // No alerts once deletion is requested (SPEC §12.6).
  if (!alertPrefs(uc.user.alerts_json).on[kind] || uc.user.deletion_requested_at) return;
  const t = clock(env);
  if (ROLLUP[kind] && !urgent) {
    const st = await env.DB.prepare('SELECT sent_at FROM alert_state WHERE user_id = ? AND kind = ?').bind(uc.user.id, kind).first<{ sent_at: number }>();
    if (st && t - st.sent_at < WINDOW) {
      await env.DB.prepare('UPDATE alert_state SET held = held + 1 WHERE user_id = ? AND kind = ?').bind(uc.user.id, kind).run();
      await scheduleJob(env, 'alert_rollup', `rollup:${uc.user.id}:${kind}:${st.sent_at}`, st.sent_at + WINDOW, { userId: uc.user.id, kind });
      return;
    }
    await env.DB.prepare('INSERT INTO alert_state (user_id, kind, sent_at, held) VALUES (?, ?, ?, 0) ON CONFLICT (user_id, kind) DO UPDATE SET sent_at = excluded.sent_at, held = 0')
      .bind(uc.user.id, kind, t)
      .run();
  }
  await insertAlert(env, uc.user.id, kind, title, text);
}

/** The roll-up at the end of a 30-minute window: "4 more trades went past a rule since 10:14". */
export async function rollup(env: Env, userId: string, kind: AlertKind): Promise<void> {
  const st = await env.DB.prepare('SELECT sent_at, held FROM alert_state WHERE user_id = ? AND kind = ?').bind(userId, kind).first<{ sent_at: number; held: number }>();
  if (!st || st.held === 0 || !ROLLUP[kind]) return;
  const uc = await userCtx(env, userId, clock(env));
  await env.DB.prepare('UPDATE alert_state SET sent_at = ?, held = 0 WHERE user_id = ? AND kind = ?').bind(clock(env), userId, kind).run();
  if (!alertPrefs(uc.user.alerts_json).on[kind] || uc.user.deletion_requested_at) return;
  await insertAlert(env, userId, kind, 'DisciplineGuard', `${st.held} more ${ROLLUP[kind]} since ${hhmm(uc, st.sent_at)}.`);
}

//--- the alerts, in SPEC §11.2 order ------------------------------------------------------------

export async function limitReached(env: Env, uc: UserCtx, a: AccountRow, loss: number | undefined, limit: number | undefined, t: number): Promise<void> {
  const resets = uc.accountResets[a.id] ?? uc.userResets;
  const until = Math.max(dayOf(resets, t).end, t + uc.asm.rules.R8.restHours * HOUR);
  const amounts = showAmounts(uc) && loss !== undefined && limit !== undefined ? `: −${money(loss, a.currency)} of ${money(limit, a.currency)}` : '';
  await alert(env, uc, 'limit', 'Daily loss limit reached', `${acctLabel(a)}${amounts}. Until ${when(uc, until, t)}, a new trade breaks this rule.`);
}

/** A counted trade broke a rule (SPEC §11.2). After the daily loss limit it has its own alert. */
export async function ruleBroken(env: Env, uc: UserCtx, a: AccountRow, rules: string[], p: { side: string; size?: number; symbol?: string; label?: string }): Promise<void> {
  const order = `${p.side === 'sell' ? 'Sell' : 'Buy'} ${p.size ?? ''} ${p.symbol ?? ''}`.replace(/\s+/g, ' ').trim();
  const where = placedWhere(p.label);
  if (rules.includes('R8')) {
    await alert(env, uc, 'after_limit', 'Trade after your daily loss limit', `${order} on ${acctLabel(a)}${where ? ` ${where}` : ''}. It counts toward today.`);
  } else {
    await alert(env, uc, 'broke', 'A trade went past your rule', `${order}${where ? ` ${where}` : ''} went past ${ruleName(rules[0])}. It counts toward today.`);
  }
}

export async function unprotectedEntry(env: Env, uc: UserCtx, a: AccountRow): Promise<void> {
  await alert(env, uc, 'off', 'Trade placed while DisciplineGuard was off', `A trade was placed on ${acctLabel(a)} while DisciplineGuard was off.`);
}

/** Protection-off from a device: alerted 10 minutes later if its accounts weren't covered again (SPEC §10.6). */
export async function scheduleOffCheck(env: Env, userId: string, connectionId: string, t: number): Promise<void> {
  await scheduleJob(env, 'off_check', `off_check:${connectionId}:${t}`, t + 10 * MIN, { userId, connectionId, t });
}

export async function offCheck(env: Env, p: { userId: string; connectionId: string; t: number }): Promise<void> {
  const conn = await env.DB.prepare('SELECT name FROM connections WHERE id = ?').bind(p.connectionId).first<{ name: string }>();
  const { results } = await env.DB.prepare(
    'SELECT sb.account_id FROM seen_by sb JOIN trading_accounts ta ON ta.id = sb.account_id WHERE sb.connection_id = ? AND ta.removed_at IS NULL',
  ).bind(p.connectionId).all<{ account_id: string }>();
  let uncovered = results.length === 0;
  for (const r of results) {
    const back = await env.DB.prepare('SELECT 1 FROM coverage WHERE account_id = ? AND to_utc > ? LIMIT 1').bind(r.account_id, p.t).first();
    if (!back) uncovered = true;
  }
  if (!uncovered || !conn) return;
  const uc = await userCtx(env, p.userId, clock(env));
  await alert(env, uc, 'off', `DisciplineGuard is off on ${conn.name}`, `Turned off at ${hhmm(uc, p.t)}. New trades there aren't counted.`);
}

export async function accountMoved(env: Env, userId: string, last3: string): Promise<void> {
  const uc = await userCtx(env, userId, clock(env));
  await alert(env, uc, 'moved', 'Account connected to another login', `Account …${last3} was connected to another DisciplineGuard login. If that wasn't you, sign in and check Devices.`);
}

export async function stopChanged(env: Env, uc: UserCtx, a: AccountRow, kind: 'removed' | 'widened'): Promise<void> {
  await alert(env, uc, 'stop', kind === 'removed' ? 'Stop loss removed' : 'Stop loss widened', `On ${acctLabel(a)}.`);
}

/** Sent once, when the 4th order of the trading day couldn't be checked. */
export async function unchecked(env: Env, uc: UserCtx, t: number): Promise<void> {
  const day = dayOf(uc.userResets, t);
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND type = 'unclassified' AND t >= ? AND t < ?").bind(uc.user.id, day.start, day.end).first<{ n: number }>();
  if (row?.n !== 4) return;
  await alert(env, uc, 'unchecked', "Orders we couldn't check", `We couldn't check 4 of your orders today. How to fix: ${env.APP_URL}/help`);
}

//--- end-of-session summary --------------------------------------------------------------------

/**
 * Called on each trade: the summary goes at the trader's chosen time, or at the end of today's trading
 * hours, or 60 minutes after the last trade (SPEC §11.2). One per trading day.
 */
export async function scheduleSummary(env: Env, uc: UserCtx, t: number): Promise<void> {
  const prefs = alertPrefs(uc.user.alerts_json);
  if (!prefs.on.summary) return;
  const offsets = resolvedTime(uc).offsets;
  const { dayNumber, weekday } = localParts(offsets, t);
  let at = t + HOUR;
  if (prefs.summaryAt !== null) {
    at = localToUtc(offsets, dayNumber * DAY + prefs.summaryAt * MIN);
    if (at <= t) at += DAY;
  } else if (uc.asm.rules.R4.on) {
    const ends = uc.asm.rules.R4.windows.filter((w) => w.day === weekday).map((w) => localToUtc(offsets, dayNumber * DAY + w.end * MIN)).filter((e) => e > t);
    if (ends.length) at = Math.max(...ends);
  }
  const day = dayOf(uc.userResets, t);
  await scheduleJob(env, 'summary', `summary:${uc.user.id}:${day.start}`, at, { userId: uc.user.id, dayStart: day.start, dayEnd: day.end });
}

export async function sendSummary(env: Env, p: { userId: string; dayStart: number; dayEnd: number }): Promise<void> {
  const uc = await userCtx(env, p.userId, clock(env));
  const d = (await dayRows(env, uc, p.dayStart, p.dayEnd)).find((x) => x.start === p.dayStart);
  if (!d || d.entries === 0) return;
  const span = await env.DB.prepare("SELECT MIN(t) AS a, MAX(t) AS b FROM events WHERE user_id = ? AND type = 'entry' AND t >= ? AND t < ?")
    .bind(p.userId, p.dayStart, p.dayEnd)
    .first<{ a: number; b: number }>();
  const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;
  const parts = [n(d.entries, 'trade', 'trades'), `${d.breaks} past a rule`];
  const kept = isKept(d);
  if (kept) parts.push('rules kept');
  const lines = [`Today: ${parts.join(' · ')}.`];
  // Periods DisciplineGuard was off while the trader was active (SPEC §11.2).
  if (span?.a) {
    for (const a of uc.accounts) {
      for (const g of await coverageGaps(env, a.id, Math.max(span.a, a.created_at), span.b)) {
        lines.push(`DisciplineGuard was off on …${a.last3} from ${hhmm(uc, g.from)} to ${hhmm(uc, g.to)}.`);
      }
    }
  }
  if (!kept) lines.push('New trading day. Same rules.');
  await alert(env, uc, 'summary', 'Your session', lines.join('\n'));
}
