// Checkout, plan changes and the payment provider webhook (SPEC §12). Provider: Lemon Squeezy.
// Plan state is set only by signed webhooks; the calls below ask the provider and the webhook confirms.
import { DAY } from '@dg/core';
import { userCtx, type UserRow } from './context.ts';
import { audit, scheduleJob, sendEmail, type Ctx } from './common.ts';
import { hmac, safeEqual } from './crypto.ts';
import { dayRows, isKept } from './days.ts';
import { now as clock, type Env } from './env.ts';
import { body, HttpError, json } from './http.ts';
import { providerEnd } from './license.ts';

export type PlanKind = 'yearly' | 'monthly' | 'earlybird_yearly';

/** List prices in cents (SPEC §12.3). The provider charges them; these are for display. */
export const PRICES: Record<PlanKind, number> = { yearly: 9900, monthly: 1499, earlybird_yearly: 7900 };
export const REFUND_DAYS = 14;

const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

function planOf(v: unknown): PlanKind | null {
  return v === 'yearly' || v === 'monthly' || v === 'earlybird_yearly' ? v : null;
}

/** GET /api/plans: prices, the early-bird offer and the trader's own recap (EXPERIENCE §13.2). */
export async function plans(env: Env, user: UserRow): Promise<Response> {
  const t = clock(env);
  const uc = await userCtx(env, user.id, t);
  const from = user.first_on_at ?? user.created_at;
  const days = (await dayRows(env, uc, from, t + 1)).filter((d) => d.entries + d.pauses > 0);
  const pauses = await env.DB.prepare(
    "SELECT json_extract(payload, '$.decision') AS d, json_extract(payload, '$.title') AS title, COUNT(*) AS n FROM events WHERE user_id = ? AND type = 'pause' AND t >= ? GROUP BY d, title",
  ).bind(user.id, from).all<{ d: string; title: string; n: number }>();
  const byTitle = new Map<string, number>();
  for (const r of pauses.results) if (r.title && r.title !== 'CHECK') byTitle.set(r.title, (byTitle.get(r.title) ?? 0) + r.n);
  const top = [...byTitle].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return json({
    prices: PRICES,
    earlyBird: !!user.is_beta,
    current: user.plan_kind,
    recap: {
      pauses: pauses.results.reduce((a, r) => a + r.n, 0),
      skipped: pauses.results.filter((r) => r.d === 'skip' || r.d === 'timeout').reduce((a, r) => a + r.n, 0),
      daysTraded: days.length,
      daysKept: days.filter(isKept).length,
      topRule: top,
    },
  });
}

/** POST /api/checkout {plan}: the hosted checkout URL for this user. */
export async function checkoutUrl(req: Request, env: Env, user: UserRow): Promise<Response> {
  const b = await body(req);
  const plan = planOf(b.plan);
  if (!plan) throw new HttpError(400, 'bad_plan');
  if (plan === 'earlybird_yearly' && !user.is_beta) throw new HttpError(403, 'not_beta');
  if (user.plan_state === 'active' && user.provider_subscription_id) throw new HttpError(409, 'already_subscribed');
  const base = plan === 'earlybird_yearly' ? env.LS_CHECKOUT_EARLYBIRD : plan === 'yearly' ? env.LS_CHECKOUT_YEARLY : env.LS_CHECKOUT_MONTHLY;
  if (!base) throw new HttpError(503, 'checkout_not_configured');
  const u = new URL(base);
  u.searchParams.set('checkout[email]', user.email);
  u.searchParams.set('checkout[custom][user_id]', user.id);
  u.searchParams.set('checkout[custom][plan]', plan);
  return json({ url: u.toString() });
}

async function lemon(env: Env, method: 'PATCH' | 'DELETE', path: string, payload?: unknown): Promise<void> {
  if (!env.LS_API_KEY) throw new HttpError(503, 'billing_not_configured');
  const res = await fetch(`https://api.lemonsqueezy.com/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${env.LS_API_KEY}`, accept: 'application/vnd.api+json', 'content-type': 'application/vnd.api+json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  if (!res.ok) throw new HttpError(502, 'provider_error');
}

/** Cancels at the provider: the plan runs to the end of the paid period and never renews (SPEC §12.4). */
export async function cancelSubscription(env: Env, user: UserRow): Promise<void> {
  if (!user.provider_subscription_id || user.cancel_at_period_end) return;
  await lemon(env, 'DELETE', `/subscriptions/${user.provider_subscription_id}`);
  await env.DB.prepare('UPDATE users SET cancel_at_period_end = 1 WHERE id = ?').bind(user.id).run();
}

/** POST /api/plan/cancel: one confirm, no questions (EXPERIENCE §13.4). */
export async function cancelPlan(env: Env, user: UserRow, ctx: Ctx): Promise<Response> {
  if (!user.provider_subscription_id || user.plan_state !== 'active') throw new HttpError(409, 'no_plan');
  await cancelSubscription(env, user);
  const uc = await userCtx(env, user.id, clock(env));
  await audit(env, user.id, 'user', 'plan_cancelled');
  await sendEmail(env, user.email, 'DisciplineGuard: plan cancelled', `Your plan is cancelled. You won't be charged again. Protection stays on until ${new Date(uc.license.validUntil).toUTCString()}. Your rules are saved for 90 days after that.\n\nDisciplineGuard`, ctx);
  return json({ until: uc.license.validUntil });
}

/** POST /api/plan/change {plan}: monthly ↔ yearly. The early-bird price ends when switching to monthly (SPEC §12.3). */
export async function changePlan(req: Request, env: Env, user: UserRow): Promise<Response> {
  const plan = planOf((await body(req)).plan);
  if (plan !== 'monthly' && plan !== 'yearly') throw new HttpError(400, 'bad_plan');
  if (!user.provider_subscription_id || user.plan_state !== 'active') throw new HttpError(409, 'no_plan');
  if (user.plan_kind === plan || (plan === 'yearly' && user.plan_kind === 'earlybird_yearly')) return json({ ok: true, same: true });
  const variant = plan === 'monthly' ? env.LS_VARIANT_MONTHLY : env.LS_VARIANT_YEARLY;
  if (!variant) throw new HttpError(503, 'billing_not_configured');
  await lemon(env, 'PATCH', `/subscriptions/${user.provider_subscription_id}`, {
    data: { type: 'subscriptions', id: user.provider_subscription_id, attributes: { variant_id: Number(variant), cancelled: false } },
  });
  await env.DB.prepare('UPDATE users SET plan_kind = ?, cancel_at_period_end = 0 WHERE id = ?').bind(plan, user.id).run();
  await audit(env, user.id, 'user', 'plan_changed', { plan });
  return json({ ok: true });
}

/** POST /api/plan/refund: within 14 days of the first payment, a full refund on request (SPEC §12.4). */
export async function requestRefund(env: Env, user: UserRow, ctx: Ctx): Promise<Response> {
  const t = clock(env);
  if (!user.first_paid_at || t - user.first_paid_at > REFUND_DAYS * DAY) throw new HttpError(409, 'refund_window');
  await audit(env, user.id, 'user', 'refund_requested');
  const owners = (env.OWNER_EMAILS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  for (const o of owners) await sendEmail(env, o, 'Refund request', `Refund ${user.email} in full (first payment ${new Date(user.first_paid_at).toISOString()}, subscription ${user.provider_subscription_id ?? '-'}).`, ctx);
  await sendEmail(env, user.email, 'DisciplineGuard: refund requested', "We got your refund request. The full amount goes back to your card within a few days, and you won't be charged again.\n\nDisciplineGuard", ctx);
  return json({ ok: true });
}

interface LsEvent {
  meta: { event_name: string; custom_data?: { user_id?: string; plan?: string }; webhook_id?: string };
  data: { id: string; type: string; attributes: Record<string, any> };
}

const ms = (s: unknown) => (typeof s === 'string' ? Date.parse(s) : NaN);

/** The plan a subscription is on: its variant when known, since a plan change keeps the checkout's custom data. */
function planFromEvent(env: Env, a: Record<string, any>, custom: string | undefined, fallback: string | null): string {
  const v = a.variant_id !== undefined ? String(a.variant_id) : '';
  if (v && v === env.LS_VARIANT_MONTHLY) return 'monthly';
  if (v && v === env.LS_VARIANT_YEARLY) return 'yearly';
  return custom ?? fallback ?? 'yearly';
}

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
  if (name.startsWith('subscription_') && ev.data.type === 'subscriptions') {
    const plan = planFromEvent(env, a, ev.meta.custom_data?.plan, uc.user.plan_kind);
    const status = String(a.status);
    const renews = ms(a.renews_at);
    const ends = ms(a.ends_at);
    const periodEnd = Number.isFinite(ends) ? ends : renews;
    const portal = typeof a.urls?.customer_portal === 'string' ? a.urls.customer_portal : null;
    const card = typeof a.urls?.update_payment_method === 'string' ? a.urls.update_payment_method : null;
    await env.DB.prepare('UPDATE users SET portal_url = COALESCE(?, portal_url), update_card_url = COALESCE(?, update_card_url) WHERE id = ?').bind(portal, card, userId).run();
    if (status === 'active' || status === 'on_trial' || status === 'cancelled') {
      await env.DB.prepare(
        "UPDATE users SET plan_state = 'active', plan_kind = ?, paid_until = ?, past_due_since = NULL, provider_customer_id = ?, provider_subscription_id = ?, cancel_at_period_end = ?, first_paid_at = COALESCE(first_paid_at, ?) WHERE id = ?",
      ).bind(plan, Number.isFinite(periodEnd) ? periodEnd : null, a.customer_id ? String(a.customer_id) : null, ev.data.id, status === 'cancelled' ? 1 : 0, t, userId).run();
      // Yearly renewal reminder, 30 days before (SPEC §12.7).
      if (status === 'active' && plan !== 'monthly' && Number.isFinite(renews)) {
        await scheduleJob(env, 'renewal_reminder', `renewal:${userId}:${renews}`, renews - 30 * DAY, { userId, renews, plan });
      }
    } else if (status === 'past_due' || status === 'unpaid') {
      await env.DB.prepare("UPDATE users SET plan_state = 'past_due', past_due_since = COALESCE(past_due_since, ?) WHERE id = ?").bind(t, userId).run();
      if (name === 'subscription_payment_failed' || status === 'past_due') {
        await sendEmail(env, uc.user.email, 'DisciplineGuard: payment failed', `Your payment failed. Update your card: ${card ?? `${env.APP_URL}/account`}\n\nProtection stays on for 3 days.\n\nDisciplineGuard`, ctx);
      }
    } else if (status === 'expired') {
      await env.DB.prepare("UPDATE users SET plan_state = 'ended', paid_until = ? WHERE id = ?").bind(Number.isFinite(ends) ? ends : t, userId).run();
      await sendEmail(env, uc.user.email, 'DisciplineGuard: plan ended', `Your plan ended. You're on the free plan now: protection stays on for 1 account. Plans: ${env.APP_URL}/plans\n\nDisciplineGuard`, ctx);
    }
  }
  if (name === 'subscription_payment_refunded' || name === 'order_refunded') {
    // Protection stays until max(next reset, event + 12 h) (SPEC §12.2, SUB-06).
    await env.DB.prepare('UPDATE users SET provider_end_at = ? WHERE id = ?').bind(providerEnd(uc.userResets, t), userId).run();
  }
  await audit(env, userId, 'provider', name, { status: a.status ?? null });
  return json({ ok: true });
}

/** The renewal reminder job: the date, the price, and how to cancel (EXPERIENCE §13.3). */
export async function renewalReminder(env: Env, p: { userId: string; renews: number; plan: PlanKind }, ctx: Ctx): Promise<void> {
  const u = await env.DB.prepare('SELECT email, plan_state, cancel_at_period_end, paid_until FROM users WHERE id = ? AND deleted_at IS NULL').bind(p.userId).first<any>();
  if (!u || u.plan_state !== 'active' || u.cancel_at_period_end || u.paid_until !== p.renews) return;
  const date = new Date(p.renews).toUTCString().slice(0, 16);
  await sendEmail(env, u.email, 'DisciplineGuard: your plan renews in 30 days', `Your plan renews on ${date} at ${usd(PRICES[p.plan] ?? PRICES.yearly)} a year. To cancel, one click: ${env.APP_URL}/account#plan\n\nDisciplineGuard`, ctx);
}
