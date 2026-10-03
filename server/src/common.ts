// Email, rate limits, audit log and jobs.
import { now as clock, type Env } from './env.ts';
import { HttpError } from './http.ts';

export interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

/** Queues a transactional email and sends it through Resend when configured. */
export async function sendEmail(env: Env, to: string, subject: string, text: string, ctx?: Ctx): Promise<void> {
  const t = clock(env);
  const r = await env.DB.prepare('INSERT INTO outbox_email (to_email, subject, body, created_at) VALUES (?, ?, ?, ?)').bind(to, subject, text, t).run();
  const id = r.meta.last_row_id;
  if (!env.RESEND_KEY) return;
  const send = (async () => {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.RESEND_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: env.EMAIL_FROM ?? 'DisciplineGuard <hello@disciplineguard.com>', to, subject, text }),
      });
      await env.DB.prepare('UPDATE outbox_email SET sent_at = ?, error = ? WHERE id = ?').bind(clock(env), res.ok ? null : `http ${res.status}`, id).run();
    } catch (e) {
      await env.DB.prepare('UPDATE outbox_email SET error = ? WHERE id = ?').bind(String(e).slice(0, 200), id).run();
    }
  })();
  if (ctx) ctx.waitUntil(send);
  else await send;
}

/** Fixed-window rate limit. Throws 429 when `key` exceeded `limit` in the window. */
export async function rateLimit(env: Env, key: string, limit: number, windowMs: number, count = 1): Promise<void> {
  const t = clock(env);
  const w = Math.floor(t / windowMs) * windowMs;
  const row = await env.DB.prepare(
    'INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, ?) ON CONFLICT (key, window_start) DO UPDATE SET count = count + ? RETURNING count',
  ).bind(key, w, count, count).first<{ count: number }>();
  if (row && row.count > limit) throw new HttpError(429, 'rate_limited');
}

export async function audit(env: Env, userId: string | null, actor: string, action: string, detail?: unknown): Promise<void> {
  await env.DB.prepare('INSERT INTO audit_log (user_id, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, actor, action, detail === undefined ? null : JSON.stringify(detail), clock(env))
    .run();
}

export async function scheduleJob(env: Env, kind: string, key: string, runAt: number, payload?: unknown): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO jobs (kind, key, run_at, payload) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET run_at = excluded.run_at, payload = excluded.payload WHERE done_at IS NULL',
  ).bind(kind, key, runAt, payload === undefined ? null : JSON.stringify(payload)).run();
}

/** "Not you?" security email for every protected change (SPEC §10.9). */
export async function securityEmail(env: Env, to: string, what: string, req: Request | undefined, ctx?: Ctx): Promise<void> {
  const ua = req?.headers.get('user-agent') ?? 'unknown device';
  const when = new Date(clock(env)).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const body = `${what}\n\nWhen: ${when}\nDevice: ${ua.slice(0, 160)}\n\nNot you? Sign in and choose Account → Security → Sign out all web sessions: ${env.APP_URL}/account\n\nDisciplineGuard`;
  await sendEmail(env, to, 'DisciplineGuard: a change to your account', body, ctx);
}
