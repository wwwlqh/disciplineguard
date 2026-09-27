// Email sign-in with a link and a 6-digit code (SPEC §10.9), and web sessions.
import { digits6, maskEmail, normalizeEmail, randomBytes, randomId, sha256, token } from './crypto.ts';
import { audit, rateLimit, sendEmail, type Ctx } from './common.ts';
import type { UserRow } from './context.ts';
import { now as clock, type Env } from './env.ts';
import { body, clientIp, getCookie, HttpError, json, str } from './http.ts';

export const SESSION_COOKIE = 'dg_s';
const CODE_TTL = 15 * 60_000;
const SESSION_TTL = 60 * 24 * 3600_000;

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

async function turnstileOk(env: Env, tokenValue: unknown, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true;
  if (typeof tokenValue !== 'string') return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', tokenValue);
  form.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  return ((await r.json()) as { success: boolean }).success === true;
}

/** POST /v1/auth/email */
export async function requestSignIn(req: Request, env: Env, ctx: Ctx): Promise<Response> {
  const b = await body(req);
  const email = str(b.email, 254).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'bad_email');
  const ip = clientIp(req);
  if (!(await turnstileOk(env, b.turnstile, ip))) throw new HttpError(400, 'bot_check');
  await rateLimit(env, `signin:email:${email}`, 3, 3600_000);
  await rateLimit(env, `signin:ip:${ip}`, 10, 3600_000);
  const code = digits6();
  const link = token(24);
  const id = randomId('lc_');
  const t = clock(env);
  const nonce = typeof b.nonce === 'string' ? b.nonce.slice(0, 100) : null;
  await env.DB.prepare('INSERT INTO login_codes (id, email, code_hash, link_hash, browser_nonce_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, email, await sha256(`${id}:${code}`), await sha256(link), nonce ? await sha256(nonce) : null, t + CODE_TTL, t)
    .run();
  const url = `${env.APP_URL}/signin#t=${link}`;
  await sendEmail(
    env,
    email,
    `Your DisciplineGuard code: ${code}`,
    `Your sign-in code is ${code}\n\nOr open this link to sign in: ${url}\n\nThe code and link work once and expire in 15 minutes. If you didn't ask for this, ignore this email.\n\nDisciplineGuard`,
    ctx,
  );
  return json({ ok: true, id });
}

/** POST /v1/auth/link-info {token, nonce}: who the link signs in, and whether this browser asked for it. */
export async function linkInfo(req: Request, env: Env): Promise<Response> {
  const b = await body(req);
  const row = await env.DB.prepare('SELECT * FROM login_codes WHERE link_hash = ?').bind(await sha256(str(b.token, 100))).first<any>();
  if (!row || row.used_at || row.expires_at < clock(env)) throw new HttpError(400, 'link_invalid');
  const same = typeof b.nonce === 'string' && row.browser_nonce_hash === (await sha256(b.nonce));
  return json({ email: maskEmail(row.email), sameBrowser: same });
}

async function createUser(env: Env, email: string, country: string | null): Promise<UserRow> {
  const norm = normalizeEmail(email);
  const prior = await env.DB.prepare('SELECT 1 FROM users WHERE email_norm = ? LIMIT 1').bind(norm).first();
  const b = randomBytes(4);
  const magic = 700_000_000 + ((((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0) % 100_000_000);
  const id = randomId('u_');
  const t = clock(env);
  await env.DB.prepare(
    'INSERT INTO users (id, email, email_norm, created_at, magic, analytics_id, country, trial_eligible) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(id, email, norm, t, magic, randomId('an_'), country, prior ? 0 : 1).run();
  await audit(env, id, 'user', 'signup');
  return (await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>())!;
}

/** POST /v1/auth/verify {email, code} or {token}. Creates the user on first sign-in. */
export async function verifySignIn(req: Request, env: Env): Promise<Response> {
  const b = await body(req);
  const t = clock(env);
  let row: any;
  if (typeof b.token === 'string') {
    row = await env.DB.prepare('SELECT * FROM login_codes WHERE link_hash = ?').bind(await sha256(str(b.token, 100))).first();
  } else {
    const email = str(b.email, 254).trim().toLowerCase();
    const code = str(b.code, 12).replace(/\s/g, '');
    await rateLimit(env, `verify:ip:${clientIp(req)}`, 30, 3600_000);
    const candidates = await env.DB.prepare('SELECT * FROM login_codes WHERE email = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 3')
      .bind(email, t)
      .all<any>();
    for (const c of candidates.results) {
      if (c.attempts >= 5) continue;
      if (c.code_hash === (await sha256(`${c.id}:${code}`))) {
        row = c;
        break;
      }
      await env.DB.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?').bind(c.id).run();
    }
  }
  if (!row || row.used_at || row.expires_at < t) throw new HttpError(400, 'code_invalid');
  const used = await env.DB.prepare('UPDATE login_codes SET used_at = ? WHERE id = ? AND used_at IS NULL').bind(t, row.id).run();
  if (used.meta.changes !== 1) throw new HttpError(400, 'code_invalid');

  const { isNew, cookie } = await signInAs(req, env, row.email);
  return json({ ok: true, isNew }, 200, { 'set-cookie': cookie });
}

/** Signs in the user with this (verified) email, creating them on first sign-in. Returns the session cookie. */
export async function signInAs(req: Request, env: Env, email: string): Promise<{ isNew: boolean; cookie: string }> {
  const t = clock(env);
  let user = await env.DB.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first<UserRow>();
  const isNew = !user;
  if (!user) user = await createUser(env, email, req.headers.get('cf-ipcountry'));
  const session = token(32);
  await env.DB.prepare('INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen, user_agent) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(randomId('s_'), user.id, await sha256(session), t, t, (req.headers.get('user-agent') ?? '').slice(0, 200))
    .run();
  return { isNew, cookie: sessionCookie(env, session, SESSION_TTL) };
}

export function sessionCookie(env: Env, value: string, maxAgeMs: number): string {
  const secure = env.DEV === '1' ? '' : '; Secure';
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure}`;
}

export interface Session {
  user: UserRow;
  sessionId: string;
  /** When this session signed in: export needs one in the last 10 minutes (SPEC §10.9). */
  signedInAt: number;
}

/** Resolves the web session. Mutating calls must carry the X-DG header (CSRF, with SameSite=Lax). */
export async function requireSession(req: Request, env: Env): Promise<Session> {
  const v = getCookie(req, SESSION_COOKIE);
  if (!v) throw new HttpError(401, 'signed_out');
  if (req.method !== 'GET' && req.headers.get('x-dg') !== '1') throw new HttpError(403, 'csrf');
  const s = await env.DB.prepare('SELECT id, user_id, created_at, revoked_at FROM sessions WHERE token_hash = ?').bind(await sha256(v)).first<any>();
  const t = clock(env);
  if (!s || s.revoked_at || s.created_at + SESSION_TTL < t) throw new HttpError(401, 'signed_out');
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(s.user_id).first<UserRow>();
  if (!user || user.deleted_at) throw new HttpError(401, 'signed_out');
  await env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE id = ? AND last_seen < ?').bind(t, s.id, t - 60_000).run();
  return { user, sessionId: s.id, signedInAt: s.created_at };
}

export async function signOut(req: Request, env: Env): Promise<Response> {
  const v = getCookie(req, SESSION_COOKIE);
  if (v) await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?').bind(clock(env), await sha256(v)).run();
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(env, '', 0) });
}

export function isOwner(env: Env, user: UserRow): boolean {
  return (env.OWNER_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(user.email.toLowerCase());
}
