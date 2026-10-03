// Self-serve export and account deletion (SPEC §12.6, §13.4).
import { DAY, whenApplies } from '@dg/core';
import { sessionCookie, type Session } from './auth.ts';
import { cancelSubscription } from './billing.ts';
import { alertPrefs } from './alerts.ts';
import { audit, rateLimit, scheduleJob, sendEmail, type Ctx } from './common.ts';
import { userCtx, type UserRow } from './context.ts';
import { sha256, token } from './crypto.ts';
import { now as clock, type Env } from './env.ts';
import { body, HttpError, json } from './http.ts';
import { zip } from './zip.ts';

export const EXPORT_FRESH_MS = 10 * 60_000;
const EXPORT_TTL = DAY;

/** POST /api/export: emails a single-use link. Needs a sign-in within the last 10 minutes (SPEC §10.9). */
export async function requestExport(env: Env, s: Session, ctx: Ctx): Promise<Response> {
  if (clock(env) - s.signedInAt > EXPORT_FRESH_MS) throw new HttpError(403, 'reauth');
  await rateLimit(env, `export:${s.user.id}`, 5, 3600_000);
  const tok = token(32);
  await env.DB.prepare('INSERT INTO export_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(tok), s.user.id, clock(env) + EXPORT_TTL).run();
  await sendEmail(env, s.user.email, 'DisciplineGuard: your data export', `Download your data (works once, for 24 hours):\n${env.APP_URL}/v1/export/${tok}\n\nDisciplineGuard`, ctx);
  return json({ ok: true });
}

function csv(rows: (string | number | boolean | null | undefined)[][]): string {
  const cell = (v: unknown) => {
    const x = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const iso = (t: number | null | undefined) => (t ? new Date(t).toISOString() : '');

/** GET /v1/export/<token>: the ZIP. JSON with everything, and CSVs for pauses, counted trades and rule changes. */
export async function downloadExport(env: Env, tok: string): Promise<Response> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(tok)) throw new HttpError(404, 'not_found');
  const t = clock(env);
  const hash = await sha256(tok);
  const used = await env.DB.prepare('UPDATE export_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id').bind(t, hash, t).first<{ user_id: string }>();
  if (!used) return new Response('This link has expired or was already used. Ask for a new export in Account → Data.', { status: 410, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const uc = await userCtx(env, used.user_id, t);
  const u = uc.user;
  const q = async (sql: string) => (await env.DB.prepare(sql).bind(u.id).all<any>()).results;
  const changes = await q('SELECT key, from_json, to_json, direction, applies_at, created_at, actor FROM setting_changes WHERE user_id = ? ORDER BY created_at');
  const pauses = await q("SELECT t, account_id, payload FROM events WHERE user_id = ? AND type = 'pause' ORDER BY t");
  const entries = await q("SELECT t, account_id, payload FROM events WHERE user_id = ? AND type = 'entry' AND void_at IS NULL ORDER BY t");
  const connections = await q('SELECT c.kind, c.name, c.version, c.created_at, c.last_seen, c.removed_at FROM connections c WHERE c.user_id = ?');
  const last3 = new Map(uc.accounts.map((a) => [a.id, a.last3]));
  const everything = {
    exportedAt: iso(t),
    profile: { email: u.email, firstName: u.first_name, createdAt: iso(u.created_at), hideAmounts: !!u.hide_amounts, saveReasons: u.reason_consent === 1 },
    plan: { state: uc.license.state, kind: u.plan_kind, validUntil: iso(uc.license.validUntil) },
    rules: uc.asm.rules,
    popup: uc.asm.popup,
    timezone: uc.asm.tz,
    pendingChanges: uc.asm.pending,
    ruleChanges: changes.map((c) => ({ key: c.key, from: c.from_json && JSON.parse(c.from_json), to: c.to_json && JSON.parse(c.to_json), direction: c.direction, appliesAt: iso(c.applies_at), at: iso(c.created_at), by: c.actor })),
    accounts: uc.accounts.map((a) => ({ platform: a.platform, broker: a.broker, server: a.server_name, last3: a.last3, nickname: a.nickname, currency: a.currency, connectedAt: iso(a.created_at) })),
    connections: connections.map((c) => ({ kind: c.kind, name: c.name, version: c.version, connectedAt: iso(c.created_at), lastSeen: iso(c.last_seen), removedAt: iso(c.removed_at) })),
    pauses: pauses.map((p) => ({ at: iso(p.t), account: last3.get(p.account_id) ?? null, ...JSON.parse(p.payload) })),
    trades: entries.map((e) => ({ at: iso(e.t), account: last3.get(e.account_id) ?? null, ...JSON.parse(e.payload) })),
    alerts: alertPrefs(u.alerts_json),
  };
  const files = {
    'disciplineguard.json': JSON.stringify(everything, null, 2),
    'pauses.csv': csv([
      ['time', 'account', 'rule', 'decision', 'symbol', 'side', 'size', 'wait_s', 'reason'],
      ...everything.pauses.map((p: any) => [p.at, p.account, p.title, p.decision, p.symbol, p.side, p.size, p.waitSec, p.reason]),
    ]),
    'trades.csv': csv([
      ['time', 'account', 'symbol', 'side', 'size', 'source', 'rules_broken'],
      ...everything.trades.map((e: any) => [e.at, e.account, e.symbol, e.side, e.size, e.source, (e.violations ?? []).join(' ')]),
    ]),
    'rule-changes.csv': csv([['time', 'setting', 'from', 'to', 'direction', 'applies_at', 'by'], ...everything.ruleChanges.map((c) => [c.at, c.key, JSON.stringify(c.from), JSON.stringify(c.to), c.direction, c.appliesAt, c.by])]),
  };
  await audit(env, u.id, 'user', 'export_downloaded');
  return new Response(zip(files), {
    headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="disciplineguard-export.zip"', 'cache-control': 'no-store' },
  });
}

/** Protection is active unless in setup mode, the plan ended, or no connection was seen for a full trading day (SPEC §12.6). */
async function protectionActive(env: Env, user: UserRow, t: number): Promise<boolean> {
  const uc = await userCtx(env, user.id, t);
  if (user.setup_mode || !uc.license.enforcing) return false;
  const seen = await env.DB.prepare('SELECT MAX(last_seen) AS t FROM connections WHERE user_id = ? AND removed_at IS NULL').bind(user.id).first<{ t: number | null }>();
  return !!seen?.t && t - seen.t < DAY;
}

/** When a deletion asked now would run: now, or like a loosening. */
async function deletionTime(env: Env, user: UserRow, t: number): Promise<number> {
  if (!(await protectionActive(env, user, t))) return t;
  const uc = await userCtx(env, user.id, t);
  const at = whenApplies('looser', { now: t, userResets: uc.userResets, setupMode: false });
  return at === 'now' ? t : at;
}

/** POST /api/account/delete {confirm: "DELETE", dryRun?}. The plan is cancelled at once; the data goes at `deletion_at`. */
export async function requestDeletion(req: Request, env: Env, s: Session, ctx: Ctx): Promise<Response> {
  const b = await body(req);
  const t = clock(env);
  if (s.user.deletion_at) return json({ at: s.user.deletion_at });
  const at = await deletionTime(env, s.user, t);
  if (b.dryRun === true) return json({ at: at <= t ? 'now' : at });
  if (b.confirm !== 'DELETE') throw new HttpError(400, 'confirm');
  await cancelSubscription(env, s.user);
  await env.DB.prepare('UPDATE users SET deletion_requested_at = ?, deletion_at = ? WHERE id = ?').bind(t, at, s.user.id).run();
  await audit(env, s.user.id, 'user', 'deletion_requested', { at });
  const leaving = 'Before you go: uninstall DisciplineGuard for Windows (Settings → Apps). Your rules keep working until the deletion runs.';
  if (at <= t) {
    await runDeletion(env, { userId: s.user.id, at }, ctx);
    return json({ at: 'now' }, 200, { 'set-cookie': sessionCookie(env, '', 0) });
  }
  await scheduleJob(env, 'delete_account', `delete:${s.user.id}:${at}`, at, { userId: s.user.id, at });
  await sendEmail(env, s.user.email, 'DisciplineGuard: deletion requested', `Your account will be deleted at ${new Date(at).toUTCString()}. Your plan is cancelled now, and you won't be charged again. To keep your account, choose Cancel deletion on the website before then.\n\n${leaving}\n\nDisciplineGuard`, ctx);
  return json({ at });
}

/** POST /api/account/delete/cancel. */
export async function cancelDeletion(env: Env, s: Session): Promise<Response> {
  await env.DB.prepare('UPDATE users SET deletion_requested_at = NULL, deletion_at = NULL WHERE id = ?').bind(s.user.id).run();
  await audit(env, s.user.id, 'user', 'deletion_cancelled');
  return json({ ok: true });
}

/**
 * The deletion job. Keeps only what SPEC §13.3 keeps: payments (the provider has the receipts), problem reports
 * (12 months), and a tombstone user row so devices get `account_deleted`.
 */
export async function runDeletion(env: Env, p: { userId: string; at: number }, ctx: Ctx): Promise<void> {
  const u = await env.DB.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').bind(p.userId).first<UserRow>();
  if (!u || u.deletion_at !== p.at) return;
  const t = clock(env);
  const id = u.id;
  const byUser = ['settings', 'setting_changes', 'events', 'user_state', 'baseline', 'alerts', 'alert_state', 'export_tokens', 'sessions', 'tell_me'];
  const accounts = "(SELECT id FROM trading_accounts WHERE user_id = ?)";
  await env.DB.batch([
    ...byUser.map((tbl) => env.DB.prepare(`DELETE FROM ${tbl} WHERE user_id = ?`).bind(id)),
    env.DB.prepare(`DELETE FROM day_start WHERE account_id IN ${accounts}`).bind(id),
    env.DB.prepare(`DELETE FROM limit_state WHERE account_id IN ${accounts}`).bind(id),
    env.DB.prepare(`DELETE FROM coverage WHERE account_id IN ${accounts}`).bind(id),
    env.DB.prepare('DELETE FROM seen_by WHERE connection_id IN (SELECT id FROM connections WHERE user_id = ?)').bind(id),
    env.DB.prepare('DELETE FROM trading_accounts WHERE user_id = ?').bind(id),
    env.DB.prepare("UPDATE connections SET name = NULL, removed_at = COALESCE(removed_at, ?), off_reason = 'account_deleted' WHERE user_id = ?").bind(t, id),
    env.DB.prepare('UPDATE desktop_installs SET revoked_at = COALESCE(revoked_at, ?), name = ? WHERE user_id = ?').bind(t, 'deleted', id),
    env.DB.prepare(
      "UPDATE users SET deleted_at = ?, email = ?, first_name = NULL, onboarding_json = NULL, alerts_json = NULL, portal_url = NULL, update_card_url = NULL, country = NULL WHERE id = ?",
    ).bind(t, `deleted+${id}@invalid`, id),
  ]);
  await audit(env, id, 'server', 'deleted');
  await sendEmail(env, u.email, 'DisciplineGuard: account deleted', "Your DisciplineGuard account is deleted. Your devices show Off and orders go through normally. You can uninstall DisciplineGuard for Windows (Settings → Apps).\n\nDisciplineGuard", ctx);
}
