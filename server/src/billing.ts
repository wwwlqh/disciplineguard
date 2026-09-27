// Hosted checkout and the payment provider webhook (SPEC §12, PHASES "Early-bird checkout").
// Provider: Lemon Squeezy (PHASE0 §4). Plan state is set only by signed webhooks.
import { userCtx, type UserRow } from './context.ts';
import { audit, sendEmail, type Ctx } from './common.ts';
import { hmac, safeEqual } from './crypto.ts';
import { now as clock, type Env } from './env.ts';
import { body, HttpError, json } from './http.ts';
import { providerEnd } from './license.ts';

/** POST /api/checkout {plan}: the hosted checkout URL for this user. Phase 1A offers only the early-bird yearly plan. */
export async function checkoutUrl(req: Request, env: Env, user: UserRow): Promise<Response> {
  const b = await body(req);
  const plan = b.plan === 'monthly' ? 'monthly' : b.plan === 'yearly' ? 'yearly' : 'earlybird_yearly';
  const base = plan === 'earlybird_yearly' ? env.LS_CHECKOUT_EARLYBIRD : plan === 'yearly' ? env.LS_CHECKOUT_YEARLY : env.LS_CHECKOUT_MONTHLY;
  if (!base) throw new HttpError(503, 'checkout_not_configured');
  if (plan === 'earlybird_yearly' && !user.is_beta) throw new HttpError(403, 'not_beta');
  const u = new URL(base);
  u.searchParams.set('checkout[email]', user.email);
  u.searchParams.set('checkout[custom][user_id]', user.id);
  u.searchParams.set('checkout[custom][plan]', plan);
  return json({ url: u.toString() });
}

interface LsEvent {
  meta: { event_name: string; custom_data?: { user_id?: string; plan?: string }; webhook_id?: string };
  data: { id: string; type: string; attributes: Record<string, any> };
}

const ms = (s: unknown) => (typeof s === 'string' ? Date.parse(s) : NaN);

/** POST /v1/webhooks/lemonsqueezy. Signature: HMAC-SHA256 of the raw body with the signing secret. */
export async function lemonWebhook(req: Request, env: Env, ctx: Ctx): Promise<Response> {
  if (!env.LS_WEBHOOK_SECRET) throw new HttpError(503, 'not_configured');
  const raw = await req.text();
  const sig = req.headers.get('x-signature') ?? '';
  if (!safeEqual(await hmac(env.LS_WEBHOOK_SECRET, raw), sig.toLowerCase())) throw new HttpError(401, 'bad_signature');
  const ev = JSON.parse(raw) as LsEvent;
  const name = ev.meta.event_name;
  const a = ev.data.attributes ?? {};
  const t = clock(env);
  const eventKey = `${name}:${ev.data.id}:${a.updated_at ?? a.created_at ?? ''}`;
  const dup = await env.DB.prepare('SELECT 1 FROM payments WHERE id = ?').bind(eventKey).first();
  if (dup) return json({ ok: true, duplicate: true });

  let userId = ev.meta.custom_data?.user_id;
  if (!userId && a.customer_id) {
    const u = await env.DB.prepare('SELECT id FROM users WHERE provider_customer_id = ?').bind(String(a.customer_id)).first<{ id: string }>();
    userId = u?.id;
  }
  if (!userId && typeof a.user_email === 'string') {
    const u = await env.DB.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL').bind(a.user_email.toLowerCase()).first<{ id: string }>();
    userId = u?.id;
  }
  await env.DB.prepare('INSERT INTO payments (id, user_id, type, amount_cents, currency, country, plan_kind, created_at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(eventKey, userId ?? null, name, typeof a.total === 'number' ? a.total : typeof a.subtotal === 'number' ? a.subtotal : null, a.currency ?? null,
      a.user_country ?? a.country ?? null, ev.meta.custom_data?.plan ?? null, t, JSON.stringify({ status: a.status, variant: a.variant_name ?? null }))
    .run();
  if (!userId) return json({ ok: true, unmatched: true });

  const uc = await userCtx(env, userId, t);
  const plan = ev.meta.custom_data?.plan ?? uc.user.plan_kind ?? 'yearly';
  if (name.startsWith('subscription_') && ev.data.type === 'subscriptions') {
    const status = String(a.status);
    const renews = ms(a.renews_at);
    const ends = ms(a.ends_at);
    const periodEnd = Number.isFinite(ends) ? ends : renews;
    if (status === 'active' || status === 'on_trial' || status === 'cancelled') {
      await env.DB.prepare(
        "UPDATE users SET plan_state = 'active', plan_kind = ?, paid_until = ?, past_due_since = NULL, provider_customer_id = ?, provider_subscription_id = ?, cancel_at_period_end = ? WHERE id = ?",
      ).bind(plan, Number.isFinite(periodEnd) ? periodEnd : null, a.customer_id ? String(a.customer_id) : null, ev.data.id, status === 'cancelled' ? 1 : 0, userId).run();
    } else if (status === 'past_due' || status === 'unpaid') {
      await env.DB.prepare("UPDATE users SET plan_state = 'past_due', past_due_since = COALESCE(past_due_since, ?) WHERE id = ?").bind(t, userId).run();
      if (name === 'subscription_payment_failed' || status === 'past_due') {
        await sendEmail(env, uc.user.email, 'DisciplineGuard: payment failed', `Your payment failed. Update your card in Account → Plan: ${env.APP_URL}/account\n\nProtection stays on for 3 days.\n\nDisciplineGuard`, ctx);
      }
    } else if (status === 'expired') {
      await env.DB.prepare("UPDATE users SET plan_state = 'ended', paid_until = ? WHERE id = ?").bind(Number.isFinite(ends) ? ends : t, userId).run();
    }
  }
  if (name === 'subscription_payment_refunded' || name === 'order_refunded') {
    // Protection stays until max(next reset, event + 12 h) (SPEC §12.2, SUB-06).
    await env.DB.prepare('UPDATE users SET provider_end_at = ? WHERE id = ?').bind(providerEnd(uc.userResets, t), userId).run();
  }
  await audit(env, userId, 'provider', name, { status: a.status ?? null });
  return json({ ok: true });
}
