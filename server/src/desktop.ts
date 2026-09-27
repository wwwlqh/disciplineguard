// The DisciplineGuard Windows app: sign-in with "Allow" in the browser, then one connection per
// MT terminal the trader ticked (SPEC §9.5). There are no pairing codes.
import { accountHashes, registerAccount } from './accounts.ts';
import { audit, rateLimit, securityEmail, type Ctx } from './common.ts';
import { userCtx, type UserRow } from './context.ts';
import { maskEmail, randomId, sha256, token } from './crypto.ts';
import { now as clock, type Env } from './env.ts';
import { body, clientIp, HttpError, json, str } from './http.ts';

const CODE_TTL = 2 * 60_000;

/**
 * POST /api/desktop/allow {challenge, name}: the trader pressed Allow in the web app.
 * Returns a single-use code that the page hands to the app's loopback address (RFC 8252). Only the
 * app holding the PKCE verifier for `challenge` can exchange it, so a forwarded link is useless.
 */
export async function allowDesktop(req: Request, env: Env, user: UserRow): Promise<Response> {
  const b = await body(req);
  const challenge = str(b.challenge, 64);
  if (!/^[0-9a-f]{64}$/.test(challenge)) throw new HttpError(400, 'bad_challenge');
  const name = str(b.name, 60).trim() || 'Windows';
  const code = token(24);
  const t = clock(env);
  await env.DB.prepare('INSERT INTO desktop_codes (code_hash, user_id, challenge, name, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256(code), user.id, challenge, name, t + CODE_TTL)
    .run();
  return json({ code });
}

/** POST /v1/auth/desktop {code, verifier, version}: the app exchanges the code for its own token. */
export async function desktopToken(req: Request, env: Env, ctx: Ctx): Promise<Response> {
  await rateLimit(env, `desktop:ip:${clientIp(req)}`, 30, 3600_000);
  const b = await body(req);
  const t = clock(env);
  const hash = await sha256(str(b.code, 100));
  const row = await env.DB.prepare('SELECT * FROM desktop_codes WHERE code_hash = ?').bind(hash).first<any>();
  if (!row || row.used_at || row.expires_at < t || row.challenge !== (await sha256(str(b.verifier, 200)))) throw new HttpError(400, 'code_invalid');
  const used = await env.DB.prepare('UPDATE desktop_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL').bind(t, hash).run();
  if (used.meta.changes !== 1) throw new HttpError(400, 'code_invalid');
  const user = (await env.DB.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').bind(row.user_id).first<UserRow>())!;
  if (!user) throw new HttpError(400, 'code_invalid');
  const appToken = token(32);
  const id = randomId('d_');
  await env.DB.prepare('INSERT INTO desktop_installs (id, user_id, token_hash, name, version, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, user.id, await sha256(appToken), row.name, typeof b.version === 'string' ? b.version.slice(0, 20) : null, t, t)
    .run();
  await audit(env, user.id, 'user', 'desktop_allowed', { desktop: id });
  await securityEmail(env, user.email, `DisciplineGuard for Windows was allowed on ${row.name}.`, req, ctx);
  return json({ token: appToken, email: maskEmail(user.email) });
}

async function requireDesktop(req: Request, env: Env): Promise<{ id: string; user: UserRow; name: string }> {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.get('authorization') ?? '');
  if (!m) throw new HttpError(401, 'signed_out');
  const d = await env.DB.prepare('SELECT id, user_id, name, revoked_at FROM desktop_installs WHERE token_hash = ?').bind(await sha256(m[1])).first<any>();
  if (!d || d.revoked_at) throw new HttpError(401, 'signed_out');
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').bind(d.user_id).first<UserRow>();
  if (!user) throw new HttpError(401, 'signed_out');
  await env.DB.prepare('UPDATE desktop_installs SET last_seen = ? WHERE id = ?').bind(clock(env), d.id).run();
  return { id: d.id, user, name: d.name };
}

/**
 * POST /v1/desktop/terminals {terminalId, kind, server, login, broker, currency, netting, demo, build, version}:
 * the EA on a terminal the trader ticked reported in through the bridge. Registers its account and returns a
 * device token for that terminal. Calling it again for the same terminal rotates the token.
 */
export async function registerTerminal(req: Request, env: Env, ctx: Ctx): Promise<Response> {
  const d = await requireDesktop(req, env);
  const b = await body(req);
  const terminalId = str(b.terminalId, 64);
  if (!/^[0-9A-Za-z_-]{4,64}$/.test(terminalId)) throw new HttpError(400, 'bad_terminal');
  const kind = b.kind === 'mt4' ? 'mt4' : 'mt5';
  const server = str(b.server ?? '', 80);
  const login = str(typeof b.login === 'number' ? String(b.login) : b.login, 32);
  if (!login) throw new HttpError(400, 'no_account');
  const t = clock(env);
  const build = typeof b.build === 'string' ? b.build.slice(0, 64).toLowerCase() : null;
  const version = typeof b.version === 'string' ? b.version.slice(0, 20) : null;
  const hashes = await accountHashes(env, { platform: kind, server, login });
  const lic = (await userCtx(env, d.user.id, t)).license.state;
  const { account } = await registerAccount(env, d.user.id, lic === 'active' || lic === 'past_due', {
    platform: kind, server, hashes, broker: typeof b.broker === 'string' ? b.broker.slice(0, 80) : undefined,
    netting: !!b.netting, currency: typeof b.currency === 'string' ? b.currency.slice(0, 8) : undefined, demo: !!b.demo,
  }, ctx);
  const deviceToken = token(32);
  const existing = await env.DB.prepare('SELECT id FROM connections WHERE desktop_id = ? AND install_id = ? AND removed_at IS NULL').bind(d.id, terminalId).first<{ id: string }>();
  const connId = existing?.id ?? randomId('c_');
  const name = `${kind.toUpperCase()} · ${server} …${hashes.last3}`;
  if (existing) {
    await env.DB.prepare('UPDATE connections SET token_hash = ?, version = ?, build_hash = ? WHERE id = ?').bind(await sha256(deviceToken), version, build, connId).run();
  } else {
    await env.DB.prepare('INSERT INTO connections (id, user_id, kind, token_hash, desktop_id, install_id, version, build_hash, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(connId, d.user.id, kind, await sha256(deviceToken), d.id, terminalId, version, build, name, t)
      .run();
    await audit(env, d.user.id, 'user', 'device_connected', { connection: connId, desktop: d.id });
    await securityEmail(env, d.user.email, `${name} was connected from ${d.name}.`, req, ctx);
  }
  await env.DB.prepare('INSERT OR IGNORE INTO seen_by (connection_id, account_id, first_seen, last_seen) VALUES (?, ?, ?, ?)').bind(connId, account.id, t, t).run();
  const known = build !== null && (env.KNOWN_BUILDS ?? '').toLowerCase().split(',').map((s) => s.trim()).includes(build);
  return json({ token: deviceToken, connectionId: connId, knownBuild: known });
}
