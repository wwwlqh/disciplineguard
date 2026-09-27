// Worker entry: API routes, the web app's static files, and the cron trigger.
import { linkInfo, requestSignIn, signOut, verifySignIn } from './auth.ts';
import { lemonWebhook } from './billing.ts';
import { desktopToken, registerTerminal } from './desktop.ts';
import type { Ctx } from './common.ts';
import type { Env } from './env.ts';
import { HttpError, json } from './http.ts';
import { runScheduled } from './jobs.ts';
import { baseline, sync } from './sync.ts';
import { webApi } from './web.ts';

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

type Route = (req: Request, env: Env, ctx: Ctx) => Promise<Response>;

const API: Record<string, Route> = {
  'POST /v1/auth/email': requestSignIn,
  'POST /v1/auth/link-info': linkInfo,
  'POST /v1/auth/verify': verifySignIn,
  'POST /v1/auth/signout': signOut,
  'POST /v1/auth/desktop': desktopToken,
  'POST /v1/desktop/terminals': registerTerminal,
  'POST /v1/sync': sync,
  'POST /v1/baseline': baseline,
  'POST /v1/webhooks/lemonsqueezy': lemonWebhook,
  'GET /v1/pubkey': async (_r, env) => json({ ed25519: env.SIGNING_PUB }),
  'GET /v1/health': async () => json({ ok: true }),
};

function withHeaders(res: Response): Response {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!r.headers.has(k)) r.headers.set(k, v);
  return r;
}

export async function handle(req: Request, env: Env, ctx: Ctx): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  try {
    const route = API[`${req.method} ${path}`];
    if (route) return withHeaders(await route(req, env, ctx));
    if (path.startsWith('/api/')) return withHeaders(await webApi(req, env, ctx));
    if (path.startsWith('/v1/')) throw new HttpError(404, 'not_found');
    if (env.ASSETS) {
      const res = await env.ASSETS.fetch(req);
      if (res.status !== 404) return withHeaders(res);
      // SPA fallback.
      return withHeaders(await env.ASSETS.fetch(new Request(new URL('/index.html', url), req)));
    }
    return withHeaders(new Response('Not found', { status: 404 }));
  } catch (e) {
    if (e instanceof HttpError) return withHeaders(json({ error: e.code, message: e.message !== e.code ? e.message : undefined }, e.status));
    // Never log request bodies or query strings (SPEC §10.9).
    console.log(JSON.stringify({ path, error: String(e).slice(0, 300) }));
    return withHeaders(json({ error: 'server_error' }, 500));
  }
}

export default {
  fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    return handle(req, env, ctx);
  },
  async scheduled(_event: unknown, env: Env, ctx: Ctx): Promise<void> {
    await runScheduled(env, ctx);
  },
};
