// "Continue with Google" (PHASES.md Phase 2): OAuth with PKCE. The code is exchanged with Google directly, and a
// verified Google email signs in (or creates) the same user the email code would. Off until GOOGLE_CLIENT_ID and
// GOOGLE_CLIENT_SECRET are set.
import { signInAs } from './auth.ts';
import { rateLimit } from './common.ts';
import { b64url, token } from './crypto.ts';
import { now as clock, type Env } from './env.ts';
import { clientIp, getCookie, json } from './http.ts';

const COOKIE = 'dg_g';
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

const on = (env: Env) => !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;
const callback = (env: Env) => `${env.APP_URL}/v1/auth/google/callback`;

/** Only a path on this site: never another origin. */
function safeNext(v: string | null | undefined): string {
  return v && /^\/(?![/\\])[\w\-./?=&%#]*$/.test(v) ? v : '/today';
}

function cookie(env: Env, value: string, maxAgeSec: number): string {
  return `${COOKIE}=${value}; Path=/v1/auth/google; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${env.DEV === '1' ? '' : '; Secure'}`;
}

function redirect(location: string, cookies: string[]): Response {
  const h = new Headers({ location, 'cache-control': 'no-store' });
  for (const c of cookies) h.append('set-cookie', c);
  return new Response(null, { status: 302, headers: h });
}

/** GET /v1/auth/options: which sign-in methods the sign-in page shows. */
export async function authOptions(_req: Request, env: Env): Promise<Response> {
  return json({ google: on(env) });
}

/** GET /v1/auth/google?next=/allow?... : off to Google's account chooser. */
export async function googleStart(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (!on(env)) return redirect(`${env.APP_URL}/signin`, []);
  await rateLimit(env, `google:ip:${clientIp(req)}`, 30, 3600_000);
  const state = token(24);
  const verifier = token(32);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const next = safeNext(url.searchParams.get('next'));
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!, redirect_uri: callback(env), response_type: 'code', scope: 'openid email',
    state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
  });
  return redirect(`${AUTH}?${q}`, [cookie(env, encodeURIComponent(JSON.stringify({ state, verifier, next })), 600)]);
}

/** GET /v1/auth/google/callback?code&state: back from Google. Any failure returns to the sign-in page. */
export async function googleCallback(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const clear = cookie(env, '', 0);
  const fail = redirect(`${env.APP_URL}/signin?google=failed`, [clear]);
  if (!on(env)) return fail;
  let saved: { state?: string; verifier?: string; next?: string };
  try {
    saved = JSON.parse(getCookie(req, COOKIE) ?? '{}');
  } catch {
    return fail;
  }
  const code = url.searchParams.get('code');
  if (!code || !saved.state || !saved.verifier || url.searchParams.get('state') !== saved.state) return fail;
  const r = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, redirect_uri: callback(env),
      grant_type: 'authorization_code', code_verifier: saved.verifier,
    }),
  }).catch(() => null);
  if (!r?.ok) return fail;
  // The ID token came straight from Google's token endpoint over TLS, so its claims are read without re-checking the
  // signature (Google's guidance for this flow). Audience, issuer, expiry and a verified email are still required.
  let claims: { aud?: string; iss?: string; exp?: number; email?: string; email_verified?: boolean | string };
  try {
    const idToken = ((await r.json()) as { id_token?: string }).id_token ?? '';
    claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))));
  } catch {
    return fail;
  }
  const verified = claims.email_verified === true || claims.email_verified === 'true';
  if (claims.aud !== env.GOOGLE_CLIENT_ID || !ISSUERS.has(claims.iss ?? '') || !verified || typeof claims.email !== 'string') return fail;
  if (!claims.exp || claims.exp * 1000 < clock(env) - 60_000) return fail;
  const email = claims.email.trim().toLowerCase();
  if (email.length > 254) return fail;
  const { cookie: session } = await signInAs(req, env, email);
  return redirect(`${env.APP_URL}${safeNext(saved.next)}`, [clear, session]);
}
