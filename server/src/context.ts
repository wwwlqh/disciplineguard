// Loads a user with their active settings, resolved time and license.
import { DAY, resets as resolveResets, transitions, type ResetSpec, type ResolvedTime } from '@dg/core';
import type { D1Like, Env } from './env.ts';
import { HttpError } from './http.ts';
import { license, type License } from './license.ts';
import { applyDefaults, assemble, loadSettings, type Assembled, type StoredSetting } from './settings.ts';

export interface UserRow {
  id: string;
  email: string;
  email_norm: string;
  first_name: string | null;
  created_at: number;
  setup_mode: number;
  locked_at: number | null;
  locked_by: string | null;
  first_on_at: number | null;
  lock_notice_sent: number;
  last_real_pause_at: number | null;
  plan_state: string;
  plan_kind: string | null;
  paid_until: number | null;
  past_due_since: number | null;
  provider_end_at: number | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  cancel_at_period_end: number;
  is_beta: number;
  magic: number;
  analytics_consent: number | null;
  analytics_id: string;
  reason_consent: number | null;
  reason_asked_at: number | null;
  alerts_json: string | null;
  first_paid_at: number | null;
  portal_url: string | null;
  update_card_url: string | null;
  deletion_at: number | null;
  hide_amounts: number;
  country: string | null;
  risk_notice_version: string | null;
  risk_notice_at: number | null;
  onboarding_json: string | null;
  deletion_requested_at: number | null;
  deleted_at: number | null;
  trial_eligible: number;
}

export interface AccountRow {
  id: string;
  user_id: string;
  platform: 'mt5' | 'mt4' | 'tv';
  server_hash: string;
  account_hash: string;
  last3: string;
  server_name: string | null;
  broker: string | null;
  nickname: string | null;
  firm: string | null;
  currency: string | null;
  netting: number;
  is_demo: number;
  trade_allowed: number;
  not_enforced: number;
  created_at: number;
  last_seen: number | null;
  last_entry_at: number | null;
  removed_at: number | null;
  balance: number | null;
  equity: number | null;
  credit: number | null;
  state_at: number | null;
  history_cursor: string | null;
}

export interface UserCtx {
  user: UserRow;
  settings: Map<string, StoredSetting>;
  asm: Assembled;
  userResets: number[];
  accounts: AccountRow[];
  accountResets: Record<string, number[]>;
  license: License;
  now: number;
}

const resetCache = new Map<string, number[]>();

/** Resets for a spec over whole UTC days, memoized per isolate. */
export function cachedResets(spec: ResetSpec, from: number, to: number): number[] {
  const f = Math.floor(from / DAY) * DAY;
  const t = Math.ceil(to / DAY) * DAY;
  const key = `${spec.tz}|${spec.at}|${f}|${t}`;
  let r = resetCache.get(key);
  if (!r) {
    r = resolveResets(spec, f, t);
    if (resetCache.size > 500) resetCache.clear();
    resetCache.set(key, r);
  }
  return r;
}

export async function loadUser(db: D1Like, id: string): Promise<UserRow> {
  const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  if (!u) throw new HttpError(404, 'no_user');
  return u;
}

export async function userCtx(env: Env, userId: string, now: number): Promise<UserCtx> {
  const user = await loadUser(env.DB, userId);
  const settings = await loadSettings(env.DB, userId, now);
  const asm = assemble(settings);
  const from = Math.min(now - 3 * DAY, user.plan_state === 'trial' ? user.created_at - DAY : Infinity);
  const far = Math.min(
    // Must reach valid_until + 8 days for resolvedTime(): paid end, trial end (≤ day 22, or first On + 15 days).
    Math.max(now + 45 * DAY, (user.paid_until ?? 0) + 11 * DAY, user.created_at + 32 * DAY, (user.first_on_at ?? 0) + 25 * DAY),
    now + 400 * DAY,
  );
  const userResets = cachedResets(asm.reset, from, far);
  const { results: accounts } = await env.DB.prepare('SELECT * FROM trading_accounts WHERE user_id = ? AND removed_at IS NULL ORDER BY created_at').bind(userId).all<AccountRow>();
  const live = accounts.filter((a) => !asm.removedAccounts.has(a.id));
  if (live.length !== accounts.length) {
    // A scheduled removal took effect (SPEC §6.4): mark it removed.
    for (const a of accounts.filter((x) => asm.removedAccounts.has(x.id))) {
      await env.DB.prepare('UPDATE trading_accounts SET removed_at = ? WHERE id = ? AND removed_at IS NULL').bind(now, a.id).run();
    }
  }
  applyDefaults(asm, live);
  const accountResets: Record<string, number[]> = {};
  for (const a of live) {
    const spec = asm.accountResets[a.id];
    if (spec) accountResets[a.id] = cachedResets(spec, now - 3 * DAY, far);
  }
  return { user, settings, asm, userResets, accounts: live, accountResets, license: license(user, userResets, now), now };
}

/** The pre-resolved time block for clients, covering at least valid_until + 7 days (SPEC §3.3). */
export function resolvedTime(ctx: UserCtx): ResolvedTime {
  const from = Math.floor(ctx.now / DAY) * DAY - 2 * DAY;
  const to = Math.min(Math.max(ctx.license.validUntil, ctx.now) + 8 * DAY, ctx.now + 400 * DAY);
  const keep = (r: number[]) => {
    const i = Math.max(0, r.findIndex((x) => x > from) - 1);
    return r.slice(i).filter((x) => x <= to + DAY);
  };
  const accountResets: Record<string, number[]> = {};
  for (const [id, r] of Object.entries(ctx.accountResets)) accountResets[id] = keep(r);
  return {
    userResets: keep(ctx.userResets),
    accountResets,
    offsets: transitions(ctx.asm.tz, from, to),
  };
}
