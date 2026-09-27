// POST /v1/sync: events and heartbeat in, rules and snapshot out (SPEC §10.3). One call per EA cycle.
import { autoLockAt, dayOf, DAY, HOUR, MIN, nextReset } from '@dg/core';
import { accountHashes, registerAccount, type ReportedAccount } from './accounts.ts';
import { audit, rateLimit, scheduleJob, type Ctx } from './common.ts';
import { resolvedTime, userCtx, type AccountRow, type UserCtx } from './context.ts';
import * as alerts from './alerts.ts';
import { addCoverage, wasCovered } from './coverage.ts';
import { eventId, randomId, sha256, sign } from './crypto.ts';
import { now as clock, type Env } from './env.ts';
import { body, HttpError, json } from './http.ts';

export const MAX_BATCH = 100;
export const EVENTS_PER_MIN = 120;

interface ConnRow {
  id: string;
  user_id: string;
  kind: string;
  acked_seq: number;
  first_on_at: number | null;
  removed_at: number | null;
}

interface SyncAccount extends ReportedAccount {
  key: string;
  balance?: number;
  equity?: number;
  credit?: number;
  protect?: boolean;
  cursor?: string;
}

interface SyncEvent {
  id?: string;
  seq?: number;
  type: string;
  t: number;
  acct?: string;
  [k: string]: unknown;
}

const RULE_IDS = new Set(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'BREAK', 'DONE_TODAY', 'CHECK']);
const OFF_REASONS = new Set(['removed', 'chart_close', 'template', 'signed_out', 'switched_login', 'site_access_removed', 'uninstalled']);

async function authDevice(req: Request, env: Env): Promise<ConnRow> {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(h);
  if (!m) throw new HttpError(401, 'no_token');
  const c = await env.DB.prepare('SELECT id, user_id, kind, acked_seq, first_on_at, removed_at FROM connections WHERE token_hash = ?').bind(await sha256(m[1])).first<ConnRow>();
  if (!c) throw new HttpError(401, 'bad_token');
  return c;
}

function clean(s: unknown, max = 40): string | undefined {
  return typeof s === 'string' ? s.slice(0, max) : undefined;
}

function finite(n: unknown): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

export async function sync(req: Request, env: Env, ctx: Ctx): Promise<Response> {
  const conn = await authDevice(req, env);
  const t = clock(env);
  const user = await env.DB.prepare('SELECT deleted_at FROM users WHERE id = ?').bind(conn.user_id).first<{ deleted_at: number | null }>();
  if (!user || user.deleted_at) return json({ status: 'account_deleted', serverTime: t }, 410);
  if (conn.removed_at) return json({ status: 'connection_removed', serverTime: t }, 410);

  const b = await body(req, 512 * 1024);
  const events: SyncEvent[] = Array.isArray(b.events) ? b.events : [];
  if (events.length > MAX_BATCH) throw new HttpError(413, 'batch_too_large');
  if (events.length) await rateLimit(env, `events:${conn.id}`, EVENTS_PER_MIN, 60_000, events.length);

  let uc = await userCtx(env, conn.user_id, t);
  if (uc.asm.removedConnections.has(conn.id)) {
    await env.DB.prepare('UPDATE connections SET removed_at = ? WHERE id = ?').bind(t, conn.id).run();
    return json({ status: 'connection_removed', serverTime: t }, 410);
  }
  const role = b.role === 'secondary' ? 'secondary' : 'primary';
  const planPaid = uc.license.state === 'active' || uc.license.state === 'past_due';

  // Accounts this connection sees.
  const reported: SyncAccount[] = Array.isArray(b.accounts) ? b.accounts.slice(0, 12) : [];
  const keyToAccount = new Map<string, AccountRow>();
  const accountOut: { key: string; id?: string; state: string; last3?: string }[] = [];
  for (const ra of reported) {
    if (typeof ra.key !== 'string' || typeof ra.server !== 'string' || (ra.platform !== 'mt5' && ra.platform !== 'mt4' && ra.platform !== 'tv')) continue;
    const login = typeof ra.login === 'number' ? String(ra.login) : ra.login;
    if (typeof login !== 'string' || !login) continue;
    const known = await findAccount(env, uc, ra.platform, ra.server, login);
    let acct = known;
    if (!acct) {
      if (!ra.protect) {
        accountOut.push({ key: ra.key, state: 'new', last3: login.slice(-3) });
        continue;
      }
      try {
        acct = (await registerAccount(env, uc.user.id, planPaid, { ...ra, login }, ctx)).account;
        await audit(env, uc.user.id, 'device', 'account_protected', { account: acct.id, connection: conn.id });
      } catch (e) {
        if (e instanceof HttpError && e.code === 'account_cap') {
          accountOut.push({ key: ra.key, state: 'cap', last3: login.slice(-3) });
          continue;
        }
        throw e;
      }
    }
    keyToAccount.set(ra.key, acct);
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE trading_accounts SET last_seen = ?, balance = ?, equity = ?, credit = ?, state_at = ?, trade_allowed = ?, netting = ?, currency = COALESCE(?, currency), history_cursor = COALESCE(?, history_cursor) WHERE id = ?',
      ).bind(
        t, finite(ra.balance) ?? null, finite(ra.equity) ?? null, finite(ra.credit) ?? null, t, ra.tradeAllowed === false ? 0 : 1, ra.netting ? 1 : 0,
        clean(ra.currency, 8) ?? null, clean(ra.cursor, 80) ?? null, acct.id,
      ),
      env.DB.prepare('INSERT INTO seen_by (connection_id, account_id, first_seen, last_seen) VALUES (?, ?, ?, ?) ON CONFLICT (connection_id, account_id) DO UPDATE SET last_seen = excluded.last_seen')
        .bind(conn.id, acct.id, t, t),
    ]);
  }

  // Events. Idempotent: deterministic ids for platform data, the client's id otherwise.
  let maxSeq = conn.acked_seq;
  const coveragePoints = new Map<string, number[]>();
  for (const acct of keyToAccount.values()) coveragePoints.set(acct.id, [t]);
  for (const e of events) {
    if (typeof e !== 'object' || e === null || typeof e.type !== 'string' || typeof e.t !== 'number') continue;
    if (typeof e.seq === 'number' && e.seq > maxSeq) maxSeq = e.seq;
    const acct = e.acct !== undefined ? keyToAccount.get(String(e.acct)) : undefined;
    // Only live signals prove the EA was running then. A fill reported later from history does not.
    const live = e.type === 'hb' || e.type === 'pause' || e.type === 'exit' || (e.type === 'entry' && e.source === 'panel');
    if (acct && live && e.t <= t + 60_000) coveragePoints.get(acct.id)?.push(Math.min(e.t, t));
    await storeEvent(env, uc, conn, acct, e, t);
  }

  if (role === 'primary' && uc.license.enforcing) {
    for (const [accountId, pts] of coveragePoints) {
      const a = [...keyToAccount.values()].find((x) => x.id === accountId);
      if (a && !a.not_enforced) await addCoverage(env, accountId, conn.id, pts.filter((p) => p > t - 7 * DAY));
    }
  }

  // First connection On: the trial starts and the auto-lock is scheduled (SPEC §6.1, §12.1).
  const updates = [
    env.DB.prepare('UPDATE connections SET last_seen = ?, acked_seq = MAX(acked_seq, ?), role = ?, version = COALESCE(?, version), push_ready = ?, status = ? WHERE id = ?')
      .bind(t, maxSeq, role, clean(b.version, 20) ?? null, b.pushReady ? 1 : 0, clean(b.state, 30) ?? null, conn.id),
  ];
  if (!conn.first_on_at && uc.license.enforcing && keyToAccount.size > 0) {
    updates.push(env.DB.prepare('UPDATE connections SET first_on_at = ? WHERE id = ? AND first_on_at IS NULL').bind(t, conn.id));
    if (!uc.user.first_on_at) {
      updates.push(env.DB.prepare('UPDATE users SET first_on_at = ? WHERE id = ? AND first_on_at IS NULL').bind(t, uc.user.id));
      if (uc.user.setup_mode) {
        const lockAt = autoLockAt(uc.userResets, t);
        ctx.waitUntil(
          Promise.all([
            scheduleJob(env, 'auto_lock', `auto_lock:${uc.user.id}`, lockAt, { userId: uc.user.id }),
            scheduleJob(env, 'lock_notice', `lock_notice:${uc.user.id}`, lockAt - DAY, { userId: uc.user.id, lockAt }),
          ]),
        );
      }
    }
  }
  await env.DB.batch(updates);
  if (!uc.user.first_on_at && updates.length > 1) uc = await userCtx(env, conn.user_id, t);

  const signed = await signedBlock(env, uc, conn.id);
  const snapshot = await buildSnapshot(env, uc);
  const cursors: Record<string, string | null> = {};
  for (const [key, a] of keyToAccount) {
    const row = await env.DB.prepare('SELECT history_cursor FROM trading_accounts WHERE id = ?').bind(a.id).first<{ history_cursor: string | null }>();
    cursors[key] = row?.history_cursor ?? null;
    accountOut.push({ key, id: a.id, state: a.not_enforced ? 'not_enforced' : 'active', last3: a.last3 });
  }
  return json({
    status: 'ok',
    serverTime: t,
    ackedSeq: maxSeq,
    signed: b.signedHash === signed.hash ? null : signed,
    signedHash: signed.hash,
    snapshot,
    accounts: accountOut,
    cursors,
  });
}

export const BASELINE_MAX = 500;
export const BASELINE_DAYS = 90;

/**
 * POST /v1/baseline: past entries and closes, uploaded once at pairing with the user's consent (SPEC §14 "Baseline").
 * Used only for the user's own before/after comparison. Idempotent by ticket.
 */
export async function baseline(req: Request, env: Env): Promise<Response> {
  const conn = await authDevice(req, env);
  if (conn.removed_at) return json({ status: 'connection_removed' }, 410);
  const t = clock(env);
  await rateLimit(env, `baseline:${conn.id}`, 60, 3600_000);
  const b = await body(req, 256 * 1024);
  const uc = await userCtx(env, conn.user_id, t);
  const a = b.account ?? {};
  const login = typeof a.login === 'number' ? String(a.login) : a.login;
  if (typeof login !== 'string' || typeof a.server !== 'string' || a.platform !== 'mt5') throw new HttpError(400, 'bad_account');
  const acct = await findAccount(env, uc, 'mt5', a.server, login);
  if (!acct) throw new HttpError(404, 'unknown_account');
  const items: any[] = Array.isArray(b.items) ? b.items.slice(0, BASELINE_MAX) : [];
  const stmts = [];
  for (const it of items) {
    const kind = it?.kind === 'close' ? 'close' : it?.kind === 'entry' ? 'entry' : null;
    const when = finite(it?.t);
    if (!kind || when === undefined || when > t || when < t - (BASELINE_DAYS + 1) * DAY || it.ticket === undefined) continue;
    const payload = kind === 'entry'
      ? { symbol: clean(it.symbol, 30), side: it.side === 'sell' ? 'sell' : 'buy', size: finite(it.size) ?? 0, source: clean(it.source, 12) }
      : { net: finite(it.net) ?? 0, size: finite(it.size) ?? 0 };
    stmts.push(
      env.DB.prepare('INSERT OR IGNORE INTO baseline (user_id, account_id, kind, ticket, t, payload) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(uc.user.id, acct.id, kind, String(it.ticket).slice(0, 40), when, JSON.stringify(payload)),
    );
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, stored: stmts.length, done: !!b.done });
}

async function findAccount(env: Env, uc: UserCtx, platform: string, server: string, login: string): Promise<AccountRow | undefined> {
  const h = await accountHashes(env, { platform, server, login });
  return uc.accounts.find((a) => a.platform === platform && a.server_hash === h.serverHash && a.account_hash === h.accountHash);
}

async function storeEvent(env: Env, uc: UserCtx, conn: ConnRow, acct: AccountRow | undefined, e: SyncEvent, now: number): Promise<void> {
  const userId = uc.user.id;
  const t = Math.min(e.t, now + 60_000);
  const insert = (id: string, type: string, payload: unknown, when = t, accountId = acct?.id ?? null) =>
    env.DB.prepare('INSERT OR IGNORE INTO events (id, user_id, connection_id, account_id, seq, type, t, received_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, userId, conn.id, accountId, typeof e.seq === 'number' ? e.seq : null, type, when, now, JSON.stringify(payload));
  const clientId = typeof e.id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(e.id) ? e.id : randomId('ev_');
  const ticket = e.ticket !== undefined ? String(e.ticket).slice(0, 40) : undefined;

  switch (e.type) {
    case 'hb':
      return;
    case 'entry': {
      if (!acct) return;
      const id = ticket ? await eventId(acct.id, 'entry', ticket) : clientId;
      const rules = Array.isArray(e.violations) ? (e.violations as unknown[]).filter((r): r is string => typeof r === 'string' && RULE_IDS.has(r)) : [];
      const source = e.source === 'panel' ? 'panel' : 'outside';
      const covered = source === 'panel' || (await wasCovered(env, acct.id, t));
      const payload = {
        symbol: clean(e.symbol, 30), side: e.side === 'sell' ? 'sell' : 'buy', size: finite(e.size) ?? 0, source,
        label: clean(e.label, 12), pauseId: clean(e.pauseId, 64), pending: !!e.pending, violations: rules, unprotected: !covered || !!e.unprotected,
      };
      const stmts = [insert(id, 'entry', payload), env.DB.prepare('UPDATE trading_accounts SET last_entry_at = MAX(COALESCE(last_entry_at, 0), ?) WHERE id = ?').bind(t, acct.id)];
      if (source === 'outside' && rules.length > 0) stmts.push(insert(`${id}:ov`, 'override', { from: 'outside', rules }));
      const [stored] = await env.DB.batch(stmts);
      if (!stored.meta.changes) return;
      await alerts.scheduleSummary(env, uc, t);
      if (source === 'outside' && rules.length > 0) await alerts.outsideViolation(env, uc, rules, payload.label);
      if (payload.unprotected) await alerts.unprotectedEntry(env, uc, acct);
      return;
    }
    case 'entry_void': {
      if (!acct || !ticket) return;
      const id = await eventId(acct.id, 'entry', ticket);
      await env.DB.prepare('UPDATE events SET void_at = ? WHERE id = ? AND user_id = ?').bind(t, id, userId).run();
      return;
    }
    case 'close': {
      if (!acct) return;
      const id = ticket ? await eventId(acct.id, 'close', ticket) : clientId;
      await insert(id, 'close', { net: finite(e.net) ?? 0, size: finite(e.size) ?? 0 }).run();
      return;
    }
    case 'pause': {
      const decision = ['skip', 'place', 'timeout', 'reinit'].includes(String(e.decision)) ? String(e.decision) : 'skip';
      const pauseId = clean(e.pauseId, 64) ?? clientId;
      const rules = Array.isArray(e.rules) ? (e.rules as unknown[]).filter((r): r is string => typeof r === 'string' && RULE_IDS.has(r)) : [];
      const payload = {
        pauseId, rules, title: clean(e.title, 12), decision, shownSec: finite(e.shownSec), waitSec: finite(e.waitSec), typed: !!e.typed,
        placedAnyway: finite(e.placedAnyway), reattempt: !!e.reattempt, unlockToClickMs: finite(e.unlockToClickMs),
        symbol: clean(e.symbol, 30), side: e.side === 'sell' ? 'sell' : 'buy', size: finite(e.size), sent: !!e.sent,
        reason: uc.user.reason_consent ? clean(e.reason, 30) : undefined, variant: clean(e.variant, 20),
      };
      const stmts = [insert(`p:${pauseId}`, 'pause', payload), env.DB.prepare('UPDATE users SET last_real_pause_at = MAX(COALESCE(last_real_pause_at, 0), ?) WHERE id = ?').bind(t, userId)];
      // Reasons are dropped until the trader says yes; the first one named asks the question on Today.
      if (e.reason !== undefined && uc.user.reason_consent === null && uc.user.reason_asked_at === null) {
        stmts.push(env.DB.prepare('UPDATE users SET reason_asked_at = ? WHERE id = ? AND reason_asked_at IS NULL').bind(t, userId));
      }
      if (decision === 'place' && e.sent) stmts.push(insert(`p:${pauseId}:ov`, 'override', { from: 'pause', rules }));
      if (decision === 'skip' || decision === 'timeout') {
        stmts.push(
          env.DB.prepare('INSERT INTO user_state (user_id, last_skip_json) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET last_skip_json = excluded.last_skip_json')
            .bind(userId, JSON.stringify({ t, symbol: payload.symbol, side: payload.side, waitSec: payload.waitSec ?? 0 })),
        );
      }
      const [stored] = await env.DB.batch(stmts);
      if (!stored.meta.changes) return;
      await alerts.scheduleSummary(env, uc, t);
      if (decision === 'place' && e.sent) await alerts.placedAnyway(env, uc, acct, { title: payload.title, rules, side: payload.side, size: payload.size, symbol: payload.symbol });
      return;
    }
    case 'pause_sent': {
      // Place anyway confirmed sent after the pause event was already queued.
      const pauseId = clean(e.pauseId, 64);
      if (!pauseId) return;
      await insert(`p:${pauseId}:ov`, 'override', { from: 'pause' }).run();
      return;
    }
    case 'break':
    case 'done_today': {
      const until = finite(e.until);
      if (!until || until <= t) return;
      const col = e.type === 'break' ? 'break_until' : 'done_until';
      // Tighten now: never shortened (SPEC §6.5).
      const capped = e.type === 'break' ? Math.min(until, t + 15 * MIN + 5_000) : Math.min(until, nextReset(uc.userResets, t));
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO user_state (user_id, ${col}) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET ${col} = MAX(COALESCE(${col}, 0), excluded.${col})`).bind(userId, capped),
        insert(clientId, e.type, { until: capped }),
      ]);
      return;
    }
    case 'limit_reached': {
      if (!acct) return;
      const dayStart = finite(e.dayStart) ?? dayOf(uc.accountResets[acct.id] ?? uc.userResets, t).start;
      const [first] = await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO limit_state (account_id, day_start_utc, reached_at, loss, limit_value) VALUES (?, ?, ?, ?, ?)')
          .bind(acct.id, dayStart, t, finite(e.loss) ?? null, finite(e.limit) ?? null),
        insert(await eventId(acct.id, 'limit_reached', String(dayStart)), 'limit_reached', { loss: finite(e.loss), limit: finite(e.limit) }),
      ]);
      if (first.meta.changes) await alerts.limitReached(env, uc, acct, finite(e.loss), finite(e.limit), t);
      return;
    }
    case 'day_start': {
      if (!acct) return;
      const ds = finite(e.dayStart);
      const bal = finite(e.balance);
      if (ds === undefined || bal === undefined) return;
      // The first client to report a day-start balance wins (SPEC §5.2).
      await env.DB.prepare('INSERT OR IGNORE INTO day_start (account_id, day_start_utc, balance, reported_by, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(acct.id, ds, bal, conn.id, now)
        .run();
      return;
    }
    case 'protection_off': {
      const reason = OFF_REASONS.has(String(e.reason)) ? String(e.reason) : 'removed';
      await env.DB.batch([
        insert(clientId, 'protection_off', { reason }, t, null),
        env.DB.prepare('UPDATE connections SET off_reason = ?, status = ? WHERE id = ?').bind(reason, 'off', conn.id),
      ]);
      await alerts.scheduleOffCheck(env, userId, conn.id, t);
      return;
    }
    case 'stop_change': {
      if (!acct) return;
      const kind = e.kind === 'removed' ? 'removed' : 'widened';
      const r = await insert(ticket ? await eventId(acct.id, 'stop_change', ticket, String(t)) : clientId, 'stop_change', { kind }).run();
      if (r.meta.changes) await alerts.stopChanged(env, uc, acct, kind);
      return;
    }
    case 'exit': {
      // A guarded exit that went straight through: the safety criterion counts these (PHASES.md Phase 1).
      if (!acct) return;
      await insert(ticket ? await eventId(acct.id, 'exit', ticket) : clientId, 'exit', { kind: clean(e.kind, 12) }).run();
      return;
    }
    case 'delayed_click':
      await insert(clientId, 'delayed_click', { ms: finite(e.ms), netMs: finite(e.netMs) }, t, null).run();
      return;
    case 'setup':
      await insert(clientId, 'setup', { failed: Array.isArray(e.failed) ? (e.failed as unknown[]).map((x) => clean(x, 30)).slice(0, 10) : [] }, t, null).run();
      return;
    case 'unclassified':
      if ((await insert(clientId, 'unclassified', {}, t).run()).meta.changes) await alerts.unchecked(env, uc, t);
      return;
    default:
      return;
  }
}

/** The signed rule cache (SPEC §10.5). Stable within a UTC day unless something changes. */
export async function signedBlock(env: Env, uc: UserCtx, connectionId: string): Promise<{ payload: string; sig: string; hash: string }> {
  const accounts: Record<string, unknown> = {};
  for (const a of uc.accounts) {
    accounts[a.id] = { platform: a.platform, last3: a.last3, nickname: a.nickname, enforced: !a.not_enforced, currency: a.currency };
  }
  const ver = Math.max(0, ...Object.values(uc.asm.lockedValues));
  const lockAt = uc.user.setup_mode && uc.user.first_on_at ? autoLockAt(uc.userResets, uc.user.first_on_at) : null;
  const payload = JSON.stringify({
    v: 1,
    conn: connectionId,
    ver,
    day: Math.floor(uc.now / DAY),
    magic: uc.user.magic,
    hideAmounts: !!uc.user.hide_amounts,
    setupMode: !!uc.user.setup_mode,
    lockAt,
    rules: uc.asm.rules,
    popup: uc.asm.popup,
    notes: uc.asm.notes,
    plan: uc.asm.plan,
    time: resolvedTime(uc),
    accounts,
    license: { state: uc.license.state, validUntil: uc.license.validUntil, enforcing: uc.license.enforcing, trialEndsAt: uc.license.trialEndsAt ?? null },
    pending: uc.asm.pending,
  });
  return { payload, sig: await sign(env.SIGNING_KEY, payload), hash: await sha256(payload) };
}

export async function buildSnapshot(env: Env, uc: UserCtx) {
  const t = uc.now;
  const r = uc.asm.rules;
  const day = dayOf(uc.userResets, t);
  const entriesFrom = Math.min(day.start, t - Math.max(HOUR, r.R3.seconds * 1000)) - 60_000;
  const closesFrom = t - Math.max(2 * r.R7.minutes + r.R10.minutes, 30) * MIN;
  const [entries, closes, lastTwo, overrides, st] = await Promise.all([
    env.DB.prepare("SELECT account_id, t, payload FROM events WHERE user_id = ? AND type = 'entry' AND void_at IS NULL AND t >= ? ORDER BY t").bind(uc.user.id, entriesFrom).all<any>(),
    env.DB.prepare("SELECT id, account_id, t, payload FROM events WHERE user_id = ? AND type = 'close' AND t >= ? ORDER BY t").bind(uc.user.id, closesFrom).all<any>(),
    env.DB.prepare("SELECT id, account_id, t, payload FROM events WHERE user_id = ? AND type = 'close' ORDER BY t DESC LIMIT 2").bind(uc.user.id).all<any>(),
    env.DB.prepare("SELECT t FROM events WHERE user_id = ? AND type = 'override' AND t >= ? ORDER BY t").bind(uc.user.id, day.start).all<{ t: number }>(),
    env.DB.prepare('SELECT break_until, done_until, last_skip_json FROM user_state WHERE user_id = ?').bind(uc.user.id).first<any>(),
  ]);
  const closeMap = new Map<string, any>();
  for (const c of [...lastTwo.results, ...closes.results]) closeMap.set(c.id, c);
  const accounts: Record<string, { dayStart: number; dayStartBalance?: number; limitReachedAt?: number }> = {};
  for (const a of uc.accounts) {
    const ad = dayOf(uc.accountResets[a.id] ?? uc.userResets, t);
    const ds = await env.DB.prepare('SELECT balance FROM day_start WHERE account_id = ? AND day_start_utc = ?').bind(a.id, ad.start).first<{ balance: number }>();
    const lim = await env.DB.prepare('SELECT MAX(reached_at) AS r FROM limit_state WHERE account_id = ? AND reached_at >= ?').bind(a.id, t - 2 * DAY).first<{ r: number | null }>();
    accounts[a.id] = { dayStart: ad.start, dayStartBalance: ds?.balance, limitReachedAt: lim?.r ?? undefined };
  }
  const entry = (row: any) => {
    const p = JSON.parse(row.payload);
    return { t: row.t, account: row.account_id, symbol: p.symbol, side: p.side, size: p.size };
  };
  return {
    asOf: t,
    dayStart: day.start,
    dayEnd: day.end,
    entries: entries.results.map(entry),
    closes: [...closeMap.values()].sort((a, b) => a.t - b.t).map((c) => ({ t: c.t, account: c.account_id, net: JSON.parse(c.payload).net, size: JSON.parse(c.payload).size })),
    overrides: overrides.results.map((o) => o.t),
    breakUntil: st?.break_until ?? null,
    doneUntil: st?.done_until ?? null,
    lastSkip: st?.last_skip_json ? JSON.parse(st.last_skip_json) : null,
    accounts,
  };
}

