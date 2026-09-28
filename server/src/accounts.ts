// Trading accounts: identity, caps, moves between logins (SPEC §2, §10.6, §10.7, §12.5).
import { accountMoved } from './alerts.ts';
import { audit, sendEmail, type Ctx } from './common.ts';
import type { AccountRow } from './context.ts';
import { hmac, randomId } from './crypto.ts';
import { now as clock, type Env } from './env.ts';
import { HttpError } from './http.ts';

export const ACCOUNT_CAP = 10;
/** Accounts on the free plan. TradingView Paper Trading is not counted (SPEC §12.5). */
export const FREE_ACCOUNTS = 1;
export const ENDED_AFTER_DAYS = 3;

export interface ReportedAccount {
  platform: 'mt5' | 'mt4' | 'tv';
  server: string;
  /** Raw account number. Hashed at once, never stored. Omit when `hashes` is given. */
  login?: string;
  hashes?: { serverHash: string; accountHash: string; last3: string };
  broker?: string;
  currency?: string;
  netting?: boolean;
  demo?: boolean;
  tradeAllowed?: boolean;
}

export async function accountHashes(env: Env, a: { platform: string; server: string; login: string }) {
  const server = a.server.trim();
  return {
    serverHash: await hmac(env.HMAC_SECRET, `${a.platform}|server|${server.toLowerCase()}`),
    accountHash: await hmac(env.HMAC_SECRET, `${a.platform}|${server.toLowerCase()}|${a.login.trim()}`),
    last3: a.login.trim().slice(-3),
  };
}

/** TradingView Paper Trading: practice money, free on every plan. MT demo accounts count, since prop firm challenges run on them. */
export const isPaper = (a: { platform: string; server?: string | null; server_name?: string | null }) =>
  a.platform === 'tv' && /paper/i.test(a.server ?? a.server_name ?? '');

/** Ended: trading disabled by the broker, or no heartbeat and no entries for 3 full trading days (SPEC §10.7). */
export function isEnded(a: AccountRow, now: number): boolean {
  if (!a.trade_allowed) return true;
  const last = Math.max(a.last_seen ?? 0, a.last_entry_at ?? 0, a.created_at);
  return now - last > (ENDED_AFTER_DAYS + 1) * 86_400_000;
}

export type Registered = { account: AccountRow; created: boolean };

/**
 * Finds or creates the account for this user. New accounts are checked against the caps,
 * and the same account under another login is refused while live there, and moved once Ended (SPEC §10.6).
 */
export async function registerAccount(env: Env, userId: string, planPaid: boolean, a: ReportedAccount, ctx?: Ctx): Promise<Registered> {
  const t = clock(env);
  const { serverHash, accountHash, last3 } = a.hashes ?? (await accountHashes(env, { platform: a.platform, server: a.server, login: a.login ?? '' }));
  const existing = await env.DB.prepare(
    'SELECT * FROM trading_accounts WHERE user_id = ? AND platform = ? AND server_hash = ? AND account_hash = ? AND removed_at IS NULL',
  ).bind(userId, a.platform, serverHash, accountHash).first<AccountRow>();
  if (existing) return { account: existing, created: false };

  const { results: mine } = await env.DB.prepare('SELECT * FROM trading_accounts WHERE user_id = ? AND removed_at IS NULL').bind(userId).all<AccountRow>();
  if (mine.length >= ACCOUNT_CAP) throw new HttpError(409, 'account_cap');
  if (!planPaid && !isPaper(a) && mine.filter((m) => !isPaper(m)).length >= FREE_ACCOUNTS) throw new HttpError(409, 'account_cap');

  // Same account under another login. Account numbers aren't secret, so while it is still live there it stays
  // there: another login can't switch off someone's protection by claiming their account. Once it has Ended
  // under the other login (or been removed there), it moves, and that login is told (SPEC §10.6).
  const { results: others } = await env.DB.prepare(
    'SELECT ta.*, u.email FROM trading_accounts ta JOIN users u ON u.id = ta.user_id WHERE ta.platform = ? AND ta.server_hash = ? AND ta.account_hash = ? AND ta.user_id != ? AND ta.removed_at IS NULL AND u.deleted_at IS NULL',
  ).bind(a.platform, serverHash, accountHash, userId).all<AccountRow & { email: string }>();
  if (others.some((o) => !isEnded(o, t))) throw new HttpError(409, 'account_taken');
  for (const o of others) {
    await env.DB.batch([
      env.DB.prepare('UPDATE trading_accounts SET removed_at = ? WHERE id = ?').bind(t, o.id),
      env.DB.prepare("INSERT INTO events (id, user_id, account_id, type, t, received_at, payload) VALUES (?, ?, ?, 'account_moved', ?, ?, ?)")
        .bind(randomId('ev_'), o.user_id, o.id, t, t, JSON.stringify({ last3: o.last3 })),
    ]);
    await audit(env, o.user_id, 'server', 'account_moved', { account: o.id });
    await sendEmail(
      env,
      o.email,
      `DisciplineGuard: account …${o.last3} was connected to another login`,
      `Account …${o.last3} was connected to another DisciplineGuard login. DisciplineGuard no longer protects it under your login.\n\nIf that wasn't you, sign in and check Devices: ${env.APP_URL}/devices\n\nDisciplineGuard`,
      ctx,
    );
    await accountMoved(env, o.user_id, o.last3);
  }

  const id = randomId('a_');
  await env.DB.prepare(
    `INSERT INTO trading_accounts (id, user_id, platform, server_hash, account_hash, last3, server_name, broker, currency, netting, is_demo, trade_allowed, created_at, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, userId, a.platform, serverHash, accountHash, last3, a.server.slice(0, 80), (a.broker ?? '').slice(0, 80) || null,
    (a.currency ?? '').slice(0, 8) || null, a.netting ? 1 : 0, a.demo ? 1 : 0, a.tradeAllowed === false ? 0 : 1, t, t,
  ).run();
  await audit(env, userId, 'server', 'account_connected', { account: id, platform: a.platform, last3 });
  const account = (await env.DB.prepare('SELECT * FROM trading_accounts WHERE id = ?').bind(id).first<AccountRow>())!;
  return { account, created: true };
}
