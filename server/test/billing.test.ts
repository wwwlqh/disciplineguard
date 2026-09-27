// Checkout, plan changes and the webhook (SPEC §12).
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DAY } from '@dg/core';
import { runScheduled } from '../src/jobs.ts';
import { World } from './harness.ts';

const ENV = {
  LS_CHECKOUT_YEARLY: 'https://s.lemonsqueezy.com/buy/y', LS_CHECKOUT_MONTHLY: 'https://s.lemonsqueezy.com/buy/m',
  LS_API_KEY: 'lskey', LS_VARIANT_MONTHLY: '11', LS_VARIANT_YEARLY: '22',
};

async function subscribed(plan = 'yearly') {
  const w = new World(ENV);
  const web = await w.signIn('a@b.co');
  await web.connect();
  const userId = (w.db.db.prepare('SELECT id FROM users').get() as any).id;
  let n = 0;
  const send = async (event: string, attrs: object, custom = plan) => {
    const raw = JSON.stringify({ meta: { event_name: event, custom_data: { user_id: userId, plan: custom } }, data: { id: 'sub_1', type: 'subscriptions', attributes: { updated_at: String(++n), ...attrs } } });
    return w.call('POST', '/v1/webhooks/lemonsqueezy', raw, { 'x-signature': createHmac('sha256', 'whsec').update(raw).digest('hex') });
  };
  await send('subscription_created', {
    status: 'active', renews_at: '2027-10-05T10:00:00Z', customer_id: 1,
    urls: { customer_portal: 'https://portal.test/p', update_payment_method: 'https://portal.test/card' },
  });
  return { w, web, send };
}

afterEach(() => vi.unstubAllGlobals());

describe('plans (SPEC §12)', () => {
  it('opens checkout for monthly and yearly; early-bird only for beta users', async () => {
    const w = new World(ENV);
    const web = await w.signIn('a@b.co');
    const m = await web.send('POST', '/api/checkout', { plan: 'monthly' });
    expect(new URL(m.data.url).searchParams.get('checkout[custom][plan]')).toBe('monthly');
    expect((await web.send('POST', '/api/checkout', { plan: 'yearly' })).data.url).toMatch(/^https:\/\/s\.lemonsqueezy\.com\/buy\/y/);
    w.db.db.prepare('UPDATE users SET is_beta = 0').run();
    expect((await web.send('POST', '/api/checkout', { plan: 'earlybird_yearly' })).status).toBe(403);
    const p = (await web.get('/api/plans')).data;
    expect(p).toMatchObject({ prices: { yearly: 9900, monthly: 1499 }, earlyBird: false });
  });

  it('stores the billing links, and offers a refund only within 14 days of the first payment', async () => {
    const { w, web } = await subscribed();
    let me = (await web.get('/api/me')).data;
    expect(me.user).toMatchObject({ portalUrl: 'https://portal.test/p', updateCardUrl: 'https://portal.test/card', refundable: true });
    expect((await web.send('POST', '/api/checkout', { plan: 'monthly' })).status).toBe(409);
    expect((await web.send('POST', '/api/plan/refund')).status).toBe(200);
    expect(w.outbox().some((m) => m.subject === 'Refund request' && m.to_email === 'owner@test.dev')).toBe(true);
    w.t += 15 * DAY;
    me = (await web.get('/api/me')).data;
    expect(me.user.refundable).toBe(false);
    expect((await web.send('POST', '/api/plan/refund')).status).toBe(409);
  });

  it('cancel asks the provider, then protection runs to the end of the period', async () => {
    const { web } = await subscribed();
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await web.send('POST', '/api/plan/cancel');
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith('https://api.lemonsqueezy.com/v1/subscriptions/sub_1', expect.objectContaining({ method: 'DELETE' }));
    const me = (await web.get('/api/me')).data;
    expect(me.user.cancelAtPeriodEnd).toBe(true);
    expect(me.license).toMatchObject({ state: 'active', validUntil: r.data.until });
  });

  it('switching to monthly changes the variant, and the webhook keeps it monthly', async () => {
    const { web, send } = await subscribed('earlybird_yearly');
    const fetchMock = vi.fn(async (_u: string, _i: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await web.send('POST', '/api/plan/change', { plan: 'monthly' })).status).toBe(200);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).data.attributes.variant_id).toBe(11);
    await send('subscription_updated', { status: 'active', renews_at: '2026-11-05T10:00:00Z', variant_id: 11 }, 'earlybird_yearly');
    expect((await web.get('/api/me')).data.user.planKind).toBe('monthly');
  });

  it('a yearly plan gets the renewal reminder 30 days before', async () => {
    const { w } = await subscribed();
    w.t = Date.UTC(2027, 8, 5, 10, 1);
    await runScheduled(w.env, { waitUntil: (p) => void w.pending.push(p) });
    await Promise.all(w.pending);
    expect(w.outbox().find((m) => m.subject === 'DisciplineGuard: your plan renews in 30 days')?.body).toContain('at $99 a year');
  });
});
